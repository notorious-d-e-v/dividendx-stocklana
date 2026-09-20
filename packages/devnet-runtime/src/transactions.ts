import {
  type Commitment, type Connection, type Signer, Transaction, type TransactionInstruction, VersionedTransaction,
} from '@solana/web3.js';
import { MAX_BOOTSTRAP_SPEND_LAMPORTS } from './constants.js';
import { invariant } from './errors.js';
import { writePrivateJson } from './private-state.js';
import type { PrivateRuntimeState, StoredAttempt } from './types.js';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return '';
  const digits = [0];
  for (const byte of input) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index]! * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let leading = 0;
  while (leading < input.length - 1 && input[leading] === 0) leading += 1;
  return '1'.repeat(leading) + digits.reverse().map((digit) => BASE58[digit]).join('');
}

export interface StepContext {
  connection: Connection;
  state: PrivateRuntimeState;
  statePath: string;
  adminAddress: string;
  budget?: { initialLamports: bigint; maxSpendLamports: bigint };
}

export function assertBootstrapBudget(initialLamports: bigint, projectedLamports: bigint,
  maxSpendLamports = MAX_BOOTSTRAP_SPEND_LAMPORTS): void {
  invariant(initialLamports >= projectedLamports
    && initialLamports - projectedLamports <= maxSpendLamports, 'BOOTSTRAP_BUDGET_EXCEEDED');
}

export async function persistedStepConfirmed(context: StepContext, name: string): Promise<boolean> {
  const previous = context.state.steps[name]?.attempts.at(-1);
  if (!previous) return false;
  const status = (await context.connection.getSignatureStatuses([previous.signature], { searchTransactionHistory: true })).value[0];
  return !!status && status.err === null
    && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized');
}

async function reconcilePersistedAttempt(
  context: StepContext,
  name: string,
  check: () => Promise<boolean>,
  commitment: Commitment,
  repeatableAfterConfirmed: boolean,
): Promise<string | null> {
  const attempts = context.state.steps[name]?.attempts ?? [];
  const previous = attempts.at(-1);
  if (!previous) return null;
  const status = (await context.connection.getSignatureStatuses([previous.signature], { searchTransactionHistory: true })).value[0];
  if (status?.err) return null;
  if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
    if (!await check()) {
      invariant(repeatableAfterConfirmed, 'CONFIRMED_STEP_RECONCILIATION_FAILED',
        `${name} confirmed but expected state is absent`);
      return null;
    }
    return previous.signature;
  }
  const blockHeight = await context.connection.getBlockHeight(commitment);
  if (blockHeight > previous.lastValidBlockHeight) {
    const finalStatus = (await context.connection.getSignatureStatuses([previous.signature], { searchTransactionHistory: true })).value[0];
    if (finalStatus?.err) return null;
    if (finalStatus && (finalStatus.confirmationStatus === 'confirmed' || finalStatus.confirmationStatus === 'finalized')) {
      if (!await check()) {
        invariant(repeatableAfterConfirmed, 'CONFIRMED_STEP_RECONCILIATION_FAILED');
        return null;
      }
      return previous.signature;
    }
    invariant(false, 'EXPIRED_SIGNATURE_UNRESOLVED',
      `${name} expired without a conclusive status; refusing a newly signed duplicate`);
  }
  const raw = Buffer.from(previous.serializedTransactionBase64, 'base64');
  const returned = await context.connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 2 });
  invariant(returned === previous.signature, 'SIGNATURE_RETRY_MISMATCH');
  previous.submittedAt ??= new Date().toISOString();
  await writePrivateJson(context.statePath, context.state);
  const confirmation = await context.connection.confirmTransaction({
    signature: previous.signature, blockhash: previous.blockhash,
    lastValidBlockHeight: previous.lastValidBlockHeight,
  }, commitment);
  invariant(confirmation.value.err === null, 'TRANSACTION_FAILED', `${name}: ${JSON.stringify(confirmation.value.err)}`);
  invariant(await check(), 'STEP_RECONCILIATION_FAILED', `${name} confirmed without expected state`);
  return previous.signature;
}

