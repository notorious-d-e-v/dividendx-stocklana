import { createHash } from 'node:crypto';
import type { Idl } from '@anchor-lang/core';
import {
  TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createMintToCheckedInstruction,
  getAssociatedTokenAddressSync, unpackAccount, unpackMint,
} from '@solana/spl-token';
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, type TransactionInstruction,
} from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DividendXInstructions, decodeProgramAccount, fetchClock, fetchQuoteSnapshot,
  normalizeAssetPolicyAccount,
} from '@dividendx/transaction-sdk';
import {
  DEFAULT_DEVNET_RPC_URL, PROGRAM_ID, assertManifestCurrent, type RegistryAsset, type RegistryManifest,
} from '@dividendx/devnet-runtime';
import {
  ATTESTOR_PUBLIC_KEY, FAUCET_PUBLIC_KEY, GRANT_UNITS, HOLDER_SOL_TARGET_LAMPORTS,
  OBSERVATION_LIFETIME_SECONDS, type ChainAdapter, type DurableOperation, type FaucetRequest,
  type PreparedTransaction, type SignedAttempt, type TransactionStatus,
} from './contract.js';
import { ServiceError } from './errors.js';

const IDL = DIVIDENDX_IDL as Idl;
const builders = new DividendXInstructions(IDL);
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const RPC_MIN_START_INTERVAL_MS = 400;
const RPC_MAX_QUEUE = 24;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const READ_ONLY_RPC_METHODS = new Set([
  'getGenesisHash', 'getAccountInfo', 'getMultipleAccounts', 'getLatestBlockhash', 'getSignatureStatuses',
  'getBlockHeight', 'getBalance', 'getMinimumBalanceForRentExemption', 'getFeeForMessage', 'simulateTransaction',
  'getSlot', 'getVersion',
]);

function reportRpcFailure(code: string): void {
  console.error(JSON.stringify({ event: 'devnet-rpc-failure', code }));
}

interface StartWaiter {
  deadline: number;
  signal?: AbortSignal | null;
  resolve: () => void;
  reject: (error: ServiceError) => void;
  abort: () => void;
}

export class RpcStartScheduler {
  private readonly queue: StartWaiter[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextStartAt = 0;
  private cooldownUntil = 0;
  private closed = false;

  constructor(readonly intervalMs = RPC_MIN_START_INTERVAL_MS, readonly maxQueue = RPC_MAX_QUEUE) {}

  acquire(deadline: number, signal?: AbortSignal | null): Promise<void> {
    if (this.closed) return Promise.reject(new ServiceError(503, 'RPC service backoff is unavailable.', 'RPC_BACKOFF_INVALID'));
    if (signal?.aborted) return Promise.reject(new ServiceError(503, 'RPC request was aborted.', 'RPC_ABORTED'));
    if (this.queue.length >= this.maxQueue) return Promise.reject(new ServiceError(503, 'RPC request queue is full.', 'RPC_QUEUE_FULL'));
    return new Promise((resolve, reject) => {
      const waiter: StartWaiter = {
        deadline, signal, resolve, reject,
        abort: () => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          signal?.removeEventListener('abort', waiter.abort);
          reject(new ServiceError(503, 'RPC request was aborted.', 'RPC_ABORTED'));
          this.pump();
        },
      };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      if (signal?.aborted) { waiter.abort(); return; }
      this.queue.push(waiter);
      this.pump();
    });
  }

