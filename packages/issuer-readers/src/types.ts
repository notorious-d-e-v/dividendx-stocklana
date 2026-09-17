export type IssuerId = "xstocks" | "backpack" | "ondo";

export interface SelectedAsset {
  readonly issuerId: IssuerId;
  readonly symbol: string;
  readonly underlying: string;
  readonly mint: string;
  readonly decimals: number;
  readonly tokenProgram: string;
  readonly chain: "solana:mainnet-beta";
}

export interface RequestObservation {
  endpoint: string;
  retrievedAt: string;
  status: number | null;
  dataDigest: string | null;
  error: string | null;
}

export interface IdentityObservation {
  issuerId: IssuerId;
  chain: "solana:mainnet-beta";
  symbol: string;
  expectedMint: string;
  observedMint: string;
  mintMatches: true;
  expectedDecimals: number;
  observedDecimals: number | null;
  decimalsReobserved: boolean;
  decimalsMatch: boolean | null;
  expectedTokenProgram: string;
  observedTokenProgram: null;
  tokenProgramReobserved: false;
}

export interface ComponentFailure {
  state: "failed" | "unavailable" | "skipped";
  code: string;
}

export interface ObservedComponent<T> {
  state: "observed";
  value: T;
}

export type Component<T> = ObservedComponent<T> | ComponentFailure;

export interface IssuerAssetObservation<T = unknown> {
  asset: SelectedAsset;
  identity: Component<IdentityObservation>;
  detail: T;
  blockers: string[];
  settlementReady: false;
}

export interface IssuerObservation<T = unknown> {
  issuerId: IssuerId;
  state: "observed" | "partial" | "unavailable" | "failed";
  assets: IssuerAssetObservation<T>[];
  requests: RequestObservation[];
  stopped: null | { code: string; remainingRequestsSkipped?: number; remainingSelectedAssetsSkipped?: number };
}

export interface IssuerReadReport {
  schema: "dividendx-issuer-observations-v1";
  requestedYear: number;
  startedAt: string;
  completedAt: string;
  selected: SelectedAsset[];
  issuers: IssuerObservation[];
  settlementReady: false;
  blockers: string[];
}

export const SETTLEMENT_BLOCKERS = Object.freeze([
  "authoritative_event_to_mint_factor_binding",
  "official_civil_ex_dates",
  "revision_and_cancellation_semantics",
  "complete_annual_coverage_and_finality",
  "live_custody_admission",
] as const);
