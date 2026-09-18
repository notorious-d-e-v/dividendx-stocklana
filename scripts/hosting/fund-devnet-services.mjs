#!/usr/bin/env node

import assert from 'node:assert/strict';
import { constants, existsSync } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { loadExplicitSigner } from '../../packages/devnet-runtime/dist/src/private-state.js';

const RPC_URL = 'https://api.devnet.solana.com';
const GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const ADMIN_ADDRESS = 'DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv';
const FAUCET_ADDRESS = 'C6U91C2a2CxKfiDNTaTHvbQe41CdRwtjsr47ip6zKyVb';
const TARGET_LAMPORTS = 1_000_000_000;
const MAX_TRANSFER_LAMPORTS = 1_000_000_000;
const MAX_FEE_LAMPORTS = 10_000;
const POLL_DEADLINE_MS = 60_000;
const RPC_DEADLINE_MS = 15_000;
const MAX_STATE_BYTES = 16_384;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const signerPath = join(repositoryRoot, '.local-tools/keys/dividendx-devnet-deployer-keypair.json');
const stateDirectory = join(repositoryRoot, '.local-tools/hosting-server');
const statePath = join(stateDirectory, 'faucet-endowment.json');
const admin = new PublicKey(ADMIN_ADDRESS);
const faucet = new PublicKey(FAUCET_ADDRESS);
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function parseArgs(argv) {
  assert.equal(argv.length % 2, 0, 'Arguments must be --name value pairs.');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    assert.match(name ?? '', /^--[a-z-]+$/, 'Invalid option.');
    assert.ok(value && !value.startsWith('--'), `${name} requires a value.`);
    assert.equal(values.has(name), false, `${name} was provided twice.`);
    values.set(name, value);
  }
  assert.deepEqual([...values.keys()].sort(), ['--execute', '--output'], 'Only --execute and --output are accepted.');
  assert.equal(values.get('--execute'), 'true', 'Live devnet mutation is opt-in: pass --execute true.');
  const output = values.get('--output');
  assert.ok(output && isAbsolute(output), '--output must be a new absolute path.');
  assert.equal(existsSync(output), false, '--output already exists; refusing to overwrite public evidence.');
  return { output };
}

function base58Encode(input) {
  if (input.length === 0) return '';
  const digits = [0];
  for (const byte of input) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] * 256; digits[index] = carry % 58; carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let leading = 0;
  while (leading < input.length - 1 && input[leading] === 0) leading += 1;
  return '1'.repeat(leading) + digits.reverse().map((digit) => BASE58[digit]).join('');
}

async function boundedRpcFetch(input, init = {}) {
  const timeout = AbortSignal.timeout(RPC_DEADLINE_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, redirect: 'error', signal });
}

function connection() {
  return new Connection(RPC_URL, {
    commitment: 'confirmed', fetch: boundedRpcFetch, disableRetryOnRateLimit: true,
    confirmTransactionInitialTimeout: RPC_DEADLINE_MS,
  });
}

async function assertOwnerOnlyDirectory(path) {
  const requested = await lstat(path);
  const uid = process.getuid?.();
  assert.ok(requested.isDirectory() && !requested.isSymbolicLink() && uid !== undefined
    && requested.uid === uid && (requested.mode & 0o077) === 0, 'PRIVATE_STATE_DIRECTORY_UNSAFE');
  assert.equal(await realpath(path), path, 'PRIVATE_STATE_DIRECTORY_UNSAFE');
}

async function readAttempt() {
  let metadata;
  try { metadata = await lstat(statePath); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const uid = process.getuid?.();
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
    && uid !== undefined && metadata.uid === uid && (metadata.mode & 0o077) === 0, 'PRIVATE_ATTEMPT_UNSAFE');
  assert.equal(await realpath(statePath), statePath, 'PRIVATE_ATTEMPT_UNSAFE');
  assert.ok(metadata.size <= MAX_STATE_BYTES, 'PRIVATE_ATTEMPT_TOO_LARGE');
  return JSON.parse(await readFile(statePath, 'utf8'));
}

async function writeExclusive(path, value, mode) {
  let handle;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally { await handle?.close().catch(() => undefined); }
  const directory = await open(dirname(path), constants.O_RDONLY);
  try { await directory.sync(); } finally { await directory.close(); }
}

function exactTransferMessage(blockhash, amountLamports) {
  return new Transaction({ feePayer: admin, recentBlockhash: blockhash }).add(SystemProgram.transfer({
    fromPubkey: admin, toPubkey: faucet, lamports: amountLamports,
  })).compileMessage();
}

