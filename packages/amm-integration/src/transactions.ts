import {
  type Commitment, Connection, type Keypair, type Signer, Transaction, type TransactionInstruction, VersionedTransaction,
} from '@solana/web3.js';
import { invariant } from './errors.js';
import type { ConfirmedStepReceipt } from './types.js';

export async function simulateSendAndConfirm(
  connection: Connection,
  name: string,
  transaction: Transaction,
  signers: readonly Signer[],
  commitment: Commitment = 'confirmed',
  onSubmitted?: (name: string, signature: string) => Promise<void>,
): Promise<ConfirmedStepReceipt> {
  invariant(signers.length > 0, 'SIGNERS_REQUIRED');
  const latest = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.feePayer ??= signers[0]!.publicKey;
  const signed = new VersionedTransaction(transaction.compileMessage());
  signed.sign([...signers]);
  const simulation = await connection.simulateTransaction(signed, { commitment, sigVerify: true });
  invariant(simulation.value.err === null, 'SIMULATION_FAILED', `${name} simulation failed: ${JSON.stringify(simulation.value.err)}; logs: ${(simulation.value.logs ?? []).slice(-12).join(' | ')}`);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
  await onSubmitted?.(name, signature);
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, commitment);
  invariant(confirmation.value.err === null, 'TRANSACTION_FAILED', `${name} failed: ${JSON.stringify(confirmation.value.err)}`);
  const status = (await connection.getSignatureStatuses([signature])).value[0];
  invariant(status && status.err === null && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'), 'TRANSACTION_CONFIRMATION_INVALID');
  return {
    name, signature, slot: status.slot, confirmationStatus: status.confirmationStatus,
    simulationUnitsConsumed: simulation.value.unitsConsumed ?? null,
    simulationLogs: simulation.value.logs ?? [],
  };
}

export async function buildSimulateSend(
  connection: Connection,
  name: string,
  payer: Keypair,
  instructions: readonly TransactionInstruction[],
  otherSigners: readonly Keypair[] = [],
  onSubmitted?: (name: string, signature: string) => Promise<void>,
): Promise<ConfirmedStepReceipt> {
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = payer.publicKey;
  return simulateSendAndConfirm(connection, name, transaction, [payer, ...otherSigners], 'confirmed', onSubmitted);
}
