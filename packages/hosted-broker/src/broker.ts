import {
  DEFAULT_LIMITS, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, PROGRAM_ID, PUBLIC_GENESIS_HASHES, SESSION_ID,
  publicSession, type Limits, type PublicSession, type SandboxKind, type SessionRecord,
} from './contract.js';
import { SessionLedgerRepository, LedgerFailure, holdsCapacity, type Clock, systemClock } from './ledger.js';
import type { SandboxProvider, ProviderView } from './provider.js';
import { gatewayToken, newSessionId, providerName } from './security.js';
import { HttpFailure as HttpError } from './security.js';

const SESSION_ROUTES: Record<SandboxKind, Readonly<Record<string, readonly string[]>>> = {
  wallet: { '/manifest': ['GET'], '/faucet': ['POST'], '/advance': ['POST'], '/rpc': ['POST'] },
  guided: { '/state': ['GET'], '/receipt': ['GET'], '/start': ['POST'], '/step': ['POST'] },
};
const KNOWN_UPSTREAM_STATUS = new Set([200, 201, 202, 400, 404, 409, 413, 415, 422, 429, 503]);
const RPC_METHODS = new Set(['getGenesisHash', 'getAccountInfo', 'getMultipleAccounts', 'getLatestBlockhash', 'getSignatureStatuses', 'getBlockHeight', 'sendTransaction']);

interface GatewayHealth { ready: boolean; kind: SandboxKind; runtimeId: string; expiresAt: string }

export interface BrokerDependencies {
  ledger: SessionLedgerRepository;
  provider: SandboxProvider;
  secret: Buffer;
  fetch: typeof globalThis.fetch;
  clock: Clock;
  limits: Limits;
}

function nowMs(deps: BrokerDependencies): number { return deps.clock.now().getTime(); }
function future(value: string | null, deps: BrokerDependencies): boolean { return value !== null && Date.parse(value) > nowMs(deps); }
function terminal(status: string): boolean { return ['stopped', 'failed', 'aborted', 'missing'].includes(status); }
function providerViewChanged(record: SessionRecord, view: ProviderView): boolean {
  return record.providerStatus !== view.status || record.providerExpiresAt !== view.expiresAt
    || (view.status === 'running' && record.providerDomain !== view.domain);
}
function extendTombstone(record: SessionRecord, providerExpiresAt: string | null, limits: Limits): void {
  if (!providerExpiresAt) return;
  const candidate = Date.parse(providerExpiresAt) + limits.tombstoneMs;
  if (Number.isFinite(candidate) && candidate > Date.parse(record.tombstoneUntil)) record.tombstoneUntil = new Date(candidate).toISOString();
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_RESPONSE_BYTES) throw new HttpError(502, 'Sandbox response is too large.');
  if (!response.body) throw new HttpError(502, 'Sandbox returned an empty response.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel('sandbox response too large');
        throw new HttpError(502, 'Sandbox response is too large.');
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')); }
  catch { throw new HttpError(502, 'Sandbox returned an invalid response.'); }
}

function cleanError(value: unknown): { error: string } {
  const message = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error.slice(0, 200) : 'Sandbox request failed.';
  return { error: message };
}

function cleanGuided(value: unknown, id: string): unknown {
  if (Array.isArray(value)) return value.map((item) => cleanGuided(item, id));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'wsUrl') continue;
    output[key] = key === 'rpcUrl' ? `sandbox:${id}` : cleanGuided(child, id);
  }
  return output;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(502, 'Sandbox returned an invalid response.');
  return value as Record<string, unknown>;
}

function validateHealth(value: unknown, record: SessionRecord): GatewayHealth {
  const item = object(value);
  if (item.ready !== true || item.kind !== record.kind || typeof item.runtimeId !== 'string'
      || typeof item.expiresAt !== 'string' || item.expiresAt !== record.expiresAt) {
    throw new Error('gateway health identity mismatch');
  }
  return item as unknown as GatewayHealth;
}

