import { invariant } from './errors.js';
import type { AssetBalances } from './types.js';

export function assertControlledConservation(value: AssetBalances): void {
  for (const amount of [
    value.collateral.provider, value.collateral.vault, value.collateral.supply,
    value.pt.provider, value.pt.otherKnown, value.pt.supply,
    value.dr.provider, value.dr.buyer, value.dr.poolVault, value.dr.poolProtocolFees, value.dr.poolFundFees,
    value.dr.poolCreatorFees, value.dr.otherKnown, value.dr.supply,
    value.testQuote.provider, value.testQuote.buyer, value.testQuote.poolVault, value.testQuote.poolProtocolFees,
    value.testQuote.poolFundFees, value.testQuote.poolCreatorFees, value.testQuote.otherKnown,
    value.testQuote.supply, value.lp.provider, value.lp.mintSupply, value.lp.internalPoolLpAmount,
  ]) invariant(amount >= 0n, 'NEGATIVE_ACCOUNTING_VALUE');
  invariant(value.collateral.provider + value.collateral.vault === value.collateral.supply,
    'COLLATERAL_CONSERVATION_FAILED');
  invariant(value.pt.provider + value.pt.otherKnown === value.pt.supply, 'PT_CONSERVATION_FAILED');
  invariant(value.dr.provider + value.dr.buyer + value.dr.poolVault + value.dr.otherKnown === value.dr.supply,
    'DR_CONSERVATION_FAILED');
  invariant(value.testQuote.provider + value.testQuote.buyer + value.testQuote.poolVault
    + value.testQuote.otherKnown === value.testQuote.supply, 'QUOTE_CONSERVATION_FAILED');
}

export function assertPrefinalBacking(value: AssetBalances): void {
  assertControlledConservation(value);
  invariant(value.collateral.vault === value.pt.supply && value.pt.supply === value.dr.supply,
    'PREFINAL_BACKING_FAILED');
}

export interface ExactSwapExpectation {
  inputQuote: bigint;
  outputDr: bigint;
  minimumDr: bigint;
  protocolFee: bigint;
  fundFee: bigint;
}

export function assertSwapDelta(before: AssetBalances, after: AssetBalances, expected: ExactSwapExpectation): bigint {
  const received = after.dr.buyer - before.dr.buyer;
  invariant(received === expected.outputDr && received >= expected.minimumDr
    && before.testQuote.buyer - after.testQuote.buyer === expected.inputQuote,
    'SWAP_DELTA_FAILED');
  invariant(before.dr.poolVault - after.dr.poolVault === received
    && after.testQuote.poolVault - before.testQuote.poolVault === expected.inputQuote
    && after.testQuote.poolProtocolFees - before.testQuote.poolProtocolFees === expected.protocolFee
    && after.testQuote.poolFundFees - before.testQuote.poolFundFees === expected.fundFee
    && after.testQuote.poolCreatorFees === before.testQuote.poolCreatorFees
    && after.dr.poolProtocolFees === before.dr.poolProtocolFees
    && after.dr.poolFundFees === before.dr.poolFundFees
    && after.dr.poolCreatorFees === before.dr.poolCreatorFees
    && after.dr.provider === before.dr.provider && after.dr.otherKnown === before.dr.otherKnown
    && after.dr.supply === before.dr.supply
    && after.testQuote.provider === before.testQuote.provider
    && after.testQuote.otherKnown === before.testQuote.otherKnown
    && after.testQuote.supply === before.testQuote.supply
    && after.pt.provider === before.pt.provider && after.pt.otherKnown === before.pt.otherKnown
    && after.pt.supply === before.pt.supply
    && after.collateral.provider === before.collateral.provider
    && after.collateral.vault === before.collateral.vault
    && after.collateral.supply === before.collateral.supply
    && after.lp.provider === before.lp.provider && after.lp.mintSupply === before.lp.mintSupply
    && after.lp.internalPoolLpAmount === before.lp.internalPoolLpAmount,
  'SWAP_DELTA_FAILED');
  assertControlledConservation(before);
  assertControlledConservation(after);
  return received;
}

