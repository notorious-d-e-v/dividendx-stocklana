import assert from 'node:assert/strict';
import test from 'node:test';
import { startGuidedServer } from '../src/server.js';

const URL = 'http://127.0.0.1:4181';
const origin = 'http://127.0.0.1:4174';

test('HTTP surface enforces origins, mutation header, exact bodies, and stale revisions', async () => {
  const server = await startGuidedServer();
  try {
    const stateResponse = await fetch(`${URL}/state`, { headers: { origin } });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.status, 'idle');
    assert.equal(stateResponse.headers.get('access-control-allow-origin'), origin);

    const deniedOrigin = await fetch(`${URL}/state`, { headers: { origin: 'https://example.com' } });
    assert.equal(deniedOrigin.status, 403);

    const missingHeader = await fetch(`${URL}/start`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ runtimeId: state.runtimeId, expectedRevision: state.revision }) });
    assert.equal(missingHeader.status, 403);

    const mutationHeaders = { origin, 'content-type': 'application/json', 'x-dividendx-demo': '1' };
    const extraField = await fetch(`${URL}/start`, { method: 'POST', headers: mutationHeaders,
      body: JSON.stringify({ runtimeId: state.runtimeId, expectedRevision: state.revision, extra: true }) });
    assert.equal(extraField.status, 400);

    const stale = await fetch(`${URL}/step`, { method: 'POST', headers: mutationHeaders,
      body: JSON.stringify({ runtimeId: state.runtimeId, sessionId: 'missing', expectedRevision: state.revision, step: 'split' }) });
    assert.equal(stale.status, 409);

    const oversized = await fetch(`${URL}/start`, { method: 'POST', headers: mutationHeaders, body: JSON.stringify({ value: 'x'.repeat(3_000) }) });
    assert.equal(oversized.status, 413);
  } finally {
    await server.close();
  }
});
