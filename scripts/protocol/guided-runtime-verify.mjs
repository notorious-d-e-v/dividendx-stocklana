#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  allocationFromRetention,
  annualSeriesAddresses,
  bytesToBigIntLe,
  decodeClockAccount,
  decodeProgramAccount,
  eventRevisionPda,
  f64ToBits,
  inspectMintProfile,
  mintProfileMatchesPolicy,
  multiplyRetentionRatios,
  normalizeAccumulatorAccount,
  normalizeAssetPolicyAccount,
  normalizeSeriesAccount,
  requiredCustodyRaw,
} from '@dividendx/transaction-sdk';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromAmm = createRequire(resolve(repositoryRoot, 'packages/amm-integration/package.json'));
const { CpmmConfigInfoLayout, CpmmPoolInfoLayout, getCpmmPdaPoolId } = requireFromAmm('@raydium-io/raydium-sdk-v2');

const RUNTIME_URL = 'http://127.0.0.1:4181';
const REQUEST_TIMEOUT_MS = 20_000;
const RPC_TIMEOUT_MS = 30_000;
const YEAR = 2027;
const EXPECTED_STEPS = Object.freeze([
  'split',
  'create-pool',
  'add-liquidity',
  'buy-dr',
  'remove-liquidity',
  'recombine',
  'settle-year',
  'redeem-buyer',
  'redeem-provider',
]);
const EXPECTED_CHECKPOINTS = Object.freeze(['setup', ...EXPECTED_STEPS]);
const PUBLIC_GENESIS_HASHES = new Set([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N2d',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const RAYDIUM_PROGRAM_ID = new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
const RAYDIUM_CONFIG = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
const RAYDIUM_FEE_RECEIVER = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');
const RAYDIUM_PROGRAM_DATA = new PublicKey('3KvTa2fYhMxMZNfHho5oX34yLQLwRauoU2JScBkugvXF');
const EXPECTED_DIVIDENDX_HASH = 'a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070';
const EXPECTED_RAYDIUM_HASH = '87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd';
const EXPECTED_CONFIG_HASH = '3b5ca2f3187261cc048e2353789242067c3aff19cab67168f86dbbd29d99f21c';
const EXPECTED_FEE_HASH = 'c8c0238152ce9c374de300598a8513b59018396b39f603cdc2eba44bca357464';
const EXPECTED_CAPTURE_SLOT = 499_784_549;
const EXPECTED_RAYDIUM_DEPLOY_SLOT = 498_629_438;
const EXPECTED_POOL_RESIDUAL_DR = 643n;
const EXPECTED_EVENT_DATES = Object.freeze([20_270_315, 20_270_615, 20_270_915, 20_271_215]);
const EXPECTED_EVENT_M0 = Object.freeze([1, 1.01, 1.02, 1.03].map(f64ToBits));
const EXPECTED_EVENT_M1 = Object.freeze([1.01, 1.02, 1.03, 1.04].map(f64ToBits));

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function loopbackUrl(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:', `${label} must use HTTP`);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), `${label} must be loopback`);
  assert.equal(url.username, '', `${label} must not contain credentials`);
  assert.equal(url.password, '', `${label} must not contain credentials`);
  return url;
}

function object(value, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function string(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  return value;
}

function integer(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative safe integer`);
  return value;
}

function raw(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a decimal string`);
  assert.match(value, /^(?:0|[1-9]\d*)$/, `${label} must be a canonical unsigned decimal string`);
  return BigInt(value);
}

function key(value, label) {
  try {
    return new PublicKey(string(value, label));
  } catch (error) {
    throw new Error(`${label} is not a valid public key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bytes(value, label, length) {
  assert.ok(value instanceof Uint8Array || Array.isArray(value), `${label} must be bytes`);
  const result = Uint8Array.from(value);
  assert.equal(result.length, length, `${label} must contain ${length} bytes`);
  return result;
}

function bigintField(record, name) {
  assert.equal(typeof record[name], 'bigint', `${name} must decode as bigint`);
  return record[name];
}

function numberField(record, name) {
  assert.ok(Number.isSafeInteger(record[name]), `${name} must decode as a safe integer`);
  return record[name];
}

function publicKeyField(record, name) {
  const value = record[name];
  assert.ok(value !== null && typeof value === 'object' && typeof value.toBase58 === 'function',
    `${name} must decode as a public key`);
  return new PublicKey(value.toBase58());
}

function equalKey(actual, expected, label) {
  assert.equal(actual.toBase58(), expected.toBase58(), `${label} mismatch`);
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function boundedFetch(input, init = {}) {
  const timeout = AbortSignal.timeout(RPC_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

async function fetchJson(path) {
  const base = loopbackUrl(RUNTIME_URL, 'guided runtime URL');
  const response = await fetch(new URL(path, base), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  assert.ok(response.ok, `GET ${path} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`GET ${path} did not return JSON`);
  }
}

function parseCli(argv) {
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true, output: null };
    assert.equal(arg, '--output', `unknown argument ${arg}`);
    assert.ok(index + 1 < argv.length, '--output requires a path');
    output = resolve(argv[++index]);
  }
  return { help: false, output };
}

