import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';
import { deriveEligibility, quoteDeposit, quoteRecombine, quoteRedemption } from '../src/quotes.js';
import type { AssetPolicySnapshot, SeriesSnapshot } from '../src/types.js';

const KEY = new PublicKey('11111111111111111111111111111111');

function series(overrides: Partial<SeriesSnapshot> = {}): SeriesSnapshot {
  return {
    address: KEY,
    assetPolicy: KEY,
    collateralMint: KEY,
    ptMint: KEY,
    drMint: KEY,
    vault: KEY,
    year: 2027,
    stateVersion: 9n,
    startUnixTimestamp: 100n,
    maturityUnixTimestamp: 200n,
    phase: 'open',
    accountableRaw: 1_000n,
    eventCount: 0,
    unresolvedCount: 0,
    inYearQualifiedCount: 0,
    journalVersion: 0n,
    journalHash: new Uint8Array(32),
    sealedCoverageDigest: new Uint8Array(32),
    sealedEventCount: 0,
    finalSupplyRaw: 0n,
    finalPtPoolRaw: 0n,
    finalDrPoolRaw: 0n,
    redeemedPtClaimsRaw: 0n,
    redeemedDrClaimsRaw: 0n,
    ptPaidRaw: 0n,
    drPaidRaw: 0n,
    ...overrides,
  };
}

const policy: AssetPolicySnapshot = {
  address: KEY,
  collateralMint: KEY,
  decimals: 6,
  extensionsMask: 0n,
  enabled: true,
  observedSlot: 40n,
  observationValidUntil: 150n,
  observationEvidenceDigest: new Uint8Array(32).fill(1),
  observedScale: { currentBits: 1n, pendingBits: 1n, pendingEffectiveTimestamp: 0n, activeBits: 1n },
  controlsFingerprint: new Uint8Array(32),
  mintProfileMatchesReviewed: true,
};

test('deposit and recombination quotes carry exact u64 outputs and state-version guards', () => {
  const deposit = quoteDeposit(series(), policy, 1_000n, 25n, 30n, { unixTimestamp: 50n, slot: 50n }, 60n);
  assert.equal(deposit.ptOutputRaw, 25n);
  assert.equal(deposit.drOutputRaw, 25n);
  assert.equal(deposit.guard.expectedStateVersion, 9n);
  assert.equal(quoteRecombine(series(), 1_000n, 25n, 25n, 25n, 150n, 160n).collateralOutputRaw, 25n);
});

test('resolved nonqualifying journal history does not permanently close pre-year funding', () => {
  const corrected = series({ eventCount: 1, journalVersion: 2n, unresolvedCount: 0, inYearQualifiedCount: 0 });
  const quote = quoteDeposit(corrected, policy, 1_000n, 10n, 10n, { unixTimestamp: 50n, slot: 50n }, 60n);
  assert.equal(quote.ptOutputRaw, 10n);
});

test('redemption enforces explicit zero-output consent and minimum output', () => {
  const finalized = series({
    phase: 'finalized',
    finalSupplyRaw: 1_000n,
    finalPtPoolRaw: 1_000n,
    finalDrPoolRaw: 0n,
  });
  assert.throws(() => quoteRedemption(finalized, 1_000n, 'dr', 1n, 1n, false, 250n, 260n), /explicit consent/);
  const quote = quoteRedemption(finalized, 1_000n, 'dr', 1n, 1n, true, 250n, 260n);
  assert.equal(quote.collateralOutputRaw, 0n);
  assert.equal(quote.guard.minimumRawOutput, 0n);
  assert.throws(() => quoteRedemption(finalized, 1_000n, 'pt', 10n, 10n, false, 250n, 260n, 11n), /minimum raw output/);
});

test('zero-supply finalized terms require zero pools and obligations', () => {
  const empty = series({ phase: 'finalized', accountableRaw: 0n, finalSupplyRaw: 0n });
  assert.throws(() => quoteRedemption(empty, 0n, 'pt', 1n, 1n, true, 250n, 260n), /supply denominator|custody|balance/);
  const inconsistent = series({ phase: 'finalized', finalSupplyRaw: 0n, finalPtPoolRaw: 1n });
  assert.throws(() => quoteRedemption(inconsistent, 1n, 'pt', 1n, 1n, true, 250n, 260n), /inconsistent/);
});

test('finalized healthy exits do not report admission or observation blockers', () => {
  const finalized = series({
    phase: 'finalized',
    finalSupplyRaw: 1_000n,
    finalPtPoolRaw: 1_000n,
    sealedCoverageDigest: new Uint8Array(32).fill(1),
  });
  const staleDisabled = {
    ...policy,
    enabled: false,
    observationValidUntil: 1n,
    mintProfileMatchesReviewed: false,
  };
  const eligibility = deriveEligibility(finalized, staleDisabled, 1_000n, { unixTimestamp: 250n, slot: 50n });
  assert.equal(eligibility.redeemable, true);
  assert.deepEqual(eligibility.reasons, []);
});
