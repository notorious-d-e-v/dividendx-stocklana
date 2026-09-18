import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Idl } from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  createInitializeMintInstruction, createInitializeScaledUiAmountConfigInstruction, getMintLen, unpackMint,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, type Connection } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID as SDK_PROGRAM_ID, DividendXInstructions, annualSeriesAddresses, assetPolicyPda, configPda,
  decodeProgramAccount, fetchClock, inspectMintProfile, issuerIdentityHash, normalizeAssetPolicyAccount,
  mintProfileMatchesPolicy, normalizeSeriesAccount,
} from '@dividendx/transaction-sdk';
import {
  ADMIN_ID, ATTESTOR_BOOTSTRAP_LAMPORTS, DEPLOYMENT_DOMAIN_HEX, DEVNET_GENESIS_HASH,
  FAUCET_BOOTSTRAP_LAMPORTS, MAX_BOOTSTRAP_SPEND_LAMPORTS, PROGRAM_ID, PROFILES, SERIES_YEAR, type Profile,
} from './constants.js';
import { invariant } from './errors.js';
import { verifyDevnetEnvironment } from './environment.js';
import { assertProductionManifestRedacted } from './manifest.js';
import { loadOrCreateStateSigner, readPrivateState, writePrivateJson } from './private-state.js';
import { executeResumableStep, persistedStepConfirmed, type StepContext } from './transactions.js';
import type { PrivateRuntimeState, RegistryAsset, RegistryManifest } from './types.js';

const IDL = DIVIDENDX_IDL as Idl;
const builders = new DividendXInstructions(IDL);
const signerNames = ['mint-kox', 'mint-mu', 'mint-ibm'] as const;

function digest(value: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function bytes(value: unknown): Uint8Array | null {
  return value instanceof Uint8Array ? value : Array.isArray(value) ? Uint8Array.from(value as number[]) : null;
}

function publicKeyText(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || !('toBase58' in value)
    || typeof value.toBase58 !== 'function') return null;
  return value.toBase58();
}

export function toSdkPublicKey(address: PublicKey): PublicKey {
  const SdkPublicKey = SDK_PROGRAM_ID.constructor as typeof PublicKey;
  return new SdkPublicKey(address.toBytes());
}

function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

export interface BootstrapSigners {
  faucet: Keypair;
  attestor: Keypair;
  mints: Keypair[];
}

export function assertSeparatedAuthorities(addresses: readonly PublicKey[]): void {
  invariant(new Set(addresses.map((address) => address.toBase58())).size === addresses.length,
    'AUTHORITY_SEPARATION_REQUIRED');
}

interface DerivedAsset {
  profile: Profile;
  mint: Keypair;
  issuerId: Uint8Array;
  policy: PublicKey;
  series: ReturnType<typeof annualSeriesAddresses>;
}

async function deriveAssets(signers: BootstrapSigners): Promise<DerivedAsset[]> {
  return Promise.all(PROFILES.map(async (profile, index) => {
    const mint = signers.mints[index]!;
    const issuerId = await issuerIdentityHash(`devnet:${DEVNET_GENESIS_HASH}`, profile.id);
    return { profile, mint, issuerId, policy: assetPolicyPda(issuerId, mint.publicKey).address,
      series: annualSeriesAddresses(issuerId, mint.publicKey, SERIES_YEAR) };
  }));
}

async function mintMatches(connection: Connection, asset: DerivedAsset, faucet: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(asset.mint.publicKey, 'confirmed');
  if (!info) return false;
  invariant(info.owner.equals(TOKEN_2022_PROGRAM_ID), 'MINT_OWNER_MISMATCH');
  const mint = unpackMint(asset.mint.publicKey, info, TOKEN_2022_PROGRAM_ID);
  const clock = await fetchClock(connection);
  const profile = await inspectMintProfile(mint, clock);
  invariant(mint.decimals === asset.profile.decimals && mint.mintAuthority?.equals(faucet)
    && mint.freezeAuthority === null && profile.accountingFactorsSupported
    && profile.extensionsMask === 1n << BigInt(ExtensionType.ScaledUiAmountConfig), 'MINT_PROFILE_MISMATCH');
  return true;
}

