import {
  type Commitment,
  ComputeBudgetProgram,
  type Connection,
  type Signer,
  Transaction,
  type TransactionInstruction,
  type TransactionSignature,
  type PublicKey,
} from '@solana/web3.js';
import { DividendXSdkError, invariant } from './errors.js';

export interface UnsignedTransactionOptions {
  payer: PublicKey;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}

export interface ConfirmedTransactionReceipt {
  signature: TransactionSignature;
  slot: number;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized';
  err: unknown | null;
}

export type FinalizationStep = 'begin' | 'accumulate' | 'complete';

export interface MeasuredComputeBudget {
  step: FinalizationStep;
  measuredUnits: number;
  requestedUnits: number;
  instructions: TransactionInstruction[];
}

export function computeBudgetInstructions(units: number, microLamports?: number | bigint): TransactionInstruction[] {
  invariant(Number.isInteger(units) && units > 0 && units <= 1_400_000, 'INVALID_AMOUNT', 'compute unit limit must be an integer from 1 through 1,400,000');
  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units })];
  if (microLamports !== undefined) instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  return instructions;
}

export function measuredFinalizationComputeBudget(
  step: FinalizationStep,
  measuredUnits: number,
  options: { marginBasisPoints?: number; microLamports?: number | bigint } = {},
): MeasuredComputeBudget {
  invariant(Number.isInteger(measuredUnits) && measuredUnits > 0, 'INVALID_AMOUNT', 'measured compute units must be a positive integer');
  const marginBasisPoints = options.marginBasisPoints ?? 1_000;
  invariant(Number.isInteger(marginBasisPoints) && marginBasisPoints >= 0 && marginBasisPoints <= 10_000, 'INVALID_AMOUNT', 'compute margin must be 0-10,000 basis points');
  const requestedUnits = Math.ceil(measuredUnits * (10_000 + marginBasisPoints) / 10_000);
  invariant(requestedUnits <= 1_400_000, 'INVALID_AMOUNT', 'measured compute plus margin exceeds Solana transaction limit');
  return {
    step,
    measuredUnits,
    requestedUnits,
    instructions: computeBudgetInstructions(requestedUnits, options.microLamports),
  };
}

export function buildUnsignedTransaction(
  instructions: readonly TransactionInstruction[],
  options: UnsignedTransactionOptions,
): Transaction {
  invariant(instructions.length > 0, 'INVALID_QUOTE', 'transaction requires at least one instruction');
  const transaction = new Transaction({
    feePayer: options.payer,
    blockhash: options.recentBlockhash,
    lastValidBlockHeight: options.lastValidBlockHeight,
  });
  transaction.add(...instructions);
  return transaction;
}

export async function buildRecentUnsignedTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: readonly TransactionInstruction[],
  commitment: Commitment = 'confirmed',
): Promise<Transaction> {
  const latest = await connection.getLatestBlockhash(commitment);
  return buildUnsignedTransaction(instructions, {
    payer,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  });
}

export async function signSubmitAndConfirm(
  connection: Connection,
  unsignedTransaction: Transaction,
  signTransaction: (transaction: Transaction) => Promise<Transaction>,
  commitment: Commitment = 'confirmed',
): Promise<ConfirmedTransactionReceipt> {
  invariant(Boolean(unsignedTransaction.recentBlockhash && unsignedTransaction.lastValidBlockHeight !== undefined), 'INVALID_QUOTE', 'transaction needs a recent blockhash and last-valid block height');
  const signed = await signTransaction(unsignedTransaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: unsignedTransaction.recentBlockhash!,
    lastValidBlockHeight: unsignedTransaction.lastValidBlockHeight!,
  }, commitment);
  const status = (await connection.getSignatureStatuses([signature])).value[0];
  const error = confirmation.value.err ?? status?.err ?? null;
  if (error !== null) {
    throw new DividendXSdkError('TRANSACTION_FAILED', `transaction ${signature} failed: ${JSON.stringify(error)}`);
  }
  if (!status || !status.confirmationStatus) throw new DividendXSdkError('TRANSACTION_FAILED', `transaction ${signature} confirmation status is unavailable`);
  return {
    signature,
    slot: status?.slot ?? confirmation.context.slot,
    confirmationStatus: status.confirmationStatus,
    err: null,
  };
}

export async function signWithSignersSubmitAndConfirm(
  connection: Connection,
  unsignedTransaction: Transaction,
  signers: readonly Signer[],
  commitment: Commitment = 'confirmed',
): Promise<ConfirmedTransactionReceipt> {
  invariant(signers.length > 0, 'INVALID_QUOTE', 'at least one caller-supplied signer is required');
  return signSubmitAndConfirm(connection, unsignedTransaction, async (transaction) => {
    transaction.partialSign(...signers);
    return transaction;
  }, commitment);
}
