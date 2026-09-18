import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobError, BlobPreconditionFailedError, BlobServiceRateLimited } from '@vercel/blob';
import { HostedSessionBroker, type BrokerDependencies } from '../src/broker.js';
import { DEFAULT_LIMITS, MAX_RESPONSE_BYTES, PROGRAM_ID, type SandboxKind } from '../src/contract.js';
import { createHostedSessionHandler } from '../src/http.js';
import { BlobJsonCasStore, JsonStoreFailure, mutateJson, type JsonCasStore, type VersionedJson } from '../src/json-store.js';
import { SessionLedgerRepository, type Clock } from '../src/ledger.js';
import type { CreatedProvider, ProviderView, SandboxProvider } from '../src/provider.js';

class MemoryStore implements JsonCasStore {
  value: unknown; etag = 0;
  async read<T>(): Promise<VersionedJson<T> | null> {
    await Promise.resolve();
    return this.etag ? { value: structuredClone(this.value) as T, etag: String(this.etag) } : null;
  }
  async create<T>(_path: string, value: T): Promise<boolean> {
    await Promise.resolve(); if (this.etag) return false;
    this.value = structuredClone(value); this.etag = 1; return true;
  }
  async compareAndSwap<T>(_path: string, etag: string, value: T): Promise<boolean> {
    await Promise.resolve(); if (etag !== String(this.etag)) return false;
    this.value = structuredClone(value); this.etag += 1; return true;
  }
}

class FakeClock implements Clock {
  constructor(public time = Date.parse('2026-09-18T00:00:00.000Z')) {}
  now(): Date { return new Date(this.time); }
  advance(ms: number): void { this.time += ms; }
}

class FakeProvider implements SandboxProvider {
  readonly views = new Map<string, ProviderView>(); createCount = 0; launchCount = 0; stopCount = 0;
  failCreate = false; failStop = false; deferredCreate: Promise<void> | null = null;
  constructor(readonly clock: FakeClock) {}
  async create(input: { name: string; kind: SandboxKind; token: string; expiresAt: string }): Promise<CreatedProvider> {
    this.createCount += 1;
    if (this.deferredCreate) await this.deferredCreate;
    if (this.failCreate) throw new Error('ambiguous create');
    const view: ProviderView = { name: input.name, status: 'running', expiresAt: input.expiresAt, domain: `https://${input.name}.vercel.run` };
    this.views.set(input.name, view);
    return { ...view, launch: async () => { this.launchCount += 1; } };
  }
  async get(name: string): Promise<ProviderView> { return structuredClone(this.views.get(name) ?? { name, status: 'missing', expiresAt: null, domain: null }); }
  async stopAndDelete(name: string): Promise<void> {
    this.stopCount += 1; if (this.failStop) throw new Error('unknown stop');
    this.views.delete(name);
  }
}