function validateStateAndReceipt(stateValue, receiptValue) {
  const state = object(stateValue, 'state');
  const receipt = object(receiptValue, 'receipt');
  assert.equal(state.schemaVersion, 1, 'unsupported state schema');
  assert.equal(receipt.schemaVersion, 1, 'unsupported receipt schema');
  assert.equal(state.status, 'complete', 'guided run is not complete');
  assert.equal(state.activeStep, null, 'completed run still has an active step');
  assert.equal(state.nextStep, null, 'completed run still has a next step');
  assert.equal(state.error, null, 'completed run reports an error');
  assert.equal(receipt.failure, null, 'completed receipt reports a failure');
  assert.equal(state.runtimeId, receipt.runtimeId, 'runtime ID mismatch');
  assert.equal(state.sessionId, receipt.sessionId, 'session ID mismatch');
  string(state.runtimeId, 'runtime ID');
  string(state.sessionId, 'session ID');
  integer(state.revision, 'state revision');
  assert.deepEqual(state.completedSteps, EXPECTED_STEPS, 'completed steps are not the fixed nine-step journey');
  assert.ok(Array.isArray(receipt.checkpoints), 'receipt checkpoints are missing');
  assert.deepEqual(receipt.checkpoints.map((checkpoint) => checkpoint.step), EXPECTED_CHECKPOINTS,
    'receipt checkpoints are incomplete or out of order');
  assert.deepEqual(receipt.checkpoints.at(-1)?.snapshot, state.snapshot,
    'final state and final receipt checkpoint disagree');
  object(state.snapshot.pool, 'final pool snapshot');
  assert.ok(Array.isArray(state.transactions) && Array.isArray(receipt.transactions), 'transaction receipts are missing');
  assert.deepEqual(state.transactions, receipt.transactions, 'state and receipt transaction claims disagree');
  for (const step of EXPECTED_STEPS) {
    assert.ok(receipt.transactions.some((transaction) => transaction.step === step), `${step} has no transaction`);
  }
  const stepOrder = new Map(EXPECTED_CHECKPOINTS.map((step, index) => [step, index]));
  let previous = -1;
  for (const transaction of receipt.transactions) {
    const index = stepOrder.get(transaction.step);
    assert.notEqual(index, undefined, `unknown transaction step ${String(transaction.step)}`);
    assert.ok(index >= previous, 'transaction steps are out of order');
    previous = index;
    string(transaction.name, 'transaction name');
    string(transaction.signature, 'transaction signature');
    assert.ok(transaction.status === 'confirmed' || transaction.status === 'finalized',
      `transaction ${transaction.signature} is not confirmed`);
    integer(transaction.slot, `transaction ${transaction.signature} slot`);
  }
  assert.equal(new Set(receipt.transactions.map((transaction) => transaction.signature)).size,
    receipt.transactions.length, 'transaction signatures are not unique');

  const capture = object(receipt.capture, 'receipt capture');
  assert.equal(receipt.boundary, 'local-captured-raydium-devnet-bytecode', 'receipt boundary mismatch');
  assert.equal(capture.sourceCluster, 'devnet', 'capture source cluster mismatch');
  assert.equal(capture.sourceSlot, EXPECTED_CAPTURE_SLOT, 'capture source slot mismatch');
  assert.equal(capture.raydiumProgramData, RAYDIUM_PROGRAM_DATA.toBase58(), 'captured ProgramData mismatch');
  assert.equal(Number(capture.raydiumDeploySlot), EXPECTED_RAYDIUM_DEPLOY_SLOT, 'captured deploy slot mismatch');
  assert.equal(capture.raydiumElfSha256, EXPECTED_RAYDIUM_HASH, 'captured Raydium hash mismatch');
  assert.equal(capture.dividendXElfSha256, EXPECTED_DIVIDENDX_HASH, 'captured DividendX hash mismatch');
  assert.equal(capture.configAccountSha256, EXPECTED_CONFIG_HASH, 'captured config hash mismatch');
  assert.equal(capture.feeAccountSha256, EXPECTED_FEE_HASH, 'captured fee-account hash mismatch');
  assert.ok(Array.isArray(receipt.limits) && receipt.limits.every((limit) => typeof limit === 'string'),
    'receipt limits must be public strings');
  return { state, receipt, snapshot: object(state.snapshot, 'state snapshot') };
}

async function programIdentity(connection, address, expectedHash) {
  const info = await connection.getAccountInfo(address, 'confirmed');
  assert.ok(info?.executable, `${address.toBase58()} is not executable`);
  assert.ok(info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID),
    `${address.toBase58()} is not owned by the upgradeable loader`);
  assert.ok(info.data.length >= 36 && info.data.readUInt32LE(0) === 2,
    `${address.toBase58()} has invalid upgradeable-loader program data`);
  const programData = new PublicKey(info.data.subarray(4, 36));
  const canonicalProgramData = PublicKey.findProgramAddressSync(
    [address.toBuffer()], BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
  equalKey(programData, canonicalProgramData, `${address.toBase58()} canonical ProgramData`);
  const dataInfo = await connection.getAccountInfo(programData, 'confirmed');
  assert.ok(dataInfo && dataInfo.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)
      && dataInfo.data.length > 45 && dataInfo.data.readUInt32LE(0) === 3,
    `${address.toBase58()} ProgramData is invalid`);
  const deploySlot = dataInfo.data.readBigUInt64LE(4);
  assert.ok(deploySlot > 0n, `${address.toBase58()} has an invalid local deploy slot`);
  const elf = dataInfo.data.subarray(45);
  const elfSha256 = sha256(elf);
  assert.equal(elfSha256, expectedHash, `${address.toBase58()} ELF hash mismatch`);
  return {
    address: address.toBase58(),
    owner: info.owner.toBase58(),
    programData: programData.toBase58(),
    deploySlot: deploySlot.toString(),
    elfSha256,
  };
}

function transactionPrograms(transaction) {
  return new Set(transaction.transaction.message.instructions.map((instruction) => instruction.programId.toBase58()));
}

function transactionSigners(transaction) {
  return new Set(transaction.transaction.message.accountKeys
    .filter((account) => account.signer)
    .map((account) => account.pubkey.toBase58()));
}

function tokenAmount(balances, owner, mint) {
  return (balances ?? [])
    .filter((balance) => balance.owner === owner && balance.mint === mint)
    .reduce((sum, balance) => sum + BigInt(balance.uiTokenAmount.amount), 0n);
}

function tokenDelta(transactions, owner, mint) {
  return transactions.reduce((sum, transaction) => {
    const pre = tokenAmount(transaction.meta?.preTokenBalances, owner, mint);
    const post = tokenAmount(transaction.meta?.postTokenBalances, owner, mint);
    return sum + post - pre;
  }, 0n);
}

