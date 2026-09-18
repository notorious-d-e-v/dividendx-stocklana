import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Idl } from '@anchor-lang/core';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction, getAssociatedTokenAddressSync, unpackMint,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, type Connection, type Keypair } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DividendXInstructions, decodeProgramAccount, fetchClock, fetchQuoteSnapshot,
  quoteDeposit, quoteRecombine,
} from '@dividendx/transaction-sdk';
import {
  DEFAULT_OBSERVATION_LIFETIME_SECONDS, HOLDER_SOL_CAP_LAMPORTS, HOLDER_TOKEN_CAP_UI,
  MAX_OBSERVATION_LIFETIME_SECONDS, PROGRAM_ID,
} from './constants.js';
import { invariant } from './errors.js';
import { assertManifestCurrent } from './manifest.js';
import { loadExplicitSigner, loadOrCreateStateSigner, readPrivateState, writePublicJson } from './private-state.js';
import { simulateSendAndConfirm } from './transactions.js';
import type { RegistryAsset, RegistryManifest } from './types.js';

const IDL = DIVIDENDX_IDL as Idl;
const builders = new DividendXInstructions(IDL);

function digest(value: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function assetById(manifest: RegistryManifest, id: string): RegistryAsset {
  const asset = manifest.assets.find((candidate) => candidate.id === id);
  invariant(asset, 'ASSET_NOT_FOUND');
  return asset;
}

async function existingSigner(stateDirectory: string, name: string, expected: string): Promise<Keypair> {
  return loadExplicitSigner(join(stateDirectory, `${name}.json`), expected);
}

async function assertRuntimeRequest(manifest: RegistryManifest, runtimeId: string, genesisHash: string): Promise<void> {
  invariant(runtimeId === manifest.runtimeId && genesisHash === manifest.genesisHash, 'STALE_RUNTIME_REQUEST');
}

export async function fundHolder(
  connection: Connection,
  manifest: RegistryManifest,
  stateDirectory: string,
  request: { owner: string; assetId: string; runtimeId: string; genesisHash: string },
): Promise<{ signatures: string[]; message: string }> {
  await assertManifestCurrent(connection, manifest);
  await assertRuntimeRequest(manifest, request.runtimeId, request.genesisHash);
  const state = await readPrivateState(join(stateDirectory, 'state.json'));
  invariant(state.runtimeId === manifest.runtimeId, 'STATE_IDENTITY_MISMATCH');
  const faucet = await existingSigner(stateDirectory, 'faucet', state.publicKeys.faucet!);
  const asset = assetById(manifest, request.assetId);
  let owner: PublicKey;
  try { owner = new PublicKey(request.owner); } catch { throw new Error('OWNER_INVALID'); }
  invariant(PublicKey.isOnCurve(owner.toBytes()), 'OWNER_INVALID');
  const mintAddress = new PublicKey(asset.collateralMint);
  const mintInfo = await connection.getAccountInfo(mintAddress, 'confirmed');
  invariant(mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID), 'MINT_PROFILE_MISMATCH');
  const mint = unpackMint(mintAddress, mintInfo, TOKEN_2022_PROGRAM_ID);
  invariant(mint.decimals === asset.decimals && mint.mintAuthority?.equals(faucet.publicKey), 'FAUCET_AUTHORITY_MISMATCH');
  const ata = getAssociatedTokenAddressSync(mintAddress, owner, false, TOKEN_2022_PROGRAM_ID);
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, ata, owner, mintAddress, TOKEN_2022_PROGRAM_ID),
    createMintToCheckedInstruction(mintAddress, ata, faucet.publicKey,
      HOLDER_TOKEN_CAP_UI * 10n ** BigInt(asset.decimals), asset.decimals, [], TOKEN_2022_PROGRAM_ID),
  ];
  const ownerLamports = await connection.getBalance(owner, 'confirmed');
  if (ownerLamports < HOLDER_SOL_CAP_LAMPORTS) instructions.unshift(SystemProgram.transfer({
    fromPubkey: faucet.publicKey, toPubkey: owner, lamports: HOLDER_SOL_CAP_LAMPORTS - ownerLamports,
  }));
  const signature = await simulateSendAndConfirm(connection, faucet, instructions);
  return { signatures: [signature], message: `Funded ${HOLDER_TOKEN_CAP_UI} ${asset.symbol} test units; CLI-only test faucet.` };
}