async function policyMatches(connection: Connection, asset: DerivedAsset, attestor: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(asset.policy, 'confirmed');
  if (!info) return false;
  invariant(info.owner.equals(PROGRAM_ID), 'ASSET_POLICY_OWNER_MISMATCH');
  const raw = decodeProgramAccount(IDL, 'assetPolicy', info.data);
  const expectedDigest = digest(`synthetic-devnet-policy-v1:${asset.profile.id}:${asset.profile.symbol}:${asset.profile.decimals}`);
  invariant(Buffer.from(bytes(raw.issuerId) ?? []).equals(Buffer.from(asset.issuerId))
    && raw.symbol === asset.profile.symbol && publicKeyText(raw.attestor) === attestor.toBase58()
    && Buffer.from(bytes(raw.policyDigest) ?? []).equals(Buffer.from(expectedDigest)), 'ASSET_POLICY_MISMATCH');
  const policy = normalizeAssetPolicyAccount(asset.policy, raw);
  invariant(policy.collateralMint.toBase58() === asset.mint.publicKey.toBase58()
    && policy.decimals === asset.profile.decimals && policy.enabled,
    'ASSET_POLICY_MISMATCH');
  return true;
}

async function observationFreshAndMatching(connection: Connection, asset: DerivedAsset): Promise<boolean> {
  const [policyInfo, mintInfo] = await connection.getMultipleAccountsInfo([asset.policy, asset.mint.publicKey], 'confirmed');
  if (!policyInfo || !mintInfo) return false;
  const clock = await fetchClock(connection);
  const policy = normalizeAssetPolicyAccount(asset.policy, decodeProgramAccount(IDL, 'assetPolicy', policyInfo.data));
  const mint = unpackMint(asset.mint.publicKey, mintInfo, TOKEN_2022_PROGRAM_ID);
  const profile = await inspectMintProfile(mint, clock);
  const expected = digest(`synthetic-test-profile-observation-v1:${asset.profile.id}:${asset.profile.symbol}:${asset.profile.decimals}`);
  return policy.observationValidUntil >= clock.unixTimestamp + 3_600n
    && Buffer.from(policy.observationEvidenceDigest).equals(Buffer.from(expected))
    && mintProfileMatchesPolicy(policy, profile);
}

async function seriesMatches(connection: Connection, asset: DerivedAsset): Promise<boolean> {
  const info = await connection.getAccountInfo(asset.series.series, 'confirmed');
  if (!info) return false;
  invariant(info.owner.equals(PROGRAM_ID), 'SERIES_OWNER_MISMATCH');
  const series = normalizeSeriesAccount(asset.series.series, decodeProgramAccount(IDL, 'series', info.data));
  invariant(series.year === SERIES_YEAR && series.assetPolicy.toBase58() === asset.policy.toBase58()
    && series.collateralMint.toBase58() === asset.mint.publicKey.toBase58()
    && series.ptMint.toBase58() === asset.series.ptMint.toBase58()
    && series.drMint.toBase58() === asset.series.drMint.toBase58()
    && series.vault.toBase58() === asset.series.vault.toBase58(), 'SERIES_MISMATCH');
  const related = await connection.getMultipleAccountsInfo([
    asset.series.accumulator, asset.series.ptMint, asset.series.drMint, asset.series.vault,
  ], 'confirmed');
  invariant(related.every((entry) => entry !== null), 'SERIES_INCOMPLETE');
  return true;
}