async function verifyTransactions(connection, receipt, identities) {
  const claims = receipt.transactions;
  const signatures = claims.map((claim) => claim.signature);
  const statuses = (await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true })).value;
  const parsed = await Promise.all(signatures.map((signature) => connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })));
  const verified = [];
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index];
    const status = statuses[index];
    const transaction = parsed[index];
    assert.ok(status && status.err === null, `${claim.signature} is absent or failed`);
    assert.ok(status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized',
      `${claim.signature} is not confirmed`);
    if (claim.status === 'finalized') assert.equal(status.confirmationStatus, 'finalized', `${claim.signature} is not finalized`);
    assert.equal(status.slot, claim.slot, `${claim.signature} status slot differs from receipt`);
    assert.ok(transaction && transaction.meta?.err === null, `${claim.signature} transaction is absent or failed`);
    assert.equal(transaction.slot, claim.slot, `${claim.signature} transaction slot differs from receipt`);
    verified.push({ ...claim, actualConfirmationStatus: status.confirmationStatus, transaction });
  }

  const groups = new Map(EXPECTED_CHECKPOINTS.map((step) => [step,
    verified.filter((transaction) => transaction.step === step).map((entry) => entry.transaction)]));
  const requireExecution = (step, signer, program) => {
    const transactions = groups.get(step);
    assert.ok(transactions.length > 0, `${step} has no parsed transaction`);
    assert.ok(transactions.some((transaction) => transactionSigners(transaction).has(signer)
      && transactionPrograms(transaction).has(program)),
    `${step} has no transaction signed by ${signer} that executes ${program}`);
  };
  const requireProgram = (step, program) => {
    const transactions = groups.get(step);
    assert.ok(transactions.length > 0, `${step} has no parsed transaction`);
    assert.ok(transactions.some((transaction) => transactionPrograms(transaction).has(program)),
      `${step} did not execute ${program}`);
  };
  const provider = identities.wallets.provider;
  const buyer = identities.wallets.buyer;
  requireExecution('split', provider, DIVIDENDX_PROGRAM_ID.toBase58());
  requireExecution('create-pool', provider, RAYDIUM_PROGRAM_ID.toBase58());
  requireExecution('add-liquidity', provider, RAYDIUM_PROGRAM_ID.toBase58());
  requireExecution('buy-dr', buyer, RAYDIUM_PROGRAM_ID.toBase58());
  requireExecution('remove-liquidity', provider, RAYDIUM_PROGRAM_ID.toBase58());
  requireExecution('recombine', provider, DIVIDENDX_PROGRAM_ID.toBase58());
  requireProgram('settle-year', DIVIDENDX_PROGRAM_ID.toBase58());
  requireExecution('redeem-buyer', buyer, DIVIDENDX_PROGRAM_ID.toBase58());
  requireExecution('redeem-provider', provider, DIVIDENDX_PROGRAM_ID.toBase58());

  const delta = (step, owner, mint) => tokenDelta(groups.get(step), owner, mint);
  return {
    verified,
    groups,
    delta,
    signatures: verified.map(({ transaction: _transaction, ...entry }) => entry),
  };
}

function requireTokenAccount(address, info, programId, mint, owner, label) {
  assert.ok(info, `${label} is missing`);
  const account = unpackAccount(address, info, programId);
  assert.ok(account.isInitialized && !account.isFrozen, `${label} is not initialized and transferable`);
  equalKey(account.mint, mint, `${label} mint`);
  if (owner) equalKey(account.owner, owner, `${label} owner`);
  return account;
}

function optionalTokenAmount(address, info, programId, mint, owner, label) {
  if (!info) return 0n;
  return requireTokenAccount(address, info, programId, mint, owner, label).amount;
}

function idlAccount(name) {
  const normalized = name.replaceAll('_', '').toLowerCase();
  const account = DIVIDENDX_IDL.accounts?.find((candidate) => candidate.name.replaceAll('_', '').toLowerCase() === normalized);
  assert.ok(account, `IDL lacks ${name}`);
  return account;
}

async function verifyJournal(connection, seriesAddress, accumulator, series) {
  const headDefinition = idlAccount('EventHead');
  const allAccounts = await connection.getProgramAccounts(DIVIDENDX_PROGRAM_ID, { commitment: 'confirmed' });
  const heads = allAccounts
    .filter(({ account }) => account.data.subarray(0, 8).equals(Buffer.from(headDefinition.discriminator)))
    .map(({ pubkey, account }) => ({ pubkey, value: decodeProgramAccount(DIVIDENDX_IDL, 'eventHead', account.data) }))
    .filter(({ value }) => publicKeyField(value, 'series').equals(seriesAddress))
    .sort((left, right) => numberField(left.value, 'index') - numberField(right.value, 'index'));
  assert.equal(heads.length, 4, 'actual series does not have exactly four EventHead accounts');
  assert.deepEqual(heads.map(({ value }) => numberField(value, 'index')), [0, 1, 2, 3], 'event indices are not contiguous');

  const revisionAddresses = heads.map(({ pubkey, value }) => eventRevisionPda(pubkey, bigintField(value, 'latestRevision')).address);
  const revisionResponse = await connection.getMultipleAccountsInfoAndContext(revisionAddresses, { commitment: 'confirmed' });
  assert.ok(revisionResponse.value.every(Boolean), 'a latest EventRevision account is missing');
  const revisions = revisionResponse.value.map((info) => decodeProgramAccount(DIVIDENDX_IDL, 'eventRevision', info.data));
  for (let index = 0; index < 4; index += 1) {
    const head = heads[index];
    const revision = revisions[index];
    assert.equal(head.value.latestResolved, true, `event ${index} is unresolved`);
    assert.equal(head.value.latestInYearQualified, true, `event ${index} is not qualified in-year`);
    assert.equal(bigintField(head.value, 'latestRevision'), 1n, `event ${index} latest revision mismatch`);
    assert.equal(bigintField(revision, 'revision'), 1n, `event ${index} revision mismatch`);
    equalKey(publicKeyField(revision, 'eventHead'), head.pubkey, `event ${index} head`);
    assert.deepEqual(bytes(head.value.eventId, `event ${index} head ID`, 32), new Uint8Array(32).fill(index + 1),
      `event ${index} ID mismatch`);
    assert.deepEqual(bytes(revision.eventId, `event ${index} revision ID`, 32), new Uint8Array(32).fill(index + 1),
      `event ${index} revision ID mismatch`);
    assert.equal(numberField(revision, 'exDate'), EXPECTED_EVENT_DATES[index], `event ${index} ex-date mismatch`);
    assert.equal(numberField(revision, 'status'), 1, `event ${index} is not qualified`);
    assert.equal(revision.sourceFinal, true, `event ${index} is not source-final`);
    assert.equal(bigintField(revision, 'm0Bits'), EXPECTED_EVENT_M0[index], `event ${index} M0 mismatch`);
    assert.equal(bigintField(revision, 'm1Bits'), EXPECTED_EVENT_M1[index], `event ${index} M1 mismatch`);
    assert.ok(bytes(revision.evidenceDigest, `event ${index} evidence digest`, 32).some((byte) => byte !== 0),
      `event ${index} evidence digest is zero`);
  }

  const ratios = revisions.map((revision) => ({
    m0Bits: bigintField(revision, 'm0Bits'),
    m1Bits: bigintField(revision, 'm1Bits'),
  }));
  const retention = multiplyRetentionRatios(ratios);
  const actualNumerator = bytesToBigIntLe(accumulator.numeratorLe);
  const actualDenominator = bytesToBigIntLe(accumulator.denominatorLe);
  assert.ok(actualNumerator > 0n && actualDenominator > 0n, 'actual accumulator is zero');
  assert.equal(actualNumerator * retention.denominator, retention.numerator * actualDenominator,
    'actual accumulator does not equal the exact event product');
  const pools = allocationFromRetention(series.finalSupplyRaw, retention);
  assert.equal(series.finalPtPoolRaw, pools.ptRaw, 'actual PT pool differs from exact event allocation');
  assert.equal(series.finalDrPoolRaw, pools.drRaw, 'actual DR pool differs from exact event allocation');
  return {
    eventCount: revisions.length,
    exDates: revisions.map((revision) => numberField(revision, 'exDate')),
    m0Bits: ratios.map(({ m0Bits }) => m0Bits.toString()),
    m1Bits: ratios.map(({ m1Bits }) => m1Bits.toString()),
    numerator: actualNumerator.toString(),
    denominator: actualDenominator.toString(),
  };
}

