import { array, bool, exactDecimal, fail, integer, object, safeCode, stableJson, string, timestamp } from "./schema.js";
import { failedRequest, observePublicJson, stopCode } from "./transport.js";
import { SETTLEMENT_BLOCKERS, type Component, type IdentityObservation, type IssuerAssetObservation, type IssuerObservation, type RequestObservation, type SelectedAsset } from "./types.js";

export const XSTOCKS_ORIGIN = "https://api.xstocks.fi";
export const XSTOCKS_MAX_PAGES = 100;

export interface XstocksEventRevision {
  eventId: string;
  sourceVersion: number;
  symbol: string;
  xstockIsin: string;
  spvSymbol: string;
  spvIsin: string;
  action: string;
  status: string;
  multiplierOld: string;
  multiplierNew: string;
  createdTime: string;
  effectiveTime: string;
  grossCashflowUsd: string | null;
  netCashflowUsd: string | null;
  withholdingTaxRate: string | null;
  fromUnits: string | null;
  toUnits: string | null;
  redemptionPriceUsd: string | null;
  notes: string | null;
  sourceDigest: string;
  officialExDate: null;
  settlementClassification: null;
  sourceFinalityAttested: false;
}

export interface XstocksPage {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalNodes: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  records: XstocksEventRevision[];
}

export interface XstocksDetail {
  registry: Component<{ id: string; isin: string; isTradingHalted: boolean; underlying: null | { symbol: string; isin: string; listingCountry: string } }>;
  corporateActions: Component<{
    records: XstocksEventRevision[];
    latestObservedHeads: XstocksEventRevision[];
    fullyFetched: true;
    annualCoverageAttested: false;
    zeroDividendYearEstablished: false;
  }> | { state: "partial"; code: string; value: {
    records: XstocksEventRevision[];
    latestObservedHeads: XstocksEventRevision[];
    fullyFetched: false;
    annualCoverageAttested: false;
    zeroDividendYearEstablished: false;
  } };
}

function nullableExact(value: unknown): string | null {
  return value === null ? null : exactDecimal(value);
}

export function parseXstocksRegistry(value: unknown, asset: SelectedAsset): {
  identity: IdentityObservation;
  registry: { id: string; isin: string; isTradingHalted: boolean; underlying: null | { symbol: string; isin: string; listingCountry: string } };
} {
  if (asset.issuerId !== "xstocks" || asset.chain !== "solana:mainnet-beta") fail("asset_identity_family_mismatch");
  const root = object(value, "xstocks_registry_malformed");
  const id = string(root.id, "xstocks_registry_malformed");
  const symbol = string(root.symbol, "xstocks_registry_malformed");
  const isin = string(root.isin, "xstocks_registry_malformed");
  if (symbol !== asset.symbol) fail("xstocks_symbol_mismatch");
  let underlying: null | { symbol: string; isin: string; listingCountry: string } = null;
  if (root.underlying !== null) {
    const source = object(root.underlying, "xstocks_registry_malformed");
    underlying = {
      symbol: string(source.symbol, "xstocks_registry_malformed"),
      isin: string(source.isin, "xstocks_registry_malformed"),
      listingCountry: string(source.listingCountry, "xstocks_registry_malformed"),
    };
  }
  const isTradingHalted = bool(root.isTradingHalted, "xstocks_registry_malformed");
  const matches = array(root.deployments, "xstocks_registry_malformed")
    .map((item) => object(item, "xstocks_registry_malformed"))
    .filter((item) => string(item.network, "xstocks_registry_malformed") === "Solana");
  if (matches.length !== 1) fail(matches.length === 0 ? "xstocks_solana_deployment_missing" : "xstocks_solana_deployment_duplicate");
  const observedMint = string(matches[0]!.address, "xstocks_registry_malformed");
  if (observedMint !== asset.mint) fail("xstocks_mint_mismatch");
  return {
    identity: {
      issuerId: "xstocks", chain: "solana:mainnet-beta", symbol: asset.symbol,
      expectedMint: asset.mint, observedMint, mintMatches: true,
      expectedDecimals: asset.decimals, observedDecimals: null,
      decimalsReobserved: false, decimalsMatch: null,
      expectedTokenProgram: asset.tokenProgram, observedTokenProgram: null, tokenProgramReobserved: false,
    },
    registry: { id, isin, isTradingHalted, underlying },
  };
}

