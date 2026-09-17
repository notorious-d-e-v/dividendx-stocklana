import anchorCore, { type Idl } from '@anchor-lang/core';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';
import {
  type AccountInfo,
  type Commitment,
  type Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { DIVIDENDX_PROGRAM_ID } from './constants.js';
import { DividendXSdkError, invariant } from './errors.js';
import type { AccumulatorSnapshot, AssetPolicySnapshot, ChainClock, ConfigSnapshot, ScaleTuple, SeriesLifecyclePhase, SeriesSnapshot } from './types.js';
import { inspectMintProfile, mintProfileMatchesPolicy, type InspectedMintProfile } from './token-profile.js';

const { BN, BorshAccountsCoder, convertIdlToCamelCase } = anchorCore;

export type LosslessAccountValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | PublicKey
  | Uint8Array
  | LosslessAccountValue[]
  | { [key: string]: LosslessAccountValue };

export interface AccountRequest {
  address: PublicKey;
  accountName: string;
  owner?: PublicKey;
}

export interface DecodedAccount {
  address: PublicKey;
  accountName: string;
  value: { [key: string]: LosslessAccountValue };
}

export interface CoherentAccountSnapshot {
  contextSlot: number;
  accounts: DecodedAccount[];
}

function lossless(value: unknown): LosslessAccountValue {
  if (BN.isBN(value)) return BigInt((value as { toString(radix?: number): string }).toString(10));
  if (value instanceof PublicKey) return value;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Array.isArray(value)) return value.map(lossless);
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, lossless(entry)]));
  }
  throw new DividendXSdkError('IDL_MISMATCH', `unsupported decoded value type: ${typeof value}`);
}

export function decodeProgramAccount(
  idl: Idl,
  accountName: string,
  data: Buffer,
): { [key: string]: LosslessAccountValue } {
  const decoded = new BorshAccountsCoder(convertIdlToCamelCase(idl)).decode(accountName, data);
  const normalized = lossless(decoded);
  invariant(normalized !== null && !Array.isArray(normalized) && !(normalized instanceof Uint8Array) && !(normalized instanceof PublicKey) && typeof normalized === 'object', 'IDL_MISMATCH', `${accountName} did not decode to a struct`);
  return normalized;
}

export async function fetchProgramAccountsCoherently(
  connection: Connection,
  idl: Idl,
  requests: readonly AccountRequest[],
  commitment: Commitment = 'confirmed',
): Promise<CoherentAccountSnapshot> {
  const response = await connection.getMultipleAccountsInfoAndContext(
    requests.map((request) => request.address),
    { commitment },
  );
  const accounts = response.value.map((info, index) => {
    const request = requests[index]!;
    invariant(info !== null, 'RPC_ACCOUNT_MISSING', `${request.accountName} account ${request.address.toBase58()} does not exist`);
    const expectedOwner = request.owner ?? DIVIDENDX_PROGRAM_ID;
    invariant(info.owner.equals(expectedOwner), 'RPC_ACCOUNT_OWNER', `${request.accountName} account has owner ${info.owner.toBase58()}, expected ${expectedOwner.toBase58()}`);
    return {
      address: request.address,
      accountName: request.accountName,
      value: decodeProgramAccount(idl, request.accountName, info.data),
    };
  });
  return { contextSlot: response.context.slot, accounts };
}

export function decodeClockAccount(info: AccountInfo<Buffer>, contextSlot: number): ChainClock {
  invariant(info.data.length >= 40, 'RPC_ACCOUNT_MISSING', 'clock sysvar data is truncated');
  const view = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  return {
    slot: view.getBigUint64(0, true),
    epochStartTimestamp: view.getBigInt64(8, true),
    epoch: view.getBigUint64(16, true),
    leaderScheduleEpoch: view.getBigUint64(24, true),
    unixTimestamp: view.getBigInt64(32, true),
    contextSlot,
  };
}