async function verifyAccounts(connection, snapshot, receipt) {
  const identities = object(receipt.identities, 'receipt identities');
  const programs = object(identities.programs, 'program identities');
  const wallets = object(identities.wallets, 'wallet identities');
  const mints = object(identities.mints, 'mint identities');
  const dividendX = object(identities.dividendX, 'DividendX identities');
  const accounts = object(identities.accounts, 'account identities');

  assert.equal(programs.dividendX, DIVIDENDX_PROGRAM_ID.toBase58(), 'DividendX program identity mismatch');
  assert.equal(programs.raydium, RAYDIUM_PROGRAM_ID.toBase58(), 'Raydium program identity mismatch');
  assert.equal(programs.raydiumConfig, RAYDIUM_CONFIG.toBase58(), 'Raydium config identity mismatch');
  assert.equal(programs.raydiumFeeReceiver, RAYDIUM_FEE_RECEIVER.toBase58(), 'Raydium fee identity mismatch');
  assert.equal(snapshot.dividendXProgram, programs.dividendX, 'snapshot DividendX program mismatch');
  assert.equal(snapshot.raydiumProgram, programs.raydium, 'snapshot Raydium program mismatch');
  assert.equal(snapshot.series, dividendX.series, 'snapshot series mismatch');
  assert.equal(snapshot.provider.address, wallets.provider, 'snapshot provider mismatch');
  assert.equal(snapshot.buyer.address, wallets.buyer, 'snapshot buyer mismatch');
  assert.deepEqual(snapshot.mints, mints, 'snapshot mint identities mismatch');
  assert.equal(snapshot.pool.address, identities.pool, 'snapshot pool identity mismatch');
  assert.equal(snapshot.year, YEAR, 'snapshot year mismatch');

  const provider = key(wallets.provider, 'provider');
  const buyer = key(wallets.buyer, 'buyer');
  const stockMintAddress = key(mints.stock, 'stock mint');
  const ptMintAddress = key(mints.pt, 'PT mint');
  const drMintAddress = key(mints.dr, 'DR mint');
  const quoteMintAddress = key(mints.quote, 'quote mint');
  const lpMintAddress = key(mints.lp, 'LP mint');
  const assetPolicyAddress = key(dividendX.assetPolicy, 'asset policy');
  const seriesAddress = key(dividendX.series, 'series');
  const accumulatorAddress = key(dividendX.accumulator, 'accumulator');
  const vaultAddress = key(dividendX.vault, 'DividendX vault');
  const poolAddress = key(identities.pool, 'Raydium pool');
  const poolVaultAAddress = key(accounts.poolVaultA, 'pool vault A');
  const poolVaultBAddress = key(accounts.poolVaultB, 'pool vault B');
  const poolDrVaultAddress = key(accounts.poolDrVault, 'pool DR vault');
  const poolQuoteVaultAddress = key(accounts.poolQuoteVault, 'pool quote vault');

  const derivedAccounts = {
    providerStock: getAssociatedTokenAddressSync(stockMintAddress, provider, false, TOKEN_2022_PROGRAM_ID),
    providerPt: getAssociatedTokenAddressSync(ptMintAddress, provider),
    providerDr: getAssociatedTokenAddressSync(drMintAddress, provider),
    providerQuote: getAssociatedTokenAddressSync(quoteMintAddress, provider),
    providerLp: getAssociatedTokenAddressSync(lpMintAddress, provider),
    buyerStock: getAssociatedTokenAddressSync(stockMintAddress, buyer, false, TOKEN_2022_PROGRAM_ID),
    buyerPt: getAssociatedTokenAddressSync(ptMintAddress, buyer),
    buyerDr: getAssociatedTokenAddressSync(drMintAddress, buyer),
    buyerQuote: getAssociatedTokenAddressSync(quoteMintAddress, buyer),
    buyerLp: getAssociatedTokenAddressSync(lpMintAddress, buyer),
  };
  for (const name of ['providerStock', 'providerPt', 'providerDr', 'providerQuote', 'providerLp', 'buyerStock', 'buyerPt', 'buyerDr', 'buyerQuote']) {
    assert.equal(accounts[name], derivedAccounts[name].toBase58(), `${name} is not the canonical ATA`);
  }

  const requested = {
    clock: SYSVAR_CLOCK_PUBKEY,
    assetPolicy: assetPolicyAddress,
    series: seriesAddress,
    accumulator: accumulatorAddress,
    stockMint: stockMintAddress,
    ptMint: ptMintAddress,
    drMint: drMintAddress,
    quoteMint: quoteMintAddress,
    lpMint: lpMintAddress,
    vault: vaultAddress,
    providerStock: derivedAccounts.providerStock,
    providerPt: derivedAccounts.providerPt,
    providerDr: derivedAccounts.providerDr,
    providerQuote: derivedAccounts.providerQuote,
    providerLp: derivedAccounts.providerLp,
    buyerStock: derivedAccounts.buyerStock,
    buyerPt: derivedAccounts.buyerPt,
    buyerDr: derivedAccounts.buyerDr,
    buyerQuote: derivedAccounts.buyerQuote,
    buyerLp: derivedAccounts.buyerLp,
    pool: poolAddress,
    poolVaultA: poolVaultAAddress,
    poolVaultB: poolVaultBAddress,
    raydiumConfig: RAYDIUM_CONFIG,
    raydiumFee: RAYDIUM_FEE_RECEIVER,
  };
  const entries = Object.entries(requested);
  const response = await connection.getMultipleAccountsInfoAndContext(entries.map(([, address]) => address), { commitment: 'confirmed' });
  const info = Object.fromEntries(entries.map(([name], index) => [name, response.value[index]]));
  for (const name of ['clock', 'assetPolicy', 'series', 'accumulator', 'stockMint', 'ptMint', 'drMint', 'quoteMint',
    'lpMint', 'vault', 'providerStock', 'providerPt', 'providerDr', 'providerQuote', 'providerLp', 'buyerStock',
    'buyerPt', 'buyerDr', 'buyerQuote', 'pool', 'poolVaultA', 'poolVaultB', 'raydiumConfig', 'raydiumFee']) {
    assert.ok(info[name], `${name} account is missing`);
  }

  assert.equal(sha256(info.raydiumConfig.data), EXPECTED_CONFIG_HASH, 'actual Raydium config differs from capture');
  assert.ok(info.raydiumConfig.owner.equals(RAYDIUM_PROGRAM_ID), 'Raydium config owner mismatch');
  assert.ok(info.raydiumFee.owner.equals(TOKEN_PROGRAM_ID), 'Raydium fee-account owner mismatch');
  // Pool creation pays this mutable native-token account; the source hash is provenance,
  // while final state includes the transfer and local native-token rent bookkeeping.
  const captureFixture = JSON.parse(await readFile(resolve(repositoryRoot,
    'packages/amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json'), 'utf8'));
  const capturedFee = captureFixture.accounts.find(({ address }) => address === RAYDIUM_FEE_RECEIVER.toBase58());
  assert.ok(capturedFee, 'captured fee receiver is missing');
  const expectedFeeData = Buffer.from(capturedFee.data, 'base64');
  assert.equal(sha256(expectedFeeData), EXPECTED_FEE_HASH, 'source fee fixture hash mismatch');
  const feeAccount = unpackAccount(RAYDIUM_FEE_RECEIVER, info.raydiumFee, TOKEN_PROGRAM_ID);
  assert.equal(feeAccount.isNative, true, 'fee receiver must remain native SOL');
  equalKey(feeAccount.mint, NATIVE_MINT, 'fee receiver mint');
  const createPoolFee = BigInt(CpmmConfigInfoLayout.decode(info.raydiumConfig.data).createPoolFee.toString());
  assert.equal(createPoolFee, 150_000_000n, 'captured creation fee changed');
  const expectedFeeLamports = BigInt(capturedFee.lamports) + createPoolFee;
  assert.equal(BigInt(info.raydiumFee.lamports), expectedFeeLamports, 'pool creation fee transfer mismatch');
  const localNativeReserve = BigInt(await connection.getMinimumBalanceForRentExemption(expectedFeeData.length, 'confirmed'));
  assert.equal(feeAccount.rentExemptReserve, localNativeReserve, 'fee receiver local rent reserve mismatch');
  const expectedNativeAmount = expectedFeeLamports - feeAccount.rentExemptReserve;
  expectedFeeData.writeBigUInt64LE(expectedNativeAmount, 64);
  expectedFeeData.writeBigUInt64LE(localNativeReserve, 113);
  assert.equal(sha256(info.raydiumFee.data), sha256(expectedFeeData), 'fee account changed beyond the expected native amount and local rent reserve');
  assert.equal(feeAccount.amount, expectedNativeAmount, 'fee receiver SyncNative amount mismatch');

  const clock = decodeClockAccount(info.clock, response.context.slot);
  assert.ok(response.context.slot >= integer(snapshot.slot, 'snapshot slot'), 'RPC context precedes the runtime snapshot');
  assert.ok(clock.unixTimestamp >= raw(snapshot.unixTimestamp, 'snapshot Unix timestamp'),
    'chain clock moved backwards from the runtime snapshot');
  const rawPolicy = decodeProgramAccount(DIVIDENDX_IDL, 'assetPolicy', info.assetPolicy.data);
  const rawSeries = decodeProgramAccount(DIVIDENDX_IDL, 'series', info.series.data);
  const rawAccumulator = decodeProgramAccount(DIVIDENDX_IDL, 'accumulator', info.accumulator.data);
  const policy = normalizeAssetPolicyAccount(assetPolicyAddress, rawPolicy);
  const series = normalizeSeriesAccount(seriesAddress, rawSeries);
  const accumulator = normalizeAccumulatorAccount(accumulatorAddress, rawAccumulator);
  const issuerId = bytes(rawPolicy.issuerId, 'asset issuer ID', 32);
  const derivedSeries = annualSeriesAddresses(issuerId, stockMintAddress, YEAR);
  equalKey(derivedSeries.assetPolicy, assetPolicyAddress, 'derived asset policy');
  equalKey(derivedSeries.series, seriesAddress, 'derived series');
  equalKey(derivedSeries.accumulator, accumulatorAddress, 'derived accumulator');
  equalKey(derivedSeries.ptMint, ptMintAddress, 'derived PT mint');
  equalKey(derivedSeries.drMint, drMintAddress, 'derived DR mint');
  equalKey(derivedSeries.vault, vaultAddress, 'derived DividendX vault');
  equalKey(policy.collateralMint, stockMintAddress, 'asset-policy collateral mint');
  equalKey(series.assetPolicy, assetPolicyAddress, 'series asset policy');
  equalKey(series.collateralMint, stockMintAddress, 'series collateral mint');
  equalKey(series.ptMint, ptMintAddress, 'series PT mint');
  equalKey(series.drMint, drMintAddress, 'series DR mint');
  equalKey(series.vault, vaultAddress, 'series vault');
  equalKey(accumulator.series, seriesAddress, 'accumulator series');
  assert.equal(series.year, YEAR, 'series year mismatch');
  assert.equal(series.phase, 'finalized', 'actual series is not finalized');
  assert.equal(snapshot.phase, series.phase, 'snapshot series phase differs from chain');
  assert.equal(series.eventCount, 4, 'actual series event count mismatch');
  assert.equal(snapshot.eventCount, series.eventCount, 'snapshot event count differs from chain');
  assert.equal(series.unresolvedCount, 0, 'actual series journal is unresolved');
  assert.equal(series.inYearQualifiedCount, 4, 'actual series qualified-event count mismatch');
  assert.equal(series.sealedEventCount, 4, 'actual sealed event count mismatch');
  assert.equal(accumulator.cursor, 4, 'actual accumulator is incomplete');

  const stockMint = unpackMint(stockMintAddress, info.stockMint, TOKEN_2022_PROGRAM_ID);
  const ptMint = unpackMint(ptMintAddress, info.ptMint, TOKEN_PROGRAM_ID);
  const drMint = unpackMint(drMintAddress, info.drMint, TOKEN_PROGRAM_ID);
  const quoteMint = unpackMint(quoteMintAddress, info.quoteMint, TOKEN_PROGRAM_ID);
  const lpMint = unpackMint(lpMintAddress, info.lpMint, TOKEN_PROGRAM_ID);
  const profile = await inspectMintProfile(stockMint, clock);
  assert.ok(mintProfileMatchesPolicy(policy, profile), 'actual mint profile differs from its reviewed asset policy');
  assert.equal(profile.scale.activeBits.toString(), snapshot.stockMultiplierBits, 'snapshot stock multiplier differs from mint');
  assert.equal(stockMint.decimals, snapshot.stockDecimals, 'stock decimals mismatch');
  assert.equal(ptMint.decimals, snapshot.stockDecimals, 'PT decimals mismatch');
  assert.equal(drMint.decimals, snapshot.stockDecimals, 'DR decimals mismatch');
  assert.equal(quoteMint.decimals, snapshot.quoteDecimals, 'quote decimals mismatch');
  assert.equal(lpMint.decimals, snapshot.lpDecimals, 'LP decimals mismatch');
  assert.equal(ptMint.mintAuthority, null, 'PT mint authority survived finalization');
  assert.equal(drMint.mintAuthority, null, 'DR mint authority survived finalization');
  assert.equal(ptMint.freezeAuthority, null, 'PT freeze authority is non-null');
  assert.equal(drMint.freezeAuthority, null, 'DR freeze authority is non-null');

  const vault = requireTokenAccount(vaultAddress, info.vault, TOKEN_2022_PROGRAM_ID, stockMintAddress, seriesAddress, 'DividendX vault');
  assert.equal(vault.delegate, null, 'DividendX vault has a delegate');
  assert.equal(vault.closeAuthority, null, 'DividendX vault has an alternate close authority');
  const providerAccounts = {
    stock: requireTokenAccount(derivedAccounts.providerStock, info.providerStock, TOKEN_2022_PROGRAM_ID, stockMintAddress, provider, 'provider stock'),
    pt: requireTokenAccount(derivedAccounts.providerPt, info.providerPt, TOKEN_PROGRAM_ID, ptMintAddress, provider, 'provider PT'),
    dr: requireTokenAccount(derivedAccounts.providerDr, info.providerDr, TOKEN_PROGRAM_ID, drMintAddress, provider, 'provider DR'),
    quote: requireTokenAccount(derivedAccounts.providerQuote, info.providerQuote, TOKEN_PROGRAM_ID, quoteMintAddress, provider, 'provider quote'),
    lp: requireTokenAccount(derivedAccounts.providerLp, info.providerLp, TOKEN_PROGRAM_ID, lpMintAddress, provider, 'provider LP'),
  };
  const buyerAccounts = {
    stock: requireTokenAccount(derivedAccounts.buyerStock, info.buyerStock, TOKEN_2022_PROGRAM_ID, stockMintAddress, buyer, 'buyer stock'),
    pt: requireTokenAccount(derivedAccounts.buyerPt, info.buyerPt, TOKEN_PROGRAM_ID, ptMintAddress, buyer, 'buyer PT'),
    dr: requireTokenAccount(derivedAccounts.buyerDr, info.buyerDr, TOKEN_PROGRAM_ID, drMintAddress, buyer, 'buyer DR'),
    quote: requireTokenAccount(derivedAccounts.buyerQuote, info.buyerQuote, TOKEN_PROGRAM_ID, quoteMintAddress, buyer, 'buyer quote'),
    lpRaw: optionalTokenAmount(derivedAccounts.buyerLp, info.buyerLp, TOKEN_PROGRAM_ID, lpMintAddress, buyer, 'buyer LP'),
  };

  assert.ok(info.pool.owner.equals(RAYDIUM_PROGRAM_ID), 'pool is not owned by Raydium CPMM');
  const pool = CpmmPoolInfoLayout.decode(info.pool.data);
  assert.equal(pool.configId.toBase58(), RAYDIUM_CONFIG.toBase58(), 'pool config mismatch');
  assert.equal(pool.vaultA.toBase58(), poolVaultAAddress.toBase58(), 'pool vault A mismatch');
  assert.equal(pool.vaultB.toBase58(), poolVaultBAddress.toBase58(), 'pool vault B mismatch');
  assert.equal(pool.mintLp.toBase58(), lpMintAddress.toBase58(), 'pool LP mint mismatch');
  const expectedPool = getCpmmPdaPoolId(RAYDIUM_PROGRAM_ID, RAYDIUM_CONFIG,
    new PublicKey(pool.mintA.toBase58()), new PublicKey(pool.mintB.toBase58())).publicKey;
  assert.equal(expectedPool.toBase58(), poolAddress.toBase58(), 'pool PDA mismatch');
  const poolVaultA = requireTokenAccount(poolVaultAAddress, info.poolVaultA, TOKEN_PROGRAM_ID,
    new PublicKey(pool.mintA.toBase58()), null, 'pool vault A');
  const poolVaultB = requireTokenAccount(poolVaultBAddress, info.poolVaultB, TOKEN_PROGRAM_ID,
    new PublicKey(pool.mintB.toBase58()), null, 'pool vault B');
  const drIsA = pool.mintA.toBase58() === drMintAddress.toBase58();
  assert.ok(drIsA || pool.mintB.toBase58() === drMintAddress.toBase58(), 'pool does not contain DR');
  assert.equal(drIsA ? pool.mintB.toBase58() : pool.mintA.toBase58(), quoteMintAddress.toBase58(),
    'pool counter-mint is not the test quote');
  const poolDr = drIsA ? poolVaultA : poolVaultB;
  const poolQuote = drIsA ? poolVaultB : poolVaultA;
  equalKey(drIsA ? poolVaultAAddress : poolVaultBAddress, poolDrVaultAddress, 'receipt pool DR vault');
  equalKey(drIsA ? poolVaultBAddress : poolVaultAAddress, poolQuoteVaultAddress, 'receipt pool quote vault');
  const lockedLpRaw = BigInt(pool.lpAmount.toString());

  const actualWallet = {
    provider: {
      stockRaw: providerAccounts.stock.amount,
      ptRaw: providerAccounts.pt.amount,
      drRaw: providerAccounts.dr.amount,
      quoteRaw: providerAccounts.quote.amount,
      lpRaw: providerAccounts.lp.amount,
    },
    buyer: {
      stockRaw: buyerAccounts.stock.amount,
      ptRaw: buyerAccounts.pt.amount,
      drRaw: buyerAccounts.dr.amount,
      quoteRaw: buyerAccounts.quote.amount,
      lpRaw: buyerAccounts.lpRaw,
    },
  };
  for (const walletName of ['provider', 'buyer']) {
    for (const field of ['stockRaw', 'ptRaw', 'drRaw', 'quoteRaw', 'lpRaw']) {
      assert.equal(raw(snapshot[walletName][field], `${walletName}.${field}`), actualWallet[walletName][field],
        `snapshot ${walletName}.${field} differs from chain`);
    }
  }
  assert.equal(raw(snapshot.vaultRaw, 'snapshot vault'), vault.amount, 'snapshot vault differs from chain');
  assert.equal(raw(snapshot.ptSupplyRaw, 'snapshot PT supply'), ptMint.supply, 'snapshot PT supply differs from chain');
  assert.equal(raw(snapshot.drSupplyRaw, 'snapshot DR supply'), drMint.supply, 'snapshot DR supply differs from chain');
  assert.equal(raw(snapshot.pool.drRaw, 'snapshot pool DR'), poolDr.amount, 'snapshot pool DR differs from chain');
  assert.equal(raw(snapshot.pool.quoteRaw, 'snapshot pool quote'), poolQuote.amount, 'snapshot pool quote differs from chain');
  assert.equal(raw(snapshot.pool.lockedLpRaw, 'snapshot locked LP'), lockedLpRaw, 'snapshot locked LP differs from chain');

  assert.equal(providerAccounts.pt.amount, 0n, 'provider PT remains after redemption');
  assert.equal(providerAccounts.dr.amount, 0n, 'provider DR remains after recombination');
  assert.equal(providerAccounts.lp.amount, 0n, 'provider LP remains after withdrawal');
  assert.equal(buyerAccounts.pt.amount, 0n, 'buyer unexpectedly owns PT');
  assert.equal(buyerAccounts.dr.amount, 0n, 'buyer DR remains after redemption');
  assert.equal(buyerAccounts.lpRaw, 0n, 'buyer unexpectedly owns LP');
  assert.equal(ptMint.supply, 0n, 'PT mint supply remains after provider redemption');
  assert.equal(lpMint.supply, 0n, 'LP mint supply remains after provider withdrawal');
  assert.equal(poolDr.amount, EXPECTED_POOL_RESIDUAL_DR, 'Raydium residual DR differs from the fixed flow');
  assert.equal(drMint.supply, poolDr.amount, 'DR supply is not exactly the Raydium residual');
  assert.equal(stockMint.supply, providerAccounts.stock.amount + buyerAccounts.stock.amount + vault.amount,
    'stock raw supply is not conserved across wallets and custody');
  assert.equal(quoteMint.supply, providerAccounts.quote.amount + buyerAccounts.quote.amount + poolQuote.amount,
    'quote raw supply is not conserved across wallets and pool');

  const journal = await verifyJournal(connection, seriesAddress, accumulator, series);
  const obligations = requiredCustodyRaw(series);
  assert.equal(series.finalPtPoolRaw + series.finalDrPoolRaw, series.finalSupplyRaw, 'final pools do not sum to final supply');
  assert.equal(series.accountableRaw, series.finalSupplyRaw, 'final accountable amount differs from final supply');
  assert.equal(series.ptPaidRaw, series.redeemedPtClaimsRaw * series.finalPtPoolRaw / series.finalSupplyRaw,
    'PT cumulative payout counter is not exact');
  assert.equal(series.drPaidRaw, series.redeemedDrClaimsRaw * series.finalDrPoolRaw / series.finalSupplyRaw,
    'DR cumulative payout counter is not exact');
  assert.equal(series.ptPaidRaw + series.drPaidRaw + obligations, series.finalSupplyRaw,
    'paid collateral plus remaining obligations does not conserve final supply');
  assert.equal(vault.amount, obligations, 'vault is not exactly equal to remaining obligations');
  assert.equal(series.redeemedPtClaimsRaw, series.finalSupplyRaw, 'provider did not redeem the full remaining PT side');
  assert.equal(series.redeemedDrClaimsRaw + poolDr.amount, series.finalSupplyRaw,
    'redeemed DR plus Raydium residual does not equal final supply');
  const poolResidualPayout = (series.redeemedDrClaimsRaw + poolDr.amount) * series.finalDrPoolRaw / series.finalSupplyRaw
    - series.redeemedDrClaimsRaw * series.finalDrPoolRaw / series.finalSupplyRaw;
  assert.equal(poolResidualPayout, vault.amount, 'Raydium residual DR is not fully backed by remaining custody');
  assert.equal(snapshot.backingVerified, true, 'runtime snapshot did not report backing verification');

  return {
    identities: { programs, wallets, mints, dividendX, accounts, pool: poolAddress.toBase58() },
    responseSlot: response.context.slot,
    clock,
    policy,
    series,
    accumulator,
    journal,
    createPoolFeeLamports: createPoolFee,
    balances: {
      stockSupply: stockMint.supply,
      quoteSupply: quoteMint.supply,
      ptSupply: ptMint.supply,
      drSupply: drMint.supply,
      lpSupply: lpMint.supply,
      vault: vault.amount,
      poolDr: poolDr.amount,
      poolQuote: poolQuote.amount,
      lockedLp: lockedLpRaw,
      provider: actualWallet.provider,
      buyer: actualWallet.buyer,
    },
    obligations,
    poolResidualPayout,
  };
}