export async function refreshTestObservations(
  connection: Connection,
  manifest: RegistryManifest,
  stateDirectory: string,
  lifetimeSeconds = DEFAULT_OBSERVATION_LIFETIME_SECONDS,
): Promise<string[]> {
  invariant(lifetimeSeconds > 0n && lifetimeSeconds <= MAX_OBSERVATION_LIFETIME_SECONDS,
    'OBSERVATION_LIFETIME_INVALID');
  await assertManifestCurrent(connection, manifest);
  const state = await readPrivateState(join(stateDirectory, 'state.json'));
  invariant(state.runtimeId === manifest.runtimeId, 'STATE_IDENTITY_MISMATCH');
  const attestor = await existingSigner(stateDirectory, 'attestor', state.publicKeys.attestor!);
  const signatures: string[] = [];
  for (const asset of manifest.assets) {
    const series = asset.series[0]!;
    const addresses = {
      assetPolicy: new PublicKey(asset.assetPolicy), series: new PublicKey(series.address),
      accumulator: new PublicKey(series.accumulator), collateralMint: new PublicKey(asset.collateralMint),
      vault: new PublicKey(series.vault),
    };
    const snapshot = await fetchQuoteSnapshot(connection, IDL, addresses);
    invariant(snapshot.policy.mintProfileMatchesReviewed && snapshot.mintProfile.accountingFactorsSupported,
      'MINT_PROFILE_CHANGED');
    const policyInfo = await connection.getAccountInfo(addresses.assetPolicy, 'confirmed');
    invariant(policyInfo !== null && policyInfo.owner.equals(PROGRAM_ID), 'ASSET_POLICY_OWNER_MISMATCH');
    const raw = decodeProgramAccount(IDL, 'assetPolicy', policyInfo.data);
    invariant(raw.attestor !== null && typeof raw.attestor === 'object' && 'toBase58' in raw.attestor
      && typeof raw.attestor.toBase58 === 'function'
      && raw.attestor.toBase58() === attestor.publicKey.toBase58(), 'ATTESTOR_AUTHORITY_MISMATCH');
    const clock = await fetchClock(connection);
    signatures.push(await simulateSendAndConfirm(connection, attestor, [
      builders.attestor.refreshObservation({ attestor: attestor.publicKey, assetPolicy: addresses.assetPolicy,
        collateralMint: addresses.collateralMint },
      digest(`synthetic-test-profile-observation-v1:${asset.id}:${asset.symbol}:${asset.decimals}`),
      clock.unixTimestamp + lifetimeSeconds),
    ]));
  }
  return signatures;
}

export interface SmokeReceipt {
  schema: 'dividendx-devnet-holder-smoke-v1';
  boundary: 'public-devnet-synthetic-test-asset';
  generatedAt: string;
  runtimeId: string;
  genesisHash: string;
  assetId: string;
  symbol: string;
  holder: string;
  amountRaw: string;
  transactions: { fund: string; createAccounts: string; split: string; recombine: string };
  conservation: { collateralStartRaw: string; collateralAfterSplitRaw: string; collateralFinalRaw: string;
    ptAfterSplitRaw: string; drAfterSplitRaw: string; ptFinalRaw: string; drFinalRaw: string };
}

