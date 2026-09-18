import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PublicKey, type Connection } from '@solana/web3.js';
import type { Idl } from '@anchor-lang/core';
import {
  DIVIDENDX_IDL, annualSeriesAddresses, assetPolicyPda, decodeProgramAccount, fetchQuoteSnapshot,
} from '@dividendx/transaction-sdk';
import { TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { DEPLOYMENT_DOMAIN_HEX, DEVNET_GENESIS_HASH, PROGRAM_ID, PROFILES, SERIES_YEAR } from './constants.js';
import { parseDevnetRpcUrl } from './config.js';
import { invariant } from './errors.js';
import { verifyDevnetEnvironment } from './environment.js';
import type { RegistryManifest } from './types.js';

export function parseRegistryManifest(value: unknown): RegistryManifest {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'MANIFEST_INVALID');
  const manifest = value as RegistryManifest;
  invariant(manifest.schemaVersion === 1 && manifest.kind === 'devnet' && manifest.clockControl === false
    && manifest.faucetEnabled === false, 'MANIFEST_INVALID');
  manifest.rpcUrl = parseDevnetRpcUrl(manifest.rpcUrl);
  invariant(manifest.genesisHash === DEVNET_GENESIS_HASH && manifest.programId === PROGRAM_ID.toBase58()
    && manifest.deploymentDomainHex === DEPLOYMENT_DOMAIN_HEX && typeof manifest.runtimeId === 'string'
    && /^[0-9a-f-]{36}$/i.test(manifest.runtimeId), 'MANIFEST_IDENTITY_INVALID');
  invariant(Array.isArray(manifest.assets) && manifest.assets.length === PROFILES.length, 'MANIFEST_ASSETS_INVALID');
  for (const profile of PROFILES) {
    const asset = manifest.assets.find((candidate) => candidate.id === profile.id);
    invariant(asset && asset.company === profile.company && asset.symbol === profile.symbol
      && asset.issuerLabel === profile.issuerLabel && asset.decimals === profile.decimals
      && /^[0-9a-f]{64}$/.test(asset.issuerIdHex), 'MANIFEST_ASSETS_INVALID');
    new PublicKey(asset.collateralMint); new PublicKey(asset.assetPolicy);
    invariant(asset.series.length === 1 && asset.series[0]!.year === SERIES_YEAR, 'MANIFEST_ASSETS_INVALID');
    for (const address of ['address', 'accumulator', 'ptMint', 'drMint', 'vault'] as const) {
      new PublicKey(asset.series[0]![address]);
    }
  }
  return manifest;
}

export async function loadRegistryManifest(path: string): Promise<RegistryManifest> {
  invariant(isAbsolute(path), 'MANIFEST_PATH_INVALID');
  return parseRegistryManifest(JSON.parse(await readFile(path, 'utf8')));
}

export async function assertManifestCurrent(connection: Connection, manifest: RegistryManifest): Promise<void> {
  const proof = await verifyDevnetEnvironment(connection);
  invariant(proof.genesisHash === manifest.genesisHash && proof.programId === manifest.programId
    && proof.deploymentDomainHex === manifest.deploymentDomainHex, 'STALE_MANIFEST');
  for (const asset of manifest.assets) {
    const issuerId = Uint8Array.from(Buffer.from(asset.issuerIdHex, 'hex'));
    const mint = new PublicKey(asset.collateralMint);
    const expectedPolicy = assetPolicyPda(issuerId, mint).address;
    const expectedSeries = annualSeriesAddresses(issuerId, mint, SERIES_YEAR);
    const series = asset.series[0]!;
    invariant(expectedPolicy.toBase58() === asset.assetPolicy
      && expectedSeries.series.toBase58() === series.address
      && expectedSeries.accumulator.toBase58() === series.accumulator
      && expectedSeries.ptMint.toBase58() === series.ptMint
      && expectedSeries.drMint.toBase58() === series.drMint
      && expectedSeries.vault.toBase58() === series.vault, 'STALE_MANIFEST');
    const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, {
      assetPolicy: expectedPolicy, series: expectedSeries.series, accumulator: expectedSeries.accumulator,
      collateralMint: mint, vault: expectedSeries.vault,
    });
    invariant(snapshot.series.year === SERIES_YEAR && snapshot.series.ptMint.equals(expectedSeries.ptMint)
      && snapshot.series.drMint.equals(expectedSeries.drMint) && snapshot.mintProfile.decimals === asset.decimals,
    'STALE_MANIFEST');
    const [policyInfo, mintInfo] = await connection.getMultipleAccountsInfo([expectedPolicy, mint], 'confirmed');
    invariant(policyInfo !== null && mintInfo !== null
      && policyInfo.owner.equals(PROGRAM_ID) && mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID), 'STALE_MANIFEST');
    const raw = decodeProgramAccount(DIVIDENDX_IDL as Idl, 'assetPolicy', policyInfo.data);
    const rawIssuer = raw.issuerId instanceof Uint8Array ? raw.issuerId : Uint8Array.from(raw.issuerId as number[]);
    const rawDigest = raw.policyDigest instanceof Uint8Array
      ? raw.policyDigest : Uint8Array.from(raw.policyDigest as number[]);
    const expectedDigest = createHash('sha256')
      .update(`synthetic-devnet-policy-v1:${asset.id}:${asset.symbol}:${asset.decimals}`).digest();
    invariant(raw.symbol === asset.symbol && Buffer.from(rawIssuer).toString('hex') === asset.issuerIdHex
      && Buffer.from(rawDigest).equals(expectedDigest)
      && raw.collateralMint !== null && typeof raw.collateralMint === 'object'
      && 'toBase58' in raw.collateralMint && typeof raw.collateralMint.toBase58 === 'function'
      && raw.collateralMint.toBase58() === mint.toBase58(),
      'STALE_MANIFEST');
    invariant(unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID).decimals === asset.decimals, 'STALE_MANIFEST');
  }
}

export function assertProductionManifestRedacted(manifest: RegistryManifest): void {
  const serialized = JSON.stringify(manifest);
  invariant(!/(secret|keypair|signerPath|stateDir|adminSigner|private)/i.test(serialized), 'MANIFEST_SECRET_FIELD');
  invariant(!serialized.includes('.local-tools') && !serialized.includes('/Users/'), 'MANIFEST_PRIVATE_PATH');
}
