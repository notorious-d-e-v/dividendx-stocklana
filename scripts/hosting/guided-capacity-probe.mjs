import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

// Opt-in QA only. Neither mode addresses the production ledger or creates a VM
// without an explicit --execute true and a new, private evidence file.
const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const BROKER_ROOT = resolve(PROJECT_ROOT, 'packages/hosted-broker');
const STORE_ID = 'store_HwInrQjHFXMVbBLI';
const SESSIONS = 16;
const ROUNDS = 5;
const PROVIDER_BATCH = 4;
const READY_DEADLINE_MS = 45_000;
const PROVIDER_DEADLINE_MS = 7 * 60_000;
const BLOB_TIMEOUT_MS = 15_000;
const MUTATIONS_PER_ROUND = [0, 1, 0, 1, 0];

function argsOf(argv) {
  const allowed = new Set(['--execute', '--output', '--mode']);
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    assert.ok(allowed.has(key), 'unsupported argument');
    assert.ok(argv[index + 1], 'missing argument value');
    assert.ok(!args.has(key), 'duplicate argument');
    args.set(key, argv[index + 1]);
  }
  assert.deepEqual([...args.keys()].sort(), ['--execute', '--mode', '--output']);
  assert.equal(args.get('--execute'), 'true', 'explicit --execute true is required');
  assert.ok(['meter', 'provider'].includes(args.get('--mode')), 'mode must be meter or provider');
  assert.ok(isAbsolute(args.get('--output') ?? ''), 'a new absolute --output is required');
  assert.ok(args.get('--output').endsWith('.json'), 'evidence output must be a JSON file');
  return args;
}

function safeType(error) {
  const value = error?.constructor?.name;
  const allowed = new Set(['Error', 'AssertionError', 'LedgerFailure', 'JsonStoreFailure', 'HttpFailure',
    'APIError', 'BlobError', 'AbortError', 'TypeError', 'SyntaxError', 'RangeError']);
  return allowed.has(value) ? value : 'UnknownError';
}

const KNOWN_LEDGER_CODES = new Set(['capacity', 'global_quota', 'visitor_quota', 'ip_quota', 'cooldown', 'conflict', 'busy', 'budget',
  'create_unknown', 'launch_unknown', 'provisioning_timeout', 'provider_stopped', 'identity_changed', 'stopping', 'expired']);
function safeCode(error) {
  const code = error?.code;
  return typeof code === 'string' && (KNOWN_LEDGER_CODES.has(code) || /^BLOB_[A-Z0-9_]{1,59}$/.test(code)) ? code : null;
}

function failure(error) { return { type: safeType(error), code: safeCode(error) }; }
function elapsed(start) { return Number((performance.now() - start).toFixed(1)); }
function pause(ms) { return new Promise((done) => setTimeout(done, ms)); }
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
}

const args = argsOf(process.argv.slice(2));
const mode = args.get('--mode');
const outputPath = args.get('--output');
let output;
try { output = await open(outputPath, 'wx', 0o600); }
catch (error) { throw new Error(`Cannot reserve a new evidence file (${safeType(error)}).`); }

const probeId = randomUUID();
const prefix = `private/dividendx/probes/capacity-${probeId}`;
const ledgerPath = `${prefix}/ledger.json`;
const meterPrefix = `${prefix}/meters`;
const meterPaths = new Set();
const createdProviders = new Set();
const providerCreateOutcome = new Map();
const providerVisitors = [];
const startedAt = Date.now();
const receipt = {
  schema: 'dividendx-guided-capacity-probe-v1',
  at: new Date(startedAt).toISOString(), mode, storeId: STORE_ID,
  namespace: prefix, sessionCap: SESSIONS, status: 'started', phase: 'configure',
  checks: {}, metrics: {}, sessions: [], failures: [],
  cleanup: { providers: [], blobPaths: [], retainedForReconciliation: false },
};
let store;
let ledger;
let provider;
let blobDel;
let ledgerMayExist = false;