export async function runHolderSmoke(
  connection: Connection,
  manifest: RegistryManifest,
  stateDirectory: string,
  assetId: string,
  receiptPath: string,
): Promise<SmokeReceipt> {
  await assertManifestCurrent(connection, manifest);
  const state = await readPrivateState(join(stateDirectory, 'state.json'));
  invariant(state.runtimeId === manifest.runtimeId, 'STATE_IDENTITY_MISMATCH');
  const faucet = await existingSigner(stateDirectory, 'faucet', state.publicKeys.faucet!);
  const holder = await loadOrCreateStateSigner(stateDirectory, 'smoke-holder');
  invariant(!holder.publicKey.equals(faucet.publicKey)
    && !holder.publicKey.equals(new PublicKey(state.publicKeys.attestor!)),
    'AUTHORITY_SEPARATION_REQUIRED');
  const asset = assetById(manifest, assetId);
  const series = asset.series[0]!;
  const mint = new PublicKey(asset.collateralMint);
  const collateral = getAssociatedTokenAddressSync(mint, holder.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const pt = getAssociatedTokenAddressSync(new PublicKey(series.ptMint), holder.publicKey);
  const dr = getAssociatedTokenAddressSync(new PublicKey(series.drMint), holder.publicKey);
  const amount = 1n * 10n ** BigInt(asset.decimals);
  const fundingInstructions = [
    createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, collateral, holder.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createMintToCheckedInstruction(mint, collateral, faucet.publicKey, amount, asset.decimals, [], TOKEN_2022_PROGRAM_ID),
  ];
  const balance = await connection.getBalance(holder.publicKey, 'confirmed');
  if (balance < 10_000_000) fundingInstructions.unshift(SystemProgram.transfer({
    fromPubkey: faucet.publicKey, toPubkey: holder.publicKey, lamports: 10_000_000 - balance,
  }));
  const fund = await simulateSendAndConfirm(connection, faucet, fundingInstructions);
  const createAccounts = await simulateSendAndConfirm(connection, holder, [
    createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, pt, holder.publicKey, new PublicKey(series.ptMint)),
    createAssociatedTokenAccountIdempotentInstruction(holder.publicKey, dr, holder.publicKey, new PublicKey(series.drMint)),
  ]);
  const addresses = { holder: holder.publicKey, assetPolicy: new PublicKey(asset.assetPolicy),
    series: new PublicKey(series.address), accumulator: new PublicKey(series.accumulator), collateralMint: mint,
    vault: new PublicKey(series.vault), holderCollateral: collateral, holderPt: pt, holderDr: dr };
  const before = await fetchQuoteSnapshot(connection, IDL, addresses);
  const quote = quoteDeposit(before.series, before.policy, before.vaultRaw, amount, before.holderCollateralRaw!, before.clock,
    before.clock.unixTimestamp + 300n);
  const holderAccounts = { holder: holder.publicKey, assetPolicy: addresses.assetPolicy, series: addresses.series,
    collateralMint: mint, vault: addresses.vault, holderCollateral: collateral, ptMint: new PublicKey(series.ptMint),
    drMint: new PublicKey(series.drMint), holderPt: pt, holderDr: dr, tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID };
  const split = await simulateSendAndConfirm(connection, holder, [builders.holder.deposit(holderAccounts, amount, quote.guard)]);
  const afterSplit = await fetchQuoteSnapshot(connection, IDL, addresses);
  invariant(afterSplit.holderCollateralRaw === before.holderCollateralRaw! - amount
    && afterSplit.holderPtRaw === before.holderPtRaw! + amount
    && afterSplit.holderDrRaw === before.holderDrRaw! + amount
    && afterSplit.vaultRaw === before.vaultRaw + amount, 'SMOKE_SPLIT_CONSERVATION_FAILED');
  const recombineQuote = quoteRecombine(afterSplit.series, afterSplit.vaultRaw, amount,
    afterSplit.holderPtRaw!, afterSplit.holderDrRaw!, afterSplit.clock.unixTimestamp, afterSplit.clock.unixTimestamp + 300n);
  const recombine = await simulateSendAndConfirm(connection, holder,
    [builders.holder.recombine(holderAccounts, amount, recombineQuote.guard)]);
  const final = await fetchQuoteSnapshot(connection, IDL, addresses);
  invariant(final.holderCollateralRaw === before.holderCollateralRaw
    && final.holderPtRaw === before.holderPtRaw && final.holderDrRaw === before.holderDrRaw
    && final.vaultRaw === before.vaultRaw, 'SMOKE_RECOMBINE_CONSERVATION_FAILED');
  const receipt: SmokeReceipt = {
    schema: 'dividendx-devnet-holder-smoke-v1', boundary: 'public-devnet-synthetic-test-asset',
    generatedAt: new Date().toISOString(), runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash,
    assetId, symbol: asset.symbol, holder: holder.publicKey.toBase58(), amountRaw: amount.toString(),
    transactions: { fund, createAccounts, split, recombine },
    conservation: {
      collateralStartRaw: before.holderCollateralRaw!.toString(),
      collateralAfterSplitRaw: afterSplit.holderCollateralRaw!.toString(), collateralFinalRaw: final.holderCollateralRaw!.toString(),
      ptAfterSplitRaw: afterSplit.holderPtRaw!.toString(), drAfterSplitRaw: afterSplit.holderDrRaw!.toString(),
      ptFinalRaw: final.holderPtRaw!.toString(), drFinalRaw: final.holderDrRaw!.toString(),
    },
  };
  invariant(!JSON.stringify(receipt).includes(stateDirectory), 'RECEIPT_PRIVATE_PATH');
  await writePublicJson(receiptPath, receipt);
  return receipt;
}
