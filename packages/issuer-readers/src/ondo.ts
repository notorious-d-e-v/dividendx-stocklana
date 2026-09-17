import { array, bool, civilDate, exactDecimal, fail, integer, object, safeCode, string, timestamp, unixMillis } from "./schema.js";
import { SETTLEMENT_BLOCKERS, type Component, type IdentityObservation, type IssuerAssetObservation, type IssuerObservation, type RequestObservation, type SelectedAsset } from "./types.js";

export const ONDO_ORIGIN = "https://api.gm.ondo.finance";
export const ONDO_SOLANA_CHAIN_ID = "solana-900";
export const ONDO_DEFAULT_ENV_FILE = "/Users/node/.config/dividendx/issuer-api.env";

interface OndoRawRecord {
  endpoint: string;
  retrievedAt: string;
  status: number | null;
  dataDigest: string | null;
  error: string | null;
}
interface OndoObserved { record: OndoRawRecord; raw: Buffer | null }
export interface OndoTransport {
  loadApiKey(envFile?: string, options?: { readFileImpl?: unknown }): Promise<string>;
  observeEndpoint(endpoint: string, options: {
    apiKey: string; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number; maxBytes?: number;
  }): Promise<OndoObserved>;
}

export interface OndoPauseNotice {
  symbol: string;
  status: "active" | "upcoming";
  type: "scheduled" | "unscheduled";
  reason: null | { code: string; message: string; documentation: string };
  start: string | null;
  end: string | null;
  eventId: string | null;
  updateSharesMultiplier: boolean | null;
  normalizedDividendEvent: false;
}
export interface OndoMultiplierObservation {
  history: { sharesMultiplier: string; changeTimestampMs: number }[];
  sourceTimestampMs: number;
  normalizedDividendEvents: false;
}
export interface OndoDividendNotice {
  ticker: string;
  dividendYield: string;
  payoutFrequency: "monthly" | "quarterly" | "semi-annually" | "annually" | "irregular" | "none";
  lastCashAmount: string;
  lastPaymentDate: string;
  sourceTimestampMs: number;
  officialExDate: null;
  normalizedDividendEvent: false;
}
export interface OndoDetail {
  pauses: Component<OndoPauseNotice[]>;
  multiplier: Component<OndoMultiplierObservation>;
  dividend: Component<OndoDividendNotice>;
  annualCoverageAttested: false;
  zeroDividendYearEstablished: false;
}

export async function loadReviewedOndoTransport(): Promise<OndoTransport> {
  // Compiled output is dist/src; the reviewed module intentionally remains outside this package.
  const moduleUrl = new URL("../../../../scripts/issuers/ondo-readonly.mjs", import.meta.url);
  return await import(moduleUrl.href) as OndoTransport;
}

function externalCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
  return typeof code === "string" && /^[a-z0-9_]+$/.test(code) ? code : safeCode(error);
}
function requestRecord(record: OndoRawRecord): RequestObservation {
  return {
    endpoint: record.endpoint,
    retrievedAt: record.retrievedAt,
    status: record.status,
    dataDigest: record.dataDigest,
    error: record.error,
  };
}
function parseRaw(observed: OndoObserved): unknown {
  if (!observed.raw) fail(observed.record.error ?? "ondo_component_unavailable");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(observed.raw)) as unknown; }
  catch { fail("ondo_schema_malformed"); }
}
function stopCode(record: RequestObservation): string | null {
  if (record.status === 401 || record.status === 403) return "issuer_authentication_failed";
  if (record.status === 429) return "issuer_rate_limited";
  return record.error === "secret_reflection_refused" ? record.error : null;
}

export function parseOndoAddresses(value: unknown, asset: SelectedAsset): IdentityObservation {
  if (asset.issuerId !== "ondo" || asset.chain !== "solana:mainnet-beta") fail("asset_identity_family_mismatch");
  const rows = array(value, "ondo_addresses_malformed").map((item) => object(item, "ondo_addresses_malformed"));
  const symbols = rows.filter((row) => string(row.symbol, "ondo_addresses_malformed") === asset.symbol);
  if (symbols.length !== 1) fail(symbols.length === 0 ? "ondo_symbol_missing" : "ondo_symbol_duplicate");
  const addresses = array(symbols[0]!.addresses, "ondo_addresses_malformed")
    .map((item) => object(item, "ondo_addresses_malformed"))
    .filter((item) => string(item.networkChainId, "ondo_addresses_malformed") === ONDO_SOLANA_CHAIN_ID);
  if (addresses.length !== 1) fail(addresses.length === 0 ? "ondo_solana_address_missing" : "ondo_solana_address_duplicate");
  const observedMint = string(addresses[0]!.address, "ondo_addresses_malformed");
  const observedDecimals = integer(addresses[0]!.decimals, "ondo_addresses_malformed");
  if (observedMint !== asset.mint) fail("ondo_mint_mismatch");
  if (observedDecimals !== asset.decimals) fail("ondo_decimals_mismatch");
  return {
    issuerId: "ondo", chain: "solana:mainnet-beta", symbol: asset.symbol,
    expectedMint: asset.mint, observedMint, mintMatches: true,
    expectedDecimals: asset.decimals, observedDecimals, decimalsReobserved: true, decimalsMatch: true,
    expectedTokenProgram: asset.tokenProgram, observedTokenProgram: null, tokenProgramReobserved: false,
  };
}

