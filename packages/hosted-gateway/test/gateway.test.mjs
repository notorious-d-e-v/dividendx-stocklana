import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { configFromEnvironment, GATEWAY_LIMITS, startGateway } from '../src/server.mjs';

const TOKEN = 'a'.repeat(64);
const GENESIS = '11111111111111111111111111111112';
const PROGRAM_ID = '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE';
const RPC_URL = 'http://127.0.0.1:19001/';

function childFactory() {
  const calls = [];
  const children = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.exitCode = null; child.signalCode = null; child.killed = false; child.killSignals = [];
    child.kill = (signal) => {
      child.killed = true; child.killSignals.push(signal); child.signalCode = signal;
      queueMicrotask(() => child.emit('exit', null, signal));
      return true;
    };
    calls.push({ command, args, options }); children.push(child);
    return child;
  };
  return { spawn, calls, children };
}

function walletManifest(runtimeId, changes = {}) {
  return { schemaVersion: 1, kind: 'surfnet', rpcUrl: RPC_URL, wsUrl: 'ws://127.0.0.1:19002/', genesisHash: GENESIS,
    programId: PROGRAM_ID, deploymentDomainHex: '01'.repeat(32), runtimeId, clockControl: true, assets: [{}], ...changes };
}

function walletUpstream(runtimeId, controls = {}) {
  let manifest = walletManifest(runtimeId);
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/manifest')) return Response.json(manifest);
    if (String(url).endsWith('/faucet') || String(url).endsWith('/advance')) return Response.json({ signatures: [] });
    if (String(url) === RPC_URL) {
      const request = JSON.parse(init.body);
      if (controls.blockRpc && request.id !== 'gateway-genesis' && request.id !== 'gateway-program') await controls.blockRpc.promise;
      if (controls.rpcResponse) return controls.rpcResponse(request);
      if (request.method === 'getGenesisHash') return Response.json({ jsonrpc: '2.0', id: request.id, result: GENESIS });
      if (request.method === 'getAccountInfo') return Response.json({ jsonrpc: '2.0', id: request.id,
        result: { context: { slot: 1 }, value: { executable: true, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', data: ['', 'base64'] } } });
      return Response.json({ jsonrpc: '2.0', id: request.id, result: null });
    }
    throw new Error(`unexpected upstream ${url}`);
  };
  return { fetch, calls, setManifest(value) { manifest = value; } };
}

function guidedUpstream(runtimeId) {
  const asset = { id: 'xstocks-test-kox', company: 'Coca-Cola', symbol: 'TestKOx', issuerLabel: 'xStocks test profile', decimals: 8 };
  let state = { schemaVersion: 4, runtimeId, revision: 0, sessionId: null, asset: null, status: 'idle', activeStep: null, nextStep: null,
    completedSteps: [], snapshot: null, transactions: [], error: null };
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/state')) return Response.json(state);
    if (String(url).endsWith('/start')) {
      state = { ...state, revision: 1, sessionId: 'flow-1', asset, status: 'preparing', activeStep: 'setup' };
      return Response.json(state, { status: 202 });
    }
    if (String(url).endsWith('/step')) return Response.json(state, { status: 202 });
    if (String(url).endsWith('/receipt')) return Response.json({ schemaVersion: 4, asset, runtimeId, checkpoints: [] });
    if (String(url) === RPC_URL) {
      const request = JSON.parse(init.body);
      if (request.method === 'getGenesisHash') return Response.json({ jsonrpc: '2.0', id: request.id, result: GENESIS });
      return Response.json({ jsonrpc: '2.0', id: request.id, result: { value: { executable: true, owner: 'BPFLoaderUpgradeab1e11111111111111111111111' } } });
    }
    throw new Error(`unexpected upstream ${url}`);
  };
  return { fetch, calls, setState(value) { state = value; }, state: () => state };
}

async function ready(kind, upstream, child = childFactory(), options = {}) {
  const now = Date.now();
  const gateway = await startGateway({ kind, token: TOKEN, expiresAt: new Date(now + 60_000).toISOString(), expiresAtMs: now + 60_000 },
    { fetch: upstream.fetch, spawn: child.spawn, host: '127.0.0.1', port: 0, startupTimeoutMs: 500, ...options });
  await gateway.readiness;
  assert.equal(gateway.phase, 'ready');
  const address = gateway.address();
  return { gateway, child, base: `http://127.0.0.1:${address.port}`, headers: { authorization: `Bearer ${TOKEN}` } };
}

function rpcBody(method, params = [], id = 1) { return JSON.stringify({ jsonrpc: '2.0', id, method, params }); }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test('configuration is strict and caps expiry at twenty minutes', () => {
  const now = Date.now();
  const valid = { DIVIDENDX_SANDBOX_KIND: 'wallet', DIVIDENDX_GATEWAY_TOKEN: TOKEN,
    DIVIDENDX_SESSION_EXPIRES_AT: new Date(now + 20 * 60_000).toISOString() };
  assert.equal(configFromEnvironment(valid, now).kind, 'wallet');
  assert.throws(() => configFromEnvironment({ ...valid, DIVIDENDX_GATEWAY_TOKEN: 'secret' }, now), /64 lowercase hex/);
  assert.throws(() => configFromEnvironment({ ...valid, DIVIDENDX_SESSION_EXPIRES_AT: new Date(now + 20 * 60_000 + 1).toISOString() }, now), /20 minutes/);
});

test('two wallet gateways bind separate children and runtime identities', async (t) => {
  const first = await ready('wallet', walletUpstream('runtime-a'));
  const second = await ready('wallet', walletUpstream('runtime-b'));
  t.after(async () => { await first.gateway.close(); await second.gateway.close(); });
  assert.equal(first.child.calls.length, 1); assert.equal(second.child.calls.length, 1);
  assert.deepEqual(first.child.calls[0].args, ['packages/local-runtime/src/server.mjs']);
  assert.equal(first.child.calls[0].options.cwd.endsWith('/dividendx-stocklana'), true);
  assert.equal(first.child.calls[0].options.env.DIVIDENDX_GATEWAY_TOKEN, undefined);
  const [a, b] = await Promise.all([
    fetch(`${first.base}/health`, { headers: first.headers }).then((value) => value.json()),
    fetch(`${second.base}/health`, { headers: second.headers }).then((value) => value.json()),
  ]);
  assert.equal(a.runtimeId, 'runtime-a'); assert.equal(b.runtimeId, 'runtime-b');
});

test('auth is required everywhere and routes are exact without CORS', async (t) => {
  const active = await ready('wallet', walletUpstream('runtime-auth'));
  t.after(() => active.gateway.close());
  const absent = await fetch(`${active.base}/health`);
  assert.equal(absent.status, 401); assert.equal(absent.headers.get('access-control-allow-origin'), null);
  const wrong = await fetch(`${active.base}/health`, { headers: { authorization: `Bearer ${'b'.repeat(64)}` } });
  assert.equal(wrong.status, 401);
  const query = await fetch(`${active.base}/manifest?x=1`, { headers: active.headers });
  assert.equal(query.status, 404);
  const preflight = await fetch(`${active.base}/manifest`, { method: 'OPTIONS', headers: { ...active.headers, origin: 'https://site.invalid' } });
  assert.equal(preflight.status, 404); assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});

test('wallet RPC allowlist validates envelopes, bounds, config, and fixed upstream headers', async (t) => {
  const upstream = walletUpstream('runtime-rpc');
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  const post = (body) => fetch(`${active.base}/rpc`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' }, body });
  assert.equal((await post(rpcBody('getVersion'))).status, 200);
  assert.equal((await post(rpcBody('requestAirdrop', ['11111111111111111111111111111111', 1]))).status, 400);
  assert.equal((await post(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'getVersion', params: [] }]))).status, 400);
  assert.equal((await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [PROGRAM_ID, { encoding: 'jsonParsed' }] }))).status, 400);
  assert.equal((await post(rpcBody('getMultipleAccounts', [Array(33).fill(PROGRAM_ID), { encoding: 'base64' }]))).status, 400);
  assert.equal((await post(rpcBody('sendTransaction', [Buffer.alloc(1_233).toString('base64'), { encoding: 'base64' }]))).status, 400);
  const accepted = await post(rpcBody('sendTransaction', [Buffer.alloc(100).toString('base64'), { encoding: 'base64', maxRetries: 2 }]));
  assert.equal(accepted.status, 200);
  const last = upstream.calls.at(-1);
  assert.equal(last.url, RPC_URL); assert.equal(last.init.headers.authorization, undefined); assert.equal(last.init.headers.origin, undefined);
  assert.equal(last.init.redirect, 'error');
});

