import { assertI64, assertU64 } from './bytes.js';
import { cumulativeRedemptionPayout } from './arithmetic.js';
import { invariant } from './errors.js';
import type {
  AssetPolicySnapshot,
  ChainClock,
  CustodySnapshot,
  DepositQuote,
  EligibilitySnapshot,
  Guard,
  IndicativeAnnualAllocation,
  RecombineQuote,
  RedemptionQuote,
  SeriesSnapshot,
} from './types.js';
import type { ClaimSideName } from './constants.js';

export function requiredCustodyRaw(series: SeriesSnapshot): bigint {
  assertU64(series.accountableRaw, 'accountable backing');
  if (series.phase !== 'finalized') return series.accountableRaw;
  for (const [label, amount] of [
    ['final supply', series.finalSupplyRaw],
    ['PT pool', series.finalPtPoolRaw],
    ['DR pool', series.finalDrPoolRaw],
    ['PT redeemed claims', series.redeemedPtClaimsRaw],
    ['DR redeemed claims', series.redeemedDrClaimsRaw],
    ['PT paid', series.ptPaidRaw],
    ['DR paid', series.drPaidRaw],
  ] as const) assertU64(amount, label);
  if (series.finalSupplyRaw === 0n) {
    invariant(
      series.finalPtPoolRaw === 0n
        && series.finalDrPoolRaw === 0n
        && series.redeemedPtClaimsRaw === 0n
        && series.redeemedDrClaimsRaw === 0n
        && series.ptPaidRaw === 0n
        && series.drPaidRaw === 0n,
      'INVALID_SERIES',
      'zero-supply final series has inconsistent pools or redemption counters',
    );
    return 0n;
  }
  invariant(series.finalPtPoolRaw + series.finalDrPoolRaw === series.finalSupplyRaw, 'INVALID_SERIES', 'final pools do not sum to final supply');
  invariant(series.redeemedPtClaimsRaw <= series.finalSupplyRaw && series.redeemedDrClaimsRaw <= series.finalSupplyRaw, 'INVALID_SERIES', 'redeemed nominal claims exceed final supply');
  invariant(series.ptPaidRaw <= series.finalPtPoolRaw && series.drPaidRaw <= series.finalDrPoolRaw, 'INVALID_SERIES', 'paid collateral exceeds a final pool');
  invariant(series.ptPaidRaw === series.redeemedPtClaimsRaw * series.finalPtPoolRaw / series.finalSupplyRaw, 'INVALID_SERIES', 'PT paid counter is inconsistent');
  invariant(series.drPaidRaw === series.redeemedDrClaimsRaw * series.finalDrPoolRaw / series.finalSupplyRaw, 'INVALID_SERIES', 'DR paid counter is inconsistent');
  return series.finalPtPoolRaw - series.ptPaidRaw + series.finalDrPoolRaw - series.drPaidRaw;
}

export function custodySnapshot(series: SeriesSnapshot, vaultRaw: bigint): CustodySnapshot {
  assertU64(vaultRaw, 'vault raw amount');
  const requiredRaw = requiredCustodyRaw(series);
  return { vaultRaw, requiredRaw, healthy: vaultRaw >= requiredRaw };
}

