#!/usr/bin/env node
/** Private, resumable 15-profile devnet holder proof. Run only after the devnet runtime is built. */
import { readFile, lstat, mkdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction, getAssociatedTokenAddressSync, unpackMint,
} from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DividendXInstructions, fetchQuoteSnapshot, quoteDeposit, quoteRecombine,
} from '@dividendx/transaction-sdk';
import { ADMIN_ID, PROFILES } from '../../packages/devnet-runtime/dist/src/constants.js';
import { connectionForRpc } from '../../packages/devnet-runtime/dist/src/config.js';
import { verifyDevnetEnvironment } from '../../packages/devnet-runtime/dist/src/environment.js';
import { assertManifestCurrent, loadRegistryManifest } from '../../packages/devnet-runtime/dist/src/manifest.js';
import {
  ensurePrivateStateDirectory, loadExplicitSigner, loadOrCreateStateSigner,
  readPrivateState, writePrivateJson, writePublicJson,
} from '../../packages/devnet-runtime/dist/src/private-state.js';
import { executeResumableStep } from '../../packages/devnet-runtime/dist/src/transactions.js';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOLDER_TARGET = 120_000_000n;
const MAX_ADMIN_SPEND = HOLDER_TARGET + 10_000n; // one funding signature fee; holder pays every other fee
const JOURNAL_SCHEMA = 'dividendx-catalog-review-private-v1';
const RECEIPT_SCHEMA = 'dividendx-devnet-catalog-holder-proof-v1';
const builders = new DividendXInstructions(DIVIDENDX_IDL);
const EXPECTED_IDS = Object.freeze([
  'xstocks-test-kox', 'xstocks-test-aapl', 'xstocks-test-msft', 'xstocks-test-mu',
  'xstocks-test-nke', 'xstocks-test-ibm', 'backpack-test-mu', 'backpack-test-nke',
  'backpack-test-ibm', 'ondo-test-ko', 'ondo-test-aapl', 'ondo-test-msft',
  'ondo-test-mu', 'ondo-test-nke', 'ondo-test-ibm',
]);

function assert(condition, code) { if (!condition) throw new Error(code); }
function key(value) { return new PublicKey(value); }
function equal(left, right) { assert(BigInt(left) === BigInt(right), 'CONSERVATION_FAILED'); }
function raw(snapshot) {
  return {
    collateral: snapshot.holderCollateralRaw,
    pt: snapshot.holderPtRaw,
    dr: snapshot.holderDrRaw,
    vault: snapshot.vaultRaw,
    accountable: snapshot.series.accountableRaw,
  };
}

export function assertExactCatalog(assets) {
  assert(Array.isArray(assets) && assets.length === 15, 'CATALOG_REQUIRES_15_ASSETS');
  const ids = assets.map((asset) => asset.id);
  assert(new Set(ids).size === 15 && ids.every((id) => EXPECTED_IDS.includes(id)), 'CATALOG_ID_MISMATCH');
  assert(PROFILES.length === 15 && PROFILES.every((profile) => ids.includes(profile.id)), 'PROFILE_SET_MISMATCH');
  for (const asset of assets) {
    const profile = PROFILES.find((candidate) => candidate.id === asset.id);
    assert(profile && asset.symbol === profile.symbol && asset.decimals === profile.decimals,
      'CATALOG_PROFILE_MISMATCH');
  }
}

export function verifyPhase(phase, baseline, observed, amount) {
  const b = Object.fromEntries(Object.entries(baseline).map(([name, value]) => [name, BigInt(value)]));
  const o = Object.fromEntries(Object.entries(observed).map(([name, value]) => [name, BigInt(value)]));
  const n = BigInt(amount);
  if (phase === 'minted') {
    equal(o.collateral, b.collateral + n); equal(o.pt, b.pt); equal(o.dr, b.dr);
    equal(o.vault, b.vault); equal(o.accountable, b.accountable);
  } else if (phase === 'deposited') {
    equal(o.collateral, b.collateral); equal(o.pt, b.pt + n); equal(o.dr, b.dr + n);
    equal(o.vault, b.vault + n); equal(o.accountable, b.accountable + n);
  } else if (phase === 'recombined') {
    equal(o.collateral, b.collateral + n); equal(o.pt, b.pt); equal(o.dr, b.dr);
    equal(o.vault, b.vault); equal(o.accountable, b.accountable);
  } else throw new Error('PHASE_INVALID');
}