export function parseXstocksHistoryPage(value: unknown, requestedPage: number, symbol: string, sourceDigest: string): XstocksPage {
  const root = object(value, "xstocks_history_malformed");
  const pagination = object(root.page, "xstocks_history_malformed");
  const currentPage = integer(pagination.currentPage, "xstocks_history_malformed");
  const pageSize = integer(pagination.pageSize, "xstocks_history_malformed");
  const totalPages = integer(pagination.totalPages, "xstocks_history_malformed");
  const totalNodes = integer(pagination.totalNodes, "xstocks_history_malformed");
  const hasNextPage = bool(pagination.hasNextPage, "xstocks_history_malformed");
  const hasPreviousPage = bool(pagination.hasPreviousPage, "xstocks_history_malformed");
  if (currentPage !== requestedPage || pageSize < 1 || pageSize > 100 || totalPages < 1 || totalNodes < 0 ||
      hasNextPage !== (currentPage < totalPages) || hasPreviousPage !== (currentPage > 1) || currentPage > totalPages) {
    fail("xstocks_pagination_inconsistent");
  }
  if (totalPages !== Math.max(1, Math.ceil(totalNodes / pageSize))) fail("xstocks_pagination_inconsistent");
  const nodes = array(root.nodes, "xstocks_history_malformed");
  if (nodes.length > pageSize || nodes.length > totalNodes) fail("xstocks_pagination_inconsistent");
  const records = nodes.map((item): XstocksEventRevision => {
    const node = object(item, "xstocks_history_malformed");
    const nodeSymbol = string(node.xstockSymbol, "xstocks_history_malformed");
    if (nodeSymbol !== symbol) fail("xstocks_event_symbol_mismatch");
    const nullableText = (field: string): string | null => node[field] === null ? null : string(node[field], "xstocks_history_malformed");
    const spvSymbol = string(node.spvSymbol, "xstocks_history_malformed");
    const xstockIsin = string(node.xstockIsin, "xstocks_history_malformed");
    const spvIsin = string(node.spvIsin, "xstocks_history_malformed");
    return {
      eventId: string(node.eventId, "xstocks_history_malformed"),
      sourceVersion: integer(node.version, "xstocks_history_malformed"),
      symbol: nodeSymbol,
      xstockIsin, spvSymbol, spvIsin,
      action: string(node.caType, "xstocks_history_malformed"),
      status: string(node.status, "xstocks_history_malformed"),
      multiplierOld: exactDecimal(node.multiplierOld, { positive: true }),
      multiplierNew: exactDecimal(node.multiplierNew, { positive: true }),
      createdTime: timestamp(node.createdTimeUtc),
      effectiveTime: timestamp(node.effectiveTimeUtc),
      grossCashflowUsd: nullableExact(node.grossCashflowUsd),
      netCashflowUsd: nullableExact(node.netCashflowUsd),
      withholdingTaxRate: nullableExact(node.withholdingTaxRate),
      fromUnits: nullableExact(node.fromUnits),
      toUnits: nullableExact(node.toUnits),
      redemptionPriceUsd: nullableExact(node.redemptionPriceUsd),
      notes: nullableText("notes"),
      sourceDigest,
      officialExDate: null,
      settlementClassification: null,
      sourceFinalityAttested: false,
    };
  });
  if (records.some((record) => record.eventId.length === 0 || record.sourceVersion < 0)) fail("xstocks_history_malformed");
  return { currentPage, pageSize, totalPages, totalNodes, hasNextPage, hasPreviousPage, records };
}