export function deriveEligibility(
  series: SeriesSnapshot,
  policy: AssetPolicySnapshot,
  vaultRaw: bigint,
  clock: Pick<ChainClock, 'unixTimestamp' | 'slot'>,
): EligibilitySnapshot {
  const nowUnixTimestamp = clock.unixTimestamp;
  assertI64(nowUnixTimestamp, 'clock Unix timestamp');
  assertU64(clock.slot, 'clock slot');
  const custody = custodySnapshot(series, vaultRaw);
  const mature = nowUnixTimestamp >= series.maturityUnixTimestamp;
  const observationFresh = nowUnixTimestamp <= policy.observationValidUntil;
  const journalResolved = series.unresolvedCount === 0;
  const coverageAttested = (series.phase === 'sealing' || series.phase === 'finalized')
    && series.sealedCoverageDigest.some((byte) => byte !== 0);
  const observationAuthenticated = policy.observationEvidenceDigest.some((byte) => byte !== 0)
    && policy.observedSlot <= clock.slot;
  const fundingJournalSafe = series.unresolvedCount === 0 && series.inYearQualifiedCount === 0;
  const depositsOpen = series.phase === 'open'
    && nowUnixTimestamp < series.startUnixTimestamp
    && policy.enabled
    && observationFresh
    && observationAuthenticated
    && fundingJournalSafe
    && policy.mintProfileMatchesReviewed
    && custody.healthy;
  const redeemable = series.phase === 'finalized' && custody.healthy;
  const reasons: string[] = [];
  if (!custody.healthy) reasons.push('custody_deficit');
  if (series.phase !== 'finalized') {
    if (!mature) reasons.push('not_mature');
    if (!journalResolved) reasons.push('journal_unresolved');
    if (mature && !coverageAttested) reasons.push('source_coverage_not_attested');
    if (nowUnixTimestamp < series.startUnixTimestamp) {
      if (!policy.enabled) reasons.push('admission_disabled');
      if (!observationFresh) reasons.push('observation_stale');
      if (!observationAuthenticated) reasons.push('observation_unverified_or_future');
      if (!fundingJournalSafe) reasons.push('series_journal_blocks_funding');
      if (!policy.mintProfileMatchesReviewed) reasons.push('mint_profile_changed_or_unverified');
    }
  }

  let productPhase: EligibilitySnapshot['productPhase'];
  if (!custody.healthy) productPhase = 'exception';
  else if (series.phase === 'finalized') productPhase = 'redeemable';
  else if (mature) productPhase = 'matured_pending';
  else if (nowUnixTimestamp < series.startUnixTimestamp) productPhase = 'funding';
  else productPhase = 'collecting';

  return {
    productPhase,
    depositsOpen,
    journalResolved,
    coverageAttested,
    mature,
    finalizationInProgress: series.phase === 'sealing',
    redeemable,
    custody,
    reasons,
  };
}

function guard(series: SeriesSnapshot, minimumRawOutput: bigint, expiryUnixTimestamp: bigint, nowUnixTimestamp: bigint): Guard {
  assertU64(series.stateVersion, 'expected state version');
  assertU64(minimumRawOutput, 'minimum raw output');
  assertI64(expiryUnixTimestamp, 'quote expiry');
  invariant(expiryUnixTimestamp >= nowUnixTimestamp, 'INVALID_QUOTE', 'quote expiry is already in the past');
  return { expectedStateVersion: series.stateVersion, expiryUnixTimestamp, minimumRawOutput };
}

export function quoteDeposit(
  series: SeriesSnapshot,
  policy: AssetPolicySnapshot,
  vaultRaw: bigint,
  inputRaw: bigint,
  ownedCollateralRaw: bigint,
  clock: Pick<ChainClock, 'unixTimestamp' | 'slot'>,
  expiryUnixTimestamp: bigint,
  minimumRawOutput = inputRaw,
): DepositQuote {
  assertU64(inputRaw, 'deposit amount', false);
  assertU64(ownedCollateralRaw, 'owned collateral balance');
  invariant(inputRaw <= ownedCollateralRaw, 'INVALID_QUOTE', 'deposit amount exceeds the current owner collateral balance');
  invariant(deriveEligibility(series, policy, vaultRaw, clock).depositsOpen, 'INVALID_QUOTE', 'series is not eligible for deposits');
  invariant(minimumRawOutput <= inputRaw, 'INVALID_QUOTE', 'minimum raw output exceeds exact paired mint output');
  return { kind: 'deposit', inputRaw, ptOutputRaw: inputRaw, drOutputRaw: inputRaw, guard: guard(series, minimumRawOutput, expiryUnixTimestamp, clock.unixTimestamp) };
}

