import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Idl } from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createMintToCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getMint,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  DividendXInstructions,
  DIVIDENDX_IDL,
  annualSeriesAddresses,
  assetPolicyPda,
  buildRecentUnsignedTransaction,
  configPda,
  fetchClock,
  fetchProgramAccountsCoherently,
  fetchQuoteSnapshot,
  issuerIdentityHash,
  programDataAddress,
  quoteDeposit,
  quoteRecombine,
  signWithSignersSubmitAndConfirm,
} from '../src/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const programPath = resolve(repositoryRoot, 'target/deploy/dividendx.so');
const idlPath = resolve(packageRoot, 'idl/dividendx.json');
const rpcPort = Number(process.env.DIVIDENDX_SMOKE_RPC_PORT ?? 18_899);
const endpoint = `http://127.0.0.1:${rpcPort}`;

async function waitForRpc(connection: Connection, validator: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (validator.exitCode !== null) throw new Error(`validator exited early with code ${validator.exitCode}`);
    try {
      await connection.getVersion();
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw new Error('local validator did not expose RPC within 30 seconds');
}

async function digest(label: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)));
}

async function main(): Promise<void> {
  const idl = JSON.parse(await readFile(idlPath, 'utf8')) as Idl;
  const upgradeAuthority = Keypair.generate();
  const holder = Keypair.generate();
  const attestor = Keypair.generate();
  const mint = Keypair.generate();
  const temp = await mkdtemp(resolve(tmpdir(), 'dividendx-sdk-smoke-'));
  const authorityPath = resolve(temp, 'upgrade-authority.json');
  const ledgerPath = resolve(temp, 'ledger');
  await writeFile(authorityPath, JSON.stringify(Array.from(upgradeAuthority.secretKey)), { mode: 0o600 });

  const toolchain = resolve(repositoryRoot, 'scripts/protocol/toolchain.sh');
  const validator = spawn(toolchain, [
    'exec',
    'solana-test-validator',
    '--reset',
    '--quiet',
    '--ledger', ledgerPath,
    '--bind-address', '127.0.0.1',
    '--rpc-port', String(rpcPort),
    '--upgradeable-program',
    '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE',
    programPath,
    authorityPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let validatorErrors = '';
  validator.stderr?.on('data', (chunk) => { validatorErrors = `${validatorErrors}${String(chunk)}`.slice(-8_000); });
  validator.stdout?.on('data', (chunk) => { validatorErrors = `${validatorErrors}${String(chunk)}`.slice(-8_000); });

  try {
    const connection = new Connection(endpoint, 'confirmed');
    await waitForRpc(connection, validator);
    const token2022 = await connection.getAccountInfo(TOKEN_2022_PROGRAM_ID, 'confirmed');
    assert.equal(token2022?.executable, true, 'canonical Token-2022 program is unavailable');
    const airdrops = await Promise.all([upgradeAuthority, holder, attestor].map(async (signer) => {
      const signature = await connection.requestAirdrop(signer.publicKey, 5_000_000_000);
      const latest = await connection.getLatestBlockhash('confirmed');
      return connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    }));
    for (const result of airdrops) assert.equal(result.value.err, null);

    const builders = new DividendXInstructions(idl);
    const config = configPda().address;
    const genesisHash = await connection.getGenesisHash();
    const deploymentDomain = new PublicKey(genesisHash).toBytes();
    const send = async (instructions: readonly TransactionInstruction[], signers: Keypair[], payer = signers[0]!) => {
      const transaction = await buildRecentUnsignedTransaction(connection, payer.publicKey, instructions);
      return signWithSignersSubmitAndConfirm(connection, transaction, signers);
    };

    await send([builders.admin.initializeConfig({
      config,
      program: builders.raw.programId,
      programData: programDataAddress(),
      upgradeAuthority: upgradeAuthority.publicKey,
      systemProgram: SystemProgram.programId,
    }, deploymentDomain)], [upgradeAuthority]);

    const mintSpace = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintSpace);
    await send([
      SystemProgram.createAccount({
        fromPubkey: upgradeAuthority.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: mintRent,
        space: mintSpace,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeScaledUiAmountConfigInstruction(mint.publicKey, upgradeAuthority.publicKey, 1, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, 6, upgradeAuthority.publicKey, upgradeAuthority.publicKey, TOKEN_2022_PROGRAM_ID),
    ], [upgradeAuthority, mint], upgradeAuthority);

    const issuerId = await issuerIdentityHash(`localnet:${genesisHash}`, 'sdk-smoke-issuer');
    const assetPolicy = assetPolicyPda(issuerId, mint.publicKey).address;
    await send([builders.admin.registerAsset({
      config,
      admin: upgradeAuthority.publicKey,
      collateralMint: mint.publicKey,
      assetPolicy,
      systemProgram: SystemProgram.programId,
    }, {
      issuerId,
      symbol: 'SMK',
      attestor: attestor.publicKey,
      policyDigest: await digest('sdk-smoke-policy'),
    })], [upgradeAuthority]);

    const chainClock = await fetchClock(connection);
    const currentClock = chainClock.unixTimestamp;
    await send([builders.attestor.refreshObservation({
      attestor: attestor.publicKey,
      assetPolicy,
      collateralMint: mint.publicKey,
    }, await digest('sdk-smoke-observation'), currentClock + 3_600n)], [attestor]);

    const year = new Date(Number(currentClock) * 1_000).getUTCFullYear() + 1;
    assert.ok(year <= 2100);
    const addresses = annualSeriesAddresses(issuerId, mint.publicKey, year);
    await send([builders.permissionless.createSeries({
      payer: upgradeAuthority.publicKey,
      assetPolicy,
      series: addresses.series,
      accumulator: addresses.accumulator,
      ptMint: addresses.ptMint,
      drMint: addresses.drMint,
      collateralMint: mint.publicKey,
      vault: addresses.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }, year)], [upgradeAuthority]);

    const holderCollateral = getAssociatedTokenAddressSync(mint.publicKey, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const holderPt = getAssociatedTokenAddressSync(addresses.ptMint, holder.publicKey, false, TOKEN_PROGRAM_ID);
    const holderDr = getAssociatedTokenAddressSync(addresses.drMint, holder.publicKey, false, TOKEN_PROGRAM_ID);
    await send([
      createAssociatedTokenAccountInstruction(upgradeAuthority.publicKey, holderCollateral, holder.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountInstruction(upgradeAuthority.publicKey, holderPt, holder.publicKey, addresses.ptMint, TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountInstruction(upgradeAuthority.publicKey, holderDr, holder.publicKey, addresses.drMint, TOKEN_PROGRAM_ID),
      createMintToCheckedInstruction(mint.publicKey, holderCollateral, upgradeAuthority.publicKey, 1_000_000n, 6, [], TOKEN_2022_PROGRAM_ID),
    ], [upgradeAuthority]);

    const holderAccounts = {
      holder: holder.publicKey,
      assetPolicy,
      series: addresses.series,
      collateralMint: mint.publicKey,
      vault: addresses.vault,
      holderCollateral,
      ptMint: addresses.ptMint,
      drMint: addresses.drMint,
      holderPt,
      holderDr,
      tokenProgram: TOKEN_PROGRAM_ID,
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
    };
    const quoteAddresses = {
      ...holderAccounts,
      accumulator: addresses.accumulator,
    };
    const fundingSnapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL, quoteAddresses);
    const depositQuote = quoteDeposit(
      fundingSnapshot.series, fundingSnapshot.policy, fundingSnapshot.vaultRaw,
      1_000n, fundingSnapshot.holderCollateralRaw!, fundingSnapshot.clock,
      fundingSnapshot.clock.unixTimestamp + 300n,
    );
    const depositReceipt = await send([
      builders.holder.deposit(holderAccounts, depositQuote.inputRaw, depositQuote.guard),
    ], [holder]);

    const snapshot = async () => {
      const [programSnapshot, vault, collateral, pt, dr, ptMint, drMint] = await Promise.all([
        fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL, [{ address: addresses.series, accountName: 'series' }]),
        getAccount(connection, addresses.vault, 'confirmed', TOKEN_2022_PROGRAM_ID),
        getAccount(connection, holderCollateral, 'confirmed', TOKEN_2022_PROGRAM_ID),
        getAccount(connection, holderPt, 'confirmed', TOKEN_PROGRAM_ID),
        getAccount(connection, holderDr, 'confirmed', TOKEN_PROGRAM_ID),
        getMint(connection, addresses.ptMint, 'confirmed', TOKEN_PROGRAM_ID),
        getMint(connection, addresses.drMint, 'confirmed', TOKEN_PROGRAM_ID),
      ]);
      const series = programSnapshot.accounts[0]!.value;
      const nominalBacking = series.nominalBacking;
      const stateVersion = series.stateVersion;
      if (typeof nominalBacking !== 'bigint' || typeof stateVersion !== 'bigint') throw new Error('series u64 fields did not decode losslessly');
      return {
        nominalBacking,
        stateVersion,
        vaultRaw: vault.amount,
        holderCollateralRaw: collateral.amount,
        holderPtRaw: pt.amount,
        holderDrRaw: dr.amount,
        ptSupplyRaw: ptMint.supply,
        drSupplyRaw: drMint.supply,
      };
    };
    assert.deepEqual(await snapshot(), {
      nominalBacking: 1_000n,
      stateVersion: 1n,
      vaultRaw: 1_000n,
      holderCollateralRaw: 999_000n,
      holderPtRaw: 1_000n,
      holderDrRaw: 1_000n,
      ptSupplyRaw: 1_000n,
      drSupplyRaw: 1_000n,
    });

    const pairedSnapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL, quoteAddresses);
    const pairedQuote = quoteRecombine(
      pairedSnapshot.series, pairedSnapshot.vaultRaw, 100n,
      pairedSnapshot.holderPtRaw!, pairedSnapshot.holderDrRaw!,
      pairedSnapshot.clock.unixTimestamp, pairedSnapshot.clock.unixTimestamp + 300n,
    );
    const recombineReceipt = await send([
      builders.holder.recombine(holderAccounts, pairedQuote.ptInputRaw, pairedQuote.guard),
    ], [holder]);
    const beforeRollback = await snapshot();
    assert.deepEqual(beforeRollback, {
      nominalBacking: 900n,
      stateVersion: 2n,
      vaultRaw: 900n,
      holderCollateralRaw: 999_100n,
      holderPtRaw: 900n,
      holderDrRaw: 900n,
      ptSupplyRaw: 900n,
      drSupplyRaw: 900n,
    });
    const rollbackInstructions = [
      builders.holder.recombine(holderAccounts, 100n, {
        expectedStateVersion: 2n,
        expiryUnixTimestamp: currentClock + 300n,
        minimumRawOutput: 100n,
      }),
      SystemProgram.transfer({ fromPubkey: holder.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 100_000_000_000n }),
    ];
    const rollback = await buildRecentUnsignedTransaction(connection, holder.publicKey, rollbackInstructions);
    rollback.partialSign(holder);
    const signature = await connection.sendRawTransaction(rollback.serialize(), { skipPreflight: true });
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: rollback.recentBlockhash!,
      lastValidBlockHeight: rollback.lastValidBlockHeight!,
    }, 'confirmed');
    assert.deepEqual(confirmation.value.err, { InstructionError: [1, { Custom: 1 }] }, 'expected the deliberate second top-level System transfer to fail');
    assert.deepEqual(await snapshot(), beforeRollback, 'failed transaction mutated protocol or token state');
    let transactionDetails = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    for (let attempt = 0; !transactionDetails && attempt < 20; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      transactionDetails = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    }
    assert.ok(transactionDetails?.meta?.logMessages, 'processed rollback transaction logs are unavailable');
    const logs = transactionDetails.meta.logMessages;
    assert.ok(logs.some((line) => line === `Program ${builders.raw.programId.toBase58()} success`), 'DividendX recombination did not succeed before the later failure');
    assert.ok(logs.filter((line) => line.includes(`Program ${TOKEN_PROGRAM_ID.toBase58()} invoke`)).length >= 2, 'paired claim burn CPIs did not execute');
    assert.ok(logs.some((line) => line.includes(`Program ${TOKEN_2022_PROGRAM_ID.toBase58()} invoke`)), 'collateral transfer CPI did not execute');
    const receipt = {
      kind: 'local-validator-sdk-smoke',
      programId: builders.raw.programId.toBase58(),
      endpoint,
      genesisHash,
      quoteSnapshotSlots: { deposit: fundingSnapshot.contextSlot, recombine: pairedSnapshot.contextSlot },
      idlSha256: createHash('sha256').update(await readFile(idlPath)).digest('hex'),
      elfSha256: createHash('sha256').update(await readFile(programPath)).digest('hex'),
      deposit: { signature: depositReceipt.signature, slot: depositReceipt.slot, amountRaw: '1000' },
      recombine: { signature: recombineReceipt.signature, slot: recombineReceipt.slot, amountRaw: '100' },
      rollback: {
        signature,
        slot: transactionDetails.slot,
        failureInstructionIndex: 1,
        error: confirmation.value.err,
        stateBefore: Object.fromEntries(Object.entries(beforeRollback).map(([name, value]) => [name, value.toString()])),
        stateAfter: Object.fromEntries(Object.entries(await snapshot()).map(([name, value]) => [name, value.toString()])),
        logs,
      },
    };
    const receiptPath = resolve(packageRoot, 'smoke/results/local-validator-receipt.json');
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ receiptPath, ...receipt, rollback: { ...receipt.rollback, logs: `[${logs.length} runtime lines]` } })}\n`);
  } catch (error) {
    if (validatorErrors) process.stderr.write(validatorErrors);
    throw error;
  } finally {
    validator.kill('SIGTERM');
    if (validator.exitCode === null) await new Promise<void>((resolveExit) => validator.once('exit', () => resolveExit()));
    await rm(temp, { recursive: true, force: true });
  }
}

await main();
process.exit(0);