export async function executeResumableStep(
  context: StepContext,
  name: string,
  check: () => Promise<boolean>,
  payer: Signer,
  instructions: readonly TransactionInstruction[],
  otherSigners: readonly Signer[] = [],
  options: { repeatableAfterConfirmed?: boolean } = {},
  commitment: Commitment = 'confirmed',
): Promise<string | null> {
  if (await check()) return null;
  const reconciled = await reconcilePersistedAttempt(context, name, check, commitment,
    options.repeatableAfterConfirmed === true);
  if (reconciled) return reconciled;
  if (await check()) return null;

  const latest = await context.connection.getLatestBlockhash(commitment);
  const transaction = new Transaction({ feePayer: payer.publicKey, ...latest }).add(...instructions);
  const signed = new VersionedTransaction(transaction.compileMessage());
  signed.sign([payer, ...otherSigners]);
  const simulation = await context.connection.simulateTransaction(signed, {
    commitment, sigVerify: true,
    accounts: { addresses: [context.adminAddress], encoding: 'base64' },
  });
  invariant(simulation.value.err === null, 'SIMULATION_FAILED',
    `${name}: ${JSON.stringify(simulation.value.err)}; ${(simulation.value.logs ?? []).slice(-10).join(' | ')}`);
  const projectedAdmin = simulation.value.accounts?.[0]?.lamports;
  invariant(typeof projectedAdmin === 'number' && Number.isSafeInteger(projectedAdmin), 'BUDGET_SIMULATION_MISSING');
  const initial = context.budget?.initialLamports ?? BigInt(context.state.initialAdminLamports ?? '-1');
  invariant(initial >= 0n, 'BOOTSTRAP_BUDGET_MISSING');
  assertBootstrapBudget(initial, BigInt(projectedAdmin), context.budget?.maxSpendLamports);

  const raw = signed.serialize();
  const signature = base58Encode(signed.signatures[0]!);
  const entry = context.state.steps[name] ??= { attempts: [] };
  const attempt: StoredAttempt = {
    signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight,
    serializedTransactionBase64: Buffer.from(raw).toString('base64'),
    preparedAt: new Date().toISOString(), submittedAt: null,
  };
  entry.attempts.push(attempt);
  await writePrivateJson(context.statePath, context.state);
  const returned = await context.connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 2 });
  invariant(returned === signature, 'SIGNATURE_SUBMISSION_MISMATCH');
  attempt.submittedAt = new Date().toISOString();
  await writePrivateJson(context.statePath, context.state);
  const confirmation = await context.connection.confirmTransaction({ signature, ...latest }, commitment);
  invariant(confirmation.value.err === null, 'TRANSACTION_FAILED', `${name}: ${JSON.stringify(confirmation.value.err)}`);
  invariant(await check(), 'STEP_RECONCILIATION_FAILED', `${name} confirmed without expected state`);
  return signature;
}

export async function simulateSendAndConfirm(
  connection: Connection,
  payer: Signer,
  instructions: readonly TransactionInstruction[],
  otherSigners: readonly Signer[] = [],
): Promise<string> {
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: payer.publicKey, ...latest }).add(...instructions);
  const signed = new VersionedTransaction(transaction.compileMessage());
  signed.sign([payer, ...otherSigners]);
  const simulation = await connection.simulateTransaction(signed, { commitment: 'confirmed', sigVerify: true });
  invariant(simulation.value.err === null, 'SIMULATION_FAILED',
    `${JSON.stringify(simulation.value.err)}; ${(simulation.value.logs ?? []).slice(-10).join(' | ')}`);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  invariant(confirmation.value.err === null, 'TRANSACTION_FAILED');
  return signature;
}
