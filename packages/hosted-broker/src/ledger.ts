import {
  DEFAULT_LIMITS, LEDGER_PATH, METER_PREFIX, MAX_LEDGER_BYTES, SESSION_ID, emptyLedger, type Limits, type SandboxKind,
  type SessionLedger, type SessionRecord,
} from './contract.js';
import type { JsonCasStore } from './json-store.js';

const TERMINAL_PROVIDER = new Set(['stopped', 'failed', 'aborted', 'missing', 'deleted']);

export interface SessionMeter {
  schemaVersion: 1;
  id: string;
  visitorHash: string;
  kind: SandboxKind;
  providerName: string;
  runtimeId: string;
  expiresAt: string;
  open: boolean;
  forwardedTotal: number;
  mutationTotal: number;
  minuteWindow: string;
  minuteCount: number;
}

export class LedgerFailure extends Error {
  constructor(readonly code: 'capacity' | 'global_quota' | 'visitor_quota' | 'ip_quota' | 'cooldown' | 'conflict' | 'busy' | 'budget', message: string) { super(message); }
}

export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };

function key(visitorHash: string, kind: SandboxKind): string { return `${visitorHash}:${kind}`; }
function day(date: Date): string { return date.toISOString().slice(0, 10); }
function minute(date: Date): string { return date.toISOString().slice(0, 16); }
function plus(date: Date, ms: number): string { return new Date(date.getTime() + ms).toISOString(); }
function isFuture(value: string, now: Date): boolean { return Date.parse(value) > now.getTime(); }
function nonnegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }

function validMeter(value: unknown): value is SessionMeter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SessionMeter>;
  return item.schemaVersion === 1 && typeof item.id === 'string' && SESSION_ID.test(item.id)
    && typeof item.visitorHash === 'string' && item.visitorHash.length > 0
    && (item.kind === 'wallet' || item.kind === 'guided')
    && typeof item.providerName === 'string' && item.providerName.length > 0
    && typeof item.runtimeId === 'string' && item.runtimeId.length > 0
    && typeof item.expiresAt === 'string' && Number.isFinite(Date.parse(item.expiresAt))
    && typeof item.open === 'boolean'
    && nonnegativeInteger(item.forwardedTotal) && nonnegativeInteger(item.mutationTotal)
    && typeof item.minuteWindow === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.minuteWindow)
    && nonnegativeInteger(item.minuteCount);
}

function meterBindingMatches(meter: SessionMeter, record: SessionRecord, runtimeId = record.runtimeId): boolean {
  return meter.id === record.id && meter.visitorHash === record.visitorHash && meter.kind === record.kind
    && meter.providerName === record.providerName && meter.runtimeId === runtimeId && meter.expiresAt === record.expiresAt;
}

function meterUnavailable(): LedgerFailure { return new LedgerFailure('busy', 'Sandbox meter is unavailable. Try again later.'); }

export function holdsCapacity(record: SessionRecord, now: Date): boolean {
  const providerMayBeLive = ['pending', 'running', 'stopping', 'snapshotting', 'unknown'].includes(record.providerStatus ?? '');
  if (providerMayBeLive && record.providerExpiresAt && isFuture(record.providerExpiresAt, now)) return true;
  if (!isFuture(record.expiresAt, now)) return false;
  if (record.status === 'starting' || record.status === 'ready' || record.status === 'resetting') return true;
  return record.status === 'failed' && !TERMINAL_PROVIDER.has(record.providerStatus ?? 'unknown');
}

export function normalizeLedger(ledger: SessionLedger, now: Date): void {
  if (ledger.schemaVersion !== 1 || !ledger.sessions || !ledger.latest || !ledger.daily || !ledger.visitorLastCreatedAt) {
    throw new Error('invalid session ledger');
  }
  for (const record of Object.values(ledger.sessions)) {
    if (!isFuture(record.expiresAt, now) && record.status !== 'expired') {
      record.status = 'expired'; record.errorCode = 'expired';
    } else if (record.status === 'starting' && !isFuture(record.provisioningDeadline, now)) {
      record.status = 'failed'; record.errorCode = 'provisioning_timeout';
    }
  }
  for (const [id, record] of Object.entries(ledger.sessions)) {
    if (!isFuture(record.tombstoneUntil, now) && !holdsCapacity(record, now)) delete ledger.sessions[id];
  }
  for (const [latestKey, id] of Object.entries(ledger.latest)) if (!ledger.sessions[id]) delete ledger.latest[latestKey];
  const cutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  for (const date of Object.keys(ledger.daily)) if (date < cutoff) delete ledger.daily[date];
  for (const [visitor, createdAt] of Object.entries(ledger.visitorLastCreatedAt)) {
    if (Date.parse(createdAt) <= now.getTime() - 2 * 86_400_000) delete ledger.visitorLastCreatedAt[visitor];
  }
}

