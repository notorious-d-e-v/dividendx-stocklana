import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { handleDevnetRequest, handleObservationCron, resetProductionForTests } from '../src/http.js';
import { publicError, safeDiagnostic } from '../src/errors.js';
import { blobConfigurationAvailable, frozenManifest } from '../src/production.js';

test('frozen manifest resolves from the deployment working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hosted-devnet-manifest-'));
  try {
    const manifest = frozenManifest();
    const manifestDirectory = join(directory, 'packages/devnet-runtime');
    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(join(manifestDirectory, 'manifest.devnet.json'), JSON.stringify(manifest));
    const loaded = frozenManifest({ cwd: directory,
      moduleUrl: pathToFileURL(join(directory, 'bundled/function/production.js')) });
    assert.equal(loaded.runtimeId, manifest.runtimeId);
    assert.equal(loaded.genesisHash, manifest.genesisHash);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing frozen manifest fails with a stable public code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hosted-devnet-missing-'));
  try {
    assert.throws(() => frozenManifest({ cwd: directory,
      moduleUrl: pathToFileURL(join(directory, 'bundled/function/production.js')) }),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'MANIFEST_UNAVAILABLE'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unexpected diagnostics expose only bounded class and code', () => {
  const error = Object.assign(new TypeError('secret-message-must-not-appear'), { code: 'ERR_BLOB_AUTH' });
  const failure = publicError(error);
  assert.deepEqual(safeDiagnostic(error), { class: 'TypeError', code: 'ERR_BLOB_AUTH' });
  assert.equal(JSON.stringify(failure).includes('secret-message'), false);
  assert.equal('diagnostic' in failure, false);
  assert.deepEqual(safeDiagnostic(Object.assign(new Error('secret'), { code: 'secret/value' })), { class: 'Error' });
});

test('unexpected HTTP failures log a sanitized diagnostic without exposing it publicly', async () => {
  const previous = process.env.DIVIDENDX_SITE_ORIGIN;
  const logged: string[] = [];
  const original = console.error;
  process.env.DIVIDENDX_SITE_ORIGIN = 'invalid-origin-with-secret';
  console.error = (...values: unknown[]) => { logged.push(values.map(String).join(' ')); };
  try {
    const response = await handleDevnetRequest(new Request('https://example.test/api/devnet/manifest'));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.deepEqual(body, { signatures: [], status: 'failed',
      message: 'The devnet test service is temporarily unavailable.', error: 'UNAVAILABLE' });
    assert.equal(logged.length, 1);
    assert.deepEqual(JSON.parse(logged[0]!), { event: 'hosted-devnet-unexpected', scope: 'devnet-http',
      diagnostic: { class: 'TypeError', code: 'ERR_INVALID_URL' } });
    assert.equal(logged[0]!.includes('invalid-origin-with-secret'), false);
  } finally {
    console.error = original;
    if (previous === undefined) delete process.env.DIVIDENDX_SITE_ORIGIN;
    else process.env.DIVIDENDX_SITE_ORIGIN = previous;
  }
});

test('manifest is public, immutable, cookie-bound, and disabled without server configuration', async () => {
  const previous = { origin: process.env.DIVIDENDX_SITE_ORIGIN, blob: process.env.BLOB_READ_WRITE_TOKEN,
    store: process.env.BLOB_STORE_ID, oidc: process.env.VERCEL_OIDC_TOKEN };
  process.env.DIVIDENDX_SITE_ORIGIN = 'https://example.test';
  delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_STORE_ID; delete process.env.VERCEL_OIDC_TOKEN;
  resetProductionForTests();
  try {
    const response = await handleDevnetRequest(new Request('https://example.test/api/devnet/manifest', { headers: { origin: 'https://example.test' } }));
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.faucetEnabled, false); assert.equal(body.clockControl, false);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Lax/);
    assert.equal(JSON.stringify(body).includes('.local-tools'), false);
    const foreign = await handleDevnetRequest(new Request('https://example.test/api/devnet/manifest', { headers: { origin: 'https://foreign.test' } }));
    assert.equal(foreign.status, 403);
  } finally {
    if (previous.origin === undefined) delete process.env.DIVIDENDX_SITE_ORIGIN; else process.env.DIVIDENDX_SITE_ORIGIN = previous.origin;
    if (previous.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previous.blob;
    if (previous.store === undefined) delete process.env.BLOB_STORE_ID; else process.env.BLOB_STORE_ID = previous.store;
    if (previous.oidc === undefined) delete process.env.VERCEL_OIDC_TOKEN; else process.env.VERCEL_OIDC_TOKEN = previous.oidc;
    resetProductionForTests();
  }
});

test('Blob storage accepts the deployment OIDC configuration', () => {
  assert.equal(blobConfigurationAvailable({ BLOB_STORE_ID: 'store', VERCEL_OIDC_TOKEN: 'oidc' }), true);
  assert.equal(blobConfigurationAvailable({ BLOB_STORE_ID: 'store' }), true);
  assert.equal(blobConfigurationAvailable({ VERCEL_OIDC_TOKEN: 'oidc' }), false);
  assert.equal(blobConfigurationAvailable({ BLOB_READ_WRITE_TOKEN: 'legacy' }), true);
});

test('faucet rejects missing mutation origin before reading secrets or storage', async () => {
  const previous = process.env.DIVIDENDX_SITE_ORIGIN;
  process.env.DIVIDENDX_SITE_ORIGIN = 'https://example.test';
  try {
    const response = await handleDevnetRequest(new Request('https://example.test/api/devnet/faucet', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }));
    assert.equal(response.status, 403);
  } finally { if (previous === undefined) delete process.env.DIVIDENDX_SITE_ORIGIN; else process.env.DIVIDENDX_SITE_ORIGIN = previous; }
});

test('faucet rejects a streamed body above two KiB before storage or RPC work', async () => {
  const previous = { origin: process.env.DIVIDENDX_SITE_ORIGIN, secret: process.env.DIVIDENDX_SESSION_SECRET };
  process.env.DIVIDENDX_SITE_ORIGIN = 'https://example.test'; process.env.DIVIDENDX_SESSION_SECRET = 's'.repeat(32);
  try {
    const response = await handleDevnetRequest(new Request('https://example.test/api/devnet/faucet', {
      method: 'POST', headers: { origin: 'https://example.test',
        cookie: `__Host-dxv=${'a'.repeat(43)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(2_100) }),
    }));
    assert.equal(response.status, 413);
  } finally {
    if (previous.origin === undefined) delete process.env.DIVIDENDX_SITE_ORIGIN; else process.env.DIVIDENDX_SITE_ORIGIN = previous.origin;
    if (previous.secret === undefined) delete process.env.DIVIDENDX_SESSION_SECRET; else process.env.DIVIDENDX_SESSION_SECRET = previous.secret;
  }
});

test('cron requires exact bearer authentication before service construction', async () => {
  const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'cron-secret';
  try {
    const absent = await handleObservationCron(new Request('https://example.test/api/cron/refresh-observations'));
    const wrong = await handleObservationCron(new Request('https://example.test/api/cron/refresh-observations', { headers: { authorization: 'Bearer wrong' } }));
    assert.equal(absent.status, 401); assert.equal(wrong.status, 401);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