function validateWalletManifest(value: unknown, record: SessionRecord): Record<string, unknown> {
  const item = object(value);
  if (item.schemaVersion !== 1 || item.kind !== 'surfnet' || item.runtimeId !== record.runtimeId
      || item.programId !== PROGRAM_ID || typeof item.genesisHash !== 'string' || PUBLIC_GENESIS_HASHES.has(item.genesisHash)
      || typeof item.deploymentDomainHex !== 'string' || !/^[0-9a-f]{64}$/.test(item.deploymentDomainHex)) {
    throw new Error('wallet runtime identity mismatch');
  }
  if ((record.genesisHash && record.genesisHash !== item.genesisHash)
      || (record.deploymentDomainHex && record.deploymentDomainHex !== item.deploymentDomainHex)) throw new Error('wallet runtime identity changed');
  return item;
}

function validateGuidedState(value: unknown, record: SessionRecord): Record<string, unknown> {
  const item = object(value);
  if (item.schemaVersion !== 2 || item.runtimeId !== record.runtimeId) throw new Error('guided runtime identity mismatch');
  const snapshot = item.snapshot;
  if (snapshot && (typeof snapshot !== 'object' || Array.isArray(snapshot))) throw new Error('guided snapshot is invalid');
  const genesis = snapshot ? (snapshot as Record<string, unknown>).genesisHash : undefined;
  if (genesis !== undefined && (typeof genesis !== 'string' || PUBLIC_GENESIS_HASHES.has(genesis)
      || (record.genesisHash !== null && record.genesisHash !== genesis))) throw new Error('guided runtime identity changed');
  return item;
}

async function providerRequest(deps: BrokerDependencies, record: SessionRecord, view: ProviderView, method: string, path: string, body?: Uint8Array): Promise<Response> {
  if (!view.domain || (record.providerDomain && record.providerDomain !== view.domain)) throw new HttpError(503, 'Sandbox endpoint is unavailable.');
  const url = new URL(path, `${view.domain}/`);
  if (url.origin !== view.domain || url.pathname !== path || url.search) throw new Error('invalid fixed provider route');
  return deps.fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${gatewayToken(deps.secret, record.id)}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json', 'content-length': String(body.byteLength) } : {}),
    }, body: body ? Buffer.from(body) : undefined,
  });
}

async function failClosed(deps: BrokerDependencies, record: SessionRecord, code = 'identity_changed'): Promise<never> {
  let stopped = false; let observed: ProviderView | null = null;
  try { await deps.provider.stopAndDelete(record.providerName); stopped = true; }
  catch { try { observed = await deps.provider.get(record.providerName); } catch {} }
  await deps.ledger.updateFenced(record.id, ['ready', 'starting'], true, (item) => {
    item.status = 'failed'; item.errorCode = code; item.providerStatus = stopped ? 'deleted' : observed?.status ?? 'unknown';
    item.providerExpiresAt = observed?.expiresAt ?? item.providerExpiresAt;
    extendTombstone(item, observed?.expiresAt ?? null, deps.limits);
  });
  throw new HttpError(503, 'Sandbox identity verification failed.');
}

export class HostedSessionBroker {
  constructor(readonly deps: BrokerDependencies) {}

