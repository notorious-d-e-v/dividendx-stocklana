import {
  BlobAccessError, BlobError, BlobPreconditionFailedError, BlobRequestAbortedError,
  BlobServiceNotAvailable, BlobServiceRateLimited, BlobStoreNotFoundError,
  BlobStoreSuspendedError, BlobUnknownError, get, put,
} from '@vercel/blob';
import { MAX_LEDGER_BYTES } from './contract.js';

export interface VersionedJson<T> { value: T; etag: string | null }
export interface JsonCasStore {
  read<T>(pathname: string, maxBytes?: number): Promise<VersionedJson<T> | null>;
  create<T>(pathname: string, value: T, maxBytes?: number): Promise<boolean>;
  compareAndSwap<T>(pathname: string, etag: string, value: T, maxBytes?: number): Promise<boolean>;
}

export interface BlobSdkAdapter { get: typeof get; put: typeof put }

type BlobOperation = 'READ' | 'CREATE' | 'CAS';
type BlobSdkFailure = 'REJECTED' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'REQUEST_ABORTED'
  | 'ACCESS_DENIED' | 'STORE_NOT_FOUND' | 'STORE_SUSPENDED' | 'UNKNOWN';

export type JsonStoreFailureCode = 'BLOB_READ_STATUS' | 'BLOB_ETAG_WEAK' | 'BLOB_ETAG_MISSING'
  | 'BLOB_LEDGER_OVERSIZE' | 'JSON_LEDGER_BUSY' | 'BLOB_READ_HTTP_429'
  | 'BLOB_READ_HTTP_4XX' | 'BLOB_READ_HTTP_5XX' | 'BLOB_READ_HTTP_OTHER'
  | `BLOB_${BlobOperation}_${BlobSdkFailure}`;

export class JsonStoreFailure extends Error {
  constructor(readonly code: JsonStoreFailureCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'JsonStoreFailure';
  }
}

const CONDITIONAL_OPERATION_CONFLICT =
  'Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.';

function isConditionalOperationConflict(error: unknown): boolean {
  // Blob API currently reports this concurrent conditional-write rejection as
  // bad_request/BlobError rather than precondition_failed. Match no other text.
  return error instanceof BlobError && error.constructor === BlobError
    && error.message === CONDITIONAL_OPERATION_CONFLICT;
}

function isTransientReadFailure(error: unknown): boolean {
  if (error instanceof BlobServiceNotAvailable) return true;
  return error instanceof BlobError
    && /^Vercel Blob: Failed to fetch blob: 5\d{2}(?:\s|$)/.test(error.message);
}

function classifySdkFailure(operation: BlobOperation, error: unknown): never {
  if (operation === 'READ' && error instanceof BlobError) {
    // @vercel/blob 2.8.0 uses this exact prefix for private GET HTTP failures,
    // but discards the response object. Keep only the numeric class; statusText may be sensitive.
    const status = /^Vercel Blob: Failed to fetch blob: (\d{3})(?:\s|$)/.exec(error.message)?.[1];
    if (status === '429') throw new JsonStoreFailure('BLOB_READ_HTTP_429', error);
    if (status?.startsWith('4')) throw new JsonStoreFailure('BLOB_READ_HTTP_4XX', error);
    if (status?.startsWith('5')) throw new JsonStoreFailure('BLOB_READ_HTTP_5XX', error);
    if (status) throw new JsonStoreFailure('BLOB_READ_HTTP_OTHER', error);
  }
  let kind: BlobSdkFailure | undefined;
  if (error instanceof BlobServiceRateLimited) kind = 'RATE_LIMITED';
  else if (error instanceof BlobServiceNotAvailable) kind = 'SERVICE_UNAVAILABLE';
  else if (error instanceof BlobRequestAbortedError) kind = 'REQUEST_ABORTED';
  else if (error instanceof BlobAccessError) kind = 'ACCESS_DENIED';
  else if (error instanceof BlobStoreNotFoundError) kind = 'STORE_NOT_FOUND';
  else if (error instanceof BlobStoreSuspendedError) kind = 'STORE_SUSPENDED';
  else if (error instanceof BlobUnknownError) kind = 'UNKNOWN';
  else if (error instanceof BlobError) kind = 'REJECTED';
  if (!kind) throw error;
  throw new JsonStoreFailure(`BLOB_${operation}_${kind}`, error);
}

