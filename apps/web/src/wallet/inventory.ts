import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from '@solana/spl-token';
import { Connection, PublicKey, SYSVAR_CLOCK_PUBKEY, type AccountInfo } from '@solana/web3.js';
import {
  DIVIDENDX_PROGRAM_ID,
  annualSeriesAddresses,
  decodeClockAccount,
  inspectMintProfile,
} from '@dividendx/transaction-sdk';
import { formatStock } from './amounts';
import type { LocalAssetManifest, LocalManifest, LocalSeriesManifest } from './types';

const MAX_RPC_ACCOUNTS = 100;

export interface WalletSeriesInventory {
  year: number;
  address: string;
  ptMint: string;
  drMint: string;
  ptAta: string;
  drAta: string;
  ptRaw: bigint;
  drRaw: bigint;
}

export interface WalletAssetInventory {
  assetId: string;
  company: string;
  symbol: string;
  issuerLabel: string;
  decimals: number;
  collateralMint: string;
  collateralAta: string;
  collateralRaw: bigint;
  stockDisplayAmount: string;
  activeMultiplierBits: bigint;
  series: WalletSeriesInventory[];
}

export interface WalletInventory {
  owner: string;
  runtimeId: string;
  contextSlots: number[];
  assets: WalletAssetInventory[];
}

interface PreparedSeries {
  manifest: LocalSeriesManifest;
  ptMint: PublicKey;
  drMint: PublicKey;
  ptAta: PublicKey;
  drAta: PublicKey;
}

interface PreparedAsset {
  manifest: LocalAssetManifest;
  mint: PublicKey;
  collateralAta: PublicKey;
  series: PreparedSeries[];
}

function key(value: string, label: string): PublicKey {
  try { return new PublicKey(value); }
  catch { throw new Error(`${label} is not a valid Solana address.`); }
}

function prepareAssets(manifest: LocalManifest, owner: PublicKey): PreparedAsset[] {
  if (manifest.programId !== DIVIDENDX_PROGRAM_ID.toBase58()) throw new Error('Inventory manifest program ID mismatch.');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Inventory manifest has no assets.');
  const ids = new Set<string>();
  const mints = new Set<string>();
  return manifest.assets.map((asset) => {
    if (ids.has(asset.id)) throw new Error('Inventory manifest repeats an asset ID.');
    ids.add(asset.id);
    if (!/^[0-9a-f]{64}$/i.test(asset.issuerIdHex)) throw new Error('Inventory issuer ID is malformed.');
    const mint = key(asset.collateralMint, 'Collateral mint');
    if (mints.has(mint.toBase58())) throw new Error('Inventory manifest repeats a collateral mint.');
    mints.add(mint.toBase58());
    if (!Array.isArray(asset.series) || asset.series.length === 0) throw new Error('Inventory asset has no annual series.');
    const years = new Set<number>();
    const series = asset.series.map((entry) => {
      if (years.has(entry.year)) throw new Error('Inventory manifest repeats an annual series.');
      years.add(entry.year);
      const expected = annualSeriesAddresses(Uint8Array.from(Buffer.from(asset.issuerIdHex, 'hex')), mint, entry.year);
      const relationships = {
        assetPolicy: asset.assetPolicy, address: entry.address, accumulator: entry.accumulator,
        ptMint: entry.ptMint, drMint: entry.drMint, vault: entry.vault,
      };
      for (const [field, address] of Object.entries(relationships)) {
        const derived = field === 'address' ? expected.series : expected[field as keyof typeof expected];
        if (!derived.equals(key(address, field))) throw new Error(`Inventory ${field} does not match the derived series address.`);
      }
      return {
        manifest: entry, ptMint: expected.ptMint, drMint: expected.drMint,
        ptAta: getAssociatedTokenAddressSync(expected.ptMint, owner),
        drAta: getAssociatedTokenAddressSync(expected.drMint, owner),
      };
    });
    return {
      manifest: asset, mint,
      collateralAta: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID),
      series,
    };
  });
}

/** Only a missing canonical ATA means zero; a present but unusable account is an error. */
export function decodeCanonicalAta(address: PublicKey, info: AccountInfo<Buffer> | null,
  programId: PublicKey, mint: PublicKey, owner: PublicKey): bigint {
  if (info === null) return 0n;
  if (!info.owner.equals(programId)) throw new Error('Inventory token account has the wrong program owner.');
  const account = unpackAccount(address, info, programId);
  if (!account.mint.equals(mint) || !account.owner.equals(owner)) {
    throw new Error('Inventory token account mint or wallet owner does not match its canonical ATA.');
  }
  if (!account.isInitialized || account.isFrozen) throw new Error('Inventory token account is not spendable.');
  return account.amount;
}