  async current(visitorHash: string, kind: SandboxKind): Promise<PublicSession> {
    let record = await this.deps.ledger.current(visitorHash, kind);
    if (!record) return publicSession(undefined, kind);
    if (!future(record.expiresAt, this.deps)) {
      let stopped = false; let observed: ProviderView | null = null;
      try { await this.deps.provider.stopAndDelete(record.providerName); stopped = true; }
      catch { try { observed = await this.deps.provider.get(record.providerName); } catch {} }
      record = await this.deps.ledger.update(record.id, (item) => {
        item.status = stopped ? 'expired' : 'failed'; item.errorCode = stopped ? 'expired' : 'stopping';
        item.providerStatus = stopped ? 'deleted' : observed?.status ?? 'unknown';
        item.providerExpiresAt = observed?.expiresAt ?? item.providerExpiresAt;
        extendTombstone(item, observed?.expiresAt ?? null, this.deps.limits);
      });
      return publicSession(record, kind);
    }
    if (record.status === 'failed' && record.errorCode === 'provisioning_timeout'
        && record.providerStatus !== null && record.providerStatus !== 'unknown') {
      let stopped = false;
      try { await this.deps.provider.stopAndDelete(record.providerName); stopped = true; } catch {}
      record = await this.deps.ledger.update(record.id, (item) => { item.providerStatus = stopped ? 'deleted' : 'unknown'; });
    }
    if (record.status === 'starting' || record.status === 'ready') record = await this.reconcile(record);
    return publicSession(record, kind);
  }

  async start(visitorHash: string, ipHash: string, kind: SandboxKind, expectedSessionId: string | null): Promise<PublicSession> {
    const current = await this.deps.ledger.current(visitorHash, kind);
    if (expectedSessionId !== null && current?.id !== expectedSessionId) throw new HttpError(409, 'Session changed; refresh before starting.');
    const id = newSessionId();
    const reserved = await this.deps.ledger.reserve({ id, visitorHash, ipHash, kind, providerName: providerName(this.deps.secret, id) });
    if (!reserved.created) {
      const existing = reserved.record.status === 'starting' || reserved.record.status === 'ready'
        ? await this.reconcile(reserved.record) : reserved.record;
      return publicSession(existing, kind);
    }
    let created;
    try {
      created = await this.deps.provider.create({ name: reserved.record.providerName, kind, token: gatewayToken(this.deps.secret, id), expiresAt: reserved.record.expiresAt });
    } catch {
      let observed: ProviderView | null = null;
      try { observed = await this.deps.provider.get(reserved.record.providerName); } catch {}
      const failed = await this.deps.ledger.update(id, (item) => {
        item.status = 'failed'; item.errorCode = 'create_unknown';
        item.providerStatus = observed && observed.status !== 'missing' ? observed.status : 'unknown'; item.providerExpiresAt = observed?.expiresAt ?? null;
        item.providerDomain = observed?.domain ?? null;
        extendTombstone(item, observed?.expiresAt ?? null, this.deps.limits);
      });
      return publicSession(failed, kind);
    }
    const launchFence = await this.deps.ledger.updateFenced(id, ['starting'], true, (item, now) => {
      item.providerStatus = created.status; item.providerExpiresAt = created.expiresAt; item.providerDomain = created.domain;
      extendTombstone(item, created.expiresAt, this.deps.limits);
      item.launchAttemptedAt = now.toISOString();
    });
    if (!launchFence.applied) {
      try { await this.deps.provider.stopAndDelete(created.name); } catch {}
      return publicSession(launchFence.record, kind);
    }
    let launching = launchFence.record;
    try { await created.launch(); }
    catch {
      launching = await this.deps.ledger.update(id, (item) => { item.status = 'failed'; item.errorCode = 'launch_unknown'; item.providerStatus = 'running'; });
      return publicSession(launching, kind);
    }
    return publicSession(await this.pollReady(launching, 8_000), kind);
  }