export function parseOndoStatuses(value: unknown, selectedSymbols: Set<string>): Map<string, OndoPauseNotice[]> {
  const result = new Map<string, OndoPauseNotice[]>();
  for (const symbol of selectedSymbols) result.set(symbol, []);
  for (const item of array(value, "ondo_status_malformed")) {
    const row = object(item, "ondo_status_malformed");
    const symbol = string(row.symbol, "ondo_status_malformed");
    const status = string(row.status, "ondo_status_malformed");
    const type = string(row.type, "ondo_status_malformed");
    if (status !== "active" && status !== "upcoming") fail("ondo_status_malformed");
    if (type !== "scheduled" && type !== "unscheduled") fail("ondo_status_malformed");
    let reason: OndoPauseNotice["reason"] = null;
    if (row.reason !== undefined) {
      const source = object(row.reason, "ondo_status_malformed");
      reason = {
        code: string(source.code, "ondo_status_malformed"),
        message: string(source.message, "ondo_status_malformed"),
        documentation: string(source.documentation, "ondo_status_malformed"),
      };
    }
    const optionalTime = (field: string): string | null => row[field] === undefined ? null : timestamp(row[field], "ondo_status_malformed");
    const optionalString = (field: string): string | null => row[field] === undefined ? null : string(row[field], "ondo_status_malformed");
    const update = row.updateSharesMultiplier === undefined ? null : bool(row.updateSharesMultiplier, "ondo_status_malformed");
    if (selectedSymbols.has(symbol)) result.get(symbol)!.push({
      symbol, status, type, reason, start: optionalTime("start"), end: optionalTime("end"),
      eventId: optionalString("eventId"), updateSharesMultiplier: update, normalizedDividendEvent: false,
    });
  }
  return result;
}

export function parseOndoMultiplier(value: unknown): OndoMultiplierObservation {
  const root = object(value, "ondo_multiplier_malformed");
  const history = array(root.history, "ondo_multiplier_malformed").map((item) => {
    const row = object(item, "ondo_multiplier_malformed");
    return { sharesMultiplier: exactDecimal(row.sharesMultiplier, { positive: true, maxFraction: 18 }), changeTimestampMs: unixMillis(row.changeTimestamp) };
  });
  return { history, sourceTimestampMs: unixMillis(root.timestamp), normalizedDividendEvents: false };
}

const FREQUENCIES = new Set(["monthly", "quarterly", "semi-annually", "annually", "irregular", "none"]);
export function parseOndoDividend(value: unknown, expectedTicker: string): OndoDividendNotice {
  const root = object(value, "ondo_dividend_malformed");
  const ticker = string(root.ticker, "ondo_dividend_malformed");
  if (ticker !== expectedTicker) fail("ondo_dividend_ticker_mismatch");
  const payoutFrequency = string(root.payoutFrequency, "ondo_dividend_malformed");
  if (!FREQUENCIES.has(payoutFrequency)) fail("ondo_dividend_malformed");
  return {
    ticker,
    dividendYield: exactDecimal(root.dividendYield, { maxFraction: 18 }),
    payoutFrequency: payoutFrequency as OndoDividendNotice["payoutFrequency"],
    lastCashAmount: exactDecimal(root.lastCashAmount, { maxFraction: 18 }),
    lastPaymentDate: civilDate(root.lastPaymentDate),
    sourceTimestampMs: unixMillis(root.timestamp),
    officialExDate: null,
    normalizedDividendEvent: false,
  };
}

function failedAsset(asset: SelectedAsset, code: string, state: "failed" | "unavailable" | "skipped" = "failed"): IssuerAssetObservation<OndoDetail> {
  return {
    asset, identity: { state, code },
    detail: {
      pauses: { state, code }, multiplier: { state, code }, dividend: { state, code },
      annualCoverageAttested: false, zeroDividendYearEstablished: false,
    },
    blockers: [...SETTLEMENT_BLOCKERS, "authenticated_notices_are_not_an_event_ledger"], settlementReady: false,
  };
}

export function unavailableOndo(assets: SelectedAsset[], code: string): IssuerObservation<OndoDetail> {
  return { issuerId: "ondo", state: "unavailable", assets: assets.map((asset) => failedAsset(asset, code, "unavailable")), requests: [], stopped: null };
}

