import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

const STORE_ID = 'store_HwInrQjHFXMVbBLI';
const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const BROKER_ROOT = resolve(PROJECT_ROOT, 'packages/hosted-broker');
const MAX_CONCURRENT_WRITERS = 8;
const SEQUENTIAL_UPDATES = 10;
const SDK_TIMEOUT_MS = 15_000;

function parseArgs(values) {
  const allowed = new Set(['--execute', '--output']);
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    assert.ok(allowed.has(key), `unsupported argument: ${key ?? '(missing)'}`);
    assert.ok(values[index + 1], `missing value for ${key}`);
    assert.equal(parsed[key], undefined, `duplicate argument: ${key}`);
    parsed[key] = values[index + 1];
  }
  return parsed;
}

function loadLocalEnvironment() {
  try {
    loadEnvFile(resolve(PROJECT_ROOT, '.env.local'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function milliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(1));
}

function summarizeEtag(etag) {
  assert.equal(typeof etag, 'string', 'ETag must be a string');
  assert.ok(etag.length > 0, 'ETag must not be empty');
  return {
    sha256: createHash('sha256').update(etag).digest('hex'),
    length: etag.length,
    weak: /^W\//i.test(etag),
    quoted: etag.startsWith('"') && etag.endsWith('"'),
  };
}

function safeMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error);
  if (
    message.length > 240
    || /(?:authorization|bearer|token|https?:\/\/|blob\.vercel-storage\.com|private\/dividendx)/i.test(message)
  ) return 'Failure details withheld.';
  return message;
}

const args = parseArgs(process.argv.slice(2));
assert.equal(args['--execute'], 'true', 'explicit --execute true is required');
assert.ok(args['--output'] && isAbsolute(args['--output']), 'a new absolute --output is required');

loadLocalEnvironment();
assert.equal(process.env.BLOB_STORE_ID, STORE_ID, 'only the dedicated DividendX store is allowed');
assert.ok(process.env.VERCEL_OIDC_TOKEN, 'VERCEL_OIDC_TOKEN is required');

// Reserve the evidence path before any cloud call. wx prevents overwriting evidence.
const evidenceHandle = await open(args['--output'], 'wx', 0o600);
const pathname = `private/dividendx/probes/cas-${randomUUID()}.json`;
// Exercise the observed conditional-write conflict with a realistically sized ledger.
const padding = randomBytes(30_000).toString('hex');
const makeValue = (revision) => ({ schemaVersion: 1, revision, padding });
const encodedValue = (revision) => JSON.stringify(makeValue(revision));
const putOptions = {
  access: 'private',
  addRandomSuffix: false,
  contentType: 'application/json',
};

const require = createRequire(resolve(BROKER_ROOT, 'package.json'));
const { del, get, head, put } = await import(require.resolve('@vercel/blob'));
const brokerModule = await import(pathToFileURL(resolve(BROKER_ROOT, 'dist/src/index.js')).href);
const { BlobJsonCasStore, mutateJson } = brokerModule;
const baseStore = new BlobJsonCasStore();

let created = false;
let phase = 'initializing';
const metrics = {
  sequential: { operationMs: [], readMs: [], casMs: [], casConflicts: 0, revisions: [] },
  concurrent: { operationMs: [], readMs: [], casMs: [], casConflicts: 0, revisions: [] },
};
let activeMetrics;
const measuredStore = {
  async read(path) {
    const startedAt = performance.now();
    try {
      return await baseStore.read(path);
    } finally {
      activeMetrics.readMs.push(milliseconds(startedAt));
    }
  },
  async create(path, value) {
    return baseStore.create(path, value);
  },
  async compareAndSwap(path, etag, value) {
    const startedAt = performance.now();
    try {
      const swapped = await baseStore.compareAndSwap(path, etag, value);
      if (!swapped) activeMetrics.casConflicts += 1;
      return swapped;
    } finally {
      activeMetrics.casMs.push(milliseconds(startedAt));
    }
  },
};

const receipt = {
  schema: 'dividendx-private-blob-cas-probe-v3',
  at: new Date().toISOString(),
  storeId: STORE_ID,
  payloadBytes: Buffer.byteLength(encodedValue(0)),
  concurrentWriters: MAX_CONCURRENT_WRITERS,
  casAttemptLimit: 12,
  status: 'started',
  phase,
  probeDeleted: false,
  etags: {},
  sequential: metrics.sequential,
  concurrent: metrics.concurrent,
};