export class SessionLedgerRepository {
  constructor(readonly store: JsonCasStore, readonly clock: Clock = systemClock, readonly limits: Limits = DEFAULT_LIMITS,
    readonly pathname = LEDGER_PATH, readonly meterPrefix = METER_PREFIX) {}

  meterPath(id: string): string {
    if (!SESSION_ID.test(id)) throw meterUnavailable();
    return `${this.meterPrefix}/${id}.json`;
  }

  async readMeter(id: string): Promise<SessionMeter | null> {
    const current = await this.store.read<unknown>(this.meterPath(id), 4096);
    if (!current) return null;
    if (!validMeter(current.value) || current.value.id !== id) throw meterUnavailable();
    return current.value;
  }

  async initializeMeter(record: SessionRecord, runtimeId: string): Promise<void> {
    if (record.meterVersion !== 1 || record.status !== 'starting' || !runtimeId) throw meterUnavailable();
    const meter: SessionMeter = {
      schemaVersion: 1, id: record.id, visitorHash: record.visitorHash, kind: record.kind,
      providerName: record.providerName, runtimeId, expiresAt: record.expiresAt, open: true,
      forwardedTotal: 0, mutationTotal: 0, minuteWindow: minute(this.clock.now()), minuteCount: 0,
    };
    if (await this.store.create(this.meterPath(record.id), meter, 4096)) return;
    const existing = await this.readMeter(record.id);
    if (!existing || !meterBindingMatches(existing, record, runtimeId) || !existing.open) throw meterUnavailable();
  }