function flagsFrom(args) {
  assert(args.length % 2 === 0, 'CLI_USAGE');
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]; const value = args[i + 1];
    assert(name?.startsWith('--') && value && !value.startsWith('--') && !flags.has(name), 'CLI_USAGE');
    flags.set(name, value);
  }
  assert([...flags.keys()].every((name) => ['--state-dir', '--admin-signer', '--manifest'].includes(name))
    && flags.size === 3, 'CLI_USAGE');
  return Object.fromEntries([...flags].map(([name, value]) => [name.slice(2), resolve(value)]));
}

async function readJournal(path) {
  try {
    const info = await lstat(path);
    assert(info.isFile() && !info.isSymbolicLink() && info.nlink === 1
      && info.uid === process.getuid() && (info.mode & 0o077) === 0, 'QA_JOURNAL_UNSAFE');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function confirmedSignature(connection, signature) {
  const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
  assert(status && status.err === null && ['confirmed', 'finalized'].includes(status.confirmationStatus),
    'SIGNATURE_NOT_CONFIRMED');
}

async function runStep(context, journal, name, check, payer, instructions, signers = []) {
  if (journal.completed[name]) {
    const recorded = journal.steps[name]?.attempts.at(-1)?.signature;
    assert(recorded === journal.completed[name], 'QA_JOURNAL_SIGNATURE_MISMATCH');
    await confirmedSignature(context.connection, recorded);
    return recorded;
  }
  await executeResumableStep(context, name, check, payer, instructions, signers);
  const recorded = journal.steps[name]?.attempts.at(-1)?.signature;
  assert(recorded, 'QA_STEP_WITHOUT_SIGNED_TRANSACTION');
  await confirmedSignature(context.connection, recorded);
  assert(await check(), 'QA_STEP_POSTCONDITION_FAILED');
  journal.completed[name] = recorded;
  await writePrivateJson(context.statePath, journal);
  return recorded;
}

async function tokenSupply(connection, mint) {
  return BigInt((await connection.getTokenSupply(mint, 'confirmed')).value.amount);
}

async function putPublic(path, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  try { await writePublicJson(path, value); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert(await readFile(path, 'utf8') === contents, 'PUBLIC_RECEIPT_CONFLICT');
  }
}

async function main() {
  const options = flagsFrom(process.argv.slice(2));
  const stateDirectory = await ensurePrivateStateDirectory(options['state-dir'], REPOSITORY);
  const manifest = await loadRegistryManifest(options.manifest);
  assertExactCatalog(manifest.assets);
  const connection = connectionForRpc(manifest.rpcUrl);
  await assertManifestCurrent(connection, manifest); // devnet genesis, pinned ELF, program authority and every series
  const environment = await verifyDevnetEnvironment(connection);
  const state = await readPrivateState(join(stateDirectory, 'state.json'));
  assert(state.runtimeId === manifest.runtimeId && state.genesisHash === manifest.genesisHash
    && state.programId === manifest.programId, 'STATE_IDENTITY_MISMATCH');
  const admin = await loadExplicitSigner(options['admin-signer'], ADMIN_ID.toBase58());
  const faucet = await loadExplicitSigner(join(stateDirectory, 'faucet.json'), state.publicKeys.faucet);
  const holder = await loadOrCreateStateSigner(stateDirectory, 'catalog-review-holder');
  assert(!holder.publicKey.equals(admin.publicKey) && !holder.publicKey.equals(faucet.publicKey),
    'SIGNER_SEPARATION_REQUIRED');
  const journalPath = join(stateDirectory, 'catalog-review-journal.json');
  let journal = await readJournal(journalPath);
  if (!journal) {
    assert(await connection.getBalance(holder.publicKey, 'confirmed') === 0, 'UNJOURNALED_HOLDER_BALANCE');
    journal = {
      schema: JOURNAL_SCHEMA, runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash,
      holder: holder.publicKey.toBase58(), admin: admin.publicKey.toBase58(),
      faucet: faucet.publicKey.toBase58(), initialAdminLamports: String(await connection.getBalance(admin.publicKey, 'confirmed')),
      fundingLamports: HOLDER_TARGET.toString(), steps: {}, completed: {}, baselines: {}, receipts: {},
    };
    await writePrivateJson(journalPath, journal);
  }
  assert(journal.schema === JOURNAL_SCHEMA && journal.runtimeId === manifest.runtimeId
    && journal.genesisHash === manifest.genesisHash && journal.holder === holder.publicKey.toBase58()
    && journal.admin === admin.publicKey.toBase58() && journal.faucet === faucet.publicKey.toBase58()
    && journal.fundingLamports === HOLDER_TARGET.toString(), 'QA_JOURNAL_IDENTITY_MISMATCH');
  const context = { connection, state: journal, statePath: journalPath,
    adminAddress: admin.publicKey.toBase58(),
    budget: { initialLamports: BigInt(journal.initialAdminLamports), maxSpendLamports: MAX_ADMIN_SPEND } };
  if (!journal.completed['fund-holder']) {
    const current = BigInt(await connection.getBalance(holder.publicKey, 'confirmed'));
    assert(current === 0n || current === HOLDER_TARGET, 'QA_HOLDER_FUNDING_STATE_UNEXPECTED');
  }
  await runStep(context, journal, 'fund-holder',
    async () => await connection.getBalance(holder.publicKey, 'confirmed') === Number(HOLDER_TARGET),
    admin, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: holder.publicKey,
      lamports: Number(HOLDER_TARGET) })]);

  const qaDirectory = join(REPOSITORY, 'packages/devnet-runtime/qa');
  await mkdir(qaDirectory, { recursive: true });
  assert(await realpath(qaDirectory) === qaDirectory, 'QA_OUTPUT_DIRECTORY_UNSAFE');
  for (const asset of manifest.assets) {
    const id = asset.id;
    const series = asset.series[0];
    const mint = key(asset.collateralMint);
    const info = await connection.getAccountInfo(mint, 'confirmed');
    assert(info?.owner.equals(TOKEN_2022_PROGRAM_ID), 'MINT_OWNER_MISMATCH');
    const profile = unpackMint(mint, info, TOKEN_2022_PROGRAM_ID);
    assert(profile.decimals === asset.decimals && profile.mintAuthority?.equals(faucet.publicKey),
      'MINT_AUTHORITY_MISMATCH');
    const amount = 10n ** BigInt(asset.decimals);
    const collateral = getAssociatedTokenAddressSync(mint, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const ptMint = key(series.ptMint); const drMint = key(series.drMint);
    const pt = getAssociatedTokenAddressSync(ptMint, holder.publicKey);
    const dr = getAssociatedTokenAddressSync(drMint, holder.publicKey);
    const addresses = { holder: holder.publicKey, assetPolicy: key(asset.assetPolicy), series: key(series.address),
      accumulator: key(series.accumulator), collateralMint: mint, vault: key(series.vault),
      holderCollateral: collateral, holderPt: pt, holderDr: dr };
    const snapshot = async () => fetchQuoteSnapshot(connection, DIVIDENDX_IDL, addresses);
    const step = (label) => `${id}:${label}`;
    const receiptPath = join(qaDirectory, `${id}.json`);
    if (journal.receipts[id]) {
      assert(journal.completed[step('atas')] && journal.completed[step('mint')]
        && journal.completed[step('deposit')] && journal.completed[step('recombine')],
      'QA_RECEIPT_WITHOUT_STEPS');
      for (const label of ['atas', 'mint', 'deposit', 'recombine']) {
        await confirmedSignature(connection, journal.completed[step(label)]);
      }
      verifyPhase('recombined', journal.baselines[id], raw(await snapshot()), amount);
      await putPublic(receiptPath, journal.receipts[id]);
      continue;
    }
    if (!journal.steps[step('atas')]) {
      const accounts = await connection.getMultipleAccountsInfo([collateral, pt, dr], 'confirmed');
      assert(accounts.every((account) => account === null), 'UNJOURNALED_HOLDER_ATA');
    }
    await runStep(context, journal, step('atas'), async () => {
      const accounts = await connection.getMultipleAccountsInfo([collateral, pt, dr], 'confirmed');
      return accounts.every((account) => account !== null);
    }, holder, [
      createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, collateral, holder.publicKey, mint, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, pt, holder.publicKey, ptMint),
      createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, dr, holder.publicKey, drMint),
    ]);
    if (!journal.baselines[id]) {
      const before = await snapshot();
      const start = raw(before);
      equal(start.collateral, 0); equal(start.pt, 0); equal(start.dr, 0);
      journal.baselines[id] = { ...Object.fromEntries(Object.entries(start).map(([name, value]) => [name, value.toString()])),
        collateralSupply: (await tokenSupply(connection, mint)).toString(),
        ptSupply: (await tokenSupply(connection, ptMint)).toString(),
        drSupply: (await tokenSupply(connection, drMint)).toString() };
      await writePrivateJson(journalPath, journal);
    }
    const baseline = journal.baselines[id];
    const holderAccounts = { holder: holder.publicKey, assetPolicy: addresses.assetPolicy, series: addresses.series,
      collateralMint: mint, vault: addresses.vault, holderCollateral: collateral,
      ptMint, drMint, holderPt: pt, holderDr: dr, tokenProgram: TOKEN_PROGRAM_ID,
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID };
    if (!journal.completed[step('mint')]) {
      const beforeMint = raw(await snapshot());
      const alreadyMinted = (() => {
        try { verifyPhase('minted', baseline, beforeMint, amount); return true; } catch { return false; }
      })();
      if (!alreadyMinted) {
        for (const field of ['collateral', 'pt', 'dr', 'vault', 'accountable']) {
          equal(beforeMint[field], baseline[field]);
        }
      }
    }
    await runStep(context, journal, step('mint'), async () => {
      const observed = raw(await snapshot());
      try { verifyPhase('minted', baseline, observed, amount); return true; } catch { return false; }
    }, holder, [createMintToCheckedInstruction(mint, collateral, faucet.publicKey, amount,
      asset.decimals, [], TOKEN_2022_PROGRAM_ID)], [faucet]);
    assert(await tokenSupply(connection, mint) === BigInt(baseline.collateralSupply) + amount,
      'COLLATERAL_SUPPLY_MISMATCH');
    const deposited = async () => {
      const observed = raw(await snapshot());
      try { verifyPhase('deposited', baseline, observed, amount); return true; } catch { return false; }
    };
    let depositInstructions = [];
    if (!journal.completed[step('deposit')] && !await deposited()) {
      const forDeposit = await snapshot();
      verifyPhase('minted', baseline, raw(forDeposit), amount);
      const depositQuote = quoteDeposit(forDeposit.series, forDeposit.policy, forDeposit.vaultRaw,
        amount, forDeposit.holderCollateralRaw, forDeposit.clock, forDeposit.clock.unixTimestamp + 300n);
      depositInstructions = [builders.holder.deposit(holderAccounts, amount, depositQuote.guard)];
    }
    await runStep(context, journal, step('deposit'), deposited, holder, depositInstructions);
    if (!journal.steps[step('recombine')]) {
      assert(await tokenSupply(connection, ptMint) === BigInt(baseline.ptSupply) + amount
        && await tokenSupply(connection, drMint) === BigInt(baseline.drSupply) + amount,
      'CLAIM_SUPPLY_MISMATCH');
    }
    const recombined = async () => {
      const observed = raw(await snapshot());
      try { verifyPhase('recombined', baseline, observed, amount); return true; } catch { return false; }
    };
    let recombineInstructions = [];
    if (!journal.completed[step('recombine')] && !await recombined()) {
      const forRecombine = await snapshot();
      verifyPhase('deposited', baseline, raw(forRecombine), amount);
      const recombineQuote = quoteRecombine(forRecombine.series, forRecombine.vaultRaw,
        amount, forRecombine.holderPtRaw, forRecombine.holderDrRaw,
        forRecombine.clock.unixTimestamp, forRecombine.clock.unixTimestamp + 300n);
      recombineInstructions = [builders.holder.recombine(holderAccounts, amount, recombineQuote.guard)];
    }
    await runStep(context, journal, step('recombine'), recombined, holder, recombineInstructions);
    assert(await tokenSupply(connection, ptMint) === BigInt(baseline.ptSupply)
      && await tokenSupply(connection, drMint) === BigInt(baseline.drSupply)
      && await tokenSupply(connection, mint) === BigInt(baseline.collateralSupply) + amount,
    'FINAL_SUPPLY_MISMATCH');
    const receipt = {
      schema: RECEIPT_SCHEMA, boundary: 'synthetic-public-devnet', runtimeId: manifest.runtimeId,
      genesisHash: manifest.genesisHash, programId: manifest.programId, elfSha256: environment.elfSha256,
      holder: holder.publicKey.toBase58(),
      assetId: id, symbol: asset.symbol, collateralMint: asset.collateralMint,
      series: series.address, amountRaw: amount.toString(),
      signatures: { createAccounts: journal.completed[step('atas')], mint: journal.completed[step('mint')],
        deposit: journal.completed[step('deposit')], recombine: journal.completed[step('recombine')] },
      conservation: { baseline, final: Object.fromEntries(Object.entries(raw(await snapshot()))
        .map(([name, value]) => [name, value.toString()])) },
    };
    assert(!JSON.stringify(receipt).includes(stateDirectory), 'PUBLIC_RECEIPT_PRIVATE_PATH');
    journal.receipts[id] = receipt;
    await writePrivateJson(journalPath, journal);
    await putPublic(receiptPath, receipt);
    process.stdout.write(`${id}: verified\n`);
  }
  const spent = BigInt(journal.initialAdminLamports) - BigInt(await connection.getBalance(admin.publicKey, 'confirmed'));
  assert(spent >= 0n && spent <= MAX_ADMIN_SPEND, 'QA_ADMIN_BUDGET_EXCEEDED');
  assert(Object.keys(journal.receipts).length === 15, 'QA_INCOMPLETE');
  const summary = { schema: RECEIPT_SCHEMA, boundary: 'synthetic-public-devnet', runtimeId: manifest.runtimeId,
    genesisHash: manifest.genesisHash, programId: manifest.programId, elfSha256: environment.elfSha256,
    holder: holder.publicKey.toBase58(),
    fundingSignature: journal.completed['fund-holder'], fundingLamports: HOLDER_TARGET.toString(),
    adminSpentLamports: spent.toString(), assetCount: 15,
    assets: manifest.assets.map(({ id }) => ({ id, receipt: `${id}.json`,
      signatures: journal.receipts[id].signatures })) };
  await putPublic(join(qaDirectory, 'summary.json'), summary);
  process.stdout.write('15 profile holder proofs verified.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Keep private paths, serialized transactions and signer details out of logs.
    process.stderr.write(`${error instanceof Error ? error.message.split(':')[0] : 'QA_FAILED'}\n`);
    process.exitCode = 1;
  });
}