try {
  phase = 'create';
  receipt.phase = phase;
  const createStartedAt = performance.now();
  const initialPut = await put(pathname, encodedValue(0), {
    ...putOptions,
    allowOverwrite: false,
    abortSignal: AbortSignal.timeout(SDK_TIMEOUT_MS),
  });
  created = true;
  receipt.createMs = milliseconds(createStartedAt);
  receipt.etags.put = summarizeEtag(initialPut.etag);

  phase = 'etag_diagnostic';
  receipt.phase = phase;
  const identityRead = await get(pathname, {
    access: 'private',
    useCache: false,
    headers: { 'Accept-Encoding': 'identity' },
    abortSignal: AbortSignal.timeout(SDK_TIMEOUT_MS),
  });
  assert.equal(identityRead?.statusCode, 200, 'identity GET must return 200');
  const identityValue = await new Response(identityRead.stream).json();
  assert.equal(identityValue.revision, 0);
  receipt.identityContentEncoding = identityRead.headers?.get('content-encoding') ?? null;
  receipt.etags.identityGet = summarizeEtag(identityRead.blob.etag);

  const diagnosticHead = await head(pathname, {
    abortSignal: AbortSignal.timeout(SDK_TIMEOUT_MS),
  });
  receipt.etags.head = summarizeEtag(diagnosticHead.etag);
  receipt.etags.putMatchesIdentityGet = initialPut.etag === identityRead.blob.etag;
  receipt.etags.putMatchesHead = initialPut.etag === diagnosticHead.etag;
  assert.equal(receipt.etags.put.weak, false, 'PUT must return a strong ETag');
  assert.equal(receipt.etags.identityGet.weak, false, 'identity GET must return a strong ETag');
  assert.equal(receipt.etags.putMatchesIdentityGet, true, 'PUT and identity GET ETags must match');

  const putEtagCasStartedAt = performance.now();
  await put(pathname, encodedValue(1), {
    ...putOptions,
    allowOverwrite: true,
    ifMatch: initialPut.etag,
    abortSignal: AbortSignal.timeout(SDK_TIMEOUT_MS),
  });
  receipt.putReturnedEtagCas = { accepted: true, latencyMs: milliseconds(putEtagCasStartedAt) };

  const getReturned = await baseStore.read(pathname);
  assert.equal(getReturned?.value.revision, 1);
  const getEtagCasStartedAt = performance.now();
  const getEtagAccepted = await baseStore.compareAndSwap(pathname, getReturned.etag, makeValue(2));
  receipt.identityGetEtagCas = { accepted: getEtagAccepted, latencyMs: milliseconds(getEtagCasStartedAt) };
  assert.equal(getEtagAccepted, true, 'identity GET ETag CAS must succeed');

  const duplicateStartedAt = performance.now();
  const duplicateCreated = await baseStore.create(pathname, makeValue(99));
  receipt.duplicateCreate = { rejected: !duplicateCreated, latencyMs: milliseconds(duplicateStartedAt) };
  assert.equal(duplicateCreated, false, 'duplicate create must be rejected');

  phase = 'sequential_updates';
  receipt.phase = phase;
  activeMetrics = metrics.sequential;
  for (let index = 0; index < SEQUENTIAL_UPDATES; index += 1) {
    const operationStartedAt = performance.now();
    const updated = await mutateJson(measuredStore, pathname, () => makeValue(0), (current) => {
      current.revision += 1;
    }, { attempts: 12 });
    activeMetrics.operationMs.push(milliseconds(operationStartedAt));
    activeMetrics.revisions.push(updated.revision);
  }
  assert.deepEqual(activeMetrics.revisions, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(activeMetrics.casConflicts, 0, 'sequential updates must not conflict');

  phase = 'concurrent_updates';
  receipt.phase = phase;
  activeMetrics = metrics.concurrent;
  const concurrentRevisions = await Promise.all(Array.from({ length: MAX_CONCURRENT_WRITERS }, async () => {
    const operationStartedAt = performance.now();
    const updated = await mutateJson(measuredStore, pathname, () => makeValue(0), (current) => {
      current.revision += 1;
    }, { attempts: 12 });
    activeMetrics.operationMs.push(milliseconds(operationStartedAt));
    return updated.revision;
  }));
  activeMetrics.revisions.push(...concurrentRevisions.sort((left, right) => left - right));
  assert.deepEqual(activeMetrics.revisions, Array.from({ length: MAX_CONCURRENT_WRITERS }, (_, index) => 13 + index));

  phase = 'final_read';
  receipt.phase = phase;
  const final = await baseStore.read(pathname);
  assert.equal(final?.value.revision, 12 + MAX_CONCURRENT_WRITERS);
  receipt.finalRevision = final.value.revision;
  receipt.status = 'passed';
  receipt.phase = 'complete';
} catch (error) {
  receipt.status = 'failed';
  receipt.phase = phase;
  receipt.errorType = error?.constructor?.name ?? 'UnknownError';
  receipt.errorMessage = safeMessage(error);
  process.exitCode = 1;
} finally {
  phase = 'cleanup';
  try {
    if (created) {
      await del(pathname, { abortSignal: AbortSignal.timeout(SDK_TIMEOUT_MS) });
      receipt.probeDeleted = true;
    }
  } catch (error) {
    receipt.cleanupErrorType = error?.constructor?.name ?? 'UnknownError';
    receipt.cleanupErrorMessage = safeMessage(error);
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  receipt.finishedAt = new Date().toISOString();
  await evidenceHandle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`);
  await evidenceHandle.close();
  console.log(JSON.stringify({
    status: receipt.status,
    phase: receipt.phase,
    output: args['--output'],
    probeDeleted: receipt.probeDeleted,
  }));
}