function validateAttempt(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'ATTEMPT_INVALID');
  assert.equal(value.schema, 'dividendx-public-devnet-faucet-endowment-private-v1', 'ATTEMPT_INVALID');
  assert.equal(value.operationScope, 'public-devnet-faucet-endowment-separate-from-bootstrap', 'ATTEMPT_SCOPE_INVALID');
  assert.equal(value.rpcUrl, RPC_URL, 'ATTEMPT_RPC_INVALID');
  assert.equal(value.genesisHash, GENESIS_HASH, 'ATTEMPT_GENESIS_INVALID');
  assert.equal(value.admin, ADMIN_ADDRESS, 'ATTEMPT_ADMIN_INVALID');
  assert.equal(value.faucet, FAUCET_ADDRESS, 'ATTEMPT_FAUCET_INVALID');
  assert.equal(value.targetLamports, TARGET_LAMPORTS, 'ATTEMPT_TARGET_INVALID');
  assert.equal(value.maxTransferLamports, MAX_TRANSFER_LAMPORTS, 'ATTEMPT_BUDGET_INVALID');
  assert.equal(value.maxFeeLamports, MAX_FEE_LAMPORTS, 'ATTEMPT_BUDGET_INVALID');
  assert.ok(Number.isSafeInteger(value.transferLamports) && value.transferLamports > 0
    && value.transferLamports <= MAX_TRANSFER_LAMPORTS, 'ATTEMPT_TRANSFER_INVALID');
  assert.ok(Number.isSafeInteger(value.balanceBefore?.adminLamports)
    && Number.isSafeInteger(value.balanceBefore?.faucetLamports), 'ATTEMPT_BALANCE_INVALID');
  assert.equal(value.balanceBefore.faucetLamports + value.transferLamports, TARGET_LAMPORTS, 'ATTEMPT_TARGET_INVALID');
  assert.ok(Number.isSafeInteger(value.expectedFeeLamports) && value.expectedFeeLamports >= 0
    && value.expectedFeeLamports <= MAX_FEE_LAMPORTS, 'ATTEMPT_FEE_INVALID');
  const attempt = value.attempt;
  assert.ok(attempt && typeof attempt === 'object', 'ATTEMPT_INVALID');
  assert.match(attempt.signature ?? '', /^[1-9A-HJ-NP-Za-km-z]{64,88}$/, 'ATTEMPT_SIGNATURE_INVALID');
  assert.match(attempt.blockhash ?? '', /^[1-9A-HJ-NP-Za-km-z]{32,64}$/, 'ATTEMPT_BLOCKHASH_INVALID');
  assert.ok(Number.isSafeInteger(attempt.lastValidBlockHeight) && attempt.lastValidBlockHeight > 0, 'ATTEMPT_HEIGHT_INVALID');
  assert.ok(typeof attempt.serializedTransactionBase64 === 'string', 'ATTEMPT_BYTES_INVALID');
  const raw = Buffer.from(attempt.serializedTransactionBase64, 'base64');
  assert.ok(raw.length > 0 && raw.length <= 1_232
    && raw.toString('base64') === attempt.serializedTransactionBase64, 'ATTEMPT_BYTES_INVALID');
  const transaction = VersionedTransaction.deserialize(raw);
  assert.equal(transaction.signatures.length, 1, 'ATTEMPT_SIGNATURE_INVALID');
  assert.equal(base58Encode(transaction.signatures[0]), attempt.signature, 'ATTEMPT_SIGNATURE_INVALID');
  assert.ok(Buffer.from(transaction.message.serialize()).equals(
    Buffer.from(exactTransferMessage(attempt.blockhash, value.transferLamports).serialize())), 'ATTEMPT_INSTRUCTIONS_INVALID');
  assert.ok(Buffer.from(transaction.serialize()).equals(raw), 'ATTEMPT_BYTES_INVALID');
  return { record: value, raw };
}