export async function fetchClock(connection: Connection, commitment: Commitment = 'confirmed'): Promise<ChainClock> {
  const response = await connection.getAccountInfoAndContext(SYSVAR_CLOCK_PUBKEY, commitment);
  invariant(response.value !== null, 'RPC_ACCOUNT_MISSING', 'clock sysvar is unavailable');
  return decodeClockAccount(response.value, response.context.slot);
}

export interface Token2022Snapshot {
  contextSlot: number;
  clock: ChainClock;
  mint: ReturnType<typeof unpackMint>;
  accounts: ReturnType<typeof unpackAccount>[];
  scale: ScaleTuple;
}

export async function fetchToken2022Snapshot(
  connection: Connection,
  mintAddress: PublicKey,
  tokenAccountAddresses: readonly PublicKey[] = [],
  commitment: Commitment = 'confirmed',
): Promise<Token2022Snapshot> {
  const addresses = [SYSVAR_CLOCK_PUBKEY, mintAddress, ...tokenAccountAddresses];
  const response = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment });
  const [clockInfo, mintInfo, ...accountInfos] = response.value;
  invariant(clockInfo !== null, 'RPC_ACCOUNT_MISSING', 'clock sysvar is unavailable');
  invariant(mintInfo !== null, 'RPC_ACCOUNT_MISSING', `mint ${mintAddress.toBase58()} does not exist`);
  invariant(mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID), 'RPC_ACCOUNT_OWNER', 'collateral mint is not owned by Token-2022');
  const clock = decodeClockAccount(clockInfo, response.context.slot);
  const mint = unpackMint(mintAddress, mintInfo, TOKEN_2022_PROGRAM_ID);
  const scale = (await inspectMintProfile(mint, clock)).scale;
  const accounts = accountInfos.map((info, index) => {
    const address = tokenAccountAddresses[index]!;
    invariant(info !== null, 'RPC_ACCOUNT_MISSING', `token account ${address.toBase58()} does not exist`);
    invariant(info.owner.equals(TOKEN_2022_PROGRAM_ID), 'RPC_ACCOUNT_OWNER', `token account ${address.toBase58()} is not owned by Token-2022`);
    return unpackAccount(address, info, TOKEN_2022_PROGRAM_ID);
  });
  return { contextSlot: response.context.slot, clock, mint, accounts, scale };
}

export function sameScaleTuple(left: ScaleTuple, right: ScaleTuple): boolean {
  return left.currentBits === right.currentBits
    && left.pendingBits === right.pendingBits
    && left.pendingEffectiveTimestamp === right.pendingEffectiveTimestamp
    && left.activeBits === right.activeBits;
}

function field(record: { [key: string]: LosslessAccountValue }, name: string): LosslessAccountValue {
  const value = record[name];
  invariant(value !== undefined, 'IDL_MISMATCH', `decoded account is missing ${name}`);
  return value;
}

function bigintField(record: { [key: string]: LosslessAccountValue }, name: string): bigint {
  const value = field(record, name);
  invariant(typeof value === 'bigint', 'IDL_MISMATCH', `${name} is not a lossless integer`);
  return value;
}

function numberField(record: { [key: string]: LosslessAccountValue }, name: string): number {
  const value = field(record, name);
  invariant(typeof value === 'number' && Number.isSafeInteger(value), 'IDL_MISMATCH', `${name} is not a safe small integer`);
  return value;
}

function boolField(record: { [key: string]: LosslessAccountValue }, name: string): boolean {
  const value = field(record, name);
  invariant(typeof value === 'boolean', 'IDL_MISMATCH', `${name} is not a boolean`);
  return value;
}

function publicKeyField(record: { [key: string]: LosslessAccountValue }, name: string): PublicKey {
  const value = field(record, name);
  invariant(value instanceof PublicKey, 'IDL_MISMATCH', `${name} is not a public key`);
  return value;
}

