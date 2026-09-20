import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedRpcFetch, RPC_MIN_START_INTERVAL_MS, RpcStartScheduler } from '../src/chain.js';

function assertServiceCode(code: string): (error: unknown) => boolean {
  return (error) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code
    && 'message' in error && typeof error.message === 'string' && !error.message.includes('secret'));
}

for (const status of [403, 429]) {
  test(`RPC HTTP ${status} discards its body and exposes only the numeric status`, async () => {
    let cancelled = false;
    const logged: string[] = []; const original = console.error;
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('upstream-secret')); },
      cancel() { cancelled = true; },
    }), { status });
    const rpcFetch = boundedRpcFetch(100, (async () => response) as typeof fetch, new RpcStartScheduler(0));
    console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
    try {
      await assert.rejects(rpcFetch('https://rpc.example.test'), assertServiceCode(`RPC_HTTP_${status}`));
      assert.equal(cancelled, true);
      assert.deepEqual(logged.map((entry) => JSON.parse(entry)), [{ event: 'devnet-rpc-failure', code: `RPC_HTTP_${status}` }]);
      assert.equal(logged.join('').includes('upstream-secret'), false);
      assert.equal(logged.join('').includes('rpc.example.test'), false);
    } finally { console.error = original; }
  });
}

test('RPC HTTP 200 is returned unchanged', async () => {
  const response = Response.json({ jsonrpc: '2.0', result: 1, id: 1 });
  const rpcFetch = boundedRpcFetch(100, (async () => response) as typeof fetch, new RpcStartScheduler(0));
  const received = await rpcFetch('https://rpc.example.test');
  assert.equal(received, response);
  assert.deepEqual(await received.json(), { jsonrpc: '2.0', result: 1, id: 1 });
});

test('RPC network failures and timeouts use stable codes', async () => {
  const logged: string[] = []; const original = console.error;
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  const network = boundedRpcFetch(100, (async () => { throw new Error('network-secret'); }) as typeof fetch, new RpcStartScheduler(0));
  try {
    await assert.rejects(network('https://rpc.example.test'), assertServiceCode('RPC_NETWORK'));
    const waitsForAbort = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('timeout-secret')), { once: true });
    })) as typeof fetch;
    await assert.rejects(boundedRpcFetch(1, waitsForAbort, new RpcStartScheduler(0))('https://rpc.example.test'), assertServiceCode('RPC_TIMEOUT'));
    assert.deepEqual(logged.map((entry) => JSON.parse(entry)), [
      { event: 'devnet-rpc-failure', code: 'RPC_NETWORK' },
      { event: 'devnet-rpc-failure', code: 'RPC_TIMEOUT' },
    ]);
    assert.equal(logged.join('').includes('secret'), false);
    assert.equal(logged.join('').includes('rpc.example.test'), false);
  } finally { console.error = original; }
});

test('an already-aborted caller signal does not start an RPC request', async () => {
  const controller = new AbortController(); controller.abort(new Error('caller-secret'));
  let called = false;
  const rpcFetch = boundedRpcFetch(100, (async () => { called = true; return Response.json({}); }) as typeof fetch, new RpcStartScheduler(0));
  await assert.rejects(rpcFetch('https://rpc.example.test', { signal: controller.signal }), assertServiceCode('RPC_ABORTED'));
  assert.equal(called, false);
});

test('shared scheduler spaces starts and a 300-request pacing budget is below the cron limit', async () => {
  const starts: number[] = [];
  const scheduler = new RpcStartScheduler(20);
  const rpcFetch = boundedRpcFetch(500, (async () => { starts.push(Date.now()); return Response.json({}); }) as typeof fetch, scheduler);
  await Promise.all(Array.from({ length: 4 }, () => rpcFetch('https://rpc.example.test')));
  assert.equal(starts.length, 4);
  for (let index = 1; index < starts.length; index += 1) assert.ok(starts[index]! - starts[index - 1]! >= 15);
  const pacedStarts = 300;
  assert.equal((pacedStarts - 1) * RPC_MIN_START_INTERVAL_MS, 119_600);
  assert.ok((pacedStarts - 1) * RPC_MIN_START_INTERVAL_MS < 300_000);
});

test('queued RPC work observes cancellation and its original deadline', async () => {
  const scheduler = new RpcStartScheduler(50);
  await scheduler.acquire(Date.now() + 500);
  const controller = new AbortController();
  const cancelled = scheduler.acquire(Date.now() + 500, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, assertServiceCode('RPC_ABORTED'));
  await assert.rejects(scheduler.acquire(Date.now() + 10), assertServiceCode('RPC_TIMEOUT'));
});

test('read-only 429 applies Retry-After cooldown without retrying or inspecting mutations', async () => {
  class TrackingScheduler extends RpcStartScheduler {
    readonly cooldowns: number[] = [];
    override applyCooldown(milliseconds: number): void { this.cooldowns.push(milliseconds); }
  }
  const scheduler = new TrackingScheduler(0);
  let calls = 0;
  const fetchImpl = (async () => { calls += 1; return new Response('', { status: 429, headers: { 'retry-after': '120' } }); }) as typeof fetch;
  const rpcFetch = boundedRpcFetch(100, fetchImpl, scheduler);
  const original = console.error; console.error = () => {};
  try {
    await assert.rejects(rpcFetch('https://rpc.example.test', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1,
      method: 'getAccountInfo', params: [] }) }), assertServiceCode('RPC_HTTP_429'));
    await assert.rejects(rpcFetch('https://rpc.example.test', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2,
      method: 'sendTransaction', params: [] }) }), assertServiceCode('RPC_HTTP_429'));
  } finally { console.error = original; }
  assert.equal(calls, 2);
  assert.deepEqual(scheduler.cooldowns, [120_000]);
});

test('a request deadline does not shorten scheduler cooldown and unsafe backoff fails closed', async () => {
  const scheduler = new RpcStartScheduler(0);
  scheduler.applyCooldown(30);
  await assert.rejects(scheduler.acquire(Date.now() + 5), assertServiceCode('RPC_TIMEOUT'));
  await new Promise((resolve) => setTimeout(resolve, 35));
  await scheduler.acquire(Date.now() + 20);

  const closed = new RpcStartScheduler(0); closed.failClosed();
  await assert.rejects(closed.acquire(Date.now() + 20), assertServiceCode('RPC_BACKOFF_INVALID'));
});

test('an unusable read-only Retry-After closes the scheduler before another fetch', async () => {
  const scheduler = new RpcStartScheduler(0); let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('', { status: calls === 1 ? 429 : 200, headers: { 'retry-after': '999999999' } });
  }) as typeof fetch;
  const rpcFetch = boundedRpcFetch(100, fetchImpl, scheduler);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [] });
  const original = console.error; console.error = () => {};
  try {
    await assert.rejects(rpcFetch('https://rpc.example.test', { method: 'POST', body }), assertServiceCode('RPC_HTTP_429'));
    await assert.rejects(rpcFetch('https://rpc.example.test', { method: 'POST', body }), assertServiceCode('RPC_BACKOFF_INVALID'));
  } finally { console.error = original; }
  assert.equal(calls, 1);
});