export async function readOndo(assets: SelectedAsset[], options: {
  apiKey: string; transport: OndoTransport; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number; maxBytes?: number;
}): Promise<IssuerObservation<OndoDetail>> {
  if (assets.some((asset) => asset.issuerId !== "ondo" || asset.chain !== "solana:mainnet-beta")) fail("asset_identity_family_mismatch");
  const requests: RequestObservation[] = [];
  const request = async (endpoint: string): Promise<OndoObserved | null> => {
    try {
      const observed = await options.transport.observeEndpoint(endpoint, options);
      requests.push(requestRecord(observed.record));
      return observed;
    } catch (error) {
      requests.push({ endpoint, retrievedAt: (options.now ?? (() => new Date()))().toISOString(), status: null, dataDigest: null, error: externalCode(error) });
      return null;
    }
  };

  const addressResponse = await request("/v1/assets/all/addresses");
  const addressStop = stopCode(requests.at(-1)!);
  if (addressStop) return { ...unavailableOndo(assets, addressStop), state: "failed", requests, stopped: { code: addressStop, remainingRequestsSkipped: 1 + assets.length * 2 } };
  if (!addressResponse) return { ...unavailableOndo(assets, requests.at(-1)!.error ?? "ondo_addresses_unavailable"), state: "failed", requests };
  let addresses: unknown;
  try { addresses = parseRaw(addressResponse); } catch (error) { return { ...unavailableOndo(assets, safeCode(error)), state: "failed", requests }; }

  const statusResponse = await request("/v1/status/assets");
  const statusStop = stopCode(requests.at(-1)!);
  if (statusStop) return { ...unavailableOndo(assets, statusStop), state: "failed", requests, stopped: { code: statusStop, remainingRequestsSkipped: assets.length * 2 } };
  let statuses: Map<string, OndoPauseNotice[]> | null = null;
  let statusFailure: string | null = null;
  try { statuses = parseOndoStatuses(parseRaw(statusResponse!), new Set(assets.map((asset) => asset.symbol))); }
  catch (error) { statusFailure = statusResponse ? safeCode(error) : requests.at(-1)!.error ?? "ondo_status_unavailable"; }

  const observations: IssuerAssetObservation<OndoDetail>[] = [];
  let stopped: IssuerObservation["stopped"] = null;
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]!;
    let identity: Component<IdentityObservation>;
    try { identity = { state: "observed", value: parseOndoAddresses(addresses, asset) }; }
    catch (error) { identity = { state: "failed", code: safeCode(error) }; }
    const pauses: OndoDetail["pauses"] = statusFailure ? { state: "failed", code: statusFailure } : { state: "observed", value: statuses!.get(asset.symbol)! };
    let multiplier: OndoDetail["multiplier"];
    let dividend: OndoDetail["dividend"];
    const multiplierResponse = await request(`/v1/assets/${asset.symbol}/shares-multiplier?range=all`);
    const multiplierStop = stopCode(requests.at(-1)!);
    if (multiplierStop) {
      multiplier = { state: "failed", code: multiplierStop };
      dividend = { state: "skipped", code: "issuer_requests_stopped" };
      stopped = { code: multiplierStop, remainingRequestsSkipped: 1 + (assets.length - index - 1) * 2 };
    } else {
      try { multiplier = { state: "observed", value: parseOndoMultiplier(parseRaw(multiplierResponse!)) }; }
      catch (error) { multiplier = { state: "failed", code: multiplierResponse ? safeCode(error) : requests.at(-1)!.error ?? "ondo_multiplier_unavailable" }; }
      const dividendResponse = await request(`/v1/assets/${asset.symbol}/dividends`);
      const dividendStop = stopCode(requests.at(-1)!);
      if (dividendStop) {
        dividend = { state: "failed", code: dividendStop };
        stopped = { code: dividendStop, remainingRequestsSkipped: (assets.length - index - 1) * 2 };
      } else {
        try { dividend = { state: "observed", value: parseOndoDividend(parseRaw(dividendResponse!), asset.underlying) }; }
        catch (error) { dividend = { state: "failed", code: dividendResponse ? safeCode(error) : requests.at(-1)!.error ?? "ondo_dividend_unavailable" }; }
      }
    }
    observations.push({
      asset, identity, detail: { pauses, multiplier, dividend, annualCoverageAttested: false, zeroDividendYearEstablished: false },
      blockers: [...SETTLEMENT_BLOCKERS, "authenticated_notices_are_not_an_event_ledger"], settlementReady: false,
    });
    if (stopped) break;
  }
  if (stopped) for (const asset of assets.slice(observations.length)) observations.push(failedAsset(asset, "issuer_requests_stopped", "skipped"));
  const failed = observations.filter((item) => item.identity.state !== "observed" || item.detail.pauses.state !== "observed" || item.detail.multiplier.state !== "observed" || item.detail.dividend.state !== "observed").length;
  return { issuerId: "ondo", state: failed === 0 ? "observed" : failed === observations.length ? "failed" : "partial", assets: observations, requests, stopped };
}