function bytesField(record: { [key: string]: LosslessAccountValue }, name: string, length: number): Uint8Array {
  const value = field(record, name);
  const bytes = value instanceof Uint8Array
    ? value
    : Array.isArray(value) && value.every((entry) => typeof entry === 'number')
      ? Uint8Array.from(value as number[])
      : null;
  invariant(bytes?.length === length, 'IDL_MISMATCH', `${name} is not ${length} bytes`);
  return bytes;
}

function phaseField(record: { [key: string]: LosslessAccountValue }): SeriesLifecyclePhase {
  const phase = field(record, 'phase');
  invariant(phase !== null && typeof phase === 'object' && !Array.isArray(phase), 'IDL_MISMATCH', 'phase is not an enum');
  if ('open' in phase) return 'open';
  if ('sealing' in phase) return 'sealing';
  if ('finalized' in phase) return 'finalized';
  throw new DividendXSdkError('IDL_MISMATCH', 'phase has an unknown enum variant');
}

export function normalizeSeriesAccount(address: PublicKey, value: { [key: string]: LosslessAccountValue }): SeriesSnapshot {
  return {
    address,
    assetPolicy: publicKeyField(value, 'assetPolicy'),
    collateralMint: publicKeyField(value, 'collateralMint'),
    ptMint: publicKeyField(value, 'ptMint'),
    drMint: publicKeyField(value, 'drMint'),
    vault: publicKeyField(value, 'vault'),
    year: numberField(value, 'year'),
    stateVersion: bigintField(value, 'stateVersion'),
    startUnixTimestamp: bigintField(value, 'startTimestamp'),
    maturityUnixTimestamp: bigintField(value, 'maturityTimestamp'),
    phase: phaseField(value),
    accountableRaw: bigintField(value, 'nominalBacking'),
    eventCount: numberField(value, 'eventCount'),
    unresolvedCount: numberField(value, 'unresolvedCount'),
    inYearQualifiedCount: numberField(value, 'inYearQualifiedCount'),
    journalVersion: bigintField(value, 'journalVersion'),
    journalHash: bytesField(value, 'journalHash', 32),
    sealedCoverageDigest: bytesField(value, 'sealedCoverageDigest', 32),
    sealedEventCount: numberField(value, 'sealedEventCount'),
    finalSupplyRaw: bigintField(value, 'finalSupply'),
    finalPtPoolRaw: bigintField(value, 'ptPool'),
    finalDrPoolRaw: bigintField(value, 'drPool'),
    redeemedPtClaimsRaw: bigintField(value, 'ptRedeemedNominal'),
    redeemedDrClaimsRaw: bigintField(value, 'drRedeemedNominal'),
    ptPaidRaw: bigintField(value, 'ptPaid'),
    drPaidRaw: bigintField(value, 'drPaid'),
  };
}

export function normalizeAccumulatorAccount(address: PublicKey, value: { [key: string]: LosslessAccountValue }): AccumulatorSnapshot {
  const numerator = field(value, 'numerator');
  const denominator = field(value, 'denominator');
  invariant(numerator instanceof Uint8Array || Array.isArray(numerator), 'IDL_MISMATCH', 'accumulator numerator is not a byte vector');
  invariant(denominator instanceof Uint8Array || Array.isArray(denominator), 'IDL_MISMATCH', 'accumulator denominator is not a byte vector');
  return {
    address,
    series: publicKeyField(value, 'series'),
    cursor: numberField(value, 'cursor'),
    numeratorLe: Uint8Array.from(numerator as ArrayLike<number>),
    denominatorLe: Uint8Array.from(denominator as ArrayLike<number>),
  };
}

export function normalizeConfigAccount(address: PublicKey, value: { [key: string]: LosslessAccountValue }): ConfigSnapshot {
  return {
    address,
    admin: publicKeyField(value, 'admin'),
    deploymentDomain: bytesField(value, 'deploymentDomain', 32),
  };
}

