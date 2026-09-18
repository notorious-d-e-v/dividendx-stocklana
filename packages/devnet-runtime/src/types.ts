export interface RegistrySeries {
  year: 2027;
  address: string;
  accumulator: string;
  ptMint: string;
  drMint: string;
  vault: string;
}

export interface RegistryAsset {
  id: string;
  company: string;
  symbol: string;
  issuerLabel: string;
  issuerIdHex: string;
  decimals: number;
  collateralMint: string;
  assetPolicy: string;
  series: RegistrySeries[];
}

export interface RegistryManifest {
  schemaVersion: 1;
  kind: 'devnet';
  rpcUrl: string;
  genesisHash: string;
  programId: string;
  deploymentDomainHex: string;
  runtimeId: string;
  clockControl: false;
  faucetEnabled: false;
  assets: RegistryAsset[];
}

export interface StoredAttempt {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  serializedTransactionBase64: string;
  preparedAt: string;
  submittedAt: string | null;
}

export interface PrivateRuntimeState {
  schema: 'dividendx-devnet-private-state-v1';
  runtimeId: string;
  rpcUrl: string;
  genesisHash: string;
  programId: string;
  deploymentDomainHex: string;
  initialAdminLamports: string | null;
  publicKeys: Record<string, string>;
  steps: Record<string, { attempts: StoredAttempt[] }>;
}