function verifyJourney(transactionProof, accounts, snapshot) {
  const { delta } = transactionProof;
  const provider = accounts.identities.wallets.provider;
  const buyer = accounts.identities.wallets.buyer;
  const { stock, pt, dr, quote, lp } = accounts.identities.mints;
  const stockUnit = 10n ** BigInt(accounts.policy.decimals);
  const splitRaw = 100n * stockUnit;
  assert.equal(delta('split', provider, stock), -splitRaw, 'split did not deposit exactly 100 test stock');
  assert.equal(delta('split', provider, pt), splitRaw, 'split did not mint exactly 100 PT');
  assert.equal(delta('split', provider, dr), splitRaw, 'split did not mint exactly 100 DR');

  const fixedQuoteUnit = 10n ** BigInt(snapshot.quoteDecimals);
  assert.equal(delta('create-pool', provider, dr), -40n * stockUnit, 'pool creation did not seed 40 DR');
  assert.equal(delta('create-pool', provider, quote), -80n * fixedQuoteUnit, 'pool creation did not seed 80 quote');
  assert.equal(delta('add-liquidity', provider, dr), -60n * stockUnit, 'liquidity addition did not add 60 DR');
  assert.equal(delta('add-liquidity', provider, quote), -120n * fixedQuoteUnit, 'liquidity addition did not add 120 quote');
  assert.equal(delta('buy-dr', buyer, quote), -20n * fixedQuoteUnit, 'buyer did not spend 20 quote');
  const buyerDrAcquired = delta('buy-dr', buyer, dr);
  assert.ok(buyerDrAcquired > 0n, 'buyer did not acquire DR through Raydium');
  assert.ok(snapshot.swap, 'final snapshot lacks the swap record');
  assert.equal(raw(snapshot.swap.inputQuoteRaw, 'snapshot swap input'), 20n * fixedQuoteUnit,
    'snapshot swap input differs from the fixed flow');
  assert.equal(raw(snapshot.swap.outputDrRaw, 'snapshot swap output'), buyerDrAcquired,
    'snapshot swap output differs from transaction balances');
  assert.ok(raw(snapshot.swap.minimumDrRaw, 'snapshot minimum DR') <= buyerDrAcquired,
    'snapshot swap output is below its minimum');
  assert.ok(delta('remove-liquidity', provider, lp) < 0n, 'provider did not burn LP on withdrawal');

  const recombinedPt = -delta('recombine', provider, pt);
  const recombinedDr = -delta('recombine', provider, dr);
  const recombinedStock = delta('recombine', provider, stock);
  assert.ok(recombinedPt > 0n && recombinedPt === recombinedDr && recombinedPt === recombinedStock,
    'provider recombination token deltas are not equal and positive');
  assert.equal(recombinedPt + accounts.series.finalSupplyRaw, splitRaw,
    'provider recombination does not explain final supply');

  const buyerDrBurned = -delta('redeem-buyer', buyer, dr);
  const buyerStockPaid = delta('redeem-buyer', buyer, stock);
  assert.equal(buyerDrBurned, buyerDrAcquired, 'buyer did not redeem exactly the DR acquired through Raydium');
  assert.equal(buyerDrBurned, accounts.series.redeemedDrClaimsRaw, 'buyer burn does not match the DR redemption counter');
  assert.equal(buyerStockPaid, accounts.series.drPaidRaw, 'buyer stock payout does not match cumulative DR payout');

  const providerPtBurned = -delta('redeem-provider', provider, pt);
  const providerStockPaid = delta('redeem-provider', provider, stock);
  assert.equal(providerPtBurned, accounts.series.redeemedPtClaimsRaw, 'provider PT burn does not match redemption counter');
  assert.equal(providerStockPaid, accounts.series.ptPaidRaw, 'provider stock payout does not match cumulative PT payout');
  return {
    splitRaw,
    buyerQuoteSpentRaw: 20n * fixedQuoteUnit,
    buyerDrAcquiredRaw: buyerDrAcquired,
    buyerDrRedeemedRaw: buyerDrBurned,
    buyerStockPayoutRaw: buyerStockPaid,
    providerRecombinedRaw: recombinedPt,
    providerPtRedeemedRaw: providerPtBurned,
    providerStockPayoutRaw: providerStockPaid,
  };
}