async function waitReady(broker, visitor, initial) {
  let current = initial;
  const deadline = Math.min(Date.now() + READY_DEADLINE_MS, startedAt + PROVIDER_DEADLINE_MS);
  while (current.status === 'starting' && Date.now() < deadline) {
    await pause(2_000);
    current = await broker.current(visitor, 'guided');
  }
  assert.equal(current.status, 'ready', 'guided runtime did not become ready');
  assert.ok(current.sessionId && current.runtimeId && current.expiresAt);
  return current;
}

async function runMeter({ SessionLedgerRepository, DEFAULT_LIMITS, BlobJsonCasStore, MAX_LEDGER_BYTES }) {
  // A fixed clock prevents a minute rollover during the five charge rounds.
  const fixedNow = new Date();
  const clock = { now: () => fixedNow };
  const measurements = { readMs: [], createMs: [], casMs: [], casConflicts: 0, chargeMs: [], roundsMs: [] };
  const base = new BlobJsonCasStore();
  const measured = {
    async read(path, maxBytes) {
      const started = performance.now();
      try { return await base.read(path, maxBytes); }
      finally { measurements.readMs.push(elapsed(started)); }
    },
    async create(path, value, maxBytes) {
      const started = performance.now();
      try { return await base.create(path, value, maxBytes); }
      finally { measurements.createMs.push(elapsed(started)); }
    },
    async compareAndSwap(path, etag, value, maxBytes) {
      const started = performance.now();
      try {
        const accepted = await base.compareAndSwap(path, etag, value, maxBytes);
        if (!accepted) measurements.casConflicts += 1;
        return accepted;
      } finally { measurements.casMs.push(elapsed(started)); }
    },
  };
  store = base;
  ledger = new SessionLedgerRepository(measured, clock, DEFAULT_LIMITS, ledgerPath, meterPrefix);
  const visitors = [];
  receipt.phase = 'prepare_synthetic_sessions';
  for (let index = 0; index < SESSIONS; index += 1) {
    const visitor = randomBytes(32).toString('hex');
    const ip = randomBytes(32).toString('hex');
    const id = randomBytes(16).toString('hex');
    const runtimeId = randomBytes(16).toString('hex');
    ledgerMayExist = true;
    const reserved = await ledger.reserve({ id, visitorHash: visitor, ipHash: ip, kind: 'guided', providerName: `capacity-probe-${id}` });
    assert.equal(reserved.created, true);
    assert.equal(reserved.record.id, id);
    meterPaths.add(ledger.meterPath(id));
    await ledger.initializeMeter(reserved.record, runtimeId);
    const ready = await ledger.updateFenced(id, ['starting'], true, (record) => {
      record.status = 'ready';
      record.providerStatus = 'running';
      record.runtimeId = runtimeId;
      record.launchAttemptedAt = fixedNow.toISOString();
    });
    assert.equal(ready.applied, true);
    visitors.push({ id, visitor, runtimeId });
  }
  assert.equal(visitors.length, SESSIONS);
  receipt.phase = 'seed_retained_tombstones';
  const unseeded = await base.read(ledgerPath);
  assert.ok(unseeded?.etag);
  const seeded = structuredClone(unseeded.value);
  const date = fixedNow.toISOString().slice(0, 10);
  const daily = seeded.daily[date];
  assert.ok(daily && daily.global === SESSIONS);
  const template = seeded.sessions[visitors[0].id];
  assert.ok(template);
  for (let index = SESSIONS; index < 500; index += 1) {
    const id = randomBytes(16).toString('hex');
    const visitorHash = randomBytes(32).toString('hex');
    const ipHash = randomBytes(32).toString('hex');
    const old = new Date(fixedNow.getTime() - 16 * 60_000).toISOString();
    seeded.sessions[id] = { ...template, id, visitorHash, ipHash,
      providerName: `capacity-probe-retired-${id}`, status: 'expired',
      createdAt: old, provisioningDeadline: old, createAttemptedAt: old,
      launchAttemptedAt: old, expiresAt: new Date(fixedNow.getTime() - 60_000).toISOString(),
      tombstoneUntil: new Date(fixedNow.getTime() + 24 * 60 * 60_000).toISOString(),
      providerStatus: 'deleted', providerExpiresAt: old, providerDomain: null,
      runtimeId: null, errorCode: 'expired' };
    seeded.latest[`${visitorHash}:guided`] = id;
    seeded.visitorLastCreatedAt[visitorHash] = old;
    daily.visitors[visitorHash] = 1;
    daily.ips[ipHash] = 1;
    daily.global += 1;
  }
  seeded.revision += 1;
  assert.equal(Object.keys(seeded.sessions).length, 500);
  assert.equal(daily.global, 500);
  const ledgerBytes = Buffer.byteLength(JSON.stringify(seeded));
  assert.ok(ledgerBytes <= MAX_LEDGER_BYTES, 'synthetic ledger exceeds repository size limit');
  assert.equal(await measured.compareAndSwap(ledgerPath, unseeded.etag, seeded, MAX_LEDGER_BYTES), true);
  const before = await base.read(ledgerPath);
  assert.ok(before?.etag);
  const revisionBefore = before.value.revision;
  measurements.setupCasConflicts = measurements.casConflicts;
  measurements.casConflicts = 0;

  receipt.phase = 'simultaneous_meter_charges';
  for (let round = 0; round < ROUNDS; round += 1) {
    const roundStarted = performance.now();
    const results = await Promise.allSettled(visitors.map(async ({ id, visitor }) => {
      const started = performance.now();
      try { await ledger.charge(id, visitor, 'guided', MUTATIONS_PER_ROUND[round]); }
      finally { measurements.chargeMs.push(elapsed(started)); }
    }));
    measurements.roundsMs.push(elapsed(roundStarted));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
  }
  const after = await base.read(ledgerPath);
  assert.equal(after?.etag, before.etag, 'global admission ETag changed during charges');
  assert.equal(after.value.revision, revisionBefore, 'global admission revision changed during charges');
  const counters = [];
  for (const { id } of visitors) {
    const meter = await ledger.readMeter(id);
    assert.ok(meter, 'session meter missing');
    assert.equal(meter.forwardedTotal, ROUNDS);
    assert.equal(meter.mutationTotal, 2);
    assert.equal(meter.minuteCount, ROUNDS);
    counters.push({ forwardedTotal: meter.forwardedTotal, mutationTotal: meter.mutationTotal, minuteCount: meter.minuteCount });
  }
  receipt.checks = { exactSessions: SESSIONS, exactCharges: SESSIONS * ROUNDS,
    retainedSyntheticTombstones: 500 - SESSIONS, admissionRecords: 500, admissionLedgerBytes: ledgerBytes,
    globalAdmissionEtagUnchanged: true, globalAdmissionRevisionUnchanged: true,
    perSessionForwarded: ROUNDS, perSessionMutations: 2, perSessionMinute: ROUNDS };
  receipt.metrics = measurements;
  receipt.metrics.chargeP50Ms = percentile(measurements.chargeMs, 0.5);
  receipt.metrics.chargeP95Ms = percentile(measurements.chargeMs, 0.95);
  receipt.sessions = counters;
}