test('runtime forwarding replaces user headers and bounds writes and responses', async (t) => {
  const upstream = walletUpstream('runtime-forward');
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  const forwarded = await fetch(`${active.base}/faucet`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json', origin: 'https://attacker.invalid', 'x-extra': 'secret' }, body: '{}' });
  assert.equal(forwarded.status, 200);
  const call = upstream.calls.at(-1);
  assert.deepEqual(call.init.headers, { accept: 'application/json', origin: 'http://127.0.0.1:4174', 'content-type': 'application/json' });
  const oversized = await fetch(`${active.base}/advance`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(GATEWAY_LIMITS.maxRuntimeWriteBytes) }) });
  assert.equal(oversized.status, 413);
});

test('inflight limit rejects excess work', async (t) => {
  const gate = deferred();
  const upstream = walletUpstream('runtime-load', { blockRpc: gate });
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  const init = { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' }, body: rpcBody('getVersion') };
  const pending = Array.from({ length: GATEWAY_LIMITS.maxInflight }, () => fetch(`${active.base}/rpc`, init));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const excess = await fetch(`${active.base}/rpc`, init);
  assert.equal(excess.status, 429);
  gate.resolve();
  assert.ok((await Promise.all(pending)).every((response) => response.status === 200));
});

test('mutation admission is capped at four and serialized', async (t) => {
  const gate = deferred();
  const upstream = walletUpstream('runtime-mutations', { blockRpc: gate });
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  const init = { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' },
    body: rpcBody('sendTransaction', [Buffer.alloc(100).toString('base64'), { encoding: 'base64' }]) };
  const pending = Array.from({ length: GATEWAY_LIMITS.maxMutations }, () => fetch(`${active.base}/rpc`, init));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const excess = await fetch(`${active.base}/rpc`, init);
  assert.equal(excess.status, 429);
  gate.resolve();
  assert.ok((await Promise.all(pending)).every((response) => response.status === 200));
});

test('child exit is permanent and never respawns', async (t) => {
  const child = childFactory();
  const active = await ready('wallet', walletUpstream('runtime-exit'), child);
  t.after(() => active.gateway.close());
  child.children[0].exitCode = 1;
  child.children[0].emit('exit', 1, null);
  const health = await fetch(`${active.base}/health`, { headers: active.headers });
  assert.equal(health.status, 503); assert.equal((await health.json()).ready, false);
  assert.equal(child.calls.length, 1);
});

test('startup failure is permanent and never respawns', async (t) => {
  const child = childFactory();
  const upstream = { fetch: async () => { throw new Error('not ready'); } };
  const now = Date.now();
  const gateway = await startGateway({ kind: 'wallet', token: TOKEN, expiresAt: new Date(now + 60_000).toISOString(), expiresAtMs: now + 60_000 },
    { fetch: upstream.fetch, spawn: child.spawn, host: '127.0.0.1', port: 0, startupTimeoutMs: 200 });
  t.after(() => gateway.close());
  child.children[0].exitCode = 1; child.children[0].emit('exit', 1, null);
  await gateway.readiness;
  assert.equal(gateway.phase, 'startup-failed'); assert.equal(child.calls.length, 1);
});

test('stale wallet identity permanently disables the gateway', async (t) => {
  const upstream = walletUpstream('runtime-stale');
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  upstream.setManifest(walletManifest('replacement-runtime'));
  const stale = await fetch(`${active.base}/manifest`, { headers: active.headers });
  assert.equal(stale.status, 503); assert.equal(active.gateway.phase, 'identity-failed');
  assert.equal(active.child.children[0].killed, true);
});

test('guided gateway accepts one start and binds later chain identity', async (t) => {
  const upstream = guidedUpstream('guided-a');
  const child = childFactory();
  const active = await ready('guided', upstream, child);
  t.after(() => active.gateway.close());
  assert.deepEqual(child.calls[0].args, ['packages/guided-runtime/dist/src/server.js']);
  const invalid = { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ runtimeId: 'guided-a', expectedRevision: 0, assetId: 'unlisted' }) };
  assert.equal((await fetch(`${active.base}/start`, invalid)).status, 400);
  assert.equal((await fetch(`${active.base}/start`, { ...invalid, body: JSON.stringify({ runtimeId: 'guided-a', expectedRevision: 0 }) })).status, 400);
  assert.equal(upstream.calls.filter(({ url }) => url.endsWith('/start')).length, 0);
  const init = { ...invalid, body: JSON.stringify({ runtimeId: 'guided-a', expectedRevision: 0, assetId: 'xstocks-test-kox' }) };
  assert.equal((await fetch(`${active.base}/start`, init)).status, 202);
  assert.equal((await fetch(`${active.base}/start`, init)).status, 409);
  const snapshot = { asset: upstream.state().asset, genesisHash: GENESIS, rpcUrl: RPC_URL, dividendXProgram: PROGRAM_ID };
  upstream.setState({ ...upstream.state(), status: 'ready', snapshot });
  assert.equal((await fetch(`${active.base}/state`, { headers: active.headers })).status, 200);
  assert.equal(active.gateway.identity.genesisHash, GENESIS);
  upstream.setState({ ...upstream.state(), snapshot: { ...snapshot, genesisHash: '11111111111111111111111111111113' } });
  assert.equal((await fetch(`${active.base}/state`, { headers: active.headers })).status, 503);
  assert.equal(active.gateway.phase, 'identity-failed');
});