export async function fetchWalletInventory(connection: Connection, manifest: LocalManifest,
  owner: PublicKey): Promise<WalletInventory> {
  if (!PublicKey.isOnCurve(owner.toBytes())) throw new Error('Inventory wallet address is not on curve.');
  const prepared = prepareAssets(manifest, owner);
  const addresses = [SYSVAR_CLOCK_PUBKEY];
  for (const asset of prepared) {
    addresses.push(asset.mint, asset.collateralAta);
    for (const series of asset.series) addresses.push(series.ptMint, series.drMint, series.ptAta, series.drAta);
  }
  const seen = new Set<string>();
  for (const address of addresses) {
    const encoded = address.toBase58();
    if (seen.has(encoded)) throw new Error('Inventory manifest derives duplicate account addresses.');
    seen.add(encoded);
  }
  const infos = new Map<string, AccountInfo<Buffer> | null>();
  const contextSlots: number[] = [];
  for (let index = 0; index < addresses.length; index += MAX_RPC_ACCOUNTS) {
    const chunk = addresses.slice(index, index + MAX_RPC_ACCOUNTS);
    const response = await connection.getMultipleAccountsInfoAndContext(chunk,
      contextSlots.length === 0 ? { commitment: 'confirmed' }
        : { commitment: 'confirmed', minContextSlot: contextSlots[0] });
    if (response.value.length !== chunk.length || !Number.isSafeInteger(response.context.slot)) {
      throw new Error('Inventory RPC response is incomplete or malformed.');
    }
    contextSlots.push(response.context.slot);
    chunk.forEach((address, offset) => infos.set(address.toBase58(), response.value[offset]!));
  }
  const info = (address: PublicKey): AccountInfo<Buffer> | null => {
    if (!infos.has(address.toBase58())) throw new Error('Inventory RPC omitted a requested account.');
    return infos.get(address.toBase58())!;
  };
  const clockInfo = info(SYSVAR_CLOCK_PUBKEY);
  if (clockInfo === null) throw new Error('Inventory Clock sysvar is missing.');
  const clock = decodeClockAccount(clockInfo, contextSlots[0]!);
  const assets: WalletAssetInventory[] = [];
  for (const asset of prepared) {
    const mintInfo = info(asset.mint);
    if (!mintInfo || !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error('Inventory collateral mint is missing or has the wrong program owner.');
    }
    const mint = unpackMint(asset.mint, mintInfo, TOKEN_2022_PROGRAM_ID);
    const profile = await inspectMintProfile(mint, clock);
    if (profile.decimals !== asset.manifest.decimals || !profile.accountingFactorsSupported) {
      throw new Error('Inventory collateral mint profile does not match the supported asset.');
    }
    const collateralRaw = decodeCanonicalAta(asset.collateralAta, info(asset.collateralAta),
      TOKEN_2022_PROGRAM_ID, asset.mint, owner);
    const series: WalletSeriesInventory[] = asset.series.map((entry) => {
      for (const claimMint of [entry.ptMint, entry.drMint]) {
        const claimInfo = info(claimMint);
        if (!claimInfo || !claimInfo.owner.equals(TOKEN_PROGRAM_ID)) {
          throw new Error('Inventory claim mint is missing or does not match the supported series.');
        }
        const decoded = unpackMint(claimMint, claimInfo, TOKEN_PROGRAM_ID);
        if (!decoded.isInitialized || decoded.decimals !== asset.manifest.decimals) {
          throw new Error('Inventory claim mint is missing or does not match the supported series.');
        }
      }
      return {
        year: entry.manifest.year, address: entry.manifest.address,
        ptMint: entry.manifest.ptMint, drMint: entry.manifest.drMint,
        ptAta: entry.ptAta.toBase58(), drAta: entry.drAta.toBase58(),
        ptRaw: decodeCanonicalAta(entry.ptAta, info(entry.ptAta), TOKEN_PROGRAM_ID, entry.ptMint, owner),
        drRaw: decodeCanonicalAta(entry.drAta, info(entry.drAta), TOKEN_PROGRAM_ID, entry.drMint, owner),
      };
    });
    assets.push({
      assetId: asset.manifest.id, company: asset.manifest.company, symbol: asset.manifest.symbol,
      issuerLabel: asset.manifest.issuerLabel, decimals: asset.manifest.decimals,
      collateralMint: asset.mint.toBase58(), collateralAta: asset.collateralAta.toBase58(),
      collateralRaw, stockDisplayAmount: formatStock(collateralRaw, asset.manifest.decimals, profile.scale.activeBits),
      activeMultiplierBits: profile.scale.activeBits, series,
    });
  }
  return { owner: owner.toBase58(), runtimeId: manifest.runtimeId, contextSlots, assets };
}
