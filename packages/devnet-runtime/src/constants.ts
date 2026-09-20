import { PublicKey } from '@solana/web3.js';

export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEFAULT_DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const TESTNET_GENESIS_HASH = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';
export const PROGRAM_ID = new PublicKey('2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE');
export const ADMIN_ID = new PublicKey('DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv');
export const DEPLOYMENT_DOMAIN_HEX = 'ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab';
export const ACCEPTED_ELF_SHA256 = 'a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070';
export const SERIES_YEAR = 2027;
export const MAX_BOOTSTRAP_SPEND_LAMPORTS = 150_000_000n;
export const MAX_CATALOG_EXPANSION_SPEND_LAMPORTS = 300_000_000n;
export const FAUCET_BOOTSTRAP_LAMPORTS = 30_000_000;
export const ATTESTOR_BOOTSTRAP_LAMPORTS = 10_000_000;
export const HOLDER_TOKEN_CAP_UI = 10n;
export const HOLDER_SOL_CAP_LAMPORTS = 6_000_000;
export const MAX_OBSERVATION_LIFETIME_SECONDS = 86_400n;
export const DEFAULT_OBSERVATION_LIFETIME_SECONDS = 43_200n;

export const LEGACY_PROFILES = Object.freeze([
  { id: 'xstocks-test-kox', company: 'Coca-Cola', symbol: 'TestKOx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'backpack-test-mu', company: 'Micron', symbol: 'TestMU', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
  { id: 'ondo-test-ibm', company: 'IBM', symbol: 'TestIBMon', issuerLabel: 'Ondo test profile', decimals: 9 },
] as const);

export const NEW_PROFILES = Object.freeze([
  { id: 'xstocks-test-aapl', company: 'Apple', symbol: 'TestAAPLx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'xstocks-test-msft', company: 'Microsoft', symbol: 'TestMSFTx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'xstocks-test-mu', company: 'Micron', symbol: 'TestMUx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'xstocks-test-nke', company: 'Nike', symbol: 'TestNKEx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'xstocks-test-ibm', company: 'IBM', symbol: 'TestIBMx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'backpack-test-nke', company: 'Nike', symbol: 'TestNKE', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
  { id: 'backpack-test-ibm', company: 'IBM', symbol: 'TestIBM', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
  { id: 'ondo-test-ko', company: 'Coca-Cola', symbol: 'TestKOon', issuerLabel: 'Ondo test profile', decimals: 9 },
  { id: 'ondo-test-aapl', company: 'Apple', symbol: 'TestAAPLon', issuerLabel: 'Ondo test profile', decimals: 9 },
  { id: 'ondo-test-msft', company: 'Microsoft', symbol: 'TestMSFTon', issuerLabel: 'Ondo test profile', decimals: 9 },
  { id: 'ondo-test-mu', company: 'Micron', symbol: 'TestMUon', issuerLabel: 'Ondo test profile', decimals: 9 },
  { id: 'ondo-test-nke', company: 'Nike', symbol: 'TestNKEon', issuerLabel: 'Ondo test profile', decimals: 9 },
] as const);

export const PROFILES = Object.freeze([...LEGACY_PROFILES, ...NEW_PROFILES] as const);

export type Profile = (typeof PROFILES)[number];