export function quoteRecombine(
  series: SeriesSnapshot,
  vaultRaw: bigint,
  amountRaw: bigint,
  ownedPtRaw: bigint,
  ownedDrRaw: bigint,
  nowUnixTimestamp: bigint,
  expiryUnixTimestamp: bigint,
  minimumRawOutput = amountRaw,
): RecombineQuote {
  assertU64(amountRaw, 'recombine amount', false);
  assertU64(ownedPtRaw, 'owned PT balance');
  assertU64(ownedDrRaw, 'owned DR balance');
  invariant(amountRaw <= ownedPtRaw && amountRaw <= ownedDrRaw, 'INVALID_QUOTE', 'recombine amount exceeds current owner paired balances');
  invariant(series.phase !== 'finalized', 'INVALID_QUOTE', 'paired recombination closes at finalization');
  invariant(custodySnapshot(series, vaultRaw).healthy, 'INVALID_QUOTE', 'custody is below total obligations');
  invariant(amountRaw <= series.accountableRaw, 'INVALID_QUOTE', 'recombine amount exceeds accountable backing');
  invariant(minimumRawOutput <= amountRaw, 'INVALID_QUOTE', 'minimum raw output exceeds exact collateral output');
  return { kind: 'recombine', ptInputRaw: amountRaw, drInputRaw: amountRaw, collateralOutputRaw: amountRaw, guard: guard(series, minimumRawOutput, expiryUnixTimestamp, nowUnixTimestamp) };
}

export function quoteRedemption(
  series: SeriesSnapshot,
  vaultRaw: bigint,
  side: ClaimSideName,
  amountRaw: bigint,
  ownedClaimRaw: bigint,
  allowZero: boolean,
  nowUnixTimestamp: bigint,
  expiryUnixTimestamp: bigint,
  minimumRawOutput?: bigint,
): RedemptionQuote {
  assertU64(amountRaw, 'redemption amount', false);
  assertU64(ownedClaimRaw, 'owned claim balance');
  invariant(amountRaw <= ownedClaimRaw, 'INVALID_QUOTE', 'redemption amount exceeds the current owner claim balance');
  invariant(series.phase === 'finalized', 'INVALID_QUOTE', 'series is not finalized');
  invariant(custodySnapshot(series, vaultRaw).healthy, 'INVALID_QUOTE', 'custody is below all remaining obligations');
  const poolRaw = side === 'pt' ? series.finalPtPoolRaw : series.finalDrPoolRaw;
  const previouslyRedeemed = side === 'pt' ? series.redeemedPtClaimsRaw : series.redeemedDrClaimsRaw;
  const outputRaw = cumulativeRedemptionPayout(poolRaw, series.finalSupplyRaw, previouslyRedeemed, amountRaw);
  invariant(outputRaw > 0n || allowZero, 'INVALID_QUOTE', 'zero-output redemption requires explicit consent');
  const minimum = minimumRawOutput ?? outputRaw;
  invariant(minimum <= outputRaw, 'INVALID_QUOTE', 'minimum raw output exceeds exact quoted collateral output');
  return {
    kind: 'redeem',
    side,
    claimInputRaw: amountRaw,
    collateralOutputRaw: outputRaw,
    allowZero,
    guard: guard(series, minimum, expiryUnixTimestamp, nowUnixTimestamp),
  };
}

export function indicativeAnnualAllocation(
  series: SeriesSnapshot,
  provisional?: { ptPoolRaw: bigint; drPoolRaw: bigint },
): IndicativeAnnualAllocation {
  const pools = series.phase === 'finalized'
    ? { ptPoolRaw: series.finalPtPoolRaw, drPoolRaw: series.finalDrPoolRaw }
    : provisional;
  invariant(pools !== undefined, 'INVALID_QUOTE', 'provisional pool inputs are required before finalization');
  return {
    final: series.phase === 'finalized',
    accountableRaw: series.accountableRaw,
    ...pools,
    journalResolved: series.unresolvedCount === 0,
    coverageAttested: (series.phase === 'sealing' || series.phase === 'finalized')
      && series.sealedCoverageDigest.some((byte) => byte !== 0),
  };
}