async function runProvider({ SessionLedgerRepository, BlobJsonCasStore, DEFAULT_LIMITS,
  HostedSessionBroker, VercelSandboxProvider, visitorHash, ipHash }) {
  const manifest = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'planning/evidence/hosted-runtime-snapshot-v4-2026-09-19.json'), 'utf8'));
  assert.match(manifest.snapshotId, /^snap_[A-Za-z0-9]+$/);
  assert.equal(manifest.guidedSchemaVersion, 4);
  assert.equal(process.env.DIVIDENDX_SANDBOX_SNAPSHOT_ID, manifest.snapshotId,
    'configured snapshot must match the accepted v4 manifest');
  receipt.snapshotId = manifest.snapshotId;
  const secret = randomBytes(32);
  const base = new BlobJsonCasStore();
  store = base;
  ledger = new SessionLedgerRepository(base, undefined, DEFAULT_LIMITS, ledgerPath, meterPrefix);
  const underlying = new VercelSandboxProvider(manifest.snapshotId, 15_000);
  provider = {
    async create(input) {
      assert.ok(createdProviders.size < SESSIONS, 'provider creation cap reached');
      assert.ok(!createdProviders.has(input.name), 'provider create must not retry a name');
      createdProviders.add(input.name); // retained even if create times out
      providerCreateOutcome.set(input.name, 'unknown');
      const created = await underlying.create(input);
      providerCreateOutcome.set(input.name, 'created');
      return created;
    },
    get: (name) => underlying.get(name),
    stopAndDelete: (name) => underlying.stopAndDelete(name),
  };
  const broker = new HostedSessionBroker({
    ledger, provider, secret, clock: { now: () => new Date() }, limits: DEFAULT_LIMITS,
    fetch: (input, init = {}) => fetch(input, { ...init, redirect: 'error',
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }),
  });
  const visitors = Array.from({ length: SESSIONS }, (_, index) => ({
    index, visitor: visitorHash(secret, `capacity-${probeId}-${index}`),
    ip: ipHash(secret, `capacity-ip-${probeId}-${index}`),
  }));
  providerVisitors.push(...visitors);
  receipt.phase = 'provider_start';
  const latencies = [];
  for (let offset = 0; offset < SESSIONS; offset += PROVIDER_BATCH) {
    assert.ok(Date.now() < startedAt + PROVIDER_DEADLINE_MS, 'provider probe deadline exceeded');
    const batch = visitors.slice(offset, offset + PROVIDER_BATCH);
    const outcomes = await Promise.allSettled(batch.map(async ({ index, visitor, ip }) => {
      const started = performance.now();
      ledgerMayExist = true;
      const initial = await broker.start(visitor, ip, 'guided', null);
      const ready = await waitReady(broker, visitor, initial);
      const record = await ledger.current(visitor, 'guided');
      assert.ok(record && record.id === ready.sessionId && record.status === 'ready');
      assert.equal(record.runtimeId, ready.runtimeId);
      assert.ok(record.providerName && createdProviders.has(record.providerName));
      meterPaths.add(ledger.meterPath(record.id));
      latencies.push(elapsed(started));
      return { index, sessionId: ready.sessionId, runtimeId: ready.runtimeId,
        providerName: record.providerName, bootMs: elapsed(started) };
    }));
    for (const [position, result] of outcomes.entries()) {
      if (result.status === 'fulfilled') receipt.sessions.push(result.value);
      else {
        const item = { index: batch[position].index, error: failure(result.reason) };
        try {
          const record = await ledger.current(batch[position].visitor, 'guided');
          if (record) {
            item.status = record.status;
            item.errorCode = safeCode({ code: record.errorCode });
          }
        } catch { item.ledgerLookup = 'unknown'; }
        receipt.failures.push(item);
      }
    }
    if (outcomes.some((result) => result.status === 'rejected')) {
      throw outcomes.find((result) => result.status === 'rejected').reason;
    }
  }
  assert.equal(receipt.sessions.length, SESSIONS);
  assert.equal(createdProviders.size, SESSIONS);
  assert.equal(new Set(receipt.sessions.map((item) => item.runtimeId)).size, SESSIONS, 'runtime identities must be unique');
  receipt.phase = 'read_guided_state';
  for (const item of receipt.sessions) {
    const visitor = visitors[item.index].visitor;
    const result = await broker.proxy(visitor, 'guided', item.sessionId, 'GET', '/state');
    assert.equal(result.status, 200);
    assert.equal(result.value?.schemaVersion, 4);
    assert.equal(result.value?.runtimeId, item.runtimeId);
    assert.equal(result.value?.status, 'idle');
    assert.equal(result.value?.revision, 0);
    assert.equal(result.value?.sessionId, null);
    assert.deepEqual(result.value?.transactions, []);
  }
  receipt.checks = { ready: SESSIONS, uniqueRuntimeIds: SESSIONS, guidedStateReads: SESSIONS,
    providerCreationsAtMost: SESSIONS };
  receipt.metrics = { bootMs: latencies, providerCreations: createdProviders.size };
  receipt.metrics.bootP50Ms = percentile(latencies, 0.5);
  receipt.metrics.bootP95Ms = percentile(latencies, 0.95);
}