async function loadOrInitializeState(
  stateDirectory: string,
  rpcUrl: string,
  signers: BootstrapSigners,
): Promise<{ state: PrivateRuntimeState; path: string; created: boolean }> {
  const path = join(stateDirectory, 'state.json');
  const publicKeys = {
    faucet: signers.faucet.publicKey.toBase58(), attestor: signers.attestor.publicKey.toBase58(),
    ...Object.fromEntries(signerNames.map((name, index) => [name, signers.mints[index]!.publicKey.toBase58()])),
  };
  try {
    await stat(path);
    const state = await readPrivateState(path);
    invariant(state.rpcUrl === rpcUrl && state.genesisHash === DEVNET_GENESIS_HASH
      && state.programId === PROGRAM_ID.toBase58() && state.deploymentDomainHex === DEPLOYMENT_DOMAIN_HEX,
    'STATE_IDENTITY_MISMATCH');
    invariant(JSON.stringify(state.publicKeys) === JSON.stringify(publicKeys), 'STATE_SIGNERS_MISMATCH');
    return { state, path, created: false };
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const state: PrivateRuntimeState = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: randomUUID(), rpcUrl,
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: null, publicKeys, steps: {},
  };
  await writePrivateJson(path, state);
  return { state, path, created: true };
}

export async function loadBootstrapSigners(stateDirectory: string): Promise<BootstrapSigners> {
  return {
    faucet: await loadOrCreateStateSigner(stateDirectory, 'faucet'),
    attestor: await loadOrCreateStateSigner(stateDirectory, 'attestor'),
    mints: await Promise.all(signerNames.map((name) => loadOrCreateStateSigner(stateDirectory, name))),
  };
}