export function normalizeAssetPolicyAccount(
  address: PublicKey,
  value: { [key: string]: LosslessAccountValue },
  mintProfileMatchesReviewed = false,
): AssetPolicySnapshot {
  return {
    address,
    collateralMint: publicKeyField(value, 'collateralMint'),
    decimals: numberField(value, 'decimals'),
    extensionsMask: bigintField(value, 'extensionsMask'),
    enabled: boolField(value, 'admissionEnabled'),
    observedSlot: bigintField(value, 'observedSlot'),
    observationValidUntil: bigintField(value, 'observationValidUntil'),
    observationEvidenceDigest: bytesField(value, 'observationEvidenceDigest', 32),
    observedScale: {
      currentBits: bigintField(value, 'reviewedCurrentMultiplierBits'),
      pendingBits: bigintField(value, 'reviewedNewMultiplierBits'),
      pendingEffectiveTimestamp: bigintField(value, 'reviewedNewMultiplierEffectiveTimestamp'),
      activeBits: bigintField(value, 'reviewedActiveMultiplierBits'),
    },
    controlsFingerprint: bytesField(value, 'reviewedControlsFingerprint', 32),
    mintProfileMatchesReviewed,
  };
}

export interface QuoteSnapshotAddresses {
  assetPolicy: PublicKey;
  series: PublicKey;
  accumulator: PublicKey;
  collateralMint: PublicKey;
  vault: PublicKey;
  holder?: PublicKey;
  holderCollateral?: PublicKey;
  holderPt?: PublicKey;
  holderDr?: PublicKey;
}

export interface CoherentQuoteSnapshot {
  contextSlot: number;
  clock: ChainClock;
  policy: AssetPolicySnapshot;
  series: SeriesSnapshot;
  accumulator: AccumulatorSnapshot;
  mintProfile: InspectedMintProfile;
  vaultRaw: bigint;
  holderCollateralRaw?: bigint;
  holderPtRaw?: bigint;
  holderDrRaw?: bigint;
}