async function prepareAttempt(rpc, balanceBefore) {
  const transferLamports = TARGET_LAMPORTS - balanceBefore.faucetLamports;
  assert.ok(transferLamports > 0 && transferLamports <= MAX_TRANSFER_LAMPORTS, 'TRANSFER_BUDGET_EXCEEDED');
  const signer = await loadExplicitSigner(signerPath, ADMIN_ADDRESS);
  const latest = await rpc.getLatestBlockhash('confirmed');
  const signed = new VersionedTransaction(exactTransferMessage(latest.blockhash, transferLamports));
  signed.sign([signer]);
  const fee = (await rpc.getFeeForMessage(signed.message, 'confirmed')).value;
  assert.ok(Number.isSafeInteger(fee) && fee >= 0 && fee <= MAX_FEE_LAMPORTS, 'FEE_BUDGET_EXCEEDED');
  const simulation = await rpc.simulateTransaction(signed, {
    commitment: 'confirmed', sigVerify: true,
    accounts: { addresses: [ADMIN_ADDRESS, FAUCET_ADDRESS], encoding: 'base64' },
  });
  assert.equal(simulation.value.err, null, `SIMULATION_FAILED: ${JSON.stringify(simulation.value.err)}`);
  const projectedAdmin = simulation.value.accounts?.[0]?.lamports;
  const projectedFaucet = simulation.value.accounts?.[1]?.lamports;
  assert.equal(projectedFaucet, balanceBefore.faucetLamports + transferLamports, 'SIMULATION_FAUCET_DELTA_INVALID');
  assert.equal(projectedAdmin, balanceBefore.adminLamports - transferLamports - fee, 'SIMULATION_ADMIN_DELTA_INVALID');
  assert.ok(balanceBefore.adminLamports - projectedAdmin <= MAX_TRANSFER_LAMPORTS + MAX_FEE_LAMPORTS,
    'ENDOWMENT_BUDGET_EXCEEDED');
  const raw = signed.serialize();
  const record = {
    schema: 'dividendx-public-devnet-faucet-endowment-private-v1',
    operationScope: 'public-devnet-faucet-endowment-separate-from-bootstrap',
    rpcUrl: RPC_URL, genesisHash: GENESIS_HASH, admin: ADMIN_ADDRESS, faucet: FAUCET_ADDRESS,
    targetLamports: TARGET_LAMPORTS, maxTransferLamports: MAX_TRANSFER_LAMPORTS,
    maxFeeLamports: MAX_FEE_LAMPORTS, transferLamports, expectedFeeLamports: fee,
    balanceBefore, preparedAt: new Date().toISOString(),
    attempt: {
      signature: base58Encode(signed.signatures[0]), blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      serializedTransactionBase64: Buffer.from(raw).toString('base64'),
    },
  };
  await writeExclusive(statePath, record, 0o600);
  return validateAttempt(record);
}

async function signatureStatus(rpc, signature) {
  return (await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
}

function succeeded(status) {
  return status?.err === null && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized');
}

async function pollStatus(rpc, attempt) {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let best = null;
  while (Date.now() < deadline) {
    const status = await signatureStatus(rpc, attempt.signature);
    if (status?.err) return { status: 'failed', confirmationStatus: status.confirmationStatus ?? null, slot: status.slot, error: 'TRANSACTION_FAILED' };
    if (succeeded(status)) {
      best = { status: status.confirmationStatus, confirmationStatus: status.confirmationStatus, slot: status.slot };
      if (status.confirmationStatus === 'finalized') return best;
    } else if (!status && await rpc.getBlockHeight('confirmed') > attempt.lastValidBlockHeight) {
      const final = await signatureStatus(rpc, attempt.signature);
      if (succeeded(final)) return { status: final.confirmationStatus, confirmationStatus: final.confirmationStatus, slot: final.slot };
      if (final?.err) return { status: 'failed', confirmationStatus: final.confirmationStatus ?? null, slot: final.slot, error: 'TRANSACTION_FAILED' };
      return { status: 'expired', confirmationStatus: null, slot: null, error: 'EXPIRED_SIGNATURE_UNRESOLVED' };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(1_000, Math.max(0, deadline - Date.now()))));
  }
  return best ?? { status: 'pending', confirmationStatus: null, slot: null };
}