  applyCooldown(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > MAX_TIMER_DELAY_MS) {
      this.failClosed(); return;
    }
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + milliseconds);
    this.pump();
  }

  failClosed(): void {
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    for (const waiter of this.queue.splice(0)) {
      waiter.signal?.removeEventListener('abort', waiter.abort);
      waiter.reject(new ServiceError(503, 'RPC service backoff is unavailable.', 'RPC_BACKOFF_INVALID'));
    }
  }

  private pump(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const currentTime = Date.now();
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const waiter = this.queue[index]!;
      if (waiter.deadline <= currentTime) {
        this.queue.splice(index, 1); waiter.signal?.removeEventListener('abort', waiter.abort);
        waiter.reject(new ServiceError(503, 'RPC request timed out.', 'RPC_TIMEOUT'));
      }
    }
    while (this.queue.length > 0) {
      const waiter = this.queue[0]!;
      const now = Date.now();
      if (waiter.signal?.aborted) { waiter.abort(); continue; }
      const startAt = Math.max(now, this.nextStartAt, this.cooldownUntil);
      if (startAt >= waiter.deadline) {
        this.queue.shift(); waiter.signal?.removeEventListener('abort', waiter.abort);
        waiter.reject(new ServiceError(503, 'RPC request timed out.', 'RPC_TIMEOUT'));
        continue;
      }
      if (startAt > now) {
        const earliestDeadline = Math.min(...this.queue.map((queued) => queued.deadline));
        this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, Math.min(startAt, earliestDeadline) - now);
        return;
      }
      this.queue.shift(); waiter.signal?.removeEventListener('abort', waiter.abort);
      this.nextStartAt = now + this.intervalMs;
      waiter.resolve();
    }
  }
}

const sharedRpcScheduler = new RpcStartScheduler();

function readOnlyRpcRequest(init?: RequestInit): boolean {
  if (typeof init?.body !== 'string' || init.body.length > 32_768) return false;
  try {
    const value = JSON.parse(init.body) as unknown;
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && 'method' in value && typeof value.method === 'string' && READ_ONLY_RPC_METHODS.has(value.method));
  } catch { return false; }
}

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | null | 'invalid' {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d{1,9}$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1_000;
    return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_TIMER_DELAY_MS ? milliseconds : 'invalid';
  }
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return 'invalid';
  const milliseconds = Math.max(0, date - now);
  return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_TIMER_DELAY_MS ? milliseconds : 'invalid';
}

function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return '';
  const digits = [0];
  for (const byte of input) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index]! * 256; digits[index] = carry % 58; carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let leading = 0;
  while (leading < input.length - 1 && input[leading] === 0) leading += 1;
  return '1'.repeat(leading) + digits.reverse().map((digit) => BASE58[digit]).join('');
}

function digest(value: string): Buffer { return createHash('sha256').update(value).digest(); }
function publicKeyText(value: unknown): string | null {
  return value !== null && typeof value === 'object' && 'toBase58' in value && typeof value.toBase58 === 'function'
    ? value.toBase58() as string : null;
}
function bytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array) && !Array.isArray(value)) throw new ServiceError(503, 'policy identity changed', 'IDENTITY_POLICY');
  return Buffer.from(value as ArrayLike<number>);
}

export function signerFromBase64(value: string | undefined, expected: string, label: string): Keypair {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ServiceError(503, `${label} signer is unavailable`, 'SIGNER_UNAVAILABLE');
  }
  const raw = Buffer.from(value, 'base64');
  if (raw.length !== 64 || raw.toString('base64') !== value) throw new ServiceError(503, `${label} signer is invalid`, 'SIGNER_INVALID');
  const signer = Keypair.fromSecretKey(raw);
  if (signer.publicKey.toBase58() !== expected) throw new ServiceError(503, `${label} signer identity is invalid`, 'SIGNER_MISMATCH');
  return signer;
}

export function authoritySigners(environment: NodeJS.ProcessEnv): { faucet: Keypair; attestor: Keypair } {
  const faucet = signerFromBase64(environment.DIVIDENDX_FAUCET_SECRET_KEY_BASE64, FAUCET_PUBLIC_KEY, 'faucet');
  const attestor = signerFromBase64(environment.DIVIDENDX_TEST_ATTESTOR_SECRET_KEY_BASE64, ATTESTOR_PUBLIC_KEY, 'attestor');
  if (faucet.publicKey.equals(attestor.publicKey)) throw new ServiceError(503, 'authority separation is invalid', 'SIGNER_SEPARATION');
  return { faucet, attestor };
}