function publicJson(value) {
  return JSON.stringify(value, (_name, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2);
}

async function writeOutput(path, output) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${output}\n`, { mode: 0o644 });
  await rename(temporary, path);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/protocol/guided-runtime-verify.mjs [--output FILE]\n');
    return;
  }
  const initialState = await fetchJson('/state');
  const receiptValue = await fetchJson('/receipt');
  const { state, receipt, snapshot } = validateStateAndReceipt(initialState, receiptValue);
  const rpcUrl = loopbackUrl(snapshot.rpcUrl, 'guided RPC URL');
  const connection = new Connection(rpcUrl.toString(), {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    fetch: boundedFetch,
  });
  const actualGenesisHash = await connection.getGenesisHash();
  assert.equal(actualGenesisHash, snapshot.genesisHash, 'snapshot genesis hash differs from RPC');
  assert.ok(!PUBLIC_GENESIS_HASHES.has(actualGenesisHash), 'guided RPC reports a public-cluster genesis hash');

  const identities = object(receipt.identities, 'receipt identities');
  const [dividendXProgram, raydiumProgram] = await Promise.all([
    programIdentity(connection, DIVIDENDX_PROGRAM_ID, EXPECTED_DIVIDENDX_HASH),
    programIdentity(connection, RAYDIUM_PROGRAM_ID, EXPECTED_RAYDIUM_HASH),
  ]);
  assert.equal(raydiumProgram.programData, RAYDIUM_PROGRAM_DATA.toBase58(), 'actual Raydium ProgramData mismatch');
  const accountProof = await verifyAccounts(connection, snapshot, receipt);
  const transactionProof = await verifyTransactions(connection, receipt, identities);
  const journey = verifyJourney(transactionProof, accountProof, snapshot);

  const endingState = await fetchJson('/state');
  assert.equal(endingState.runtimeId, state.runtimeId, 'runtime restarted during verification');
  assert.equal(endingState.sessionId, state.sessionId, 'guided session changed during verification');
  assert.equal(endingState.revision, state.revision, 'guided state changed during verification');
  assert.equal(await connection.getGenesisHash(), actualGenesisHash, 'RPC genesis changed during verification');

  const output = {
    schemaVersion: 1,
    ok: true,
    verifiedAt: new Date().toISOString(),
    runtimeId: state.runtimeId,
    sessionId: state.sessionId,
    revision: state.revision,
    rpcUrl: rpcUrl.toString(),
    genesisHash: actualGenesisHash,
    slot: accountProof.responseSlot,
    checks: {
      fixedNineStepJourney: true,
      allReportedTransactionsConfirmed: true,
      actualProgramPayloads: { dividendX: dividendXProgram, raydium: raydiumProgram },
      actualJournal: accountProof.journal,
      actualCreatePoolFeeLamports: accountProof.createPoolFeeLamports,
      journey,
      series: {
        address: accountProof.series.address.toBase58(),
        phase: accountProof.series.phase,
        eventCount: accountProof.series.eventCount,
        finalSupplyRaw: accountProof.series.finalSupplyRaw,
        ptPoolRaw: accountProof.series.finalPtPoolRaw,
        drPoolRaw: accountProof.series.finalDrPoolRaw,
        ptRedeemedNominalRaw: accountProof.series.redeemedPtClaimsRaw,
        drRedeemedNominalRaw: accountProof.series.redeemedDrClaimsRaw,
        ptPaidRaw: accountProof.series.ptPaidRaw,
        drPaidRaw: accountProof.series.drPaidRaw,
      },
      custody: {
        vaultRaw: accountProof.balances.vault,
        remainingObligationsRaw: accountProof.obligations,
        raydiumResidualDrRaw: accountProof.balances.poolDr,
        raydiumResidualPayoutRaw: accountProof.poolResidualPayout,
        exactConservation: true,
      },
      supplies: {
        stockRaw: accountProof.balances.stockSupply,
        quoteRaw: accountProof.balances.quoteSupply,
        ptRaw: accountProof.balances.ptSupply,
        drRaw: accountProof.balances.drSupply,
        lpRaw: accountProof.balances.lpSupply,
        lockedLpRaw: accountProof.balances.lockedLp,
      },
    },
    signatures: transactionProof.signatures,
  };
  const encoded = publicJson(output);
  if (options.output) await writeOutput(options.output, encoded);
  process.stdout.write(`${encoded}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, stage: 'guided-runtime-verify', error: errorText(error) })}\n`);
  process.exitCode = 1;
}