function fixture(options: { active?: number } = {}) {
  const clock = new FakeClock(); const store = new MemoryStore(); const provider = new FakeProvider(clock);
  let failRpc = false; let healthReady = true; let rpcResponse: (() => Response) | null = null;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const providerName = url.hostname.split('.')[0]!;
    const record = [...provider.views.values()].find((item) => item.name === providerName)!;
    const expiresAt = record.expiresAt!; const runtimeId = `runtime-${providerName}`;
    // Kind is recovered from the gateway-token test registry below.
    const kind = kinds.get(providerName)!;
    if (url.pathname === '/health') return Response.json({ ready: healthReady, kind, runtimeId, expiresAt });
    if (url.pathname === '/manifest') return Response.json({ schemaVersion: 1, kind: 'surfnet', runtimeId, rpcUrl: 'http://127.0.0.1:8899', wsUrl: 'ws://127.0.0.1:8900',
      genesisHash: `local-${providerName}`, programId: PROGRAM_ID, deploymentDomainHex: 'ab'.repeat(32), clockControl: true, assets: [] });
    if (url.pathname === '/state') return Response.json({ schemaVersion: 2, runtimeId, revision: 0, sessionId: null, status: 'idle', snapshot: null, transactions: [], completedSteps: [], error: null });
    if (failRpc && url.pathname === '/rpc') throw new Error('unknown submit result');
    if (rpcResponse && url.pathname === '/rpc') return rpcResponse();
    return Response.json({ jsonrpc: '2.0', id: 1, result: 'ok' });
  };
  const kinds = new Map<string, SandboxKind>();
  const originalCreate = provider.create.bind(provider);
  provider.create = async (input) => { kinds.set(input.name, input.kind); return originalCreate(input); };
  const limits = { ...DEFAULT_LIMITS, ...(options.active === undefined ? {} : { active: options.active }) };
  const deps: BrokerDependencies = { clock, provider, secret: Buffer.alloc(32, 7), fetch: fetcher, limits,
    ledger: new SessionLedgerRepository(store, clock, limits) };
  return { broker: new HostedSessionBroker(deps), clock, store, provider, secret: deps.secret, origins: new Set(['https://example.com']),
    setFailRpc: (value: boolean) => { failRpc = value; }, setHealthReady: (value: boolean) => { healthReady = value; },
    setRpcResponse: (value: () => Response) => { rpcResponse = value; } };
}

test('two visitors and two flows receive distinct isolated sessions', async () => {
  const f = fixture();
  const a = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  const b = await f.broker.start('visitor-b', 'ip-b', 'wallet', null);
  f.clock.advance(DEFAULT_LIMITS.creationCooldownMs);
  const guided = await f.broker.start('visitor-a', 'ip-a', 'guided', null);
  assert.equal(a.status, 'ready'); assert.equal(b.status, 'ready'); assert.equal(guided.status, 'ready');
  assert.notEqual(a.sessionId, b.sessionId); assert.notEqual(a.sessionId, guided.sessionId);
  assert.equal(f.provider.createCount, 3); assert.equal(f.provider.launchCount, 3);
  const duplicate = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  assert.equal(duplicate.sessionId, a.sessionId); assert.equal(f.provider.createCount, 3);
});

test('CAS races enforce the global active limit', async () => {
  const f = fixture({ active: 2 });
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
    f.broker.start(`visitor-${index}`, `ip-${index}`, 'wallet', null)));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2);
  assert.equal(f.provider.createCount, 2);
});

test('cookie binding prevents cross-session access and proxy rewrites manifest', async () => {
  const f = fixture(); const session = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  await assert.rejects(() => f.broker.proxy('visitor-b', 'wallet', session.sessionId!, 'GET', '/manifest'), (error: any) => error.status === 404);
  const result = await f.broker.proxy('visitor-a', 'wallet', session.sessionId!, 'GET', '/manifest');
  const manifest = result.value as Record<string, unknown>;
  assert.equal(manifest.rpcUrl, `/api/sandbox/wallet/${session.sessionId}/rpc`);
  assert.equal(manifest.hostedSessionId, session.sessionId); assert.equal('wsUrl' in manifest, false);
});

test('expiry and reset never silently replace a runtime', async () => {
  const f = fixture(); const first = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  f.clock.advance(DEFAULT_LIMITS.lifetimeMs + 1);
  const expired = await f.broker.current('visitor-a', 'wallet');
  assert.equal(expired.status, 'expired'); assert.equal(f.provider.createCount, 1);
  const replacement = await f.broker.reset('visitor-a', 'ip-a', 'wallet', first.sessionId);
  assert.equal(replacement.status, 'ready'); assert.notEqual(replacement.sessionId, first.sessionId); assert.equal(f.provider.createCount, 2);
  await assert.rejects(() => f.broker.proxy('visitor-a', 'wallet', first.sessionId!, 'GET', '/manifest'), (error: any) => error.status === 410);
});