export async function bootstrapDevnet(
  connection: Connection,
  rpcUrl: string,
  stateDirectory: string,
  admin: Keypair,
): Promise<RegistryManifest> {
  invariant(admin.publicKey.equals(ADMIN_ID), 'ADMIN_IDENTITY_MISMATCH');
  await verifyDevnetEnvironment(connection);
  const signers = await loadBootstrapSigners(stateDirectory);
  assertSeparatedAuthorities([admin.publicKey, signers.faucet.publicKey, signers.attestor.publicKey,
    ...signers.mints.map((mint) => mint.publicKey)]);
  const assets = await deriveAssets(signers);
  const stored = await loadOrInitializeState(stateDirectory, rpcUrl, signers);
  if (stored.created) {
    const known = assets.flatMap((asset) => [asset.mint.publicKey, asset.policy, asset.series.series]);
    invariant((await connection.getMultipleAccountsInfo(known, 'confirmed')).every((info) => info === null),
      'STATE_REQUIRED_FOR_EXISTING_ASSETS');
  }
  if (stored.state.initialAdminLamports === null) {
    stored.state.initialAdminLamports = String(await connection.getBalance(admin.publicKey, 'confirmed'));
    await writePrivateJson(stored.path, stored.state);
  }
  const context: StepContext = {
    connection, state: stored.state, statePath: stored.path, adminAddress: admin.publicKey.toBase58(),
  };
  const [faucetBalance, attestorBalance] = await Promise.all([
    connection.getBalance(signers.faucet.publicKey, 'confirmed'),
    connection.getBalance(signers.attestor.publicKey, 'confirmed'),
  ]);
  const fundingInstructions = [];
  if (faucetBalance < FAUCET_BOOTSTRAP_LAMPORTS) fundingInstructions.push(SystemProgram.transfer({
    fromPubkey: admin.publicKey, toPubkey: signers.faucet.publicKey, lamports: FAUCET_BOOTSTRAP_LAMPORTS - faucetBalance,
  }));
  if (attestorBalance < ATTESTOR_BOOTSTRAP_LAMPORTS) fundingInstructions.push(SystemProgram.transfer({
    fromPubkey: admin.publicKey, toPubkey: signers.attestor.publicKey, lamports: ATTESTOR_BOOTSTRAP_LAMPORTS - attestorBalance,
  }));
  if (fundingInstructions.length) await executeResumableStep(context, 'fund_separated_test_authorities', async () =>
    await persistedStepConfirmed(context, 'fund_separated_test_authorities')
      || (await connection.getBalance(signers.faucet.publicKey, 'confirmed') >= FAUCET_BOOTSTRAP_LAMPORTS
      && await connection.getBalance(signers.attestor.publicKey, 'confirmed') >= ATTESTOR_BOOTSTRAP_LAMPORTS),
  admin, fundingInstructions);

  for (const asset of assets) {
    const mintSpace = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const rent = await connection.getMinimumBalanceForRentExemption(mintSpace);
    await executeResumableStep(context, `create_mint_${asset.profile.id}`,
      () => mintMatches(connection, asset, signers.faucet.publicKey), admin, [
        SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: asset.mint.publicKey,
          lamports: rent, space: mintSpace, programId: TOKEN_2022_PROGRAM_ID }),
        createInitializeScaledUiAmountConfigInstruction(asset.mint.publicKey, signers.faucet.publicKey, 1, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(asset.mint.publicKey, asset.profile.decimals, signers.faucet.publicKey, null, TOKEN_2022_PROGRAM_ID),
      ], [asset.mint]);
    await executeResumableStep(context, `register_policy_${asset.profile.id}`,
      () => policyMatches(connection, asset, signers.attestor.publicKey), admin, [
        builders.admin.registerAsset({ config: configPda().address, admin: admin.publicKey,
          collateralMint: asset.mint.publicKey, assetPolicy: asset.policy, systemProgram: SystemProgram.programId }, {
          issuerId: asset.issuerId, symbol: asset.profile.symbol, attestor: toSdkPublicKey(signers.attestor.publicKey),
          policyDigest: digest(`synthetic-devnet-policy-v1:${asset.profile.id}:${asset.profile.symbol}:${asset.profile.decimals}`),
        }),
      ]);
    const clock = await fetchClock(connection);
    await executeResumableStep(context, `observe_profile_${asset.profile.id}`,
      () => observationFreshAndMatching(connection, asset), signers.attestor, [
      builders.attestor.refreshObservation({ attestor: signers.attestor.publicKey, assetPolicy: asset.policy,
          collateralMint: asset.mint.publicKey },
        digest(`synthetic-test-profile-observation-v1:${asset.profile.id}:${asset.profile.symbol}:${asset.profile.decimals}`),
        clock.unixTimestamp + 43_200n),
      ], [], { repeatableAfterConfirmed: true });
    await executeResumableStep(context, `create_series_${asset.profile.id}`,
      () => seriesMatches(connection, asset), admin, [
        builders.permissionless.createSeries({ payer: admin.publicKey, assetPolicy: asset.policy,
          series: asset.series.series, accumulator: asset.series.accumulator, ptMint: asset.series.ptMint,
          drMint: asset.series.drMint, collateralMint: asset.mint.publicKey, vault: asset.series.vault,
          tokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }, SERIES_YEAR),
      ]);
  }
  const currentAdmin = BigInt(await connection.getBalance(admin.publicKey, 'confirmed'));
  invariant(BigInt(stored.state.initialAdminLamports!) - currentAdmin <= MAX_BOOTSTRAP_SPEND_LAMPORTS,
    'BOOTSTRAP_BUDGET_EXCEEDED');
  const registryAssets: RegistryAsset[] = assets.map((asset) => ({
    id: asset.profile.id, company: asset.profile.company, symbol: asset.profile.symbol,
    issuerLabel: asset.profile.issuerLabel, issuerIdHex: Buffer.from(asset.issuerId).toString('hex'),
    decimals: asset.profile.decimals, collateralMint: asset.mint.publicKey.toBase58(), assetPolicy: asset.policy.toBase58(),
    series: [{ year: SERIES_YEAR, address: asset.series.series.toBase58(), accumulator: asset.series.accumulator.toBase58(),
      ptMint: asset.series.ptMint.toBase58(), drMint: asset.series.drMint.toBase58(), vault: asset.series.vault.toBase58() }],
  }));
  const manifest: RegistryManifest = {
    schemaVersion: 1, kind: 'devnet', rpcUrl, genesisHash: DEVNET_GENESIS_HASH,
    programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    runtimeId: stored.state.runtimeId, clockControl: false, faucetEnabled: false, assets: registryAssets,
  };
  assertProductionManifestRedacted(manifest);
  await writePrivateJson(join(stateDirectory, 'manifest.json'), manifest);
  return manifest;
}