export function boundedRpcFetch(timeoutMs = 12_000, fetchImpl: typeof fetch = globalThis.fetch,
  scheduler: RpcStartScheduler = sharedRpcScheduler): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const caller = init?.signal;
    if (caller?.aborted) throw new ServiceError(503, 'RPC request was aborted.', 'RPC_ABORTED');
    const deadline = Date.now() + timeoutMs;
    try { await scheduler.acquire(deadline, caller); }
    catch (error) {
      if (error instanceof ServiceError && error.code !== 'RPC_ABORTED') reportRpcFailure(error.code);
      throw error;
    }
    const controller = new AbortController();
    let timedOut = false;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reportRpcFailure('RPC_TIMEOUT');
      throw new ServiceError(503, 'RPC request timed out.', 'RPC_TIMEOUT');
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, remaining);
    const abort = () => controller.abort(caller?.reason);
    caller?.addEventListener('abort', abort, { once: true });
    if (caller?.aborted) abort();
    try {
      let response: Response;
      try { response = await fetchImpl(input, { ...init, redirect: 'error', signal: controller.signal }); }
      catch {
        if (timedOut) {
          reportRpcFailure('RPC_TIMEOUT');
          throw new ServiceError(503, 'RPC request timed out.', 'RPC_TIMEOUT');
        }
        if (caller?.aborted) throw new ServiceError(503, 'RPC request was aborted.', 'RPC_ABORTED');
        reportRpcFailure('RPC_NETWORK');
        throw new ServiceError(503, 'RPC request failed.', 'RPC_NETWORK');
      }
      if (!response.ok) {
        if (response.status === 429 && readOnlyRpcRequest(init)) {
          const cooldown = retryAfterMilliseconds(response.headers.get('retry-after'));
          if (cooldown === 'invalid') scheduler.failClosed();
          else if (cooldown !== null && cooldown > 0) scheduler.applyCooldown(cooldown);
        }
        try { await response.body?.cancel(); } catch { /* The upstream body is intentionally discarded. */ }
        const code = `RPC_HTTP_${response.status}`;
        reportRpcFailure(code);
        throw new ServiceError(503, 'RPC service rejected the request.', code);
      }
      return response;
    }
    finally { clearTimeout(timer); caller?.removeEventListener('abort', abort); }
  }) as typeof fetch;
}

export function publicDevnetConnection(): Connection {
  return new Connection(DEFAULT_DEVNET_RPC_URL, {
    commitment: 'confirmed', fetch: boundedRpcFetch(), disableRetryOnRateLimit: true, confirmTransactionInitialTimeout: 12_000,
  });
}

export class SolanaChainAdapter implements ChainAdapter {
  constructor(readonly connection: Connection, readonly manifest: RegistryManifest,
    readonly faucet: Keypair, readonly attestor: Keypair) {
    if (faucet.publicKey.toBase58() !== FAUCET_PUBLIC_KEY || attestor.publicKey.toBase58() !== ATTESTOR_PUBLIC_KEY
      || faucet.publicKey.equals(attestor.publicKey)) throw new ServiceError(503, 'authority configuration is invalid', 'SIGNER_MISMATCH');
  }

  private asset(assetId: string): RegistryAsset {
    const asset = this.manifest.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new ServiceError(400, 'assetId is invalid', 'ASSET_INVALID');
    return asset;
  }

