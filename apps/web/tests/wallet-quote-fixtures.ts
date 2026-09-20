import anchorCore from '@anchor-lang/core';
import { TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { PublicKey, SYSVAR_CLOCK_PUBKEY, type AccountInfo } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID, configPda, decodeClockAccount, inspectMintProfile,
} from '@dividendx/transaction-sdk';
import type { InventoryFixture } from './inventory-fixtures';

const { BN, BorshAccountsCoder, convertIdlToCamelCase } = anchorCore;
const coder = new BorshAccountsCoder(convertIdlToCamelCase(DIVIDENDX_IDL));
const number = (value: bigint | number) => new BN(value.toString());
const zeros = () => Array(32).fill(0);
const proof = () => [1, ...Array(31).fill(0)];

function programAccount(data: Buffer): AccountInfo<Buffer> {
  return { owner: DIVIDENDX_PROGRAM_ID, data, executable: false, lamports: 1_000_000, rentEpoch: 0 };
}

/** Adds coherent, open-series quote accounts to the canonical ATA fixture. */
export async function addOpenSeriesQuotes(fixture: InventoryFixture): Promise<void> {
  const clock = decodeClockAccount(fixture.accounts.get(SYSVAR_CLOCK_PUBKEY.toBase58())!, 123);
  for (const asset of fixture.manifest.assets) {
    const mintAddress = new PublicKey(asset.collateralMint);
    const mintInfo = fixture.accounts.get(asset.collateralMint)!;
    const mint = unpackMint(mintAddress, mintInfo, TOKEN_2022_PROGRAM_ID);
    const profile = await inspectMintProfile(mint, clock);
    const year = asset.series[0]!;
    const seriesAddress = new PublicKey(year.address);
    const policyData = await coder.encode('assetPolicy', {
      config: configPda().address, issuerId: [...Buffer.from(asset.issuerIdHex, 'hex')],
      collateralMint: mintAddress, symbol: asset.symbol, decimals: asset.decimals,
      attestor: PublicKey.default, policyDigest: zeros(), extensionsMask: number(profile.extensionsMask),
      admissionEnabled: true, reviewedCurrentMultiplierBits: number(profile.scale.currentBits),
      reviewedNewMultiplierBits: number(profile.scale.pendingBits),
      reviewedNewMultiplierEffectiveTimestamp: number(profile.scale.pendingEffectiveTimestamp),
      reviewedActiveMultiplierBits: number(profile.scale.activeBits),
      reviewedControlsFingerprint: [...profile.controlsFingerprint], observedSlot: number(clock.slot),
      observationValidUntil: number(1_900_000_000), observationEvidenceDigest: proof(), bump: 1,
    });
    const seriesData = await coder.encode('series', {
      assetPolicy: new PublicKey(asset.assetPolicy), policyDigest: zeros(), year: year.year,
      startTimestamp: number(1_900_000_000), maturityTimestamp: number(1_930_000_000),
      collateralMint: mintAddress, vault: new PublicKey(year.vault),
      ptMint: new PublicKey(year.ptMint), drMint: new PublicKey(year.drMint),
      decimals: asset.decimals, phase: { open: {} }, nominalBacking: number(0),
      eventCount: 0, unresolvedCount: 0, inYearQualifiedCount: 0, journalVersion: number(0),
      journalHash: zeros(), stateVersion: number(1), sealedJournalVersion: number(0),
      sealedJournalHash: zeros(), sealedCoverageDigest: zeros(), sealedEventCount: 0,
      sealedCurrentMultiplierBits: number(profile.scale.currentBits),
      sealedNewMultiplierBits: number(profile.scale.pendingBits),
      sealedNewMultiplierEffectiveTimestamp: number(profile.scale.pendingEffectiveTimestamp),
      sealedActiveMultiplierBits: number(profile.scale.activeBits),
      sealedControlsFingerprint: [...profile.controlsFingerprint], finalizationSlot: number(0),
      finalSupply: number(0), ptPool: number(0), drPool: number(0),
      ptRedeemedNominal: number(0), drRedeemedNominal: number(0), ptPaid: number(0), drPaid: number(0),
      bump: 1, ptMintBump: 1, drMintBump: 1,
    });
    const accumulatorData = await coder.encode('accumulator', {
      series: seriesAddress, cursor: 0, numerator: Buffer.from([1]), denominator: Buffer.from([1]), bump: 1,
    });
    fixture.accounts.set(asset.assetPolicy, programAccount(policyData));
    fixture.accounts.set(year.address, programAccount(seriesData));
    fixture.accounts.set(year.accumulator, programAccount(accumulatorData));
    fixture.accounts.set(year.vault, fixture.tokenAccount(mintAddress, seriesAddress, 0n, TOKEN_2022_PROGRAM_ID));
  }
}