  async reset(visitorHash: string, ipHash: string, kind: SandboxKind, expectedSessionId: string | null): Promise<PublicSession> {
    const current = await this.deps.ledger.current(visitorHash, kind);
    if (!current || !expectedSessionId || current.id !== expectedSessionId) throw new HttpError(409, 'Session changed; refresh before resetting.');
    if (current.status === 'starting' || (current.status === 'failed' && current.providerStatus === 'unknown' && holdsCapacity(current, this.deps.clock.now()))) {
      throw new HttpError(503, 'Sandbox creation is still being reconciled. Try again later.', 15);
    }
    if (Date.parse(current.createdAt) + this.deps.limits.creationCooldownMs > nowMs(this.deps)) throw new HttpError(429, 'Wait before resetting this sandbox.', 30);
    await this.deps.ledger.update(current.id, (item) => { item.status = 'resetting'; item.errorCode = 'stopping'; });
    try { await this.deps.provider.stopAndDelete(current.providerName); }
    catch {
      let observed: ProviderView | null = null;
      try { observed = await this.deps.provider.get(current.providerName); } catch {}
      const failed = await this.deps.ledger.update(current.id, (item) => {
        item.status = 'failed'; item.errorCode = 'stopping'; item.providerStatus = observed?.status ?? 'unknown';
        item.providerExpiresAt = observed?.expiresAt ?? item.providerExpiresAt;
        extendTombstone(item, observed?.expiresAt ?? null, this.deps.limits);
      });
      return publicSession(failed, kind);
    }
    await this.deps.ledger.update(current.id, (item) => { item.status = 'expired'; item.errorCode = 'expired'; item.providerStatus = 'deleted'; });
    return this.start(visitorHash, ipHash, kind, current.id);
  }

  private async reconcile(record: SessionRecord): Promise<SessionRecord> {
    let view: ProviderView;
    try { view = await this.deps.provider.get(record.providerName); }
    catch { return record; }
    if (view.status === 'missing' && (record.providerStatus === null || record.providerStatus === 'unknown')) return record;
    if (terminal(view.status)) return this.deps.ledger.update(record.id, (item) => { item.status = 'failed'; item.errorCode = 'provider_stopped'; item.providerStatus = view.status; });
    if (view.status !== 'running' || !future(view.expiresAt, this.deps)) {
      if (!providerViewChanged(record, view)) return record;
      return this.deps.ledger.update(record.id, (item) => {
      item.providerStatus = view.status; item.providerExpiresAt = view.expiresAt;
      extendTombstone(item, view.expiresAt, this.deps.limits);
      });
    }
    if (!view.domain || (record.providerDomain && record.providerDomain !== view.domain)) return failClosed(this.deps, record);
    const updated = providerViewChanged(record, view) ? await this.deps.ledger.update(record.id, (item) => {
        item.providerStatus = view.status; item.providerExpiresAt = view.expiresAt; item.providerDomain ??= view.domain;
        extendTombstone(item, view.expiresAt, this.deps.limits);
      }) : record;
    if (updated.status === 'starting' && updated.launchAttemptedAt) return this.probeReady(updated, view);
    return updated;
  }