async function cleanupProvider() {
  if (!provider) return true;
  let allReconciled = true;
  if (ledgerMayExist) {
    for (const { visitor } of providerVisitors) {
      let record;
      try { record = await ledger.current(visitor, 'guided'); }
      catch (error) {
        receipt.cleanup.providers.push({ status: 'ledger_lookup_unknown', error: failure(error) });
        allReconciled = false;
        continue;
      }
      if (!record) continue;
      meterPaths.add(ledger.meterPath(record.id));
      let meter;
      try { meter = await ledger.readMeter(record.id); }
      catch (error) {
        receipt.cleanup.providers.push({ name: record.providerName, status: 'meter_lookup_unknown', error: failure(error) });
        allReconciled = false;
        continue;
      }
      if (!meter) continue;
      try { await ledger.closeMeter(record); }
      catch (error) {
        receipt.cleanup.providers.push({ name: record.providerName, status: 'meter_close_unknown', error: failure(error) });
        allReconciled = false;
      }
    }
  }
  // Every attempted name is known before create, including an ambiguous timeout.
  for (const name of createdProviders) {
    let view;
    try { view = await provider.get(name); }
    catch (error) {
      receipt.cleanup.providers.push({ name, status: 'unknown', error: failure(error) });
      allReconciled = false;
      continue;
    }
    if (view.status === 'missing') {
      const uncertain = providerCreateOutcome.get(name) === 'unknown';
      receipt.cleanup.providers.push({ name, status: uncertain ? 'create_unknown_missing' : 'missing' });
      if (uncertain) allReconciled = false;
      continue;
    }
    if (!['running', 'pending', 'stopped', 'failed', 'aborted'].includes(view.status)) {
      receipt.cleanup.providers.push({ name, status: view.status, retained: true });
      allReconciled = false;
      continue;
    }
    try {
      await provider.stopAndDelete(name); // checks stopped state before delete
      receipt.cleanup.providers.push({ name, status: 'stopped_and_deleted' });
    } catch (error) {
      receipt.cleanup.providers.push({ name, status: 'uncertain', error: failure(error) });
      allReconciled = false;
    }
  }
  return allReconciled;
}