test('unknown mutation completion is charged and never retried or replaced', async () => {
  const f = fixture(); const session = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  f.setFailRpc(true);
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: ['AQ=='] }));
  await assert.rejects(() => f.broker.proxy('visitor-a', 'wallet', session.sessionId!, 'POST', '/rpc', body), (error: any) => error.status === 503);
  const record = await f.broker.deps.ledger.byId(session.sessionId!);
  assert.equal(record?.mutationTotal, 1); assert.equal(record?.forwardedTotal, 1); assert.equal(f.provider.createCount, 1);
  assert.equal((await f.broker.current('visitor-a', 'wallet')).sessionId, session.sessionId);
});

test('RPC accepts a deployed-program account response and cancels a response over 2 MiB', async () => {
  const f = fixture();
  const handler = createHostedSessionHandler({ broker: f.broker, secret: f.secret, origins: f.origins });
  const initial = await handler(new Request('https://example.com/api/sandbox/wallet/session'));
  const cookie = initial.headers.get('set-cookie')!.split(';')[0]!;
  const started = await handler(new Request('https://example.com/api/sandbox/wallet/session', {
    method: 'POST', headers: { cookie, origin: 'https://example.com', 'x-dividendx-session': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'start', expectedSessionId: null }),
  }));
  const session = await started.json() as { sessionId: string };
  const request = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [PROGRAM_ID, { encoding: 'base64' }] }));
  const programData = Buffer.alloc(706_504, 7).toString('base64');
  const account = { jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: {
    data: [programData, 'base64'], executable: true, lamports: 1, owner: PROGRAM_ID, rentEpoch: 0, space: 706_504,
  } } };
  const body = JSON.stringify(account);
  assert.ok(Buffer.byteLength(body) > 900_000 && Buffer.byteLength(body) < MAX_RESPONSE_BYTES);
  f.setRpcResponse(() => new Response(body, { status: 200, headers: {
    'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)),
  } }));
  const accepted = await handler(new Request(`https://example.com/api/sandbox/wallet/${session.sessionId}/rpc`, {
    method: 'POST', headers: { cookie, origin: 'https://example.com', 'content-type': 'application/json' }, body: request,
  }));
  assert.equal(accepted.status, 200);
  assert.equal((((await accepted.json()) as any).result.value.data[0] as string).length, programData.length);

  let cancelled = false;
  f.setRpcResponse(() => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const denied = await handler(new Request(`https://example.com/api/sandbox/wallet/${session.sessionId}/rpc`, {
    method: 'POST', headers: { cookie, origin: 'https://example.com', 'content-type': 'application/json' }, body: request,
  }));
  assert.equal(denied.status, 502);
  assert.deepEqual(await denied.json(), { error: 'Sandbox response is too large.' });
  assert.equal(cancelled, true);
});

test('ambiguous provider creation remains a charged tombstone and is not repeated', async () => {
  const f = fixture(); f.provider.failCreate = true;
  const failed = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  assert.equal(failed.status, 'failed'); assert.equal(f.provider.createCount, 1);
  const duplicate = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  assert.equal(duplicate.sessionId, failed.sessionId); assert.equal(f.provider.createCount, 1);
  await assert.rejects(() => f.broker.reset('visitor-a', 'ip-a', 'wallet', failed.sessionId), (error: any) => error.status === 503);
});

test('deferred creation is fenced from duplicate start and reset', async () => {
  const f = fixture(); let release!: () => void;
  f.provider.deferredCreate = new Promise<void>((resolve) => { release = resolve; });
  const original = f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  while (f.provider.createCount === 0) await Promise.resolve();
  const pending = await f.broker.current('visitor-a', 'wallet');
  assert.equal(pending.status, 'starting');
  const duplicate = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  assert.equal(duplicate.sessionId, pending.sessionId); assert.equal(f.provider.createCount, 1);
  await assert.rejects(() => f.broker.reset('visitor-a', 'ip-a', 'wallet', pending.sessionId), (error: any) => error.status === 503);
  release();
  const ready = await original;
  assert.equal(ready.status, 'ready'); assert.equal(ready.sessionId, pending.sessionId);
  assert.equal(f.provider.createCount, 1); assert.equal(f.provider.launchCount, 1);
});