  private async pollReady(record: SessionRecord, durationMs: number): Promise<SessionRecord> {
    const deadline = Date.now() + durationMs;
    let latest = record;
    while (Date.now() < deadline && nowMs(this.deps) < Date.parse(record.provisioningDeadline)) {
      latest = await this.reconcile(latest);
      if (latest.status !== 'starting') return latest;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return latest;
  }

  private async probeReady(record: SessionRecord, view: ProviderView): Promise<SessionRecord> {
    try {
      const response = await providerRequest(this.deps, record, view, 'GET', '/health');
      if (!response.ok) return record;
      const health = validateHealth(await boundedJson(response), record);
      let identityResponse: Response;
      if (record.kind === 'wallet') identityResponse = await providerRequest(this.deps, record, view, 'GET', '/manifest');
      else identityResponse = await providerRequest(this.deps, record, view, 'GET', '/state');
      if (!identityResponse.ok) return record;
      const identity = await boundedJson(identityResponse);
      const transition = await this.deps.ledger.updateFenced(record.id, ['starting'], true, (item) => {
        item.runtimeId = health.runtimeId;
        if (item.kind === 'wallet') {
          const manifest = validateWalletManifest(identity, { ...item, runtimeId: health.runtimeId });
          item.genesisHash = manifest.genesisHash as string; item.deploymentDomainHex = manifest.deploymentDomainHex as string;
        } else {
          const state = validateGuidedState(identity, { ...item, runtimeId: health.runtimeId });
          const snapshot = state.snapshot as Record<string, unknown> | null;
          if (snapshot && typeof snapshot.genesisHash === 'string') item.genesisHash = snapshot.genesisHash;
        }
        item.status = 'ready'; item.errorCode = null;
      });
      return transition.record;
    } catch { return record; }
  }

  async proxy(visitorHash: string, kind: SandboxKind, id: string, method: string, path: string, body?: Uint8Array): Promise<{ status: number; value: unknown }> {
    if (!SESSION_ID.test(id)) throw new HttpError(404, 'route not found');
    const methods = SESSION_ROUTES[kind][path];
    if (!methods || !methods.includes(method)) throw new HttpError(404, 'route not found');
    if (body && body.byteLength > MAX_REQUEST_BYTES) throw new HttpError(413, 'Request body is too large.');
    let mutationCount = method === 'POST' ? 1 : 0;
    if (method === 'POST' && !body) throw new HttpError(400, 'Request body is required.');
    if (kind === 'wallet' && path === '/rpc') mutationCount = validateRpc(body!);
    let charged: SessionRecord;
    try { charged = await this.deps.ledger.charge(id, visitorHash, kind, mutationCount); }
    catch (error) {
      if (error instanceof LedgerFailure && error.code === 'conflict') {
        const record = await this.deps.ledger.byId(id);
        if (record && record.visitorHash !== visitorHash) throw new HttpError(404, 'route not found');
        if (record && !future(record.expiresAt, this.deps)) {
          let stopped = false; let observed: ProviderView | null = null;
          try { await this.deps.provider.stopAndDelete(record.providerName); stopped = true; }
          catch { try { observed = await this.deps.provider.get(record.providerName); } catch {} }
          await this.deps.ledger.update(record.id, (item) => {
            item.status = stopped ? 'expired' : 'failed'; item.errorCode = stopped ? 'expired' : 'stopping';
            item.providerStatus = stopped ? 'deleted' : observed?.status ?? 'unknown';
            item.providerExpiresAt = observed?.expiresAt ?? item.providerExpiresAt;
            extendTombstone(item, observed?.expiresAt ?? null, this.deps.limits);
          });
        }
        throw new HttpError(record ? 410 : 404, record ? 'Sandbox session has expired.' : 'route not found');
      }
      throw error;
    }
    let view: ProviderView;
    try { view = await this.deps.provider.get(charged.providerName); }
    catch { throw new HttpError(503, 'Sandbox provider is temporarily unavailable.'); }
    if (view.status === 'pending' || view.status === 'snapshotting') {
      await this.deps.ledger.update(id, (item) => {
        item.providerStatus = view.status; item.providerExpiresAt = view.expiresAt;
        extendTombstone(item, view.expiresAt, this.deps.limits);
      });
      throw new HttpError(503, 'Sandbox is temporarily unavailable.', 5);
    }
    if (view.status !== 'running' || !future(view.expiresAt, this.deps)) {
      await this.deps.ledger.update(id, (item) => { item.status = terminal(view.status) ? 'failed' : 'expired'; item.errorCode = terminal(view.status) ? 'provider_stopped' : 'expired'; item.providerStatus = view.status; });
      throw new HttpError(410, 'Sandbox session has expired.');
    }
    let response: Response;
    try { response = await providerRequest(this.deps, charged, view, method, path, body); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'Sandbox is temporarily unavailable.'); }
    const value = await boundedJson(response);
    const status = KNOWN_UPSTREAM_STATUS.has(response.status) ? response.status : 502;
    if (!response.ok) return { status, value: cleanError(value) };
    if (kind === 'wallet' && path === '/manifest') {
      try {
        const manifest = validateWalletManifest(value, charged);
        const { wsUrl: _ws, rpcUrl: _rpc, ...clean } = manifest;
        return { status, value: { ...clean, hostedSessionId: id, expiresAt: charged.expiresAt, rpcUrl: `/api/sandbox/wallet/${id}/rpc` } };
      } catch { return failClosed(this.deps, charged); }
    }
    if (kind === 'guided' && path === '/state') {
      try {
        const state = validateGuidedState(value, charged);
        const snapshot = state.snapshot as Record<string, unknown> | null;
        if (snapshot && typeof snapshot.genesisHash === 'string' && !charged.genesisHash) {
          await this.deps.ledger.update(id, (item) => {
            if (item.genesisHash && item.genesisHash !== snapshot.genesisHash) throw new Error('guided runtime identity changed');
            item.genesisHash = snapshot.genesisHash as string;
          });
        }
      } catch { return failClosed(this.deps, charged); }
    }
    if (kind === 'guided' && path === '/receipt') {
      const item = object(value);
      if (item.runtimeId !== undefined && item.runtimeId !== charged.runtimeId) return failClosed(this.deps, charged);
    }
    return { status, value: kind === 'guided' ? cleanGuided(value, id) : value };
  }
}

