import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { checkedDigest, u16Le, u64Le } from './bytes.js';
import { DIVIDENDX_PROGRAM_ID } from './constants.js';

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

export interface DerivedAddress {
  address: PublicKey;
  bump: number;
}

function derive(seeds: readonly Uint8Array[], programId: PublicKey): DerivedAddress {
  const [address, bump] = PublicKey.findProgramAddressSync([...seeds], programId);
  return { address, bump };
}

export function configPda(programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('config')], programId);
}

export function programDataAddress(programId = DIVIDENDX_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([programId.toBytes()], BPF_LOADER_UPGRADEABLE_PROGRAM_ID)[0];
}

export function annualSeriesAddresses(
  issuerId: Uint8Array,
  collateralMint: PublicKey,
  year: number,
  programId = DIVIDENDX_PROGRAM_ID,
) {
  const assetPolicy = assetPolicyPda(issuerId, collateralMint, programId).address;
  const series = seriesPda(assetPolicy, year, programId).address;
  return {
    config: configPda(programId).address,
    assetPolicy,
    series,
    accumulator: accumulatorPda(series, programId).address,
    ptMint: ptMintPda(series, programId).address,
    drMint: drMintPda(series, programId).address,
    vault: vaultAddress(series, collateralMint),
  };
}

export function assetPolicyPda(issuerId: Uint8Array, collateralMint: PublicKey, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('asset'), checkedDigest(issuerId, 'issuer ID'), collateralMint.toBytes()], programId);
}

export function seriesPda(assetPolicy: PublicKey, year: number, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('series'), assetPolicy.toBytes(), u16Le(year)], programId);
}

export function ptMintPda(series: PublicKey, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('pt'), series.toBytes()], programId);
}

export function drMintPda(series: PublicKey, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('dr'), series.toBytes()], programId);
}

export function vaultAddress(series: PublicKey, collateralMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(collateralMint, series, true, TOKEN_2022_PROGRAM_ID);
}

export function eventHeadPda(series: PublicKey, eventId: Uint8Array, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('event'), series.toBytes(), checkedDigest(eventId, 'event ID')], programId);
}

export function eventRevisionPda(eventHead: PublicKey, revision: bigint, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('revision'), eventHead.toBytes(), u64Le(revision)], programId);
}

export function accumulatorPda(series: PublicKey, programId = DIVIDENDX_PROGRAM_ID): DerivedAddress {
  return derive([Buffer.from('accumulator'), series.toBytes()], programId);
}

export function deriveClaimNames(symbol: string, year: number): { pt: string; dr: string } {
  const encoded = new TextEncoder().encode(symbol);
  if (symbol.length === 0 || encoded.length > 16 || !Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new RangeError('symbol must contain 1-16 UTF-8 bytes and year must be 2020-2100');
  }
  return { pt: `PT-${symbol}-${year}`, dr: `DR-${symbol}-${year}` };
}