async function transactionBalances(rpc, record, status) {
  if (status.status !== 'confirmed' && status.status !== 'finalized') return null;
  const details = await rpc.getTransaction(record.attempt.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  assert.ok(details?.meta, 'CONFIRMED_TRANSACTION_DETAILS_UNAVAILABLE');
  const keys = details.transaction.message.staticAccountKeys ?? details.transaction.message.accountKeys;
  const adminIndex = keys.findIndex((key) => key.toBase58() === ADMIN_ADDRESS);
  const faucetIndex = keys.findIndex((key) => key.toBase58() === FAUCET_ADDRESS);
  assert.ok(adminIndex >= 0 && faucetIndex >= 0, 'CONFIRMED_TRANSACTION_ACCOUNTS_INVALID');
  const before = { adminLamports: details.meta.preBalances[adminIndex], faucetLamports: details.meta.preBalances[faucetIndex] };
  const after = { adminLamports: details.meta.postBalances[adminIndex], faucetLamports: details.meta.postBalances[faucetIndex] };
  assert.equal(after.faucetLamports - before.faucetLamports, record.transferLamports, 'CONFIRMED_FAUCET_DELTA_INVALID');
  assert.equal(before.adminLamports - after.adminLamports, record.transferLamports + details.meta.fee, 'CONFIRMED_ADMIN_DELTA_INVALID');
  assert.equal(details.meta.fee, record.expectedFeeLamports, 'CONFIRMED_FEE_INVALID');
  assert.ok(details.meta.fee <= MAX_FEE_LAMPORTS, 'CONFIRMED_FEE_BUDGET_EXCEEDED');
  assert.equal(after.faucetLamports, TARGET_LAMPORTS, 'CONFIRMED_TARGET_INVALID');
  return { before, after, feeLamports: details.meta.fee };
}

async function currentBalances(rpc) {
  const [adminLamports, faucetLamports] = await Promise.all([
    rpc.getBalance(admin, 'confirmed'), rpc.getBalance(faucet, 'confirmed'),
  ]);
  return { adminLamports, faucetLamports };
}

function receiptBase() {
  return {
    schema: 'dividendx-public-devnet-faucet-endowment-receipt-v1',
    operationScope: 'public-devnet-faucet-endowment-separate-from-closed-bootstrap-budget',
    rpcUrl: RPC_URL, genesisHash: GENESIS_HASH, admin: ADMIN_ADDRESS, faucet: FAUCET_ADDRESS,
    targetLamports: TARGET_LAMPORTS, maxTransferLamports: MAX_TRANSFER_LAMPORTS,
    maxFeeLamports: MAX_FEE_LAMPORTS, attestorFunded: false,
  };
}

async function run() {
  await assertOwnerOnlyDirectory(stateDirectory);
  const rpc = connection();
  assert.equal(await rpc.getGenesisHash(), GENESIS_HASH, 'GENESIS_MISMATCH');
  let stored = await readAttempt();
  if (!stored) {
    const balances = await currentBalances(rpc);
    if (balances.faucetLamports >= TARGET_LAMPORTS) return {
      ...receiptBase(), status: 'not-needed', signature: null, depositLamports: 0, feeLamports: 0,
      publicBefore: balances, publicAfter: balances, completedAt: new Date().toISOString(),
    };
    stored = (await prepareAttempt(rpc, balances)).record;
  }
  const { record, raw } = validateAttempt(stored);
  let initial = await signatureStatus(rpc, record.attempt.signature);
  if (!initial && await rpc.getBlockHeight('confirmed') <= record.attempt.lastValidBlockHeight) {
    let returned = null;
    try {
      returned = await rpc.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 2 });
    } catch { /* Submission may have reached the cluster; bounded polling decides the public status. */ }
    if (returned !== null) assert.equal(returned, record.attempt.signature, 'SIGNATURE_SUBMISSION_MISMATCH');
  }
  const status = await pollStatus(rpc, record.attempt);
  const transaction = await transactionBalances(rpc, record, status);
  const after = transaction?.after ?? await currentBalances(rpc);
  return {
    ...receiptBase(), status: status.status, confirmationStatus: status.confirmationStatus,
    signature: record.attempt.signature, depositLamports: record.transferLamports,
    feeLamports: transaction?.feeLamports ?? record.expectedFeeLamports,
    publicBefore: transaction?.before ?? record.balanceBefore, publicAfter: after,
    slot: status.slot, error: status.error ?? null, completedAt: new Date().toISOString(),
  };
}

const options = parseArgs(process.argv.slice(2));
let receipt;
try { receipt = await run(); }
catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const privateValue of [repositoryRoot, signerPath, statePath, options.output]) message = message.replaceAll(privateValue, '[private path]');
  receipt = { ...receiptBase(), status: 'failed', signature: null, depositLamports: null, feeLamports: null,
    publicBefore: null, publicAfter: null, error: message.slice(0, 1_000), completedAt: new Date().toISOString() };
  process.exitCode = 1;
}
await writeExclusive(options.output, receipt, 0o644);
process.stdout.write(`${JSON.stringify({ status: receipt.status, signature: receipt.signature, output: options.output })}\n`);
