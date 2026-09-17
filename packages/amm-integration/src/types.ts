export type ExecutionMode = 'devnet' | 'local-clone';

export interface ExecutionManifest {
  schema: 'dividendx-raydium-cpmm-v1';
  mode: ExecutionMode;
  rpcUrl: string;
  expectedGenesisHash: string;
  expectedDividendXUpgradeAuthority: string;
  deploymentDomainHex: string;
  expectedDividendXElfSha256: string;
  expectedRaydiumElfSha256: string;
  maxCreatePoolFeeLamports: string;
  maxRunSpendLamports: string;
  expectedYear: 2027;
}

export interface AmmConfigSnapshot {
  address: string;
  bump: number;
  disableCreatePool: boolean;
  index: number;
  tradeFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  createPoolFee: bigint;
  protocolOwner: string;
  fundOwner: string;
  creatorFeeRate: bigint;
}

export interface ProgramIdentity {
  address: string;
  owner: string;
  executable: boolean;
  programData: string | null;
  deploySlot: string | null;
  upgradeAuthority: string | null;
  elfSha256: string;
}

export interface PreflightResult {
  mode: ExecutionMode;
  rpcUrl: string;
  genesisHash: string;
  contextSlot: number;
  dividendX: ProgramIdentity;
  raydium: ProgramIdentity;
  config: AmmConfigSnapshot;
  feeReceiver: {
    address: string;
    mint: string;
    tokenOwner: string;
    amountRaw: string;
    isNative: boolean;
  };
}

export interface AssetBalances {
  collateral: { provider: bigint; vault: bigint; supply: bigint };
  pt: { provider: bigint; otherKnown: bigint; supply: bigint };
  dr: { provider: bigint; buyer: bigint; poolVault: bigint; poolProtocolFees: bigint; poolFundFees: bigint; poolCreatorFees: bigint; otherKnown: bigint; supply: bigint };
  testQuote: { provider: bigint; buyer: bigint; poolVault: bigint; poolProtocolFees: bigint; poolFundFees: bigint; poolCreatorFees: bigint; otherKnown: bigint; supply: bigint; controlledTotal?: bigint };
  lp: { provider: bigint; mintSupply: bigint; internalPoolLpAmount: bigint };
}

export interface ConfirmedStepReceipt {
  name: string;
  signature: string;
  slot: number;
  confirmationStatus: 'confirmed' | 'finalized';
  simulationUnitsConsumed: number | null;
  simulationLogs: string[];
}
