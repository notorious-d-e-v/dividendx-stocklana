import { expect, test } from '@playwright/test';
import { AccountState, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { decodeCanonicalAta, fetchWalletInventory } from '../src/wallet/inventory';
import { createInventoryFixture } from './inventory-fixtures';

test('inventory treats missing canonical ATAs as zero and formats current scaled stock holdings', async () => {
  const fixture = createInventoryFixture();
  const empty = await fetchWalletInventory(fixture.connection, fixture.manifest, fixture.owner);
  expect(empty.runtimeId).toBe('fixture-runtime');
  expect(empty.contextSlots).toEqual([123]);
  expect(empty.assets[0]!.collateralRaw).toBe(0n);
  expect(empty.assets[0]!.stockDisplayAmount).toBe('0');
  expect(empty.assets[0]!.series[0]!.ptRaw).toBe(0n);
  expect(empty.assets[0]!.series[0]!.drRaw).toBe(0n);
  expect(fixture.calls).toEqual([7]);

  fixture.setHolding(0, { collateral: 2_000_000n, pt: 300_000n, dr: 200_000n });
  const funded = await fetchWalletInventory(fixture.connection, fixture.manifest, fixture.owner);
  expect(funded.assets[0]!.collateralRaw).toBe(2_000_000n);
  expect(funded.assets[0]!.stockDisplayAmount).toBe('3');
  expect(funded.assets[0]!.activeMultiplierBits).toBe(0x3ff8000000000000n);
  expect(funded.assets[0]!.series[0]!.ptRaw).toBe(300_000n);
  expect(funded.assets[0]!.series[0]!.drRaw).toBe(200_000n);
});

test('present wrong-program, wrong-mint, wrong-wallet and frozen ATAs fail closed', () => {
  const fixture = createInventoryFixture();
  const mint = new PublicKey(fixture.manifest.assets[0]!.collateralMint);
  const ata = getAssociatedTokenAddressSync(mint, fixture.owner, false, TOKEN_2022_PROGRAM_ID);
  const valid = fixture.tokenAccount(mint, fixture.owner, 7n, TOKEN_2022_PROGRAM_ID);
  expect(decodeCanonicalAta(ata, valid, TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toBe(7n);
  expect(decodeCanonicalAta(ata, null, TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toBe(0n);
  expect(() => decodeCanonicalAta(ata, fixture.tokenAccount(mint, fixture.owner, 7n, TOKEN_PROGRAM_ID),
    TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toThrow(/wrong program owner/);
  expect(() => decodeCanonicalAta(ata, fixture.tokenAccount(Keypair.generate().publicKey, fixture.owner, 7n,
    TOKEN_2022_PROGRAM_ID), TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toThrow(/mint or wallet owner/);
  expect(() => decodeCanonicalAta(ata, fixture.tokenAccount(mint, Keypair.generate().publicKey, 7n,
    TOKEN_2022_PROGRAM_ID), TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toThrow(/mint or wallet owner/);
  expect(() => decodeCanonicalAta(ata, fixture.tokenAccount(mint, fixture.owner, 7n,
    TOKEN_2022_PROGRAM_ID, AccountState.Frozen), TOKEN_2022_PROGRAM_ID, mint, fixture.owner)).toThrow(/not spendable/);
});

test('inventory rejects missing supported mints and malformed RPC account lists', async () => {
  const fixture = createInventoryFixture();
  const mint = fixture.manifest.assets[0]!.collateralMint;
  fixture.accounts.set(mint, null);
  await expect(fetchWalletInventory(fixture.connection, fixture.manifest, fixture.owner)).rejects.toThrow(/collateral mint is missing/);
  const shortFixture = createInventoryFixture();
  shortFixture.connection.getMultipleAccountsInfoAndContext = async () => ({
    context: { slot: 123 }, value: [],
  }) as never;
  await expect(fetchWalletInventory(shortFixture.connection, shortFixture.manifest, shortFixture.owner)).rejects.toThrow(/incomplete or malformed/);
});

test('inventory caps account batches at 100 and returns every supported asset', async () => {
  const fixture = createInventoryFixture(17);
  fixture.setHolding(16, { collateral: 1_000_000_000n });
  const inventory = await fetchWalletInventory(fixture.connection, fixture.manifest, fixture.owner);
  expect(fixture.calls).toEqual([100, 3]);
  expect(fixture.minContextSlots).toEqual([undefined, 123]);
  expect(inventory.contextSlots).toEqual([123, 123]);
  expect(inventory.assets).toHaveLength(17);
  expect(inventory.assets.filter((asset) => asset.collateralRaw > 0n).map((asset) => asset.assetId)).toEqual(['asset-16']);
});

test('inventory refuses a manifest whose annual series is not derived from its issuer and mint', async () => {
  const fixture = createInventoryFixture();
  fixture.manifest.assets[0]!.series[0]!.ptMint = Keypair.generate().publicKey.toBase58();
  await expect(fetchWalletInventory(fixture.connection, fixture.manifest, fixture.owner)).rejects.toThrow(/ptMint does not match/);
  expect(fixture.calls).toHaveLength(0);
});
