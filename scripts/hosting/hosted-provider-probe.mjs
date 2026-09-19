import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvFile } from 'node:process';

const STORE_ID = 'store_HwInrQjHFXMVbBLI';
const GUIDED_SCHEMA_VERSION = 4;
const PROBE_DEADLINE_MS = 120_000;
const READINESS_DEADLINE_MS = 45_000;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  assert.ok(process.argv[index + 1] !== undefined, `missing value for ${process.argv[index]}`);
  assert.equal(args.has(process.argv[index]), false, `duplicate argument ${process.argv[index]}`);
  args.set(process.argv[index], process.argv[index + 1]);
}
assert.deepEqual([...args.keys()].sort(), ['--execute', '--output', '--snapshot-id'],
  'only --execute, --output, and --snapshot-id are accepted');
assert.equal(args.get('--execute'), 'true', 'explicit --execute true is required');
const outputPath = args.get('--output');
assert.ok(outputPath && isAbsolute(outputPath), 'a new absolute --output is required');
const snapshotId = args.get('--snapshot-id');
assert.match(snapshotId, /^snap_[A-Za-z0-9]+$/, 'an explicit Vercel Sandbox --snapshot-id is required');

try { loadEnvFile(resolve('.env.local')); } catch {}
assert.equal(process.env.BLOB_STORE_ID, STORE_ID, 'only the dedicated DividendX Blob store is allowed');
assert.ok(process.env.VERCEL_OIDC_TOKEN, 'VERCEL_OIDC_TOKEN must be loaded from the linked local environment');

const brokerUrl = pathToFileURL(resolve('packages/hosted-broker/dist/src/index.js')).href;
const {
  BlobJsonCasStore, DEFAULT_LIMITS, HostedSessionBroker, HttpFailure, LedgerFailure, PROGRAM_ID, PUBLIC_GENESIS_HASHES,
  SessionLedgerRepository, VercelSandboxProvider, ipHash, visitorHash,
} = await import(brokerUrl);
const require = createRequire(resolve('packages/hosted-broker/package.json'));
const { del } = await import(require.resolve('@vercel/blob'));
const output = await open(outputPath, 'wx', 0o600);

const startedAt = Date.now();
const probeDeadline = startedAt + PROBE_DEADLINE_MS;
const overallAbort = AbortSignal.timeout(PROBE_DEADLINE_MS);
const pathname = `private/dividendx/probes/provider-${randomUUID()}.json`;
const secret = randomBytes(32);
const visitors = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const visitorHashes = visitors.map((value) => visitorHash(secret, value));
const ipHashes = ['probe-wallet', 'probe-guided'].map((value) => ipHash(secret, value));
const limits = { ...DEFAULT_LIMITS, active: 2 };
const store = new BlobJsonCasStore();
const ledger = new SessionLedgerRepository(store, undefined, limits, pathname);
const provider = new VercelSandboxProvider(snapshotId, 15_000);
const boundedFetch = (input, init = {}) => fetch(input, {
  ...init,
  signal: init.signal ? AbortSignal.any([init.signal, overallAbort]) : overallAbort,
});
const broker = new HostedSessionBroker({ ledger, provider, secret, fetch: boundedFetch, clock: { now: () => new Date() }, limits });
const providerNames = new Set();
const receipt = {
  schema: 'dividendx-hosted-provider-probe-v1',
  at: new Date(startedAt).toISOString(),
  storeId: STORE_ID,
  snapshotId,
  guidedSchemaVersion: GUIDED_SCHEMA_VERSION,
  deadlineMs: PROBE_DEADLINE_MS,
  status: 'started',
  phase: 'wallet_start',
  stages: [],
  checks: {},
  sessions: [],
  diagnostics: { records: [] },
  cleanup: { providers: [], lookupErrors: [], blobDeleted: false },
};

function beforeDeadline() {
  assert.ok(Date.now() < probeDeadline, 'hosted provider probe exceeded its 120-second deadline');
}

function beginStage(name) {
  receipt.phase = name;
  receipt.stages.push({ name, status: 'started' });
}

function passStage() {
  const stage = receipt.stages.at(-1);
  if (stage?.status === 'started') stage.status = 'passed';
}

