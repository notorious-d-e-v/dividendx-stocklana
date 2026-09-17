import { CurveCalculator } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import type { Transaction } from '@solana/web3.js';
import { FEE_RATE_DENOMINATOR, RAYDIUM_CPMM_PROGRAM_ID } from './constants.js';
import { invariant } from './errors.js';
import type { AmmConfigSnapshot } from './types.js';

function bn(value: bigint): BN {
  invariant(value >= 0n, 'AMOUNT_INVALID');
  return new BN(value.toString());
}

export function minimumOutput(expectedOutput: bigint, slippageBps: number): bigint {
  invariant(expectedOutput > 0n && Number.isSafeInteger(slippageBps) && slippageBps >= 0 && slippageBps <= 500,
    'SLIPPAGE_INVALID');
  const result = expectedOutput * BigInt(10_000 - slippageBps) / 10_000n;
  invariant(result > 0n, 'MINIMUM_OUTPUT_ZERO');
  return result;
}

export interface CreatorDisabledSwapQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  minimumOutput: bigint;
  tradeFee: bigint;
  protocolFee: bigint;
  fundFee: bigint;
  creatorFee: 0n;
  sdkSwapResult: { inputAmount: BN; outputAmount: BN };
}

export function quoteCreatorDisabledSwap(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint,
  config: AmmConfigSnapshot, enableCreatorFee: boolean, slippageBps: number): CreatorDisabledSwapQuote {
  invariant(!enableCreatorFee, 'CREATOR_FEE_POOL_REFUSED', 'v1 accepts only ordinary creator-fee-disabled CPMM pools');
  invariant(inputAmount > 0n && inputReserve > 0n && outputReserve > 0n, 'SWAP_AMOUNT_INVALID');
  invariant(config.tradeFeeRate > 0n && config.tradeFeeRate < FEE_RATE_DENOMINATOR, 'RAYDIUM_FEE_INVALID');
  const result = CurveCalculator.swapBaseInput(
    bn(inputAmount), bn(inputReserve), bn(outputReserve), bn(config.tradeFeeRate), bn(0n),
    bn(config.protocolFeeRate), bn(config.fundFeeRate), true,
  );
  const outputAmount = BigInt(result.outputAmount.toString());
  invariant(BigInt(result.creatorFee.toString()) === 0n && outputAmount > 0n, 'SWAP_QUOTE_INVALID');
  return {
    inputAmount, outputAmount, minimumOutput: minimumOutput(outputAmount, slippageBps),
    tradeFee: BigInt(result.tradeFee.toString()), protocolFee: BigInt(result.protocolFee.toString()),
    fundFee: BigInt(result.fundFee.toString()), creatorFee: 0n,
    sdkSwapResult: { inputAmount: result.inputAmount, outputAmount: result.outputAmount },
  };
}

export function assertSwapInstructionBounds(transaction: Transaction, inputAmount: bigint, minimumOut: bigint): void {
  const baseInputDiscriminator = Buffer.from([143, 190, 90, 218, 196, 30, 51, 222]);
  const matching = transaction.instructions.filter((instruction) => instruction.programId.equals(RAYDIUM_CPMM_PROGRAM_ID)
    && instruction.data.length === 24 && instruction.data.subarray(0, 8).equals(baseInputDiscriminator));
  invariant(matching.length === 1, 'SWAP_INSTRUCTION_INVALID');
  invariant(matching[0]!.data.readBigUInt64LE(8) === inputAmount
    && matching[0]!.data.readBigUInt64LE(16) === minimumOut, 'SWAP_INSTRUCTION_BOUNDS_MISMATCH');
}
