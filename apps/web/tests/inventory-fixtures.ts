import {
  ACCOUNT_SIZE,
  AccountLayout,
  AccountState,
  AccountType,
  ExtensionType,
  MINT_SIZE,
  MintLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMintLen,
} from '@solana/spl-token';
import { Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, type AccountInfo, type Connection } from '@solana/web3.js';
import { DIVIDENDX_PROGRAM_ID, annualSeriesAddresses } from '@dividendx/transaction-sdk';
import type { LocalManifest } from '../src/wallet/types';

const FACTOR_BITS = 0x3ff8000000000000n; // 1.5

function accountInfo(owner: PublicKey, data: Buffer): AccountInfo<Buffer> {
  return { owner, data, lamports: 1_000_000, executable: false, rentEpoch: 0 };
}

function mintData(decimals: number, scaled: boolean): Buffer {
  const data = Buffer.alloc(scaled ? getMintLen([ExtensionType.ScaledUiAmountConfig]) : MINT_SIZE);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 0n,
    decimals, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  if (scaled) {
    data[ACCOUNT_SIZE] = AccountType.Mint;
    data.writeUInt16LE(ExtensionType.ScaledUiAmountConfig, ACCOUNT_SIZE + 1);
    data.writeUInt16LE(56, ACCOUNT_SIZE + 3);
    const start = ACCOUNT_SIZE + 5;
    data.writeBigUInt64LE(FACTOR_BITS, start + 32);
    data.writeBigInt64LE(0n, start + 40);
    data.writeBigUInt64LE(FACTOR_BITS, start + 48);
  }
  return data;
}

function tokenData(mint: PublicKey, owner: PublicKey, raw: bigint,
  state = AccountState.Initialized): Buffer {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({ mint, owner, amount: raw, delegateOption: 0, delegate: PublicKey.default,
    state, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
    closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data);
  return data;
}

export interface InventoryFixture {
  manifest: LocalManifest;
  owner: PublicKey;
  accounts: Map<string, AccountInfo<Buffer> | null>;
  calls: number[];
  minContextSlots: (number | undefined)[];
  connection: Connection;
  setHolding(assetIndex: number, amounts: { collateral?: bigint; pt?: bigint; dr?: bigint },
    seriesIndex?: number): void;
  tokenAccount(mint: PublicKey, owner: PublicKey, raw: bigint,
    programId?: PublicKey, state?: AccountState): AccountInfo<Buffer>;
}

/** Self-contained valid mints/Clock and absent holder ATAs. No network is used. */
export function createInventoryFixture(assetCount = 1, seriesCount = 1): InventoryFixture {
  const owner = Keypair.generate().publicKey;
  const accounts = new Map<string, AccountInfo<Buffer> | null>();
  const calls: number[] = [];
  const minContextSlots: (number | undefined)[] = [];
  const clock = Buffer.alloc(40);
  clock.writeBigInt64LE(1_800_000_000n, 32);
  accounts.set(SYSVAR_CLOCK_PUBKEY.toBase58(), accountInfo(PublicKey.default, clock));
  const assets: LocalManifest['assets'] = [];
  for (let index = 0; index < assetCount; index += 1) {
    const mint = Keypair.generate().publicKey;
    const issuerId = Uint8Array.from({ length: 32 }, (_, byte) => (index * 37 + byte + 1) % 256);
    const decimals = ([6, 8, 9] as const)[index % 3]!;
    const collateralAta = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
    accounts.set(mint.toBase58(), accountInfo(TOKEN_2022_PROGRAM_ID, mintData(decimals, true)));
    accounts.set(collateralAta.toBase58(), null);
    const series = [];
    for (let offset = 0; offset < seriesCount; offset += 1) {
      const year = 2027 + offset;
      const derived = annualSeriesAddresses(issuerId, mint, year);
      accounts.set(derived.ptMint.toBase58(), accountInfo(TOKEN_PROGRAM_ID, mintData(decimals, false)));
      accounts.set(derived.drMint.toBase58(), accountInfo(TOKEN_PROGRAM_ID, mintData(decimals, false)));
      accounts.set(getAssociatedTokenAddressSync(derived.ptMint, owner).toBase58(), null);
      accounts.set(getAssociatedTokenAddressSync(derived.drMint, owner).toBase58(), null);
      series.push({ year, address: derived.series.toBase58(), accumulator: derived.accumulator.toBase58(),
        ptMint: derived.ptMint.toBase58(), drMint: derived.drMint.toBase58(), vault: derived.vault.toBase58() });
    }
    const derived = annualSeriesAddresses(issuerId, mint, 2027);
    assets.push({ id: `asset-${index}`, company: `Company ${index}`, symbol: `Test${index}`,
      issuerLabel: 'synthetic test profile', issuerIdHex: Buffer.from(issuerId).toString('hex'),
      decimals, collateralMint: mint.toBase58(), assetPolicy: derived.assetPolicy.toBase58(), series });
  }
  const manifest: LocalManifest = {
    schemaVersion: 1, kind: 'devnet', rpcUrl: 'https://api.devnet.solana.com', genesisHash: 'fixture-genesis',
    programId: DIVIDENDX_PROGRAM_ID.toBase58(), deploymentDomainHex: '00'.repeat(32),
    runtimeId: 'fixture-runtime', clockControl: false, faucetEnabled: false, assets,
  };
  const connection = {
    async getMultipleAccountsInfoAndContext(addresses: PublicKey[], config?: { minContextSlot?: number }) {
      calls.push(addresses.length);
      minContextSlots.push(config?.minContextSlot);
      return { context: { slot: 123 }, value: addresses.map((address) => {
        const name = address.toBase58();
        if (!accounts.has(name)) throw new Error(`Fixture omitted ${name}`);
        return accounts.get(name)!;
      }) };
    },
  } as unknown as Connection;
  return {
    manifest, owner, accounts, calls, minContextSlots, connection,
    setHolding(assetIndex, amounts, seriesIndex = 0) {
      const asset = manifest.assets[assetIndex]!;
      const entry = asset.series[seriesIndex]!;
      const mint = new PublicKey(asset.collateralMint);
      const ptMint = new PublicKey(entry.ptMint);
      const drMint = new PublicKey(entry.drMint);
      if (amounts.collateral !== undefined) accounts.set(getAssociatedTokenAddressSync(mint, owner, false,
        TOKEN_2022_PROGRAM_ID).toBase58(), accountInfo(TOKEN_2022_PROGRAM_ID, tokenData(mint, owner, amounts.collateral)));
      if (amounts.pt !== undefined) accounts.set(getAssociatedTokenAddressSync(ptMint, owner).toBase58(),
        accountInfo(TOKEN_PROGRAM_ID, tokenData(ptMint, owner, amounts.pt)));
      if (amounts.dr !== undefined) accounts.set(getAssociatedTokenAddressSync(drMint, owner).toBase58(),
        accountInfo(TOKEN_PROGRAM_ID, tokenData(drMint, owner, amounts.dr)));
    },
    tokenAccount(mint, accountOwner, raw, programId = TOKEN_PROGRAM_ID, state = AccountState.Initialized) {
      return accountInfo(programId, tokenData(mint, accountOwner, raw, state));
    },
  };
}