test('failed stop retains capacity through a later provider hard expiry', async () => {
  const f = fixture({ active: 1 });
  const session = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  const record = await f.broker.deps.ledger.byId(session.sessionId!);
  const view = f.provider.views.get(record!.providerName)!;
  view.expiresAt = new Date(f.clock.time + DEFAULT_LIMITS.lifetimeMs + 60_000).toISOString();
  f.provider.failStop = true; f.clock.advance(DEFAULT_LIMITS.lifetimeMs + 1);
  assert.equal((await f.broker.current('visitor-a', 'wallet')).status, 'failed');
  await assert.rejects(() => f.broker.start('visitor-b', 'ip-b', 'wallet', null), (error: any) => error.code === 'capacity');
  assert.equal(f.provider.createCount, 1);
});

test('readiness polling does not CAS-write an unchanged provider view', async () => {
  const f = fixture(); const id = 'ab'.repeat(16); const providerName = 'dx-readiness-probe';
  await f.broker.deps.ledger.reserve({ id, visitorHash: 'visitor-a', ipHash: 'ip-a', kind: 'wallet', providerName });
  const expiresAt = new Date(f.clock.time + DEFAULT_LIMITS.lifetimeMs).toISOString();
  const domain = `https://${providerName}.vercel.run`;
  f.provider.views.set(providerName, { name: providerName, status: 'running', expiresAt, domain });
  await f.broker.deps.ledger.update(id, (record, now) => {
    record.providerStatus = 'running'; record.providerExpiresAt = expiresAt; record.providerDomain = domain;
    record.launchAttemptedAt = now.toISOString();
  });
  f.setHealthReady(false);
  const etag = f.store.etag;
  assert.equal((await f.broker.current('visitor-a', 'wallet')).status, 'starting');
  assert.equal(f.store.etag, etag);
});

