export const LEDGER_PATH = 'private/dividendx/hosted-devnet-v1.json';
export const MAX_LEDGER_BYTES = 1_048_576;
export const FAUCET_RESERVATION_LAMPORTS = 9_000_000;
export const HOLDER_SOL_TARGET_LAMPORTS = 6_000_000;
export const FAUCET_DAILY_GRANTS = 30;
export const FAUCET_DAILY_LAMPORTS = 270_000_000;
export const FAUCET_LIFETIME_LAMPORTS = 1_000_000_000;
export const VISITOR_DAILY_GRANTS = 3;
export const IP_DAILY_GRANTS = 12;
export const OBSERVATION_RESERVATION_LAMPORTS = 10_000;
export const OBSERVATION_LIFETIME_LAMPORTS = 10_000_000;
export const PREPARATION_LEASE_MS = 45_000;
export const GRANT_UNITS = 10n;
export const OBSERVATION_LIFETIME_SECONDS = 43_200n;
export const FAUCET_PUBLIC_KEY = 'C6U91C2a2CxKfiDNTaTHvbQe41CdRwtjsr47ip6zKyVb';
export const ATTESTOR_PUBLIC_KEY = 'Demegvz6VfKDWjiiPiyRdnqfK3Vy2EJATU4dcNKqpcwk';

export type OperationKind = 'faucet' | 'observation';
export type OperationState = 'reserved' | 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'expired';

export interface SignedAttempt {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  serializedTransactionBase64: string;
  preparedAt: string;
  intent: Record<string, string>;
}

export interface DurableOperation {
  id: string;
  kind: OperationKind;
  state: OperationState;
  reservationLamports: number;
  createdAt: string;
  day: string;
  owner: string | null;
  assetId: string;
  visitorHash: string | null;
  ipHash: string | null;
  bucket: string | null;
  fence: number | null;
  attempt: SignedAttempt | null;
  submittedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
}

export interface PreparationLease {
  operationId: string;
  holder: string;
  fence: number;
  expiresAt: string;
}

export interface DailyQuota {
  grants: number;
  lamports: number;
  visitors: Record<string, number>;
  ips: Record<string, number>;
}

export interface HostedDevnetLedger {
  schemaVersion: 1;
  revision: number;
  nextFence: number;
  faucetDisabledReason: string | null;
  faucetLifetimeLamports: number;
  observationLifetimeLamports: number;
  daily: Record<string, DailyQuota>;
  leases: { faucet: PreparationLease | null; observation: PreparationLease | null };
  operations: Record<string, DurableOperation>;
}

export interface FaucetRequest {
  owner: string;
  assetId: string;
  runtimeId: string;
  genesisHash: string;
}

export interface PreparedTransaction extends SignedAttempt {}

export interface TransactionStatus {
  state: 'missing' | 'pending' | 'confirmed' | 'failed';
  errorCode?: string;
}

export interface ChainAdapter {
  prepareFaucet(request: FaucetRequest, reservationLamports: number): Promise<PreparedTransaction>;
  prepareObservation(assetId: string, reservationLamports: number): Promise<PreparedTransaction>;
  verifyPrepared(operation: DurableOperation): Promise<void>;
  sendExact(attempt: SignedAttempt): Promise<void>;
  transactionStatus(attempt: SignedAttempt): Promise<TransactionStatus>;
  blockHeight(): Promise<number>;
  verifyOutcome(operation: DurableOperation): Promise<boolean>;
}

export interface PublicFundingResult {
  signatures: string[];
  status: 'pending' | 'confirmed' | 'failed';
  message: string;
  error?: string;
}

export function emptyLedger(): HostedDevnetLedger {
  return {
    schemaVersion: 1, revision: 0, nextFence: 0, faucetDisabledReason: null,
    faucetLifetimeLamports: 0, observationLifetimeLamports: 0,
    daily: {}, leases: { faucet: null, observation: null }, operations: {},
  };
}