export function reduceXstocksRevisions(input: XstocksEventRevision[]): { records: XstocksEventRevision[]; latestObservedHeads: XstocksEventRevision[] } {
  const unique = new Map<string, XstocksEventRevision>();
  for (const record of input) {
    const key = `${record.eventId}\0${record.sourceVersion}`;
    const existing = unique.get(key);
    if (existing) {
      const { sourceDigest: _existingDigest, ...existingValue } = existing;
      const { sourceDigest: _newDigest, ...newValue } = record;
      if (stableJson(existingValue) !== stableJson(newValue)) fail("xstocks_conflicting_event_revision");
    }
    if (!existing) unique.set(key, record);
  }
  const records = [...unique.values()];
  const heads = new Map<string, XstocksEventRevision>();
  for (const record of records) {
    const current = heads.get(record.eventId);
    if (!current || record.sourceVersion > current.sourceVersion) heads.set(record.eventId, record);
  }
  return { records, latestObservedHeads: [...heads.values()] };
}

function validateEventRelationships(records: XstocksEventRevision[], registry: { isin: string; underlying: null | { symbol: string; isin: string } }, asset: SelectedAsset): void {
  for (const record of records) {
    if (record.xstockIsin !== registry.isin) fail("xstocks_event_identity_mismatch");
    if (registry.underlying && (record.spvSymbol !== asset.underlying || record.spvSymbol !== registry.underlying.symbol || record.spvIsin !== registry.underlying.isin)) {
      fail("xstocks_event_identity_mismatch");
    }
  }
}

function assetFailure(asset: SelectedAsset, code: string): IssuerAssetObservation<XstocksDetail> {
  return {
    asset,
    identity: { state: "failed", code },
    detail: {
      registry: { state: "failed", code },
      corporateActions: { state: "skipped", code: "identity_not_verified" },
    },
    blockers: [...SETTLEMENT_BLOCKERS], settlementReady: false,
  };
}

const allowedAsset = (url: URL) => /^\/api\/v2\/public\/assets\/[^/]+$/.test(url.pathname) && url.search === "";
const allowedHistory = (url: URL) => url.pathname === "/api/v2/public/corporate-actions/history" &&
  url.searchParams.get("pageSize") === "100" && url.searchParams.get("sortBy") === "createdTimeUtc" &&
  url.searchParams.get("sortOrder") === "asc" && [...url.searchParams.keys()].length === 5;

