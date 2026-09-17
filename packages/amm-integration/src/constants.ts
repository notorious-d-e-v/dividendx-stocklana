import { DEVNET_PROGRAM_ID } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';

export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const PUBLIC_CLUSTER_GENESIS_HASHES = new Set([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N2d',
  DEVNET_GENESIS_HASH,
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);
export const DIVIDENDX_PROGRAM_ID = new PublicKey('2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE');
export const DIVIDENDX_ELF_SHA256 = 'a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070';
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
export const RAYDIUM_CPMM_AUTHORITY = new PublicKey('CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq');
export const RAYDIUM_CONFIG = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
export const RAYDIUM_CREATE_POOL_FEE_RECEIVER = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');
export const RAYDIUM_CAPTURED_ELF_SHA256 = '87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd';
export const RAYDIUM_PROGRAM_DEPLOY_SLOT = 498_629_438;
export const RAYDIUM_CONFIG_OBSERVATION_SLOT = 499_748_702;
export const RAYDIUM_CAPTURED_PROGRAM_DATA = new PublicKey('3KvTa2fYhMxMZNfHho5oX34yLQLwRauoU2JScBkugvXF');

if (!DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.equals(RAYDIUM_CPMM_PROGRAM_ID)
  || !DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC.equals(RAYDIUM_CREATE_POOL_FEE_RECEIVER)
  || !DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_AUTH.equals(RAYDIUM_CPMM_AUTHORITY)) {
  throw new Error('pinned Raydium SDK devnet constants do not match reviewed identities');
}

export const COLLATERAL_DECIMALS = 8;
export const CLAIM_DECIMALS = 8;
export const TEST_QUOTE_DECIMALS = 6;
export const SERIES_YEAR = 2027;

export const CIRCLE_DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const CIRCLE_DEVNET_USDC_MINT_AUTHORITY = new PublicKey('GrNg1XM2ctzeE2mXxXCfhcTUbejM8Z4z4wNVTy2FjMEz');
export const CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY = new PublicKey('CJtyoKSLrktozQzjERTiK3btQtiTK3nN4QrqGHLidyCT');
export const CIRCLE_USDC_SOURCE_URL = 'https://developers.circle.com/stablecoins/usdc-contract-addresses';
export const CIRCLE_USDC_REQUIRED_FUNDING_RAW = 11n * 10n ** 6n;
export type QuoteMode = 'mock' | 'circle-devnet-usdc';

export const FLOW = Object.freeze({
  collateralDepositRaw: 100n * 10n ** 8n,
  seedDrRaw: 40n * 10n ** 8n,
  seedQuoteRaw: 80n * 10n ** 6n,
  addDrRaw: 60n * 10n ** 8n,
  addQuoteRaw: 120n * 10n ** 6n,
  buyerQuoteRaw: 20n * 10n ** 6n,
  slippageBps: 50,
});

export const USDC_FLOW: typeof FLOW = Object.freeze({
  collateralDepositRaw: 100n * 10n ** 8n,
  seedDrRaw: 40n * 10n ** 8n,
  seedQuoteRaw: 4n * 10n ** 6n,
  addDrRaw: 60n * 10n ** 8n,
  addQuoteRaw: 6n * 10n ** 6n,
  buyerQuoteRaw: 1n * 10n ** 6n,
  slippageBps: 50,
});

export const MAX_CREATE_POOL_FEE_LAMPORTS = 250_000_000n;
export const MAX_RUN_SPEND_LAMPORTS = 1_500_000_000n;
export const MAX_TRADE_FEE_RATE = 10_000n;
export const FEE_RATE_DENOMINATOR = 1_000_000n;
