/** Public, JSON-only contract. Import as types in the browser; never expose signing keys. */
export const DEMO_ASSETS = [
  { id: 'xstocks-test-kox', company: 'Coca-Cola', symbol: 'TestKOx', issuerLabel: 'xStocks test profile', decimals: 8 },
  { id: 'backpack-test-mu', company: 'Micron', symbol: 'TestMU', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
  { id: 'ondo-test-ibm', company: 'IBM', symbol: 'TestIBMon', issuerLabel: 'Ondo test profile', decimals: 9 },
] as const;
export type DemoAssetId = (typeof DEMO_ASSETS)[number]['id'];
export type DemoAsset = (typeof DEMO_ASSETS)[number];
export type DemoStep = 'core-split' | 'core-recombine-partial' | 'core-recombine-rest' | 'dividend-split' | 'dividend-quarter-one' | 'dividend-quarter-two' | 'dividend-recombine' | 'create-pool' | 'add-liquidity' | 'buy-dr' | 'remove-liquidity' | 'recombine' | 'settle-year' | 'redeem-buyer' | 'redeem-provider';
export type DemoStatus = 'idle' | 'preparing' | 'ready' | 'running' | 'failed' | 'complete';
export interface DemoWallet {
  address: string;
  stockRaw: string;
  ptRaw: string;
  drRaw: string;
  quoteRaw: string;
  lpRaw: string;
}
export interface DemoTransaction {
  step: DemoStep | 'setup';
  name: string;
  signature: string;
  status: 'submitted' | 'confirmed' | 'finalized';
  slot: number | null;
}
export interface DemoSnapshot {
  asset: DemoAsset;
  observedAt: string;
  slot: number;
  unixTimestamp: string;
  genesisHash: string;
  rpcUrl: string;
  dividendXProgram: string;
  raydiumProgram: string;
  series: string;
  year: 2027;
  phase: 'open' | 'sealing' | 'finalized';
  eventCount: number;
  stockDecimals: number;
  claimDecimals: number;
  quoteDecimals: number;
  quoteAsset: {
    symbol: 'USDC';
    provenance: 'local-circle-devnet-clone';
    canonicalMint: string;
  };
  lpDecimals: number;
  stockMultiplierBits: string;
  provider: DemoWallet;
  buyer: DemoWallet;
  mints: { stock: string; pt: string; dr: string; quote: string; lp: string | null };
  pool: null | { address: string; drRaw: string; quoteRaw: string; lockedLpRaw: string };
  vaultRaw: string;
  ptSupplyRaw: string;
  drSupplyRaw: string;
  backingVerified: boolean;
  swap: null | { inputQuoteRaw: string; outputDrRaw: string; minimumDrRaw: string };
}
export interface DemoState {
  schemaVersion: 4;
  runtimeId: string;
  revision: number;
  sessionId: string | null;
  asset: DemoAsset | null;
  status: DemoStatus;
  activeStep: DemoStep | 'setup' | null;
  nextStep: DemoStep | null;
  completedSteps: DemoStep[];
  snapshot: DemoSnapshot | null;
  transactions: DemoTransaction[];
  error: string | null;
}
export interface DemoStartRequest { runtimeId: string; expectedRevision: number; assetId: DemoAssetId }
export interface DemoStepRequest { runtimeId: string; expectedRevision: number; sessionId: string; step: DemoStep }