export async function fetchQuoteSnapshot(
  connection: Connection,
  idl: Idl,
  addresses: QuoteSnapshotAddresses,
  commitment: Commitment = 'confirmed',
  programId = DIVIDENDX_PROGRAM_ID,
): Promise<CoherentQuoteSnapshot> {
  invariant(new PublicKey(idl.address).equals(programId), 'IDL_MISMATCH', 'IDL address does not match the explicit program ID');
  const optionalAddresses = [addresses.holderCollateral, addresses.holderPt, addresses.holderDr].filter((address): address is PublicKey => address !== undefined);
  invariant(optionalAddresses.length === 0 || addresses.holder !== undefined, 'INVALID_SERIES', 'holder authority is required when holder token accounts are requested');
  const requested = [
    SYSVAR_CLOCK_PUBKEY,
    addresses.assetPolicy,
    addresses.series,
    addresses.accumulator,
    addresses.collateralMint,
    addresses.vault,
    ...optionalAddresses,
  ];
  const response = await connection.getMultipleAccountsInfoAndContext(requested, { commitment });
  const [clockInfo, policyInfo, seriesInfo, accumulatorInfo, mintInfo, vaultInfo, ...optionalInfos] = response.value;
  invariant(clockInfo && policyInfo && seriesInfo && accumulatorInfo && mintInfo && vaultInfo, 'RPC_ACCOUNT_MISSING', 'one or more required quote accounts are missing');
  invariant(policyInfo.owner.equals(programId) && seriesInfo.owner.equals(programId) && accumulatorInfo.owner.equals(programId), 'RPC_ACCOUNT_OWNER', 'program account owner mismatch');
  invariant(mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) && vaultInfo.owner.equals(TOKEN_2022_PROGRAM_ID), 'RPC_ACCOUNT_OWNER', 'collateral mint or vault is not owned by Token-2022');

  const clock = decodeClockAccount(clockInfo, response.context.slot);
  const rawPolicy = decodeProgramAccount(idl, 'assetPolicy', policyInfo.data);
  const policy = normalizeAssetPolicyAccount(addresses.assetPolicy, rawPolicy);
  const series = normalizeSeriesAccount(addresses.series, decodeProgramAccount(idl, 'series', seriesInfo.data));
  const accumulator = normalizeAccumulatorAccount(addresses.accumulator, decodeProgramAccount(idl, 'accumulator', accumulatorInfo.data));
  const mint = unpackMint(addresses.collateralMint, mintInfo, TOKEN_2022_PROGRAM_ID);
  const mintProfile = await inspectMintProfile(mint, clock);
  policy.mintProfileMatchesReviewed = mintProfileMatchesPolicy(policy, mintProfile);
  const vault = unpackAccount(addresses.vault, vaultInfo, TOKEN_2022_PROGRAM_ID);

  invariant(policy.collateralMint.equals(addresses.collateralMint), 'INVALID_SERIES', 'asset policy collateral mint mismatch');
  invariant(series.assetPolicy.equals(addresses.assetPolicy), 'INVALID_SERIES', 'series asset policy mismatch');
  invariant(series.collateralMint.equals(addresses.collateralMint), 'INVALID_SERIES', 'series collateral mint mismatch');
  invariant(series.vault.equals(addresses.vault), 'INVALID_SERIES', 'series vault mismatch');
  invariant(accumulator.series.equals(addresses.series), 'INVALID_SERIES', 'accumulator series mismatch');
  invariant(vault.mint.equals(addresses.collateralMint) && vault.owner.equals(addresses.series), 'INVALID_SERIES', 'vault mint or authority mismatch');
  invariant(vault.delegate === null && vault.closeAuthority === null, 'INVALID_SERIES', 'vault has a delegate or alternate close authority');
  invariant(vault.isInitialized && !vault.isFrozen, 'INVALID_SERIES', 'vault is not initialized and transferable');

  let optionalIndex = 0;
  const unpackOptional = (address: PublicKey | undefined, programId: PublicKey) => {
    if (!address) return undefined;
    const info = optionalInfos[optionalIndex++];
    invariant(info !== null && info.owner.equals(programId), 'RPC_ACCOUNT_OWNER', `holder token account ${address.toBase58()} owner mismatch`);
    return unpackAccount(address, info, programId);
  };
  const holderCollateral = unpackOptional(addresses.holderCollateral, TOKEN_2022_PROGRAM_ID);
  const holderPt = unpackOptional(addresses.holderPt, TOKEN_PROGRAM_ID);
  const holderDr = unpackOptional(addresses.holderDr, TOKEN_PROGRAM_ID);
  for (const account of [holderCollateral, holderPt, holderDr]) {
    if (account) {
      invariant(account.isInitialized && !account.isFrozen, 'INVALID_SERIES', 'holder token account is not initialized and transferable');
      if (addresses.holder) invariant(account.owner.equals(addresses.holder), 'INVALID_SERIES', 'holder token account authority mismatch');
    }
  }
  if (holderCollateral) invariant(holderCollateral.mint.equals(addresses.collateralMint), 'INVALID_SERIES', 'holder collateral mint mismatch');
  if (holderPt) invariant(holderPt.mint.equals(series.ptMint), 'INVALID_SERIES', 'holder PT mint mismatch');
  if (holderDr) invariant(holderDr.mint.equals(series.drMint), 'INVALID_SERIES', 'holder DR mint mismatch');

  return {
    contextSlot: response.context.slot,
    clock,
    policy,
    series,
    accumulator,
    mintProfile,
    vaultRaw: vault.amount,
    holderCollateralRaw: holderCollateral?.amount,
    holderPtRaw: holderPt?.amount,
    holderDrRaw: holderDr?.amount,
  };
}