async function waitReady(visitor, kind, initial) {
  const deadline = Math.min(Date.now() + READINESS_DEADLINE_MS, probeDeadline);
  let current = initial;
  while (current.status === 'starting' && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
    current = await broker.current(visitor, kind);
  }
  assert.equal(current.status, 'ready', `${kind} sandbox did not become ready before the probe deadline`);
  assert.ok(current.sessionId && current.runtimeId && current.expiresAt);
  return current;
}

async function rememberProvider(visitor, kind) {
  const record = await ledger.current(visitor, kind);
  if (record) providerNames.add(record.providerName);
  return record;
}

function containsPrivateRpc(value) {
  const encoded = JSON.stringify(value);
  return /(?:127\.0\.0\.1|localhost|\.vercel\.run|ws:\/\/|http:\/\/)/i.test(encoded);
}

try {
  beginStage('wallet_start');
  beforeDeadline();
  const wallet = await waitReady(visitorHashes[0], 'wallet', await broker.start(visitorHashes[0], ipHashes[0], 'wallet', null));
  const walletRecord = await rememberProvider(visitorHashes[0], 'wallet');
  assert.ok(walletRecord); assert.equal(providerNames.size, 1);
  passStage();

  beginStage('guided_start');
  beforeDeadline();
  const guided = await waitReady(visitorHashes[1], 'guided', await broker.start(visitorHashes[1], ipHashes[1], 'guided', null));
  const guidedRecord = await rememberProvider(visitorHashes[1], 'guided');
  assert.ok(guidedRecord); assert.equal(providerNames.size, 2, 'probe must create exactly two distinct providers');
  assert.notEqual(wallet.runtimeId, guided.runtimeId, 'wallet and guided runtimes must be distinct');
  passStage();

  beginStage('wallet_proxy');
  const manifestResult = await broker.proxy(visitorHashes[0], 'wallet', wallet.sessionId, 'GET', '/manifest');
  assert.equal(manifestResult.status, 200);
  const manifest = manifestResult.value;
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.kind, 'surfnet');
  assert.equal(manifest.runtimeId, wallet.runtimeId); assert.equal(manifest.programId, PROGRAM_ID);
  assert.equal(manifest.rpcUrl, `/api/sandbox/wallet/${wallet.sessionId}/rpc`);
  assert.equal(manifest.hostedSessionId, wallet.sessionId); assert.equal(manifest.expiresAt, wallet.expiresAt);
  assert.equal('wsUrl' in manifest, false); assert.equal(PUBLIC_GENESIS_HASHES.has(manifest.genesisHash), false);

  const rpcBody = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'provider-probe', method: 'getGenesisHash', params: [] }));
  const rpcResult = await broker.proxy(visitorHashes[0], 'wallet', wallet.sessionId, 'POST', '/rpc', rpcBody);
  assert.equal(rpcResult.status, 200); assert.equal(rpcResult.value?.result, manifest.genesisHash);

  let crossVisitorDenied = false;
  try { await broker.proxy(visitorHashes[1], 'wallet', wallet.sessionId, 'GET', '/manifest'); }
  catch (error) { crossVisitorDenied = error instanceof HttpFailure && error.status === 404; }
  assert.equal(crossVisitorDenied, true, 'another visitor must not access the wallet session');
  passStage();

  beginStage('guided_proxy');
  const guidedResult = await broker.proxy(visitorHashes[1], 'guided', guided.sessionId, 'GET', '/state');
  assert.equal(guidedResult.status, 200);
  const guidedState = guidedResult.value;
  assert.equal(guidedState?.schemaVersion, GUIDED_SCHEMA_VERSION, 'snapshot must contain the v4 guided runtime');
  assert.equal(guidedState.runtimeId, guided.runtimeId);
  assert.equal(guidedState.status, 'idle');
  assert.equal(guidedState.revision, 0);
  assert.equal(guidedState.sessionId, null);
  assert.equal(guidedState.asset, null);
  assert.equal(guidedState.activeStep, null);
  assert.equal(guidedState.nextStep, null);
  assert.deepEqual(guidedState.completedSteps, []);
  assert.equal(guidedState.snapshot, null);
  assert.deepEqual(guidedState.transactions, []);
  assert.equal(guidedState.error, null);
  assert.equal(containsPrivateRpc(guidedState), false);

  let crossGuidedVisitorDenied = false;
  try { await broker.proxy(visitorHashes[0], 'guided', guided.sessionId, 'GET', '/state'); }
  catch (error) { crossGuidedVisitorDenied = error instanceof HttpFailure && error.status === 404; }
  assert.equal(crossGuidedVisitorDenied, true, 'another visitor must not access the guided session');
  passStage();

  beginStage('gateway_auth');
  for (const record of [walletRecord, guidedRecord]) {
    const view = await provider.get(record.providerName);
    assert.equal(view.status, 'running'); assert.ok(view.domain);
    const unauthenticated = await boundedFetch(new URL('/health', `${view.domain}/`), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    assert.equal(unauthenticated.status, 401, 'public gateway health must reject missing bearer auth');
    await unauthenticated.body?.cancel();
  }
  passStage();

  Object.assign(receipt.checks, {
    exactProviderCount: 2,
    walletReady: true,
    guidedReady: true,
    distinctRuntimeIds: true,
    walletManifestRewritten: true,
    walletWebSocketOmitted: true,
    walletRpcGenesisMatched: true,
    publicGenesisRejected: true,
    crossVisitorDenied: true,
    crossGuidedVisitorDenied: true,
    guidedV4IdleState: true,
    guidedStateSanitized: true,
    unauthenticatedGatewayDenied: true,
  });
  receipt.sessions.push(
    { kind: 'wallet', providerName: walletRecord.providerName, runtimeId: wallet.runtimeId, providerStatus: walletRecord.providerStatus },
    { kind: 'guided', providerName: guidedRecord.providerName, runtimeId: guided.runtimeId, providerStatus: guidedRecord.providerStatus },
  );
  receipt.status = 'passed';
  receipt.phase = 'complete';
} catch (error) {
  receipt.status = 'failed';
  receipt.errorType = error?.constructor?.name ?? 'UnknownError';
  const stage = receipt.stages.at(-1);
  if (stage?.status === 'started') stage.status = 'failed';
  if (error instanceof LedgerFailure) {
    receipt.errorCode = error.code;
    receipt.errorMessage = error.message;
  }
  process.exitCode = 1;
} finally {
  const diagnosed = new Set();
  for (const [visitor, kind] of [[visitorHashes[0], 'wallet'], [visitorHashes[1], 'guided']]) {
    try {
      const record = await rememberProvider(visitor, kind);
      if (record && !diagnosed.has(record.id)) {
        diagnosed.add(record.id);
        receipt.diagnostics.records.push({ kind, providerName: record.providerName, status: record.status,
          providerStatus: record.providerStatus, errorCode: record.errorCode });
      }
    }
    catch (error) {
      receipt.cleanup.lookupErrors.push({ kind, errorType: error?.constructor?.name ?? 'UnknownError' });
      receipt.status = 'cleanup_failed'; process.exitCode = 1;
    }
  }
  if (providerNames.size > 2) {
    receipt.status = 'cleanup_failed'; receipt.cleanup.providerLimitExceeded = true; process.exitCode = 1;
  }
  for (const name of providerNames) {
    try {
      await provider.stopAndDelete(name);
      receipt.cleanup.providers.push({ providerName: name, stoppedAndDeleted: true });
    } catch (error) {
      receipt.cleanup.providers.push({ providerName: name, stoppedAndDeleted: false, errorType: error?.constructor?.name ?? 'UnknownError' });
      receipt.status = 'cleanup_failed'; process.exitCode = 1;
    }
  }
  try {
    await del(pathname, { abortSignal: AbortSignal.timeout(15_000) });
    receipt.cleanup.blobDeleted = true;
  } catch (error) {
    receipt.cleanup.blobDeleteErrorType = error?.constructor?.name ?? 'UnknownError';
    receipt.status = 'cleanup_failed'; process.exitCode = 1;
  }
  receipt.elapsedMs = Date.now() - startedAt;
  const evidence = `${JSON.stringify(receipt, null, 2)}\n`;
  assert.equal(/\.vercel\.run|authorization|gatewayToken|visitorHash|ipHash|cookie/i.test(evidence), false, 'evidence contains private broker metadata');
  await output.writeFile(evidence);
  await output.close();
  console.log(JSON.stringify({ status: receipt.status, output: outputPath, cleanup: receipt.cleanup }));
}