test('HTTP contract issues secure cookie and requires exact mutation origin and header', async () => {
  const f = fixture(); const handler = createHostedSessionHandler({ broker: f.broker, secret: f.secret, origins: f.origins });
  const get = await handler(new Request('https://example.com/api/sandbox/wallet/session'));
  assert.equal(get.status, 200); assert.match(get.headers.get('set-cookie')!, /__Host-dxv=.*HttpOnly; Secure; SameSite=Lax/);
  const cookie = get.headers.get('set-cookie')!.split(';')[0]!;
  const missingHeader = await handler(new Request('https://example.com/api/sandbox/wallet/session', { method: 'POST', headers: { cookie, origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', expectedSessionId: null }) }));
  assert.equal(missingHeader.status, 403);
  const wrongOrigin = await handler(new Request('https://example.com/api/sandbox/wallet/session', { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'x-dividendx-session': '1', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', expectedSessionId: null }) }));
  assert.equal(wrongOrigin.status, 403);
  const query = await handler(new Request('https://example.com/api/sandbox/wallet/session?x=1', { headers: { cookie } }));
  assert.equal(query.status, 404);
});

test('unexpected HTTP failures log only bounded class and code tokens', async () => {
  const f = fixture(); const handler = createHostedSessionHandler({ broker: f.broker, secret: f.secret, origins: f.origins });
  const privateText = 'https://private.example/bearer-secret request body and stack detail';
  const failure = Object.assign(new JsonStoreFailure('BLOB_READ_HTTP_429', new Error(privateText)), {
    headers: { authorization: privateText }, body: privateText,
  });
  f.broker.current = async () => { throw failure; };
  const originalError = console.error; const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  let response: Response;
  try { response = await handler(new Request('https://example.com/api/sandbox/wallet/session')); }
  finally { console.error = originalError; }
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Session service is temporarily unavailable.' });
  assert.equal(logs.length, 1); assert.equal(logs[0]!.length, 1);
  assert.deepEqual(JSON.parse(String(logs[0]![0])), {
    event: 'hosted-broker-unexpected', class: 'JsonStoreFailure', code: 'BLOB_READ_HTTP_429',
  });
  assert.equal(String(logs[0]![0]).includes(privateText), false);
});

test('Blob reads request identity encoding and reject weak representation ETags', async () => {
  let etag = 'W/"compressed"'; let options: any;
  const sdk = {
    get: async (_pathname: string, input: any) => {
      options = input;
      const response = new Response('{"revision":1}', { headers: { etag, 'content-type': 'application/json' } });
      return { statusCode: 200 as const, stream: response.body!, headers: response.headers,
        blob: { url: 'https://example.invalid/blob', downloadUrl: 'https://example.invalid/blob?download=1', pathname: 'probe.json',
          contentDisposition: '', cacheControl: '', uploadedAt: new Date(), etag, contentType: 'application/json', size: 14 } };
    },
    put: async () => { throw new Error('not used'); },
  } as any;
  const store = new BlobJsonCasStore(sdk);
  await assert.rejects(() => store.read('probe.json'), (error: any) => error instanceof JsonStoreFailure && error.code === 'BLOB_ETAG_WEAK');
  assert.deepEqual(options.headers, { 'Accept-Encoding': 'identity' });
  assert.equal(options.useCache, false);
  etag = '';
  await assert.rejects(() => store.read('probe.json'), (error: any) => error instanceof JsonStoreFailure && error.code === 'BLOB_ETAG_MISSING');
  etag = '"strong"';
  assert.deepEqual(await store.read<{ revision: number }>('probe.json'), { value: { revision: 1 }, etag: '"strong"' });
});

test('JSON store reports fixed local failure codes without weakening CAS', async () => {
  const sdk = {
    get: async () => ({ statusCode: 304 as const, stream: null, headers: new Headers(), blob: { etag: '"strong"' } }),
    put: async () => { throw new Error('not used'); },
  } as any;
  const store = new BlobJsonCasStore(sdk);
  await assert.rejects(() => store.read('probe.json'), (error: any) => error.code === 'BLOB_READ_STATUS');
  await assert.rejects(() => store.create('probe.json', { payload: 'too large' }, 1), (error: any) => error.code === 'BLOB_LEDGER_OVERSIZE');
  await assert.rejects(() => store.compareAndSwap('probe.json', 'W/"weak"', {}, 100), (error: any) => error.code === 'BLOB_ETAG_WEAK');
  const conflicted = new BlobJsonCasStore({ ...sdk, put: async () => { throw new BlobPreconditionFailedError(); } } as any);
  assert.equal(await conflicted.compareAndSwap('probe.json', '"stale"', {}, 100), false);

  const contended = {
    read: async () => ({ value: { revision: 1 }, etag: '"one"' }),
    create: async () => false,
    compareAndSwap: async () => false,
  } as JsonCasStore;
  await assert.rejects(
    () => mutateJson(contended, 'probe.json', () => ({ revision: 0 }), (value) => { value.revision += 1; }, { attempts: 1, jitter: async () => {} }),
    (error: any) => error instanceof JsonStoreFailure && error.code === 'JSON_LEDGER_BUSY',
  );
});

test('JSON store safely distinguishes Blob SDK read, create, and CAS failures', async () => {
  const rejected = new BlobError('private provider detail');
  let reads = 0; let writes = 0;
  const readRejected = new BlobJsonCasStore({
    get: async () => { reads += 1; throw rejected; },
    put: async () => { throw new Error('not used'); },
  } as any);
  await assert.rejects(() => readRejected.read('probe.json'), (error: any) =>
    error instanceof JsonStoreFailure && error.code === 'BLOB_READ_REJECTED'
      && error.message === 'BLOB_READ_REJECTED' && error.cause === rejected);
  assert.equal(reads, 1);

  const createRejected = new BlobJsonCasStore({
    get: async () => { reads += 1; return null; },
    put: async () => { writes += 1; throw rejected; },
  } as any);
  await assert.rejects(() => createRejected.create('probe.json', {}), (error: any) =>
    error instanceof JsonStoreFailure && error.code === 'BLOB_CREATE_REJECTED');

  const casRejected = new BlobJsonCasStore({
    get: async () => null,
    put: async () => { writes += 1; throw rejected; },
  } as any);
  await assert.rejects(() => casRejected.compareAndSwap('probe.json', '"current"', {}), (error: any) =>
    error instanceof JsonStoreFailure && error.code === 'BLOB_CAS_REJECTED');

  const rateLimited = new BlobJsonCasStore({
    get: async () => null,
    put: async () => { writes += 1; throw new BlobServiceRateLimited(3); },
  } as any);
  await assert.rejects(() => rateLimited.compareAndSwap('probe.json', '"current"', {}), (error: any) =>
    error instanceof JsonStoreFailure && error.code === 'BLOB_CAS_RATE_LIMITED');
  assert.equal(writes, 3);
});

test('eight concurrent ledger charges reconcile Blob conditional-operation conflicts exactly once', async () => {
  const f = fixture();
  const session = await f.broker.start('visitor-a', 'ip-a', 'wallet', null);
  let stored = JSON.stringify(f.store.value); let etagNumber = 1; let conflicts = 0;
  const etag = () => `"etag-${etagNumber}"`;
  const sdk = {
    get: async () => {
      const currentEtag = etag();
      const response = new Response(stored, { headers: { etag: currentEtag, 'content-type': 'application/json' } });
      return { statusCode: 200 as const, stream: response.body!, headers: response.headers,
        blob: { url: 'https://example.invalid/blob', downloadUrl: 'https://example.invalid/blob?download=1',
          pathname: 'ledger.json', contentDisposition: '', cacheControl: '', uploadedAt: new Date(),
          etag: currentEtag, contentType: 'application/json', size: Buffer.byteLength(stored) } };
    },
    put: async (_pathname: string, body: unknown, options: any) => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (options.ifMatch !== etag()) {
        conflicts += 1;
        throw new BlobError('The conditional request cannot succeed due to a conflicting operation against this resource.');
      }
      assert.equal(typeof body, 'string'); stored = body as string; etagNumber += 1;
      return { url: 'https://example.invalid/blob', downloadUrl: 'https://example.invalid/blob?download=1',
        pathname: 'ledger.json', contentType: 'application/json', contentDisposition: '', etag: etag() };
    },
  } as any;
  const repository = new SessionLedgerRepository(new BlobJsonCasStore(sdk), f.clock);
  await Promise.all(Array.from({ length: 8 }, () =>
    repository.charge(session.sessionId!, 'visitor-a', 'wallet', 1)));
  const record = await repository.byId(session.sessionId!);
  assert.ok(conflicts > 0);
  assert.equal(record!.forwardedTotal, 8);
  assert.equal(record!.mutationTotal, 8);
});

test('JSON store classifies private GET HTTP failures without retaining status text', async () => {
  for (const [status, code] of [
    [429, 'BLOB_READ_HTTP_429'], [403, 'BLOB_READ_HTTP_4XX'],
    [503, 'BLOB_READ_HTTP_5XX'], [302, 'BLOB_READ_HTTP_OTHER'],
  ] as const) {
    const privateText = 'private-token-and-upstream-detail';
    const store = new BlobJsonCasStore({
      get: async () => { throw new BlobError(`Failed to fetch blob: ${status} ${privateText}`); },
      put: async () => { throw new Error('not used'); },
    } as any);
    await assert.rejects(() => store.read('probe.json'), (error: any) =>
      error instanceof JsonStoreFailure && error.code === code
        && error.message === code && !error.message.includes(privateText));
  }
});