test('guided gateway rejects a v3 state after a v4 discovery', async (t) => {
  const upstream = guidedUpstream('guided-old-schema');
  const active = await ready('guided', upstream);
  t.after(() => active.gateway.close());
  upstream.setState({ ...upstream.state(), schemaVersion: 3 });
  assert.equal((await fetch(`${active.base}/state`, { headers: active.headers })).status, 503);
  assert.equal(active.gateway.phase, 'identity-failed');
});

test('expiry stops the child and closes the gateway listener', async () => {
  const child = childFactory();
  const now = Date.now();
  const upstream = walletUpstream('runtime-expiry');
  const gateway = await startGateway({ kind: 'wallet', token: TOKEN, expiresAt: new Date(now + 150).toISOString(), expiresAtMs: now + 150 },
    { fetch: upstream.fetch, spawn: child.spawn, host: '127.0.0.1', port: 0, startupTimeoutMs: 100 });
  await gateway.readiness;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(gateway.phase, 'expired'); assert.equal(gateway.server.listening, false); assert.equal(child.children[0].killed, true);
});

test('oversized upstream responses are rejected', async (t) => {
  const upstream = walletUpstream('runtime-response', { rpcResponse(request) {
    if (request.method === 'getGenesisHash') return Response.json({ jsonrpc: '2.0', id: request.id, result: GENESIS });
    if (request.method === 'getAccountInfo' && request.id === 'gateway-program') return Response.json({ jsonrpc: '2.0', id: request.id, result: { value: { executable: true, owner: 'BPFLoaderUpgradeab1e11111111111111111111111' } } });
    return new Response('{}', { headers: { 'content-length': String(GATEWAY_LIMITS.maxResponseBytes + 1) } });
  } });
  const active = await ready('wallet', upstream);
  t.after(() => active.gateway.close());
  const response = await fetch(`${active.base}/rpc`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' }, body: rpcBody('getVersion') });
  assert.equal(response.status, 502);
});

test('upstream requests are aborted at the configured deadline', async (t) => {
  const active = await ready('wallet', walletUpstream('runtime-timeout'), childFactory(), { upstreamTimeoutMs: 25 });
  t.after(() => active.gateway.close());
  active.gateway.fetch = async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  const started = Date.now();
  const response = await fetch(`${active.base}/rpc`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json' }, body: rpcBody('getVersion') });
  assert.equal(response.status, 502); assert.ok(Date.now() - started < 500);
});

test('request capacity includes bodies still being read and releases cancelled reads', async (t) => {
  const { request } = await import('node:http');
  const active = await ready('wallet', walletUpstream('runtime-body-slots'));
  const pending = [];
  t.after(async () => { pending.forEach((item) => item.destroy()); await active.gateway.close(); });
  for (let index = 0; index < GATEWAY_LIMITS.maxInflight; index += 1) {
    const item = request(`${active.base}/rpc`, { method: 'POST', headers: { ...active.headers, 'content-type': 'application/json', 'content-length': '100' } });
    item.on('error', () => {});
    item.write('{');
    pending.push(item);
  }
  const deadline = Date.now() + 1_000;
  while (active.gateway.inflight < GATEWAY_LIMITS.maxInflight && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(active.gateway.inflight, GATEWAY_LIMITS.maxInflight);
  assert.equal((await fetch(`${active.base}/manifest`, { headers: active.headers })).status, 429);
  pending.forEach((item) => item.destroy());
  const cancelledDeadline = Date.now() + 1_000;
  while (active.gateway.inflight > 0 && Date.now() < cancelledDeadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(active.gateway.inflight, 0);
  assert.equal((await fetch(`${active.base}/manifest`, { headers: active.headers })).status, 200);
});
