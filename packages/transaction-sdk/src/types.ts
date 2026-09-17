import type { PublicKey } from '@solana/web3.js';
import type { ClaimSideName, EventStatusName } from './constants.js';

export interface ChainClock {
  slot: bigint;
  epochStartTimestamp: bigint;
  epoch: bigint;
  leaderScheduleEpoch: bigint;
  unixTimestamp: bigint;
  contextSlot: number;
}

export interface ScaleTuple {
  currentBits: bigint;
  pendingBits: bigint;
  pendingEffectiveTimestamp: bigint;
  activeBits: bigint;
}

export interface ConfigSnapshot {
  address: PublicKey;
  admin: PublicKey;
  deploymentDomain: Uint8Array;
}

export interface Guard {
  expectedStateVersion: bigint;
  expiryUnixTimestamp: bigint;
  minimumRawOutput: bigint;
}

export type SeriesLifecyclePhase = 'open' | 'sealing' | 'finalized';
export type ProductPhase = 'funding' | 'collecting' | 'matured_pending' | 'redeemable' | 'exception';

export interface SeriesSnapshot {
  address: PublicKey;
  assetPolicy: PublicKey;
  collateralMint: PublicKey;
  ptMint: PublicKey;
  drMint: PublicKey;
  vault: PublicKey;
  year: number;
  stateVersion: bigint;
  startUnixTimestamp: bigint;
  maturityUnixTimestamp: bigint;
  phase: SeriesLifecyclePhase;
  accountableRaw: bigint;
  eventCount: number;
  unresolvedCount: number;
  inYearQualifiedCount: number;
  journalVersion: bigint;
  journalHash: Uint8Array;
  sealedCoverageDigest: Uint8Array;
  sealedEventCount: number;
  finalSupplyRaw: bigint;
  finalPtPoolRaw: bigint;
  finalDrPoolRaw: bigint;
  redeemedPtClaimsRaw: bigint;
  redeemedDrClaimsRaw: bigint;
  ptPaidRaw: bigint;
  drPaidRaw: bigint;
}

export interface AccumulatorSnapshot {
  address: PublicKey;
  series: PublicKey;
  cursor: number;
  numeratorLe: Uint8Array;
  denominatorLe: Uint8Array;
}

export interface AssetPolicySnapshot {
  address: PublicKey;
  collateralMint: PublicKey;
  decimals: number;
  extensionsMask: bigint;
  enabled: boolean;
  observedSlot: bigint;
  observationValidUntil: bigint;
  observationEvidenceDigest: Uint8Array;
  observedScale: ScaleTuple;
  controlsFingerprint: Uint8Array;
  /** True only after comparing the current mint extensions, controls and full scale tuple in one RPC snapshot. */
  mintProfileMatchesReviewed: boolean;
}

export interface CustodySnapshot {
  vaultRaw: bigint;
  requiredRaw: bigint;
  healthy: boolean;
}

export interface EligibilitySnapshot {
  productPhase: ProductPhase;
  depositsOpen: boolean;
  journalResolved: boolean;
  coverageAttested: boolean;
  mature: boolean;
  finalizationInProgress: boolean;
  redeemable: boolean;
  custody: CustodySnapshot;
  reasons: readonly string[];
}

export interface DepositQuote {
  kind: 'deposit';
  inputRaw: bigint;
  ptOutputRaw: bigint;
  drOutputRaw: bigint;
  guard: Guard;
}

export interface RecombineQuote {
  kind: 'recombine';
  ptInputRaw: bigint;
  drInputRaw: bigint;
  collateralOutputRaw: bigint;
  guard: Guard;
}

export interface RedemptionQuote {
  kind: 'redeem';
  side: ClaimSideName;
  claimInputRaw: bigint;
  collateralOutputRaw: bigint;
  allowZero: boolean;
  guard: Guard;
}

export interface IndicativeAnnualAllocation {
  final: boolean;
  accountableRaw: bigint;
  ptPoolRaw: bigint;
  drPoolRaw: bigint;
  journalResolved: boolean;
  coverageAttested: boolean;
}

export interface EventInput {
  eventId: Uint8Array;
  revision: bigint;
  exDate: number;
  status: EventStatusName;
  m0Bits: bigint;
  m1Bits: bigint;
  sourceFinal: boolean;
  originalEffectiveTimestamp: bigint;
  paymentDate: number;
  observedSlot: bigint;
  evidenceDigest: Uint8Array;
}
