import { array, bool, exactDecimal, fail, integer, object, safeCode, string } from "./schema.js";
import { failedRequest, observePublicJson, stopCode } from "./transport.js";
import { SETTLEMENT_BLOCKERS, type IdentityObservation, type IssuerAssetObservation, type IssuerObservation, type RequestObservation, type SelectedAsset } from "./types.js";

export const BACKPACK_ORIGIN = "https://api.backpack.exchange";
export const BACKPACK_MAX_BYTES = 8 * 1024 * 1024;

export interface BackpackListing {
  displayName: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  nativeDecimals: number;
  minimumDeposit: string;
  minimumWithdrawal: string;
  maximumWithdrawal: string | null;
  withdrawalFee: string;
  operationalAvailability: "available" | "restricted";
}

export interface BackpackDetail {
  listing: { state: "observed"; value: BackpackListing } | { state: "failed" | "skipped"; code: string };
  corporateActions: {
    state: "unavailable";
    code: "issuer_event_endpoint_not_public";
    annualCoverageAttested: false;
    zeroDividendYearEstablished: false;
  };
}

export function parseBackpackRegistry(value: unknown, asset: SelectedAsset): { identity: IdentityObservation; listing: BackpackListing } {
  if (asset.issuerId !== "backpack" || asset.chain !== "solana:mainnet-beta") fail("asset_identity_family_mismatch");
  const parentMatches = array(value, "backpack_registry_malformed")
    .map((item) => object(item, "backpack_registry_malformed"))
    .filter((item) => string(item.symbol, "backpack_registry_malformed") === asset.symbol);
  if (parentMatches.length !== 1) fail(parentMatches.length === 0 ? "backpack_symbol_missing" : "backpack_symbol_duplicate");
  const parent = parentMatches[0]!;
  const tokenMatches = array(parent.tokens, "backpack_registry_malformed")
    .map((item) => object(item, "backpack_registry_malformed"))
    .filter((item) => string(item.blockchain, "backpack_registry_malformed") === "Solana");
  if (tokenMatches.length !== 1) fail(tokenMatches.length === 0 ? "backpack_solana_token_missing" : "backpack_solana_token_duplicate");
  const token = tokenMatches[0]!;
  const observedMint = string(token.contractAddress, "backpack_registry_malformed");
  const observedDecimals = integer(token.nativeDecimals, "backpack_registry_malformed");
  if (observedMint !== asset.mint) fail("backpack_mint_mismatch");
  if (observedDecimals !== asset.decimals) fail("backpack_decimals_mismatch");
  const maximumWithdrawal = token.maximumWithdrawal === null ? null : string(token.maximumWithdrawal, "backpack_registry_malformed");
  // These are source strings, not arithmetic inputs. Validate their type without normalizing them.
  const listing: BackpackListing = {
    displayName: string(token.displayName, "backpack_registry_malformed"),
    depositEnabled: bool(token.depositEnabled, "backpack_registry_malformed"),
    withdrawEnabled: bool(token.withdrawEnabled, "backpack_registry_malformed"),
    nativeDecimals: observedDecimals,
    minimumDeposit: exactDecimal(token.minimumDeposit),
    minimumWithdrawal: exactDecimal(token.minimumWithdrawal),
    maximumWithdrawal: maximumWithdrawal === null ? null : exactDecimal(maximumWithdrawal),
    withdrawalFee: exactDecimal(token.withdrawalFee),
    operationalAvailability: bool(token.depositEnabled, "backpack_registry_malformed") && bool(token.withdrawEnabled, "backpack_registry_malformed") ? "available" : "restricted",
  };
  string(parent.displayName, "backpack_registry_malformed");
  if (!(parent.coingeckoId === null || typeof parent.coingeckoId === "string")) fail("backpack_registry_malformed");
  return {
    identity: {
      issuerId: "backpack", chain: "solana:mainnet-beta", symbol: asset.symbol,
      expectedMint: asset.mint, observedMint, mintMatches: true,
      expectedDecimals: asset.decimals, observedDecimals,
      decimalsReobserved: true, decimalsMatch: true,
      expectedTokenProgram: asset.tokenProgram, observedTokenProgram: null, tokenProgramReobserved: false,
    },
    listing,
  };
}

function failedAsset(asset: SelectedAsset, code: string, skipped = false): IssuerAssetObservation<BackpackDetail> {
  return {
    asset,
    identity: { state: skipped ? "skipped" : "failed", code },
    detail: {
      listing: { state: skipped ? "skipped" : "failed", code },
      corporateActions: { state: "unavailable", code: "issuer_event_endpoint_not_public", annualCoverageAttested: false, zeroDividendYearEstablished: false },
    },
    blockers: [...SETTLEMENT_BLOCKERS, "issuer_corporate_action_ledger_unavailable"], settlementReady: false,
  };
}

export async function readBackpack(assets: SelectedAsset[], options: { fetchImpl?: typeof fetch; now?: () => Date } = {}): Promise<IssuerObservation<BackpackDetail>> {
  if (assets.some((asset) => asset.issuerId !== "backpack" || asset.chain !== "solana:mainnet-beta")) fail("asset_identity_family_mismatch");
  const url = new URL("/api/v1/assets", BACKPACK_ORIGIN);
  const requests: RequestObservation[] = [];
  let response;
  try {
    response = await observePublicJson(url, {
      allowedOrigin: BACKPACK_ORIGIN,
      allowedPath: (candidate) => candidate.pathname === "/api/v1/assets" && candidate.search === "",
      maxBytes: BACKPACK_MAX_BYTES,
      ...options,
    });
    requests.push(response.request);
  } catch (error) {
    requests.push(failedRequest(url.pathname, error, options.now));
    return { issuerId: "backpack", state: "failed", assets: assets.map((asset) => failedAsset(asset, safeCode(error))), requests, stopped: null };
  }
  const stop = stopCode(response.request);
  if (stop) {
    return {
      issuerId: "backpack", state: "failed", assets: assets.map((asset) => failedAsset(asset, stop, true)), requests,
      stopped: { code: stop, remainingRequestsSkipped: 0 },
    };
  }
  if (!response.value) {
    const code = response.request.error ?? "backpack_registry_unavailable";
    return { issuerId: "backpack", state: "failed", assets: assets.map((asset) => failedAsset(asset, code)), requests, stopped: null };
  }
  const observed = assets.map((asset): IssuerAssetObservation<BackpackDetail> => {
    try {
      const parsed = parseBackpackRegistry(response.value, asset);
      return {
        asset, identity: { state: "observed", value: parsed.identity },
        detail: {
          listing: { state: "observed", value: parsed.listing },
          corporateActions: { state: "unavailable", code: "issuer_event_endpoint_not_public", annualCoverageAttested: false, zeroDividendYearEstablished: false },
        },
        blockers: [
          ...SETTLEMENT_BLOCKERS, "issuer_corporate_action_ledger_unavailable",
          ...(parsed.listing.depositEnabled ? [] : ["issuer_deposits_disabled"]),
          ...(parsed.listing.withdrawEnabled ? [] : ["issuer_withdrawals_disabled"]),
        ], settlementReady: false,
      };
    } catch (error) { return failedAsset(asset, safeCode(error)); }
  });
  const failures = observed.filter((item) => item.identity.state !== "observed").length;
  return { issuerId: "backpack", state: failures === 0 ? "observed" : failures === observed.length ? "failed" : "partial", assets: observed, requests, stopped: null };
}