  private async assertFaucetAsset(asset: RegistryAsset): Promise<void> {
    const address = new PublicKey(asset.collateralMint);
    const info = await this.connection.getAccountInfo(address, 'confirmed');
    if (!info || !info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new ServiceError(503, 'mint profile changed', 'IDENTITY_MINT');
    const mint = unpackMint(address, info, TOKEN_2022_PROGRAM_ID);
    if (mint.decimals !== asset.decimals || !mint.mintAuthority?.equals(this.faucet.publicKey) || mint.freezeAuthority !== null) {
      throw new ServiceError(503, 'faucet authority changed', 'IDENTITY_FAUCET');
    }
  }

  private async assertObservationAsset(asset: RegistryAsset): Promise<void> {
    const series = asset.series[0]!;
    const policyAddress = new PublicKey(asset.assetPolicy);
    const snapshot = await fetchQuoteSnapshot(this.connection, IDL, {
      assetPolicy: policyAddress, series: new PublicKey(series.address), accumulator: new PublicKey(series.accumulator),
      collateralMint: new PublicKey(asset.collateralMint), vault: new PublicKey(series.vault),
    });
    if (!snapshot.policy.mintProfileMatchesReviewed || !snapshot.mintProfile.accountingFactorsSupported) {
      throw new ServiceError(503, 'mint profile changed', 'IDENTITY_PROFILE');
    }
    const info = await this.connection.getAccountInfo(policyAddress, 'confirmed');
    if (!info || !info.owner.equals(PROGRAM_ID)) throw new ServiceError(503, 'policy identity changed', 'IDENTITY_POLICY');
    const raw = decodeProgramAccount(IDL, 'assetPolicy', info.data);
    const expected = digest(`synthetic-devnet-policy-v1:${asset.id}:${asset.symbol}:${asset.decimals}`);
    if (publicKeyText(raw.attestor) !== this.attestor.publicKey.toBase58() || !bytes(raw.policyDigest).equals(expected)) {
      throw new ServiceError(503, 'observation authority changed', 'IDENTITY_ATTESTOR');
    }
  }

  private async prepare(signer: Keypair, instructions: readonly TransactionInstruction[], reservationLamports: number,
    intent: Record<string, string>): Promise<PreparedTransaction> {
    const before = await this.connection.getBalance(signer.publicKey, 'confirmed');
    if (before < reservationLamports) throw new ServiceError(503, 'service signer balance is insufficient', 'INSUFFICIENT_BALANCE');
    const latest = await this.connection.getLatestBlockhash('confirmed');
    const legacy = new Transaction({ feePayer: signer.publicKey, ...latest }).add(...instructions);
    const signed = new VersionedTransaction(legacy.compileMessage());
    signed.sign([signer]);
    const simulation = await this.connection.simulateTransaction(signed, {
      commitment: 'confirmed', sigVerify: true, accounts: { addresses: [signer.publicKey.toBase58()], encoding: 'base64' },
    });
    if (simulation.value.err !== null) throw new ServiceError(503, 'transaction simulation failed', 'SIMULATION_FAILED');
    const after = simulation.value.accounts?.[0]?.lamports;
    if (!Number.isSafeInteger(after) || after! < 0 || before - after! < 0 || before - after! > reservationLamports) {
      throw new ServiceError(503, 'transaction exceeds its reserved debit', 'SIMULATION_BUDGET');
    }
    const raw = signed.serialize();
    return {
      signature: base58Encode(signed.signatures[0]!), blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight, serializedTransactionBase64: Buffer.from(raw).toString('base64'),
      preparedAt: new Date().toISOString(), intent,
    };
  }

  async prepareFaucet(request: FaucetRequest, reservationLamports: number): Promise<PreparedTransaction> {
    await assertManifestCurrent(this.connection, this.manifest);
    if (request.runtimeId !== this.manifest.runtimeId || request.genesisHash !== this.manifest.genesisHash) {
      throw new ServiceError(409, 'runtime identity is stale', 'STALE_RUNTIME');
    }
    let owner: PublicKey;
    try { owner = new PublicKey(request.owner); } catch { throw new ServiceError(400, 'owner is invalid', 'OWNER_INVALID'); }
    if (!PublicKey.isOnCurve(owner.toBytes())) throw new ServiceError(400, 'owner is invalid', 'OWNER_INVALID');
    const asset = this.asset(request.assetId);
    await this.assertFaucetAsset(asset);
    const mint = new PublicKey(asset.collateralMint);
    const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
    const instructions: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(this.faucet.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
      createMintToCheckedInstruction(mint, ata, this.faucet.publicKey, GRANT_UNITS * 10n ** BigInt(asset.decimals), asset.decimals, [], TOKEN_2022_PROGRAM_ID),
    ];
    const ownerBalance = await this.connection.getBalance(owner, 'confirmed');
    if (ownerBalance < HOLDER_SOL_TARGET_LAMPORTS) instructions.unshift(SystemProgram.transfer({
      fromPubkey: this.faucet.publicKey, toPubkey: owner, lamports: HOLDER_SOL_TARGET_LAMPORTS - ownerBalance,
    }));
    return this.prepare(this.faucet, instructions, reservationLamports, {
      operation: 'faucet', recipient: owner.toBase58(), mint: mint.toBase58(), destination: ata.toBase58(),
      amountRaw: (GRANT_UNITS * 10n ** BigInt(asset.decimals)).toString(),
    });
  }

  async prepareObservation(assetId: string, reservationLamports: number): Promise<PreparedTransaction> {
    await assertManifestCurrent(this.connection, this.manifest);
    const asset = this.asset(assetId);
    await this.assertObservationAsset(asset);
    const clock = await fetchClock(this.connection);
    const instruction = builders.attestor.refreshObservation({
      attestor: this.attestor.publicKey, assetPolicy: new PublicKey(asset.assetPolicy), collateralMint: new PublicKey(asset.collateralMint),
    }, digest(`synthetic-test-profile-observation-v1:${asset.id}:${asset.symbol}:${asset.decimals}`),
    clock.unixTimestamp + OBSERVATION_LIFETIME_SECONDS);
    return this.prepare(this.attestor, [instruction], reservationLamports, {
      operation: 'refreshObservation', assetPolicy: asset.assetPolicy,
      evidenceDigestHex: digest(`synthetic-test-profile-observation-v1:${asset.id}:${asset.symbol}:${asset.decimals}`).toString('hex'),
      validUntil: (clock.unixTimestamp + OBSERVATION_LIFETIME_SECONDS).toString(),
    });
  }

  async verifyPrepared(operation: DurableOperation): Promise<void> {
    await assertManifestCurrent(this.connection, this.manifest);
    const asset = this.asset(operation.assetId);
    if (operation.kind === 'faucet') await this.assertFaucetAsset(asset); else await this.assertObservationAsset(asset);
  }

  async sendExact(attempt: SignedAttempt): Promise<void> {
    const raw = Buffer.from(attempt.serializedTransactionBase64, 'base64');
    let transaction: VersionedTransaction;
    try { transaction = VersionedTransaction.deserialize(raw); }
    catch { throw new ServiceError(503, 'persisted transaction is invalid', 'SIGNED_BYTES_INVALID'); }
    if (transaction.signatures.length !== 1 || base58Encode(transaction.signatures[0]!) !== attempt.signature
      || Buffer.from(transaction.serialize()).toString('base64') !== attempt.serializedTransactionBase64) {
      throw new ServiceError(503, 'persisted transaction identity changed', 'SIGNED_BYTES_INVALID');
    }
    const returned = await this.connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 2 });
    if (returned !== attempt.signature) throw new ServiceError(503, 'RPC returned a different signature', 'SIGNATURE_MISMATCH');
  }

  async transactionStatus(attempt: SignedAttempt): Promise<TransactionStatus> {
    const status = (await this.connection.getSignatureStatuses([attempt.signature], { searchTransactionHistory: true })).value[0];
    if (!status) return { state: 'missing' };
    if (status.err) return { state: 'failed', errorCode: 'TRANSACTION_FAILED' };
    return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'
      ? { state: 'confirmed' } : { state: 'pending' };
  }

  blockHeight(): Promise<number> { return this.connection.getBlockHeight('confirmed'); }

  async verifyOutcome(operation: DurableOperation): Promise<boolean> {
    const asset = this.asset(operation.assetId);
    if (operation.kind === 'faucet') {
      if (!operation.owner) return false;
      const owner = new PublicKey(operation.owner); const mint = new PublicKey(asset.collateralMint);
      const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
      const info = await this.connection.getAccountInfo(ata, 'confirmed');
      if (!info) return false;
      const account = unpackAccount(ata, info, TOKEN_2022_PROGRAM_ID);
      return account.owner.equals(owner) && account.mint.equals(mint);
    }
    const info = await this.connection.getAccountInfo(new PublicKey(asset.assetPolicy), 'confirmed');
    if (!info) return false;
    const raw = decodeProgramAccount(IDL, 'assetPolicy', info.data);
    const expected = digest(`synthetic-test-profile-observation-v1:${asset.id}:${asset.symbol}:${asset.decimals}`);
    const policy = normalizeAssetPolicyAccount(new PublicKey(asset.assetPolicy), raw);
    const intended = operation.attempt?.intent.validUntil;
    return bytes(raw.observationEvidenceDigest).equals(expected) && typeof intended === 'string'
      && policy.observationValidUntil >= BigInt(intended);
  }
}
