import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createDevnetReviewBridge } from './devnet-review-bridge.mjs';

const fields = { assetId: 'ondo-test-ibm', genesisHash: 'devnet', owner: 'owner', runtimeId: 'runtime' };
function request(method, url, body, headers = {}) {
  return Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(body)]), {
    method, url, headers: { host: '127.0.0.1:4184', origin: 'http://127.0.0.1:4184', 'content-type': 'application/json', ...headers },
  });
}
async function invoke(bridge, req) {
  const result = {};
  await bridge(req, { writeHead(status, headers) { Object.assign(result, { status, headers }); }, end(body) { result.body = JSON.parse(body); } }, () => { result.next = true; });
  return result;
}
test('local bridge keeps the public visitor and budgets, never exposes its cookie', async () => {
  const calls = [];
  const bridge = createDevnetReviewBridge({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/manifest')
      ? Response.json({ faucetEnabled: true }, { headers: { 'set-cookie': '__Host-dxv=opaque; Secure; HttpOnly; Path=/' } })
      : Response.json({ status: 'failed', error: 'VISITOR_QUOTA' }, { status: 429 });
  } });
  const first = await invoke(bridge, request('GET', '/api/devnet/manifest'));
  assert.equal(first.body.faucetEnabled, true);
  assert.equal(first.headers['set-cookie'], undefined);
  const grant = await invoke(bridge, request('POST', '/api/devnet/faucet', JSON.stringify(fields), { cookie: 'foreign=ignored', authorization: 'ignored' }));
  assert.equal(grant.status, 429);
  assert.equal(grant.body.error, 'VISITOR_QUOTA');
  assert.equal(calls[1].options.headers.cookie, '__Host-dxv=opaque');
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[1].url, 'https://dividendx.payai.network/api/devnet/faucet');
});
test('only exact loopback origins and the two fixed paths reach upstream', async () => {
  let calls = 0;
  const bridge = createDevnetReviewBridge({ fetchImpl: async () => { calls++; return Response.json({}); } });
  for (const req of [
    request('GET', '/api/devnet/manifest', undefined, { origin: 'https://other.example' }),
    request('GET', '/api/devnet/manifest', undefined, { host: 'other.example:4184' }),
    request('POST', '/api/devnet/faucet', JSON.stringify(fields), { origin: undefined }),
    request('GET', '/api/devnet/manifest', undefined, { 'sec-fetch-site': 'cross-site' }),
  ]) assert.equal((await invoke(bridge, req)).status, 403);
  assert.equal((await invoke(bridge, request('GET', '/api/devnet/manifest?url=https://other.example'))).status, 404);
  assert.equal((await invoke(bridge, request('GET', '/api/devnet/other'))).status, 404);
  assert.equal(calls, 0);
});
test('invalid or oversized faucet payloads never reach upstream', async () => {
  let calls = 0;
  const bridge = createDevnetReviewBridge({ fetchImpl: async () => { calls++; return Response.json({}); } });
  assert.equal((await invoke(bridge, request('POST', '/api/devnet/faucet', 'x'.repeat(2049)))).status, 413);
  assert.equal((await invoke(bridge, request('POST', '/api/devnet/faucet', '{'))).status, 400);
  assert.equal((await invoke(bridge, request('POST', '/api/devnet/faucet', JSON.stringify({ ...fields, extra: true })))).status, 400);
  assert.equal(calls, 0);
});
