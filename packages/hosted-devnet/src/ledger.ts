import { createHash, randomUUID } from 'node:crypto';
import type { JsonCasStore } from '@dividendx/hosted-broker/json-store';
import { mutateJson } from '@dividendx/hosted-broker/json-store';
import {
  FAUCET_DAILY_GRANTS, FAUCET_DAILY_LAMPORTS, FAUCET_LIFETIME_LAMPORTS, FAUCET_RESERVATION_LAMPORTS,
  IP_DAILY_GRANTS, LEDGER_PATH, MAX_LEDGER_BYTES, OBSERVATION_LIFETIME_LAMPORTS,
  OBSERVATION_RESERVATION_LAMPORTS, PREPARATION_LEASE_MS, VISITOR_DAILY_GRANTS,
  emptyLedger, type DurableOperation, type HostedDevnetLedger, type OperationState, type PreparationLease,
  type SignedAttempt,
} from './contract.js';
import { LeaseBusyError, ServiceError } from './errors.js';

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function utcDay(now: number): string { return new Date(now).toISOString().slice(0, 10); }
export function observationBucket(now: number): string {
  const start = Math.floor(now / (6 * 60 * 60_000)) * 6 * 60 * 60_000;
  return new Date(start).toISOString();
}
export function grantOperationId(owner: string, assetId: string, day: string): string { return `grant-${hash(`${day}\0${owner}\0${assetId}`)}`; }
export function observationOperationId(assetId: string, bucket: string): string { return `observation-${hash(`${bucket}\0${assetId}`)}`; }

function validate(ledger: HostedDevnetLedger): void {
  if (ledger.schemaVersion !== 1 || !Number.isSafeInteger(ledger.revision) || !Number.isSafeInteger(ledger.nextFence)
    || !ledger.daily || !ledger.leases || !ledger.operations) throw new ServiceError(503, 'The devnet ledger is invalid.', 'LEDGER_INVALID');
}

function mutate(store: JsonCasStore, change: (ledger: HostedDevnetLedger) => void): Promise<HostedDevnetLedger> {
  return mutateJson(store, LEDGER_PATH, emptyLedger, (ledger) => {
    validate(ledger);
    change(ledger);
    ledger.revision += 1;
  }, { attempts: 8, maxBytes: MAX_LEDGER_BYTES });
}

export class DurableJournal {
  constructor(readonly store: JsonCasStore, readonly now: () => number = Date.now) {}

  async read(): Promise<HostedDevnetLedger> {
    const current = await this.store.read<HostedDevnetLedger>(LEDGER_PATH, MAX_LEDGER_BYTES);
    const ledger = current?.value ?? emptyLedger();
    validate(ledger);
    return ledger;
  }

  async reserveGrant(owner: string, assetId: string, visitorHash: string, ipHash: string): Promise<DurableOperation> {
    const day = utcDay(this.now());
    const id = grantOperationId(owner, assetId, day);
    const ledger = await mutate(this.store, (value) => {
      if (value.faucetDisabledReason) throw new ServiceError(503, 'The test faucet is disabled.', 'FAUCET_DISABLED');
      if (value.operations[id]) return;
      const quota = value.daily[day] ??= { grants: 0, lamports: 0, visitors: {}, ips: {} };
      if (quota.grants >= FAUCET_DAILY_GRANTS || quota.lamports + FAUCET_RESERVATION_LAMPORTS > FAUCET_DAILY_LAMPORTS
        || value.faucetLifetimeLamports + FAUCET_RESERVATION_LAMPORTS > FAUCET_LIFETIME_LAMPORTS) {
        throw new ServiceError(429, 'The public test faucet budget is exhausted.', 'GLOBAL_QUOTA', 3_600);
      }
      if ((quota.visitors[visitorHash] ?? 0) >= VISITOR_DAILY_GRANTS) throw new ServiceError(429, 'The visitor test-faucet limit is reached.', 'VISITOR_QUOTA', 3_600);
      if ((quota.ips[ipHash] ?? 0) >= IP_DAILY_GRANTS) throw new ServiceError(429, 'The network test-faucet limit is reached.', 'IP_QUOTA', 3_600);
      quota.grants += 1; quota.lamports += FAUCET_RESERVATION_LAMPORTS;
      quota.visitors[visitorHash] = (quota.visitors[visitorHash] ?? 0) + 1;
      quota.ips[ipHash] = (quota.ips[ipHash] ?? 0) + 1;
      value.faucetLifetimeLamports += FAUCET_RESERVATION_LAMPORTS;
      value.operations[id] = {
        id, kind: 'faucet', state: 'reserved', reservationLamports: FAUCET_RESERVATION_LAMPORTS,
        createdAt: new Date(this.now()).toISOString(), day, owner, assetId, visitorHash, ipHash, bucket: null,
        fence: null, attempt: null, submittedAt: null, completedAt: null, errorCode: null,
      };
    });
    return structuredClone(ledger.operations[id]!);
  }

