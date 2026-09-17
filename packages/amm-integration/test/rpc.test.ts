import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedRetryFetch } from '../src/rpc.js';

test('RPC retry is bounded to reviewed transient status codes', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response('', { status: calls < 3 ? 429 : 200 });
  }) as typeof fetch;
  const result = await boundedRetryFetch({ attempts: 4, baseDelayMs: 0, maxDelayMs: 0 }, fetcher)('http://127.0.0.1');
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
});

test('RPC retry does not retry schema/auth failures', async () => {
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response('', { status: 401 }); }) as typeof fetch;
  assert.equal((await boundedRetryFetch({ attempts: 4, baseDelayMs: 0, maxDelayMs: 0 }, fetcher)('http://127.0.0.1')).status, 401);
  assert.equal(calls, 1);
});