function validateRpc(bytes: Uint8Array): number {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw new HttpError(400, 'RPC body must be valid JSON.'); }
  const calls = Array.isArray(value) ? value : [value];
  if (calls.length === 0 || calls.length > 10) throw new HttpError(400, 'RPC batch size is invalid.');
  let mutationCount = 0;
  for (const call of calls) {
    const item = object(call);
    const keys = Object.keys(item).sort().join(',');
    if (keys !== 'id,jsonrpc,method' && keys !== 'id,jsonrpc,method,params') throw new HttpError(400, 'RPC fields are invalid.');
    if (item.jsonrpc !== '2.0' || !RPC_METHODS.has(String(item.method)) || !('id' in item)
        || !(['string', 'number'].includes(typeof item.id) || item.id === null)) throw new HttpError(403, 'RPC method is not allowed.');
    const params = item.params === undefined ? [] : item.params;
    if (!Array.isArray(params) || params.length > 2) throw new HttpError(400, 'RPC parameters are invalid.');
    if (item.method === 'getGenesisHash' && params.length !== 0) throw new HttpError(400, 'RPC parameters are invalid.');
    if (item.method === 'getBlockHeight' && params.length > 1) throw new HttpError(400, 'RPC parameters are invalid.');
    if (item.method === 'getLatestBlockhash' && params.length > 1) throw new HttpError(400, 'RPC parameters are invalid.');
    if (item.method === 'getAccountInfo' && (params.length < 1 || !publicKey(params[0]))) throw new HttpError(400, 'RPC account is invalid.');
    if (item.method === 'getMultipleAccounts' && (!Array.isArray(params[0]) || params[0].length < 1 || params[0].length > 20 || !params[0].every(publicKey))) throw new HttpError(400, 'RPC accounts are invalid.');
    if (item.method === 'getSignatureStatuses' && (!Array.isArray(params[0]) || params[0].length < 1 || params[0].length > 20
        || !params[0].every((entry) => typeof entry === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(entry)))) throw new HttpError(400, 'RPC signatures are invalid.');
    if (params[1] !== undefined && (!params[1] || typeof params[1] !== 'object' || Array.isArray(params[1]))) throw new HttpError(400, 'RPC options are invalid.');
    if (item.method === 'sendTransaction') {
      mutationCount += 1;
      if (params.length < 1 || typeof params[0] !== 'string' || params[0].length < 4 || params[0].length > 2_000
          || !/^[A-Za-z0-9+/]+={0,2}$/.test(params[0])) throw new HttpError(400, 'RPC transaction is invalid.');
    }
  }
  return mutationCount;
}

function publicKey(value: unknown): boolean {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}
