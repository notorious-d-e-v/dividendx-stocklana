import { readBackpack } from "./backpack.js";
import { selectAssets } from "./catalog.js";
import { loadReviewedOndoTransport, ONDO_DEFAULT_ENV_FILE, readOndo, unavailableOndo, type OndoTransport } from "./ondo.js";
import { fail, safeCode } from "./schema.js";
import { SETTLEMENT_BLOCKERS, type IssuerId, type IssuerObservation, type IssuerReadReport, type SelectedAsset } from "./types.js";
import { readXstocks } from "./xstocks.js";

export interface ReadOptions {
  year: number;
  issuers?: IssuerId[];
  symbols?: string[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  ondo?: {
    transport?: OndoTransport;
    apiKey?: string;
    envFile?: string;
    readFileImpl?: unknown;
    timeoutMs?: number;
    maxBytes?: number;
  };
}

export function validateYear(year: number): number {
  if (!Number.isSafeInteger(year) || year < 1000 || year > 9999) fail("invalid_year");
  return year;
}

export async function readSelectedIssuers(options: ReadOptions): Promise<IssuerReadReport> {
  validateYear(options.year);
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const selected = selectAssets({ issuers: options.issuers, symbols: options.symbols });
  const grouped = (issuer: IssuerId): SelectedAsset[] => selected.filter((asset) => asset.issuerId === issuer);
  const issuers: IssuerObservation[] = [];
  const xstocks = grouped("xstocks");
  if (xstocks.length) issuers.push(await readXstocks(xstocks, { fetchImpl: options.fetchImpl, now }));
  const backpack = grouped("backpack");
  if (backpack.length) issuers.push(await readBackpack(backpack, { fetchImpl: options.fetchImpl, now }));
  const ondo = grouped("ondo");
  if (ondo.length) {
    let transport: OndoTransport | null = null;
    let apiKey = options.ondo?.apiKey;
    try {
      transport = options.ondo?.transport ?? await loadReviewedOndoTransport();
      if (apiKey === undefined) apiKey = await transport.loadApiKey(options.ondo?.envFile ?? ONDO_DEFAULT_ENV_FILE, { readFileImpl: options.ondo?.readFileImpl });
      if (typeof apiKey !== "string" || apiKey.trim() === "") throw Object.assign(new Error("ondo_api_key_missing"), { code: "ondo_api_key_missing" });
    } catch (error) {
      const candidate = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
      const code = typeof candidate === "string" && /^[a-z0-9_]+$/.test(candidate) ? candidate : safeCode(error);
      issuers.push(unavailableOndo(ondo, code));
    }
    if (transport && typeof apiKey === "string" && apiKey.trim() !== "") {
      issuers.push(await readOndo(ondo, {
        apiKey, transport, fetchImpl: options.fetchImpl, now,
        timeoutMs: options.ondo?.timeoutMs, maxBytes: options.ondo?.maxBytes,
      }));
    }
  }
  return {
    schema: "dividendx-issuer-observations-v1", requestedYear: options.year, startedAt,
    completedAt: now().toISOString(), selected, issuers,
    settlementReady: false, blockers: [...SETTLEMENT_BLOCKERS],
  };
}