export function assertRecombineDelta(before: AssetBalances, after: AssetBalances, amount: bigint): void {
  invariant(amount > 0n, 'RECOMBINE_AMOUNT_INVALID');
  invariant(after.collateral.provider - before.collateral.provider === amount
    && before.collateral.vault - after.collateral.vault === amount
    && before.pt.provider - after.pt.provider === amount
    && before.dr.provider - after.dr.provider === amount
    && before.pt.supply - after.pt.supply === amount
    && before.dr.supply - after.dr.supply === amount
    && after.collateral.supply === before.collateral.supply, 'RECOMBINE_DELTA_FAILED');
  invariant(after.dr.buyer === before.dr.buyer && after.dr.poolVault === before.dr.poolVault
    && after.testQuote.provider === before.testQuote.provider
    && after.testQuote.buyer === before.testQuote.buyer
    && after.testQuote.poolVault === before.testQuote.poolVault
    && after.pt.otherKnown === before.pt.otherKnown && after.dr.otherKnown === before.dr.otherKnown
    && after.testQuote.otherKnown === before.testQuote.otherKnown
    && after.testQuote.supply === before.testQuote.supply
    && after.dr.poolProtocolFees === before.dr.poolProtocolFees
    && after.dr.poolFundFees === before.dr.poolFundFees
    && after.dr.poolCreatorFees === before.dr.poolCreatorFees
    && after.testQuote.poolProtocolFees === before.testQuote.poolProtocolFees
    && after.testQuote.poolFundFees === before.testQuote.poolFundFees
    && after.testQuote.poolCreatorFees === before.testQuote.poolCreatorFees
    && after.lp.provider === before.lp.provider && after.lp.mintSupply === before.lp.mintSupply
    && after.lp.internalPoolLpAmount === before.lp.internalPoolLpAmount,
  'RECOMBINE_UNRELATED_BALANCE_CHANGED');
}

export function assertWithdrawBoundary(value: AssetBalances): void {
  invariant(value.lp.provider === 0n && value.lp.mintSupply === 0n, 'PROVIDER_LP_REMAINS');
  invariant(value.lp.internalPoolLpAmount === 100n && value.dr.poolVault > 0n && value.testQuote.poolVault > 0n,
    'LOCKED_LIQUIDITY_BOUNDARY_MISSING');
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  invariant(numerator >= 0n && denominator > 0n, 'WITHDRAW_ACCOUNTING_INVALID');
  return (numerator + denominator - 1n) / denominator;
}

function feeExcluded(value: { poolVault: bigint; poolProtocolFees: bigint; poolFundFees: bigint; poolCreatorFees: bigint }): bigint {
  const result = value.poolVault - value.poolProtocolFees - value.poolFundFees - value.poolCreatorFees;
  invariant(result >= 0n, 'WITHDRAW_ACCOUNTING_INVALID');
  return result;
}

export function assertSoleProviderWithdrawal(before: AssetBalances, after: AssetBalances): void {
  const burned = before.lp.provider;
  invariant(burned > 0n && before.lp.mintSupply === burned && before.lp.internalPoolLpAmount === burned + 100n,
    'WITHDRAW_ACCOUNTING_INVALID');
  assertWithdrawBoundary(after);
  const drFees = before.dr.poolProtocolFees + before.dr.poolFundFees + before.dr.poolCreatorFees;
  const quoteFees = before.testQuote.poolProtocolFees + before.testQuote.poolFundFees + before.testQuote.poolCreatorFees;
  const expectedDr = ceilDiv(100n * feeExcluded(before.dr), before.lp.internalPoolLpAmount) + drFees;
  const expectedQuote = ceilDiv(100n * feeExcluded(before.testQuote), before.lp.internalPoolLpAmount) + quoteFees;
  invariant(after.dr.poolVault === expectedDr && after.testQuote.poolVault === expectedQuote,
    'WITHDRAW_RESIDUAL_MISMATCH');
  invariant(after.dr.provider - before.dr.provider === before.dr.poolVault - after.dr.poolVault
    && after.testQuote.provider - before.testQuote.provider === before.testQuote.poolVault - after.testQuote.poolVault,
  'WITHDRAW_DELTA_FAILED');
  invariant(after.lp.internalPoolLpAmount === before.lp.internalPoolLpAmount - burned
    && after.dr.poolProtocolFees === before.dr.poolProtocolFees
    && after.dr.poolFundFees === before.dr.poolFundFees
    && after.dr.poolCreatorFees === before.dr.poolCreatorFees
    && after.testQuote.poolProtocolFees === before.testQuote.poolProtocolFees
    && after.testQuote.poolFundFees === before.testQuote.poolFundFees
    && after.testQuote.poolCreatorFees === before.testQuote.poolCreatorFees
    && after.dr.buyer === before.dr.buyer && after.dr.otherKnown === before.dr.otherKnown
    && after.dr.supply === before.dr.supply
    && after.testQuote.buyer === before.testQuote.buyer
    && after.testQuote.otherKnown === before.testQuote.otherKnown
    && after.testQuote.supply === before.testQuote.supply
    && after.pt.provider === before.pt.provider && after.pt.supply === before.pt.supply
    && after.collateral.provider === before.collateral.provider
    && after.collateral.vault === before.collateral.vault
    && after.collateral.supply === before.collateral.supply, 'WITHDRAW_UNRELATED_BALANCE_CHANGED');
  assertControlledConservation(after);
}
