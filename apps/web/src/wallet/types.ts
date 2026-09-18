import type { WalletAccount, WalletWithFeatures } from '@wallet-standard/base';
import type { StandardConnectFeature, StandardEventsFeature } from '@wallet-standard/features';
import type { SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import type { CoherentQuoteSnapshot, EligibilitySnapshot } from '@dividendx/transaction-sdk';
import type { PublicKey } from '@solana/web3.js';

export interface LocalSeriesManifest {
  year: number;
  address: string;
  accumulator: string;
  ptMint: string;
  drMint: string;
  vault: string;
}

export interface LocalAssetManifest {
  id: string;
  company: string;
  symbol: string;
  issuerLabel: string;
  issuerIdHex: string;
  decimals: 6 | 8 | 9;
  collateralMint: string;
  assetPolicy: string;
  series: LocalSeriesManifest[];
}

export interface LocalManifest {
  schemaVersion: 1;
  kind: 'surfnet' | 'local-validator' | 'devnet';
  rpcUrl: string;
  wsUrl?: string;
  genesisHash: string;
  programId: string;
  deploymentDomainHex: string;
  runtimeId: string;
  clockControl: boolean;
  faucetEnabled?: boolean;
  hostedSessionId?: string;
  expiresAt?: string;
  assets: LocalAssetManifest[];
}

export type WalletNetwork = 'local' | 'devnet' | 'sandbox';

export type CompatibleWallet = WalletWithFeatures<StandardConnectFeature & StandardEventsFeature & SolanaSignTransactionFeature>;

export interface ConnectedWallet {
  wallet: CompatibleWallet;
  account: WalletAccount;
  temporary: boolean;
}

export interface HolderAddresses {
  collateral: PublicKey;
  pt: PublicKey;
  dr: PublicKey;
}

export interface WalletSeriesSnapshot {
  quote: CoherentQuoteSnapshot;
  eligibility: EligibilitySnapshot;
  holderAddresses?: HolderAddresses;
  collateralRaw: bigint;
  ptRaw: bigint;
  drRaw: bigint;
}

export interface UiReceipt {
  label: string;
  signature: string;
  slot: number | null;
  status: string;
}
