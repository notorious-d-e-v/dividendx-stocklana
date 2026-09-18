import type { JsonCasStore } from '@dividendx/hosted-broker/json-store';
import type { RegistryManifest } from '@dividendx/devnet-runtime';
import { PublicKey } from '@solana/web3.js';
import {
  FAUCET_DAILY_GRANTS, FAUCET_DAILY_LAMPORTS, FAUCET_LIFETIME_LAMPORTS, FAUCET_RESERVATION_LAMPORTS,
  type ChainAdapter, type DurableOperation, type FaucetRequest, type PublicFundingResult,
} from './contract.js';
import { DurableJournal, utcDay } from './ledger.js';
import { LeaseBusyError, ServiceError } from './errors.js';

function result(operation: DurableOperation, symbol?: string): PublicFundingResult {
  const signatures = operation.attempt ? [operation.attempt.signature] : [];
  if (operation.state === 'confirmed') return { signatures, status: 'confirmed', message: symbol
    ? `Funded 10 ${symbol} synthetic devnet test units.` : 'Synthetic observation refreshed.' };
  if (operation.state === 'failed' || operation.state === 'expired') return {
    signatures, status: 'failed', message: 'The recorded devnet operation did not complete.',
    error: operation.state === 'expired' ? 'The signed transaction expired unresolved; no replacement was issued.' : 'The recorded transaction failed.',
  };
  return { signatures, status: 'pending', message: 'The recorded devnet operation is pending confirmation.' };
}

export class HostedDevnetService {
  readonly journal: DurableJournal;
  private writeDisabled = false;

  constructor(readonly store: JsonCasStore, readonly chain: ChainAdapter, readonly manifest: RegistryManifest,
    now: () => number = Date.now) {
    this.journal = new DurableJournal(store, now);
  }

  async faucetAvailable(): Promise<boolean> {
    if (this.writeDisabled) return false;
    try {
      const ledger = await this.journal.read();
      const daily = ledger.daily[utcDay(this.journal.now())];
      return ledger.faucetDisabledReason === null
        && ledger.faucetLifetimeLamports + FAUCET_RESERVATION_LAMPORTS <= FAUCET_LIFETIME_LAMPORTS
        && (!daily || (daily.grants < FAUCET_DAILY_GRANTS
          && daily.lamports + FAUCET_RESERVATION_LAMPORTS <= FAUCET_DAILY_LAMPORTS));
    }
    catch { this.writeDisabled = true; return false; }
  }

  private async reconcile(operation: DurableOperation): Promise<DurableOperation> {
    if (['confirmed', 'failed', 'expired'].includes(operation.state)) return operation;
    if (!operation.attempt) return operation;
    const status = await this.chain.transactionStatus(operation.attempt);
    if (status.state === 'confirmed') {
      const verified = await this.chain.verifyOutcome(operation);
      return this.journal.transition(operation.id, verified ? 'confirmed' : 'failed', verified ? undefined : 'OUTCOME_MISMATCH');
    }
    if (status.state === 'failed') return this.journal.transition(operation.id, 'failed', status.errorCode ?? 'TRANSACTION_FAILED');
    if (await this.chain.blockHeight() > operation.attempt.lastValidBlockHeight) {
      const final = await this.chain.transactionStatus(operation.attempt);
      if (final.state === 'confirmed') {
        const verified = await this.chain.verifyOutcome(operation);
        return this.journal.transition(operation.id, verified ? 'confirmed' : 'failed', verified ? undefined : 'OUTCOME_MISMATCH');
      }
      return this.journal.transition(operation.id, final.state === 'failed' ? 'failed' : 'expired',
        final.state === 'failed' ? 'TRANSACTION_FAILED' : 'SIGNATURE_EXPIRED');
    }
    return operation;
  }

  private async execute(operation: DurableOperation, prepare: () => Promise<import('./contract.js').PreparedTransaction>): Promise<DurableOperation> {
    let current = await this.reconcile(operation);
    if (['confirmed', 'failed', 'expired'].includes(current.state)) return current;
    let lease;
    try { lease = await this.journal.acquire(current); }
    catch (error) { if (error instanceof LeaseBusyError) return current; throw error; }
    try {
      if (current.state === 'reserved') {
        const attempt = await prepare();
        current = await this.journal.persistPrepared(current.id, lease, attempt);
      }
      await this.chain.verifyPrepared(current);
      await this.journal.assertSendFence(current.id, lease);
      try { await this.chain.sendExact(current.attempt!); }
      catch (error) {
        if (error instanceof ServiceError && error.code === 'SIGNATURE_MISMATCH') {
          try { return await this.journal.release(lease, 'failed', error.code); }
          catch { this.writeDisabled = true; return current; }
        }
        try { return await this.journal.release(lease, 'submitted', 'SUBMISSION_UNCERTAIN'); }
        catch { this.writeDisabled = true; return current; }
      }
      try { current = await this.journal.release(lease, 'submitted'); }
      catch { this.writeDisabled = true; return current; }
      return this.reconcile(current);
    } catch (error) {
      try { await this.journal.release(lease); } catch { this.writeDisabled = true; }
      if (current.kind === 'faucet' && error instanceof ServiceError
        && (error.code.startsWith('IDENTITY_') || error.code === 'INSUFFICIENT_BALANCE')) {
        this.writeDisabled = true;
        try { await this.journal.disableFaucet(error.code); } catch {}
      }
      throw error;
    }
  }

  async fund(request: FaucetRequest, visitorHash: string, ipHash: string): Promise<PublicFundingResult> {
    if (this.writeDisabled) throw new ServiceError(503, 'The test faucet is disabled.', 'FAUCET_DISABLED');
    if (request.runtimeId !== this.manifest.runtimeId || request.genesisHash !== this.manifest.genesisHash) {
      throw new ServiceError(409, 'runtime identity is stale', 'STALE_RUNTIME');
    }
    const asset = this.manifest.assets.find((candidate) => candidate.id === request.assetId);
    if (!asset) throw new ServiceError(400, 'assetId is invalid', 'ASSET_INVALID');
    let owner: PublicKey;
    try { owner = new PublicKey(request.owner); } catch { throw new ServiceError(400, 'owner is invalid', 'OWNER_INVALID'); }
    if (!PublicKey.isOnCurve(owner.toBytes()) || owner.toBase58() !== request.owner) throw new ServiceError(400, 'owner is invalid', 'OWNER_INVALID');
    let operation: DurableOperation;
    try {
      operation = await this.journal.reserveGrant(request.owner, request.assetId, visitorHash, ipHash);
      operation = await this.execute(operation, () => this.chain.prepareFaucet(request, operation.reservationLamports));
    } catch (error) {
      if (!(error instanceof ServiceError)) this.writeDisabled = true;
      throw error;
    }
    return result(operation, asset.symbol);
  }

  async refreshObservations(): Promise<PublicFundingResult[]> {
    const values: PublicFundingResult[] = [];
    for (const asset of this.manifest.assets) {
      try {
        const operation = await this.journal.reserveObservation(asset.id);
        const completed = await this.execute(operation, () => this.chain.prepareObservation(asset.id, operation.reservationLamports));
        const value = result(completed);
        values.push(value);
        if (value.status === 'failed') break;
      } catch (error) {
        values.push({ signatures: [], status: 'failed', message: 'Observation refresh stopped before this asset completed.',
          error: error instanceof ServiceError ? error.code : 'OBSERVATION_REFRESH_FAILED' });
        break;
      }
    }
    return values;
  }
}