  async closeMeter(record: SessionRecord): Promise<void> {
    if (record.meterVersion === undefined) return;
    if (record.meterVersion !== 1 || !record.runtimeId) throw meterUnavailable();
    const pathname = this.meterPath(record.id);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const current = await this.store.read<unknown>(pathname, 4096);
      if (!current || !validMeter(current.value) || !meterBindingMatches(current.value, record)) throw meterUnavailable();
      if (!current.value.open) return;
      if (await this.store.compareAndSwap(pathname, current.etag!, { ...current.value, open: false }, 4096)) return;
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)));
    }
    throw meterUnavailable();
  }

  private async transaction<T>(operation: (ledger: SessionLedger, now: Date) => T): Promise<T> {
    // Browser account refreshes can overlap. Blob serializes one conditional write
    // and rejects the rest, so allow a bounded queue of eight callers to drain.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const current = await this.store.read<SessionLedger>(this.pathname, MAX_LEDGER_BYTES);
      const ledger = structuredClone(current?.value ?? emptyLedger());
      const now = this.clock.now();
      normalizeLedger(ledger, now);
      const result = operation(ledger, now);
      ledger.revision += 1;
      const saved = current
        ? await this.store.compareAndSwap(this.pathname, current.etag!, ledger, MAX_LEDGER_BYTES)
        : await this.store.create(this.pathname, ledger, MAX_LEDGER_BYTES);
      if (saved) return result;
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)));
    }
    throw new LedgerFailure('busy', 'Session service is busy. Try again.');
  }

  async current(visitorHash: string, kind: SandboxKind): Promise<SessionRecord | undefined> {
    const current = await this.store.read<SessionLedger>(this.pathname, MAX_LEDGER_BYTES);
    if (!current) return undefined;
    const ledger = structuredClone(current.value);
    normalizeLedger(ledger, this.clock.now());
    const id = ledger.latest[key(visitorHash, kind)];
    return id ? ledger.sessions[id] : undefined;
  }

  async byId(id: string): Promise<SessionRecord | undefined> {
    const current = await this.store.read<SessionLedger>(this.pathname, MAX_LEDGER_BYTES);
    if (!current) return undefined;
    const ledger = structuredClone(current.value);
    normalizeLedger(ledger, this.clock.now());
    return ledger.sessions[id];
  }

  async assertForwardable(record: SessionRecord): Promise<SessionRecord> {
    const current = await this.store.read<SessionLedger>(this.pathname, MAX_LEDGER_BYTES);
    if (!current) throw new LedgerFailure('conflict', 'Sandbox session is not available.');
    const ledger = structuredClone(current.value);
    const now = this.clock.now();
    normalizeLedger(ledger, now);
    const latest = ledger.sessions[record.id];
    if (!latest || ledger.latest[key(record.visitorHash, record.kind)] !== record.id
      || latest.visitorHash !== record.visitorHash || latest.kind !== record.kind
      || latest.providerName !== record.providerName || latest.runtimeId !== record.runtimeId
      || latest.expiresAt !== record.expiresAt || latest.meterVersion !== record.meterVersion
      || latest.status !== 'ready' || !isFuture(latest.expiresAt, now)) {
      throw new LedgerFailure('conflict', 'Sandbox session is not available.');
    }
    if (latest.meterVersion === 1) {
      const meter = await this.readMeter(latest.id);
      if (!meter || !meterBindingMatches(meter, latest) || !meter.open) throw meterUnavailable();
    } else if (latest.meterVersion !== undefined) throw meterUnavailable();
    return latest;
  }

  async assertMeterForwardable(record: SessionRecord): Promise<void> {
    if (record.meterVersion !== 1 || !record.runtimeId || !isFuture(record.expiresAt, this.clock.now())) {
      throw new LedgerFailure('conflict', 'Sandbox session is not available.');
    }
    const meter = await this.readMeter(record.id);
    if (!meter || !meterBindingMatches(meter, record) || !meter.open) throw meterUnavailable();
  }

  private async forwardableById(id: string, visitorHash: string, kind: SandboxKind): Promise<SessionRecord> {
    const current = await this.store.read<SessionLedger>(this.pathname, MAX_LEDGER_BYTES);
    if (!current) throw new LedgerFailure('conflict', 'Sandbox session is not available.');
    const ledger = structuredClone(current.value);
    const now = this.clock.now();
    normalizeLedger(ledger, now);
    const record = ledger.sessions[id];
    if (!record || record.visitorHash !== visitorHash || record.kind !== kind
      || ledger.latest[key(visitorHash, kind)] !== id || record.status !== 'ready'
      || !isFuture(record.expiresAt, now) || !record.runtimeId) {
      throw new LedgerFailure('conflict', 'Sandbox session is not available.');
    }
    if (record.meterVersion === 1) {
      const meter = await this.readMeter(id);
      if (!meter || !meterBindingMatches(meter, record) || !meter.open) throw meterUnavailable();
    } else if (record.meterVersion !== undefined) throw meterUnavailable();
    return record;
  }

  async reserve(input: { id: string; visitorHash: string; ipHash: string; kind: SandboxKind; providerName: string }): Promise<{ record: SessionRecord; created: boolean }> {
    let created = false;
    return this.transaction((ledger, now) => {
      const latestId = ledger.latest[key(input.visitorHash, input.kind)];
      const latest = latestId ? ledger.sessions[latestId] : undefined;
      if (latest && holdsCapacity(latest, now)) return { record: structuredClone(latest), created: false };

      const lastCreated = ledger.visitorLastCreatedAt[input.visitorHash];
      if (lastCreated && Date.parse(lastCreated) + this.limits.creationCooldownMs > now.getTime()) {
        throw new LedgerFailure('cooldown', 'Wait before starting another sandbox.');
      }
      if (Object.values(ledger.sessions).filter((entry) => holdsCapacity(entry, now)).length >= this.limits.active) {
        throw new LedgerFailure('capacity', 'Sandbox capacity is currently full. Try again later.');
      }
      const date = day(now);
      const counter = ledger.daily[date] ??= { global: 0, visitors: {}, ips: {} };
      if (counter.global >= this.limits.dailyGlobal) throw new LedgerFailure('global_quota', 'Daily sandbox capacity is exhausted.');
      if ((counter.visitors[input.visitorHash] ?? 0) >= this.limits.dailyVisitor) throw new LedgerFailure('visitor_quota', 'Your daily sandbox limit is reached.');
      if ((counter.ips[input.ipHash] ?? 0) >= this.limits.dailyIp) throw new LedgerFailure('ip_quota', 'This network has reached its daily sandbox limit.');

      const record: SessionRecord = {
        id: input.id, meterVersion: 1, visitorHash: input.visitorHash, ipHash: input.ipHash, kind: input.kind,
        providerName: input.providerName, status: 'starting', createdAt: now.toISOString(),
        provisioningDeadline: plus(now, this.limits.provisioningMs), expiresAt: plus(now, this.limits.lifetimeMs),
        tombstoneUntil: plus(now, this.limits.lifetimeMs + this.limits.tombstoneMs),
        createAttemptedAt: now.toISOString(), launchAttemptedAt: null, providerStatus: null,
        providerExpiresAt: null, providerDomain: null, runtimeId: null, genesisHash: null,
        deploymentDomainHex: null, forwardedTotal: 0, mutationTotal: 0,
        minuteWindow: minute(now), minuteCount: 0, errorCode: null,
      };
      ledger.sessions[record.id] = record;
      ledger.latest[key(input.visitorHash, input.kind)] = record.id;
      ledger.visitorLastCreatedAt[input.visitorHash] = now.toISOString();
      counter.global += 1;
      counter.visitors[input.visitorHash] = (counter.visitors[input.visitorHash] ?? 0) + 1;
      counter.ips[input.ipHash] = (counter.ips[input.ipHash] ?? 0) + 1;
      created = true;
      return { record: structuredClone(record), created };
    });
  }

  async update(id: string, mutate: (record: SessionRecord, now: Date) => void): Promise<SessionRecord> {
    return this.transaction((ledger, now) => {
      const record = ledger.sessions[id];
      if (!record) throw new LedgerFailure('conflict', 'Sandbox session no longer exists.');
      mutate(record, now);
      return structuredClone(record);
    });
  }

  async updateFenced(id: string, allowed: readonly SessionRecord['status'][], requireLatest: boolean,
    mutate: (record: SessionRecord, now: Date) => void): Promise<{ record: SessionRecord; applied: boolean }> {
    return this.transaction((ledger, now) => {
      const record = ledger.sessions[id];
      if (!record) throw new LedgerFailure('conflict', 'Sandbox session no longer exists.');
      const latest = ledger.latest[key(record.visitorHash, record.kind)] === id;
      if (!allowed.includes(record.status) || (requireLatest && !latest) || !isFuture(record.expiresAt, now)) {
        return { record: structuredClone(record), applied: false };
      }
      mutate(record, now);
      return { record: structuredClone(record), applied: true };
    });
  }

  async charge(id: string, visitorHash: string, kind: SandboxKind, mutationCount: number): Promise<SessionRecord> {
    if (!nonnegativeInteger(mutationCount)) throw new LedgerFailure('budget', 'Sandbox request limit is reached.');
    const snapshot = await this.forwardableById(id, visitorHash, kind);
    if (snapshot.meterVersion === 1) {
      const pathname = this.meterPath(id);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const current = await this.store.read<unknown>(pathname, 4096);
        if (!current || !validMeter(current.value) || !meterBindingMatches(current.value, snapshot)
          || !current.value.open) throw meterUnavailable();
        const meter = structuredClone(current.value);
        const now = this.clock.now();
        if (!isFuture(meter.expiresAt, now)) throw new LedgerFailure('conflict', 'Sandbox session has expired.');
        const window = minute(now);
        if (meter.minuteWindow !== window) { meter.minuteWindow = window; meter.minuteCount = 0; }
        if (meter.forwardedTotal >= this.limits.requestsTotal || meter.minuteCount >= this.limits.requestsPerMinute
          || meter.mutationTotal + mutationCount > this.limits.mutationsTotal) {
          throw new LedgerFailure('budget', 'Sandbox request limit is reached.');
        }
        meter.forwardedTotal += 1; meter.minuteCount += 1; meter.mutationTotal += mutationCount;
        if (await this.store.compareAndSwap(pathname, current.etag!, meter, 4096)) return snapshot;
        await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)));
      }
      throw meterUnavailable();
    }
    if (snapshot.meterVersion !== undefined) throw meterUnavailable();
    return this.transaction((ledger, now) => {
      const record = ledger.sessions[id];
      if (!record || record.visitorHash !== visitorHash || record.kind !== kind
        || record.meterVersion !== undefined || ledger.latest[key(visitorHash, kind)] !== id) {
        throw new LedgerFailure('conflict', 'Sandbox session is not available.');
      }
      if (record.status !== 'ready' || !isFuture(record.expiresAt, now)) throw new LedgerFailure('conflict', 'Sandbox session is not ready.');
      const window = minute(now);
      if (record.minuteWindow !== window) { record.minuteWindow = window; record.minuteCount = 0; }
      if (record.forwardedTotal >= this.limits.requestsTotal || record.minuteCount >= this.limits.requestsPerMinute
          || record.mutationTotal + mutationCount > this.limits.mutationsTotal) {
        throw new LedgerFailure('budget', 'Sandbox request limit is reached.');
      }
      record.forwardedTotal += 1; record.minuteCount += 1;
      record.mutationTotal += mutationCount;
      return structuredClone(record);
    });
  }
}