export async function readXstocks(assets: SelectedAsset[], options: {
  fetchImpl?: typeof fetch; now?: () => Date; maxPages?: number;
} = {}): Promise<IssuerObservation<XstocksDetail>> {
  if (assets.some((asset) => asset.issuerId !== "xstocks" || asset.chain !== "solana:mainnet-beta")) fail("asset_identity_family_mismatch");
  const requests: RequestObservation[] = [];
  const observations: IssuerAssetObservation<XstocksDetail>[] = [];
  let stopped: IssuerObservation["stopped"] = null;
  for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
    const asset = assets[assetIndex]!;
    const registryUrl = new URL(`/api/v2/public/assets/${encodeURIComponent(asset.symbol)}`, XSTOCKS_ORIGIN);
    let registryResponse;
    try {
      registryResponse = await observePublicJson(registryUrl, { allowedOrigin: XSTOCKS_ORIGIN, allowedPath: allowedAsset, ...options });
      requests.push(registryResponse.request);
    } catch (error) {
      requests.push(failedRequest(registryUrl.pathname, error, options.now));
      observations.push(assetFailure(asset, safeCode(error)));
      continue;
    }
    const stop = stopCode(registryResponse.request);
    if (stop) {
      observations.push(assetFailure(asset, stop));
      stopped = { code: stop, remainingSelectedAssetsSkipped: assets.length - assetIndex - 1 };
      break;
    }
    if (!registryResponse.value) {
      observations.push(assetFailure(asset, registryResponse.request.error ?? "xstocks_registry_unavailable"));
      continue;
    }
    let parsedRegistry;
    try { parsedRegistry = parseXstocksRegistry(registryResponse.value, asset); }
    catch (error) { observations.push(assetFailure(asset, safeCode(error))); continue; }

    const pages: XstocksPage[] = [];
    const pageSignatures = new Set<string>();
    let historyFailure: string | null = null;
    let page = 1;
    while (true) {
      if (page > (options.maxPages ?? XSTOCKS_MAX_PAGES)) { historyFailure = "xstocks_page_limit_exceeded"; break; }
      const url = new URL("/api/v2/public/corporate-actions/history", XSTOCKS_ORIGIN);
      url.search = new URLSearchParams({ page: String(page), pageSize: "100", symbol: asset.symbol, sortBy: "createdTimeUtc", sortOrder: "asc" }).toString();
      let response;
      try {
        response = await observePublicJson(url, { allowedOrigin: XSTOCKS_ORIGIN, allowedPath: allowedHistory, ...options });
        requests.push(response.request);
      } catch (error) {
        requests.push(failedRequest(`${url.pathname}${url.search}`, error, options.now));
        historyFailure = safeCode(error); break;
      }
      const historyStop = stopCode(response.request);
      if (historyStop) {
        historyFailure = historyStop;
        stopped = { code: historyStop, remainingSelectedAssetsSkipped: assets.length - assetIndex - 1 };
        break;
      }
      if (!response.value || !response.request.dataDigest) { historyFailure = response.request.error ?? "xstocks_history_unavailable"; break; }
      try {
        const parsed = parseXstocksHistoryPage(response.value, page, asset.symbol, response.request.dataDigest);
        const signature = stableJson(parsed.records.map(({ sourceDigest: _digest, ...record }) => record));
        if (pageSignatures.has(signature)) fail("xstocks_repeated_page");
        pageSignatures.add(signature);
        if (pages.length && (parsed.totalPages !== pages[0]!.totalPages || parsed.totalNodes !== pages[0]!.totalNodes || parsed.pageSize !== pages[0]!.pageSize)) {
          fail("xstocks_pagination_inconsistent");
        }
        pages.push(parsed);
        if (!parsed.hasNextPage) break;
        page += 1;
      } catch (error) { historyFailure = safeCode(error); break; }
    }
    let corporateActions: XstocksDetail["corporateActions"];
    if (historyFailure && pages.length) {
      try {
        const reduced = reduceXstocksRevisions(pages.flatMap((item) => item.records));
        validateEventRelationships(reduced.records, parsedRegistry.registry, asset);
        corporateActions = { state: "partial", code: historyFailure, value: { ...reduced, fullyFetched: false, annualCoverageAttested: false, zeroDividendYearEstablished: false } };
      } catch (error) { corporateActions = { state: "failed", code: safeCode(error) }; }
    } else if (historyFailure) corporateActions = { state: "failed", code: historyFailure };
    else {
      try {
        const all = pages.flatMap((item) => item.records);
        if (all.length !== pages[0]!.totalNodes) fail("xstocks_pagination_inconsistent");
        const reduced = reduceXstocksRevisions(all);
        validateEventRelationships(reduced.records, parsedRegistry.registry, asset);
        corporateActions = { state: "observed", value: { ...reduced, fullyFetched: true, annualCoverageAttested: false, zeroDividendYearEstablished: false } };
      } catch (error) { corporateActions = { state: "failed", code: safeCode(error) }; }
    }
    observations.push({
      asset,
      identity: { state: "observed", value: parsedRegistry.identity },
      detail: { registry: { state: "observed", value: parsedRegistry.registry }, corporateActions },
      blockers: [...SETTLEMENT_BLOCKERS, ...(parsedRegistry.registry.isTradingHalted ? ["issuer_trading_halted"] : [])], settlementReady: false,
    });
    if (stopped) break;
  }
  if (stopped && observations.length < assets.length) {
    for (const asset of assets.slice(observations.length)) {
      observations.push({ ...assetFailure(asset, "issuer_requests_stopped"), identity: { state: "skipped", code: "issuer_requests_stopped" } });
    }
  }
  const hardFailures = observations.filter((item) => item.identity.state !== "observed" || item.detail.corporateActions.state === "failed" || item.detail.corporateActions.state === "skipped").length;
  const partials = observations.filter((item) => item.detail.corporateActions.state === "partial").length;
  const state = hardFailures === observations.length ? "failed" : hardFailures > 0 || partials > 0 ? "partial" : "observed";
  return { issuerId: "xstocks", state, assets: observations, requests, stopped };
}