  async reserveObservation(assetId: string): Promise<DurableOperation> {
    const now = this.now();
    const bucket = observationBucket(now);
    const id = observationOperationId(assetId, bucket);
    const ledger = await mutate(this.store, (value) => {
      if (value.operations[id]) return;
      if (value.observationLifetimeLamports + OBSERVATION_RESERVATION_LAMPORTS > OBSERVATION_LIFETIME_LAMPORTS) {
        throw new ServiceError(503, 'The observation refresh budget is exhausted.', 'OBSERVATION_BUDGET');
      }
      value.observationLifetimeLamports += OBSERVATION_RESERVATION_LAMPORTS;
      value.operations[id] = {
        id, kind: 'observation', state: 'reserved', reservationLamports: OBSERVATION_RESERVATION_LAMPORTS,
        createdAt: new Date(now).toISOString(), day: utcDay(now), owner: null, assetId,
        visitorHash: null, ipHash: null, bucket, fence: null, attempt: null, submittedAt: null,
        completedAt: null, errorCode: null,
      };
    });
    return structuredClone(ledger.operations[id]!);
  }

  async acquire(operation: DurableOperation): Promise<PreparationLease> {
    if (!['reserved', 'prepared', 'submitted'].includes(operation.state)) throw new ServiceError(409, 'operation is not active', 'OPERATION_STATE');
    const holder = randomUUID();
    const kind = operation.kind;
    const now = this.now();
    const ledger = await mutate(this.store, (value) => {
      const current = value.operations[operation.id];
      if (!current || !['reserved', 'prepared', 'submitted'].includes(current.state)) throw new ServiceError(409, 'operation changed', 'OPERATION_STATE');
      const lease = value.leases[kind];
      if (lease && Date.parse(lease.expiresAt) > now) throw new LeaseBusyError();
      const fence = ++value.nextFence;
      value.leases[kind] = { operationId: operation.id, holder, fence, expiresAt: new Date(now + PREPARATION_LEASE_MS).toISOString() };
      if (current.state !== 'reserved') current.fence = fence;
    });
    return structuredClone(ledger.leases[kind]!);
  }

  async persistPrepared(operationId: string, lease: PreparationLease, attempt: SignedAttempt): Promise<DurableOperation> {
    const now = this.now();
    const ledger = await mutate(this.store, (value) => {
      const operation = value.operations[operationId];
      if (!operation || operation.state !== 'reserved') throw new ServiceError(409, 'operation changed', 'OPERATION_STATE');
      const current = value.leases[operation.kind];
      if (!current || current.operationId !== operationId || current.holder !== lease.holder || current.fence !== lease.fence
        || Date.parse(current.expiresAt) <= now) throw new ServiceError(409, 'preparation lease was lost', 'LEASE_LOST');
      operation.state = 'prepared'; operation.fence = lease.fence; operation.attempt = structuredClone(attempt);
    });
    return structuredClone(ledger.operations[operationId]!);
  }

  async assertSendFence(operationId: string, lease: PreparationLease): Promise<void> {
    const ledger = await this.read();
    const operation = ledger.operations[operationId];
    const current = operation ? ledger.leases[operation.kind] : null;
    if (!operation || !['prepared', 'submitted'].includes(operation.state) || operation.fence !== lease.fence || !current
      || current.operationId !== operationId || current.holder !== lease.holder || current.fence !== lease.fence
      || Date.parse(current.expiresAt) <= this.now()) throw new ServiceError(409, 'preparation lease was lost', 'LEASE_LOST');
  }

  async release(lease: PreparationLease, state?: OperationState, errorCode?: string): Promise<DurableOperation> {
    const ledger = await mutate(this.store, (value) => {
      const operation = value.operations[lease.operationId];
      if (!operation) throw new ServiceError(409, 'operation missing', 'OPERATION_STATE');
      const current = value.leases[operation.kind];
      const sameLease = current?.operationId === lease.operationId && current.holder === lease.holder && current.fence === lease.fence;
      const ownsFence = sameLease && operation.fence === lease.fence && Date.parse(current.expiresAt) > this.now();
      if (sameLease) value.leases[operation.kind] = null;
      if (state) {
        if (['confirmed', 'failed', 'expired'].includes(operation.state)) return;
        if (!ownsFence) throw new ServiceError(409, 'preparation lease was lost', 'LEASE_LOST');
        if (!['prepared', 'submitted'].includes(operation.state)) throw new ServiceError(409, 'operation changed', 'OPERATION_STATE');
        operation.state = state;
        if (state === 'submitted') operation.submittedAt = new Date(this.now()).toISOString();
        if (state === 'confirmed' || state === 'failed' || state === 'expired') operation.completedAt = new Date(this.now()).toISOString();
        operation.errorCode = errorCode ?? null;
      }
    });
    return structuredClone(ledger.operations[lease.operationId]!);
  }

  async transition(operationId: string, state: OperationState, errorCode?: string): Promise<DurableOperation> {
    const ledger = await mutate(this.store, (value) => {
      const operation = value.operations[operationId];
      if (!operation) throw new ServiceError(409, 'operation missing', 'OPERATION_STATE');
      if (['confirmed', 'failed', 'expired'].includes(operation.state)) return;
      if (!operation.attempt || !['submitted', 'confirmed', 'failed', 'expired'].includes(state)) {
        throw new ServiceError(409, 'operation changed', 'OPERATION_STATE');
      }
      operation.state = state; operation.errorCode = errorCode ?? null;
      if (state === 'submitted') operation.submittedAt ??= new Date(this.now()).toISOString();
      if (state === 'confirmed' || state === 'failed' || state === 'expired') operation.completedAt = new Date(this.now()).toISOString();
    });
    return structuredClone(ledger.operations[operationId]!);
  }

  async disableFaucet(reason: string): Promise<void> {
    await mutate(this.store, (value) => { value.faucetDisabledReason ??= reason; });
  }
}
