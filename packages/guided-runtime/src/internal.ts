import type { Keypair, PublicKey } from '@solana/web3.js';
import type { DemoSnapshot, DemoState, DemoStep, DemoTransaction } from './contract.js';

export const DEMO_STEPS: readonly DemoStep[] = [
  'split', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity',
  'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider',
] as const;

export interface RuntimeSigners {
  admin: Keypair;
  attestor: Keypair;
  provider: Keypair;
  buyer: Keypair;
  collateralMint: Keypair;
}

export interface KnownAddresses {
  issuerId: Uint8Array;
  assetPolicy: PublicKey;
  series: {
    series: PublicKey;
    accumulator: PublicKey;
    ptMint: PublicKey;
    drMint: PublicKey;
    vault: PublicKey;
  };
  providerCollateral: PublicKey;
  providerPt: PublicKey;
  providerDr: PublicKey;
  providerQuote: PublicKey;
  buyerCollateral: PublicKey;
  buyerPt: PublicKey;
  buyerDr: PublicKey;
  buyerQuote: PublicKey;
}

export interface PoolAddresses {
  poolId: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  drVault: PublicKey;
  quoteVault: PublicKey;
  providerLp: PublicKey;
}

export interface DemoCheckpoint {
  step: DemoStep | 'setup';
  snapshot: DemoSnapshot;
}

export interface PublicReceipt {
  schemaVersion: 2;
  runtimeId: string;
  sessionId: string;
  boundary: 'offline-local-circle-devnet-usdc-clone';
  capture: {
    sourceCluster: 'devnet';
    sourceSlot: number;
    raydiumProgramData: string;
    raydiumDeploySlot: number;
    raydiumElfSha256: string;
    dividendXElfSha256: string;
    configAccountSha256: string;
    feeAccountSha256: string;
    circleUsdc: {
      sourceUrl: string;
      sourceCluster: 'devnet';
      sourceGenesisHash: string;
      sourceSlot: number;
      mint: string;
      owner: string;
      dataSha256: string;
      supplyRaw: string;
      decimals: 6;
      mintAuthority: string;
      freezeAuthority: string;
    };
  };
  localFunding: {
    method: 'surfpool-set-account';
    providerRaw: '10000000';
    buyerRaw: '1000000';
    totalRaw: '11000000';
    publicFaucetTransfer: false;
  };
  identities: {
    programs: { dividendX: string; raydium: string; raydiumConfig: string; raydiumFeeReceiver: string };
    wallets: { provider: string; buyer: string };
    mints: { stock: string; pt: string; dr: string; quote: string; lp: string | null };
    dividendX: { assetPolicy: string; series: string; accumulator: string; vault: string };
    accounts: {
      providerStock: string; providerPt: string; providerDr: string; providerQuote: string; providerLp: string | null;
      buyerStock: string; buyerPt: string; buyerDr: string; buyerQuote: string;
      poolVaultA: string | null; poolVaultB: string | null; poolDrVault: string | null; poolQuoteVault: string | null;
    };
    pool: string | null;
  };
  transactions: DemoTransaction[];
  checkpoints: DemoCheckpoint[];
  failure: null | {
    failedAt: string;
    step: DemoStep | 'setup' | null;
    error: string;
    snapshot: DemoSnapshot | null;
    lastKnownObservedAt: string | null;
  };
  limits: string[];
}

export interface PersistedRuntimeState {
  savedAt: string;
  state: DemoState;
  receipt: PublicReceipt | null;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
