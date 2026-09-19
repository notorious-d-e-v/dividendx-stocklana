import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRpcEnvelope, RpcPolicyError } from './rpc-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(HERE, '../../..');
const PROGRAM_ID = '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE';
const UPGRADEABLE_LOADER_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';
const PUBLIC_GENESIS = new Set([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);
const KIND = new Set(['wallet', 'guided']);
const GUIDED_ASSETS = new Set(['xstocks-test-kox', 'backpack-test-mu', 'ondo-test-ibm']);
const TOKEN = /^[a-f0-9]{64}$/;
const RUNTIME_ID = /^[A-Za-z0-9._:-]{3,128}$/;
const HEX_32 = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 32 * 1_024;
const MAX_RUNTIME_WRITE_BYTES = 4 * 1_024;
const MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const MAX_INFLIGHT = 8;
const MAX_MUTATIONS = 4;
const UPSTREAM_TIMEOUT_MS = 15_000;
const STARTUP_TIMEOUT_MS = 30_000;
const INTERNAL_ORIGIN = 'http://127.0.0.1:4174';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function plainRecord(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function hashToken(value) { return createHash('sha256').update(value).digest(); }
function authorized(header, expectedDigest) {
  const candidate = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  return timingSafeEqual(hashToken(candidate), expectedDigest);
}
function json(response, status, value, extra = {}) {
  if (response.destroyed || response.writableEnded) return;
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...extra });
  response.end(body);
}
function internalUrl(kind, path) { return `http://127.0.0.1:${kind === 'wallet' ? 4180 : 4181}${path}`; }
function exactContentType(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'content-type must be application/json');
}
async function readBody(request, maximum = MAX_BODY_BYTES) {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    request.resume();
    throw new HttpError(413, 'request body is too large');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) { request.resume(); throw new HttpError(413, 'request body is too large'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function parseJson(buffer) {
  try { return JSON.parse(buffer.toString('utf8')); } catch { throw new HttpError(400, 'request body must be valid JSON'); }
}
function base58Bytes(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw new Error('invalid genesis hash');
  let number = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('invalid genesis hash');
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) { bytes.push(Number(number & 255n)); number >>= 8n; }
  bytes.reverse();
  let leading = 0;
  while (value[leading] === '1') { bytes.unshift(0); leading += 1; }
  if (bytes.length !== 32) throw new Error('invalid genesis hash');
  return Buffer.from(bytes);
}
function safeRpcUrl(value) {
  const url = new URL(value);
  const port = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || !Number.isInteger(port) || port < 1 || port > 65_535
    || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('runtime RPC endpoint is unsafe');
  return url.toString();
}
function childSpec(kind, repositoryRoot) {
  return kind === 'wallet'
    ? { command: process.execPath, args: ['packages/local-runtime/src/server.mjs'], cwd: repositoryRoot }
    : { command: process.execPath, args: ['packages/guided-runtime/dist/src/server.js'], cwd: repositoryRoot };
}
function childEnvironment(environment) {
  const result = {};
  for (const name of ['PATH', 'NODE_ENV', 'TZ', 'LD_LIBRARY_PATH']) if (typeof environment[name] === 'string') result[name] = environment[name];
  return result;
}

async function boundedResponse(response, maximum = MAX_RESPONSE_BYTES) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new HttpError(502, 'runtime response is too large');
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximum) throw new HttpError(502, 'runtime response is too large');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new HttpError(502, 'runtime response is too large'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function responseJson(buffer) {
  try { return JSON.parse(buffer.toString('utf8')); } catch { throw new HttpError(502, 'runtime returned invalid JSON'); }
}

export function configFromEnvironment(environment = process.env, now = Date.now()) {
  const kind = environment.DIVIDENDX_SANDBOX_KIND;
  const token = environment.DIVIDENDX_GATEWAY_TOKEN;
  const expiresAt = environment.DIVIDENDX_SESSION_EXPIRES_AT;
  if (!KIND.has(kind)) throw new Error("DIVIDENDX_SANDBOX_KIND must be 'wallet' or 'guided'");
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('DIVIDENDX_GATEWAY_TOKEN must be 64 lowercase hex characters');
  if (typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(expiresAt)) throw new Error('DIVIDENDX_SESSION_EXPIRES_AT must be an ISO UTC timestamp');
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now || expiresAtMs > now + 20 * 60_000) throw new Error('session expiry must be in the future and no more than 20 minutes away');
  return { kind, token, expiresAt, expiresAtMs };
}