async function cleanupBlobs() {
  if (!store || !blobDel) return;
  // No list and no prefix deletion. The set is populated only from own IDs.
  for (const path of [...meterPaths, ...(ledgerMayExist ? [ledgerPath] : [])]) {
    try {
      await blobDel(path, { abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
      receipt.cleanup.blobPaths.push({ path, deleted: true });
    } catch (error) {
      receipt.cleanup.blobPaths.push({ path, deleted: false, error: failure(error) });
      receipt.status = 'cleanup_failed'; process.exitCode = 1;
    }
  }
}

try {
  try { loadEnvFile(resolve(PROJECT_ROOT, '.env.local')); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  assert.equal(process.env.BLOB_STORE_ID, STORE_ID, 'dedicated DividendX Blob store required');
  assert.ok(process.env.VERCEL_OIDC_TOKEN, 'linked Blob credentials required');
  const require = createRequire(resolve(BROKER_ROOT, 'package.json'));
  ({ del: blobDel } = await import(require.resolve('@vercel/blob')));
  const broker = await import(pathToFileURL(resolve(BROKER_ROOT, 'dist/src/index.js')).href);
  receipt.phase = mode === 'meter' ? 'meter_setup' : 'provider_setup';
  if (mode === 'meter') await runMeter(broker);
  else await runProvider(broker);
  receipt.status = 'passed';
  receipt.phase = 'complete';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = failure(error);
  process.exitCode = 1;
} finally {
  receipt.phase = receipt.status === 'passed' ? 'cleanup' : receipt.phase;
  const reconciled = await cleanupProvider();
  if (reconciled) await cleanupBlobs();
  else {
    receipt.cleanup.retainedForReconciliation = true;
    receipt.status = 'cleanup_failed'; process.exitCode = 1;
  }
  receipt.finishedAt = new Date().toISOString();
  receipt.elapsedMs = Date.now() - startedAt;
  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  assert.equal(/(?:authorization|bearer|gatewayToken|visitorHash|ipHash|cookie|\.vercel\.run|https?:\/\/)/i.test(encoded), false,
    'evidence contains private broker metadata');
  await output.writeFile(encoded);
  await output.close();
  console.log(JSON.stringify({ status: receipt.status, mode, output: outputPath,
    providerCreations: createdProviders.size, retainedForReconciliation: receipt.cleanup.retainedForReconciliation }));
}