function encode<T>(value: T, maxBytes: number): string {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > maxBytes) throw new JsonStoreFailure('BLOB_LEDGER_OVERSIZE');
  return body;
}

async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('BLOB_LEDGER_OVERSIZE');
        throw new JsonStoreFailure('BLOB_LEDGER_OVERSIZE');
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export class BlobJsonCasStore implements JsonCasStore {
  constructor(readonly sdk: BlobSdkAdapter = { get, put }) {}

  async read<T>(pathname: string, maxBytes = MAX_LEDGER_BYTES): Promise<VersionedJson<T> | null> {
    let result;
    // Keep one deadline across both GETs; a slow first request cannot double the function's read time.
    const abortSignal = AbortSignal.timeout(10_000);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await this.sdk.get(pathname, { access: 'private', useCache: false,
          headers: { 'Accept-Encoding': 'identity' }, abortSignal });
        break;
      } catch (error) {
        if (attempt === 0 && isTransientReadFailure(error) && !abortSignal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 30 + Math.floor(Math.random() * 40)));
          if (!abortSignal.aborted) continue;
        }
        classifySdkFailure('READ', error);
      }
    }
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new JsonStoreFailure('BLOB_READ_STATUS');
    const text = await readBounded(result.stream, maxBytes);
    if (!result.blob.etag) throw new JsonStoreFailure('BLOB_ETAG_MISSING');
    if (/^W\//i.test(result.blob.etag)) throw new JsonStoreFailure('BLOB_ETAG_WEAK');
    return { value: JSON.parse(text) as T, etag: result.blob.etag };
  }

  async create<T>(pathname: string, value: T, maxBytes = MAX_LEDGER_BYTES): Promise<boolean> {
    const body = encode(value, maxBytes);
    try {
      await this.sdk.put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', abortSignal: AbortSignal.timeout(10_000) });
      return true;
    } catch (error) {
      // Duplicate-create has no stable typed error. Reconcile by a consistent read.
      if (await this.read<T>(pathname, maxBytes)) return false;
      classifySdkFailure('CREATE', error);
    }
  }

  async compareAndSwap<T>(pathname: string, etag: string, value: T, maxBytes = MAX_LEDGER_BYTES): Promise<boolean> {
    if (!etag) throw new JsonStoreFailure('BLOB_ETAG_MISSING');
    if (/^W\//i.test(etag)) throw new JsonStoreFailure('BLOB_ETAG_WEAK');
    const body = encode(value, maxBytes);
    try {
      await this.sdk.put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: etag, contentType: 'application/json', abortSignal: AbortSignal.timeout(10_000) });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || isConditionalOperationConflict(error)) return false;
      classifySdkFailure('CAS', error);
    }
  }
}

export async function mutateJson<T>(store: JsonCasStore, pathname: string, initial: () => T,
  mutate: (value: T) => void, options: { attempts?: number; maxBytes?: number; jitter?: () => Promise<void> } = {}): Promise<T> {
  const attempts = options.attempts ?? 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await store.read<T>(pathname, options.maxBytes);
    const next = structuredClone(current?.value ?? initial());
    mutate(next);
    const saved = current
      ? await store.compareAndSwap(pathname, current.etag!, next, options.maxBytes)
      : await store.create(pathname, next, options.maxBytes);
    if (saved) return next;
    await (options.jitter?.() ?? new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20))));
  }
  throw new JsonStoreFailure('JSON_LEDGER_BUSY');
}