export class HostedGateway {
  constructor(config, options = {}) {
    if (!KIND.has(config.kind)) throw new Error('invalid sandbox kind');
    if (typeof config.token !== 'string' || !TOKEN.test(config.token)) throw new Error('invalid gateway token');
    this.kind = config.kind;
    this.tokenDigest = hashToken(config.token);
    this.expiresAt = config.expiresAt;
    this.expiresAtMs = config.expiresAtMs ?? Date.parse(config.expiresAt);
    this.now = options.now ?? Date.now;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.spawn = options.spawn ?? spawn;
    this.repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
    this.host = options.host ?? '0.0.0.0';
    this.port = options.port ?? 3000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
    this.upstreamTimeoutMs = options.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS;
    this.phase = 'starting';
    this.runtimeId = null;
    this.identity = null;
    this.inflight = 0;
    this.mutationCount = 0;
    this.mutationTail = Promise.resolve();
    this.guidedStartClaimed = false;
    this.closing = false;
  }

  async start() {
    if (!KIND.has(this.kind) || !Number.isFinite(this.expiresAtMs) || this.expiresAtMs <= this.now() || this.expiresAtMs > this.now() + 20 * 60_000) throw new Error('invalid gateway configuration');
    this.server = createServer((request, response) => void this.handle(request, response));
    this.server.headersTimeout = 5_000;
    this.server.requestTimeout = 20_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxRequestsPerSocket = 100;
    await new Promise((resolveListen, rejectListen) => {
      this.server.once('error', rejectListen);
      this.server.listen(this.port, this.host, resolveListen);
    });
    const spec = childSpec(this.kind, this.repositoryRoot);
    try {
      this.child = this.spawn(spec.command, spec.args, { cwd: spec.cwd, env: childEnvironment(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      this.fail('startup-failed');
      return this;
    }
    this.child.stdout?.on('data', () => {});
    this.child.stderr?.on('data', () => {});
    this.child.once('error', () => this.fail(this.phase === 'starting' ? 'startup-failed' : 'child-exited'));
    this.child.once('exit', () => { if (!this.closing) this.fail(this.phase === 'starting' ? 'startup-failed' : 'child-exited'); });
    const expiryDelay = Math.max(0, this.expiresAtMs - this.now());
    this.expiryTimer = setTimeout(() => void this.expire(), expiryDelay);
    this.expiryTimer.unref?.();
    this.readiness = this.discover().catch(() => this.fail('startup-failed'));
    return this;
  }

  address() { return this.server?.address(); }
  health() { return { kind: this.kind, ready: this.phase === 'ready', runtimeId: this.runtimeId, expiresAt: this.expiresAt }; }

  fail(phase) {
    if (this.closing || ['expired', 'startup-failed', 'child-exited', 'identity-failed'].includes(this.phase)) return;
    this.phase = phase;
    this.stopChild();
  }

  async expire() {
    if (this.closing) return;
    this.phase = 'expired';
    await this.close('expired');
  }

  stopChild(signal = 'SIGTERM') {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      try { this.child.kill(signal); } catch {}
    }
  }

  async terminateChild() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    this.stopChild('SIGTERM');
    let timer;
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      new Promise((resolveGrace) => { timer = setTimeout(resolveGrace, 5_000); timer.unref?.(); }),
    ]);
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }

  async close(reason = 'stopped') {
    if (this.closing) return;
    this.closing = true;
    clearTimeout(this.expiryTimer);
    if (reason !== 'expired') this.phase = reason;
    const childStopped = this.terminateChild();
    if (this.server?.listening) await new Promise((resolveClose) => this.server.close(resolveClose));
    await childStopped;
  }

  async discover() {
    const deadline = this.now() + this.startupTimeoutMs;
    while (this.phase === 'starting' && this.now() < deadline) {
      try {
        if (this.kind === 'wallet') await this.discoverWallet(); else await this.discoverGuided();
        if (this.phase === 'starting') this.phase = 'ready';
        return;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    }
    if (this.phase === 'starting') this.fail('startup-failed');
  }

  async upstream(path, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.upstreamTimeoutMs);
    try {
      const response = await this.fetch(internalUrl(this.kind, path), { ...init, redirect: 'error', signal: controller.signal });
      const body = await boundedResponse(response);
      return { response, body };
    } finally { clearTimeout(timeout); }
  }

  async rpcUpstream(envelope) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.upstreamTimeoutMs);
    try {
      const response = await this.fetch(this.identity.rpcUrl, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) });
      return { response, body: await boundedResponse(response) };
    } finally { clearTimeout(timeout); }
  }

  async verifyRpc(rpcUrl, genesisHash) {
    const previous = this.identity;
    this.identity = { ...(previous ?? {}), rpcUrl };
    try {
      const genesisRequest = { jsonrpc: '2.0', id: 'gateway-genesis', method: 'getGenesisHash', params: [] };
      const genesis = await this.rpcUpstream(genesisRequest);
      if (!genesis.response.ok || responseJson(genesis.body).result !== genesisHash) throw new Error('RPC genesis mismatch');
      const programRequest = { jsonrpc: '2.0', id: 'gateway-program', method: 'getAccountInfo', params: [PROGRAM_ID, { encoding: 'base64', commitment: 'confirmed' }] };
      const program = await this.rpcUpstream(programRequest);
      const value = responseJson(program.body)?.result?.value;
      if (!program.response.ok || !value || value.executable !== true || value.owner !== UPGRADEABLE_LOADER_ID) throw new Error('program unavailable');
    } catch (error) {
      this.identity = previous;
      throw error;
    }
  }

  async discoverWallet() {
    const { response, body } = await this.upstream('/manifest', { headers: { accept: 'application/json', origin: INTERNAL_ORIGIN } });
    if (!response.ok) throw new Error('manifest unavailable');
    const manifest = responseJson(body);
    if (!plainRecord(manifest) || manifest.schemaVersion !== 1 || manifest.kind !== 'surfnet' || !RUNTIME_ID.test(manifest.runtimeId)
      || manifest.programId !== PROGRAM_ID || typeof manifest.genesisHash !== 'string' || PUBLIC_GENESIS.has(manifest.genesisHash)
      || typeof manifest.deploymentDomainHex !== 'string' || !HEX_32.test(manifest.deploymentDomainHex)) throw new Error('manifest identity is invalid');
    base58Bytes(manifest.genesisHash);
    const rpcUrl = safeRpcUrl(manifest.rpcUrl);
    await this.verifyRpc(rpcUrl, manifest.genesisHash);
    this.runtimeId = manifest.runtimeId;
    this.identity = { runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash, deploymentDomainHex: manifest.deploymentDomainHex, rpcUrl };
  }

  async discoverGuided() {
    const { response, body } = await this.upstream('/state', { headers: { accept: 'application/json', origin: INTERNAL_ORIGIN, 'x-dividendx-demo': '1' } });
    if (!response.ok) throw new Error('state unavailable');
    const state = responseJson(body);
    if (!plainRecord(state) || state.schemaVersion !== 4 || !RUNTIME_ID.test(state.runtimeId) || state.status !== 'idle'
      || state.asset !== null || state.snapshot !== null) throw new Error('initial guided state is invalid');
    this.runtimeId = state.runtimeId;
    this.identity = { runtimeId: state.runtimeId, genesisHash: null, deploymentDomainHex: null, rpcUrl: null };
  }

  async validateGuidedState(value) {
    if (!plainRecord(value) || value.schemaVersion !== 4 || value.runtimeId !== this.runtimeId
      || (value.asset !== null && (!plainRecord(value.asset) || !GUIDED_ASSETS.has(value.asset.id)))) throw new Error('guided runtime identity changed');
    if (value.snapshot === null || value.snapshot === undefined) return;
    const snapshot = value.snapshot;
    if (!plainRecord(snapshot) || !plainRecord(snapshot.asset) || snapshot.asset.id !== value.asset?.id
      || snapshot.dividendXProgram !== PROGRAM_ID || typeof snapshot.genesisHash !== 'string' || PUBLIC_GENESIS.has(snapshot.genesisHash)) throw new Error('guided chain identity is invalid');
    const deploymentDomainHex = base58Bytes(snapshot.genesisHash).toString('hex');
    const rpcUrl = safeRpcUrl(snapshot.rpcUrl);
    if (this.identity.genesisHash !== null && (this.identity.genesisHash !== snapshot.genesisHash || this.identity.deploymentDomainHex !== deploymentDomainHex || this.identity.rpcUrl !== rpcUrl)) throw new Error('guided chain identity changed');
    if (this.identity.genesisHash === null) {
      await this.verifyRpc(rpcUrl, snapshot.genesisHash);
      this.identity = { ...this.identity, genesisHash: snapshot.genesisHash, deploymentDomainHex, rpcUrl };
    }
  }

  async validateGuidedReceipt(value) {
    if (!plainRecord(value) || value.schemaVersion !== 4 || value.runtimeId !== this.runtimeId
      || !plainRecord(value.asset) || !GUIDED_ASSETS.has(value.asset.id)) throw new Error('guided receipt identity changed');
    if (Array.isArray(value.checkpoints)) for (const checkpoint of value.checkpoints) if (plainRecord(checkpoint) && checkpoint.snapshot)
      await this.validateGuidedState({ schemaVersion: 4, runtimeId: value.runtimeId, asset: value.asset, snapshot: checkpoint.snapshot });
  }

  async handle(request, response) {
    request.setTimeout(5_000, () => request.destroy());
    let slotReserved = false;
    try {
      if (!authorized(request.headers.authorization, this.tokenDigest)) throw new HttpError(401, 'unauthorized');
      if (this.now() >= this.expiresAtMs) { void this.expire(); throw new HttpError(503, 'session unavailable'); }
      if (request.method === 'GET' && request.url === '/health') {
        if ((request.headers['content-length'] && request.headers['content-length'] !== '0') || request.headers['transfer-encoding']) throw new HttpError(400, 'GET requests cannot contain a body');
        json(response, this.phase === 'ready' || this.phase === 'starting' ? 200 : 503, this.health()); return;
      }
      if (this.phase !== 'ready') throw new HttpError(503, 'session unavailable');
      if (this.inflight >= MAX_INFLIGHT) throw new HttpError(429, 'too many requests');
      const route = this.route(request.method, request.url);
      if (!route) throw new HttpError(404, 'route not found');
      this.inflight += 1;
      slotReserved = true;
      let body = null;
      let envelope = null;
      if (request.method === 'POST') {
        exactContentType(request);
        body = await readBody(request, route === 'rpc' ? MAX_BODY_BYTES : MAX_RUNTIME_WRITE_BYTES);
        const value = parseJson(body);
        if (route === 'rpc') envelope = validateRpcEnvelope(value);
        else if (!plainRecord(value)) throw new HttpError(400, 'request body must be an object');
        if (this.kind === 'guided' && route === 'start') {
          const keys = Object.keys(value).sort();
          if (keys.length !== 3 || keys.join(',') !== 'assetId,expectedRevision,runtimeId'
            || !RUNTIME_ID.test(value.runtimeId) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0
            || !GUIDED_ASSETS.has(value.assetId)) throw new HttpError(400, 'invalid guided start request');
        }
      } else if ((request.headers['content-length'] && request.headers['content-length'] !== '0') || request.headers['transfer-encoding']) {
        throw new HttpError(400, 'GET requests cannot contain a body');
      }
      request.setTimeout(0);
      const mutation = ['faucet', 'advance', 'start', 'step'].includes(route) || (route === 'rpc' && envelope.method === 'sendTransaction');
      {
        const operation = () => {
          if (this.phase !== 'ready') throw new HttpError(503, 'session unavailable');
          if (this.now() >= this.expiresAtMs) { void this.expire(); throw new HttpError(503, 'session unavailable'); }
          if (this.kind === 'guided' && route === 'start') {
            if (this.guidedStartClaimed) throw new HttpError(409, 'guided runtime already started');
            this.guidedStartClaimed = true;
          }
          return this.forward(route, body, envelope);
        };
        const result = mutation ? await this.mutate(operation) : await operation();
        if (this.phase !== 'ready' || this.now() >= this.expiresAtMs) throw new HttpError(503, 'session unavailable');
        response.writeHead(result.response.status, { 'content-type': 'application/json; charset=utf-8', 'content-length': result.body.length, 'cache-control': 'no-store' });
        response.end(result.body);
      }
    } catch (error) {
      if (error instanceof RpcPolicyError || error instanceof HttpError) json(response, error.status, { error: error.message }, error.status === 401 ? { 'www-authenticate': 'Bearer' } : {});
      else json(response, this.phase === 'identity-failed' ? 503 : 502, { error: this.phase === 'identity-failed' ? 'session unavailable' : 'runtime request failed' });
    } finally {
      if (slotReserved) this.inflight -= 1;
    }
  }

  route(method, url) {
    const allowed = this.kind === 'wallet'
      ? new Map([['GET /manifest', 'manifest'], ['POST /faucet', 'faucet'], ['POST /advance', 'advance'], ['POST /rpc', 'rpc']])
      : new Map([['GET /state', 'state'], ['GET /receipt', 'receipt'], ['POST /start', 'start'], ['POST /step', 'step']]);
    return allowed.get(`${method} ${url}`) ?? null;
  }

  async mutate(operation) {
    if (this.mutationCount >= MAX_MUTATIONS) throw new HttpError(429, 'mutation queue is full');
    this.mutationCount += 1;
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    try { return await result; } finally { this.mutationCount -= 1; }
  }

  async forward(route, body, envelope) {
    let result;
    if (route === 'rpc') result = await this.rpcUpstream(envelope);
    else {
      const path = `/${route}`;
      const headers = { accept: 'application/json', origin: INTERNAL_ORIGIN };
      if (this.kind === 'guided') headers['x-dividendx-demo'] = '1';
      const init = { method: body ? 'POST' : 'GET', headers };
      if (body) { headers['content-type'] = 'application/json'; init.body = body; }
      result = await this.upstream(path, init);
    }
    if (result.response.status < 200 || result.response.status > 599) throw new HttpError(502, 'runtime returned an invalid status');
    const value = responseJson(result.body);
    try {
      if (route === 'manifest' && result.response.ok) {
        if (value.runtimeId !== this.identity.runtimeId || value.genesisHash !== this.identity.genesisHash
          || value.deploymentDomainHex !== this.identity.deploymentDomainHex || safeRpcUrl(value.rpcUrl) !== this.identity.rpcUrl
          || value.programId !== PROGRAM_ID) throw new Error('wallet runtime identity changed');
      }
      if (this.kind === 'guided' && result.response.ok && ['state', 'start', 'step'].includes(route)) await this.validateGuidedState(value);
      if (this.kind === 'guided' && result.response.ok && route === 'receipt') await this.validateGuidedReceipt(value);
      if (route === 'rpc' && envelope.method === 'getGenesisHash' && result.response.ok && value.result !== this.identity.genesisHash) throw new Error('RPC genesis changed');
    } catch {
      this.fail('identity-failed');
      throw new HttpError(503, 'session unavailable');
    }
    return result;
  }
}

export async function startGateway(config, options) {
  const gateway = new HostedGateway(config, options);
  return gateway.start();
}

export const GATEWAY_LIMITS = Object.freeze({ maxBodyBytes: MAX_BODY_BYTES, maxRuntimeWriteBytes: MAX_RUNTIME_WRITE_BYTES,
  maxResponseBytes: MAX_RESPONSE_BYTES, maxInflight: MAX_INFLIGHT, maxMutations: MAX_MUTATIONS, upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS });
