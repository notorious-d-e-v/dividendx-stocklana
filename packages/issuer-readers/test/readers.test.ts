import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SELECTED_ASSETS,
  BACKPACK_MAX_BYTES,
  parseBackpackRegistry,
  parseOndoAddresses,
  parseOndoDividend,
  parseOndoMultiplier,
  parseOndoStatuses,
  parseXstocksHistoryPage,
  parseXstocksRegistry,
  readBackpack,
  readXstocks,
  reduceXstocksRevisions,
  timestamp,
  type SelectedAsset,
  type XstocksEventRevision,
} from "../src/index.js";

const TOKEN_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const xasset = SELECTED_ASSETS.find((asset) => asset.symbol === "KOx")!;
const basset = SELECTED_ASSETS.find((asset) => asset.symbol === "MU.US")!;
const oasset = SELECTED_ASSETS.find((asset) => asset.symbol === "KOon")!;

function xRegistry(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-kox", symbol: "KOx", isin: "CH1436219419", isTradingHalted: false,
    underlying: { symbol: "KO", isin: "US1912161007", listingCountry: "US" },
    deployments: [
      { network: "Ethereum", address: "0xnot-solana" },
      { network: "Solana", address: xasset.mint },
    ],
    ...overrides,
  };
}
function xEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e", version: 1,
    xstockSymbol: "KOx", spvSymbol: "KO", caType: "CashDividend", effectiveTimeUtc: "2026-09-15T00:30:00Z",
    multiplierOld: "1.0183310000000000", multiplierNew: "1.0225601246249238",
    grossCashflowUsd: "0.5100", netCashflowUsd: null, withholdingTaxRate: "0.15",
    fromUnits: null, toUnits: null, redemptionPriceUsd: null, notes: null,
    createdTimeUtc: "2026-09-14T22:00:00+00:00", status: "Initial",
    xstockIsin: "CH1436219419", spvIsin: "US1912161007", ...overrides,
  };
}
function xPage(nodes: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    nodes,
    page: {
      currentPage: 1, pageSize: 100, totalPages: 1, totalNodes: nodes.length,
      hasNextPage: false, hasPreviousPage: false, ...overrides,
    },
  };
}
function backpackToken(overrides: Record<string, unknown> = {}) {
  return {
    blockchain: "Solana", contractAddress: basset.mint, depositEnabled: true,
    displayName: "Micron", maximumWithdrawal: null, minimumDeposit: "0.0100",
    minimumWithdrawal: "0.02", nativeDecimals: 6, withdrawEnabled: true,
    withdrawalFee: "0.001", ...overrides,
  };
}
function backpackRegistry(tokens = [backpackToken()]) {
  return [{ coingeckoId: null, displayName: "Micron", symbol: "MU.US", tokens }];
}

test("typed catalog is exactly equal to selected catalog identity fields", async () => {
  const source = JSON.parse(await readFile(new URL("../../../demo-fixtures/catalog.json", import.meta.url), "utf8")) as Array<Record<string, unknown>>;
  assert.deepEqual(SELECTED_ASSETS, source.map((row) => ({
    issuerId: row.issuerId, symbol: row.symbol, underlying: row.underlying, mint: row.mint,
    decimals: row.decimals, tokenProgram: row.tokenProgram, chain: "solana:mainnet-beta",
  })));
  assert.equal(SELECTED_ASSETS.length, 15);
  assert.ok(SELECTED_ASSETS.every((asset) => asset.tokenProgram === TOKEN_PROGRAM));
});

test("xStocks registry binds exact Solana deployment and records decimals as unobserved", () => {
  const parsed = parseXstocksRegistry(xRegistry(), xasset);
  assert.equal(parsed.identity.observedMint, xasset.mint);
  assert.equal(parsed.identity.observedDecimals, null);
  assert.equal(parsed.identity.decimalsReobserved, false);
  assert.equal(parsed.registry.underlying?.symbol, "KO");
  assert.equal(parsed.registry.isTradingHalted, false);
  assert.throws(() => parseXstocksRegistry(xRegistry({ deployments: [{ network: "Solana-mainnet", address: xasset.mint }] }), xasset), /xstocks_solana_deployment_missing/);
  assert.throws(() => parseXstocksRegistry(xRegistry({ deployments: [{ network: "Solana", address: xasset.mint }, { network: "Solana", address: xasset.mint }] }), xasset), /xstocks_solana_deployment_duplicate/);
  assert.throws(() => parseXstocksRegistry(xRegistry(), { ...xasset, issuerId: "backpack" }), /asset_identity_family_mismatch/);
});

test("xStocks exact factors and all revisions survive without invented ex-date or finality", () => {
  const first = parseXstocksHistoryPage(xPage([xEvent()]), 1, "KOx", "sha256:first").records[0]!;
  const second = parseXstocksHistoryPage(xPage([xEvent({ version: 2, multiplierNew: "1.023000000000000000" })]), 1, "KOx", "sha256:second").records[0]!;
  const reduced = reduceXstocksRevisions([first, second, { ...first, sourceDigest: "sha256:duplicate-page" }]);
  assert.equal(reduced.records.length, 2);
  assert.equal(reduced.latestObservedHeads[0]!.sourceVersion, 2);
  assert.equal(first.multiplierOld, "1.0183310000000000");
  assert.equal(first.grossCashflowUsd, "0.5100");
  assert.equal(first.officialExDate, null);
  assert.equal(first.sourceFinalityAttested, false);
  assert.equal(first.status, "Initial");
  const unsupported = parseXstocksHistoryPage(xPage([xEvent({ caType: "UnsupportedIssuerAction" })]), 1, "KOx", "sha256:unsupported").records[0]!;
  assert.equal(unsupported.action, "UnsupportedIssuerAction");
  assert.equal(unsupported.settlementClassification, null);
});

test("xStocks rejects numeric factors, conflicting revisions, malformed timestamps and pagination", () => {
  assert.throws(() => parseXstocksHistoryPage(xPage([xEvent({ multiplierNew: 1.2 })]), 1, "KOx", "sha256:a"), /numeric_factor_not_exact_string/);
  assert.throws(() => parseXstocksHistoryPage(xPage([xEvent({ createdTimeUtc: "2026-09-14T22:00:00" })]), 1, "KOx", "sha256:a"), /malformed_timestamp/);
  assert.throws(() => parseXstocksHistoryPage(xPage([], { currentPage: 2 }), 1, "KOx", "sha256:a"), /xstocks_pagination_inconsistent/);
  const a = parseXstocksHistoryPage(xPage([xEvent()]), 1, "KOx", "sha256:a").records[0]!;
  const b: XstocksEventRevision = { ...a, multiplierNew: "9" };
  assert.throws(() => reduceXstocksRevisions([a, b]), /xstocks_conflicting_event_revision/);
  assert.throws(() => timestamp("2026-09-17T12:00:00"), /malformed_timestamp/);
});

test("xStocks coherent empty history remains explicitly non-covering", () => {
  const page = parseXstocksHistoryPage(xPage([]), 1, "KOx", "sha256:empty");
  assert.equal(page.records.length, 0);
  assert.equal(page.totalNodes, 0);
});

test("xStocks later-page failure retains partial records and concrete summary state", async () => {
  let call = 0;
  const fetchImpl: typeof fetch = async () => {
    call += 1;
    if (call === 1) return new Response(JSON.stringify(xRegistry()), { status: 200 });
    if (call === 2) return new Response(JSON.stringify(xPage([xEvent()], { pageSize: 1, totalPages: 2, totalNodes: 2, hasNextPage: true })), { status: 200 });
    throw new Error("private network detail");
  };
  const report = await readXstocks([xasset], { fetchImpl });
  assert.equal(report.state, "partial");
  const actions = report.assets[0]!.detail.corporateActions;
  assert.equal(actions.state, "partial");
  if (actions.state === "partial") {
    assert.equal(actions.value.records.length, 1);
    assert.equal(actions.value.fullyFetched, false);
    assert.equal(actions.value.annualCoverageAttested, false);
  }
});

test("xStocks repeated page content blocks completion", async () => {
  let call = 0;
  const fetchImpl: typeof fetch = async () => {
    call += 1;
    if (call === 1) return new Response(JSON.stringify(xRegistry()), { status: 200 });
    const page = call - 1;
    return new Response(JSON.stringify(xPage([xEvent()], { currentPage: page, pageSize: 1, totalPages: 2, totalNodes: 2, hasNextPage: page === 1, hasPreviousPage: page === 2 })), { status: 200 });
  };
  const report = await readXstocks([xasset], { fetchImpl });
  assert.equal(report.assets[0]!.detail.corporateActions.state, "partial");
  assert.equal((report.assets[0]!.detail.corporateActions as { code: string }).code, "xstocks_repeated_page");
});

test("xStocks enforces registry-to-event identity joins and surfaces trading halt", async () => {
  let call = 0;
  const mismatchFetch: typeof fetch = async () => {
    call += 1;
    return new Response(JSON.stringify(call === 1 ? xRegistry() : xPage([xEvent({ spvIsin: "wrong-isin" })])), { status: 200 });
  };
  const mismatch = await readXstocks([xasset], { fetchImpl: mismatchFetch });
  assert.equal(mismatch.assets[0]!.detail.corporateActions.state, "failed");
  assert.equal((mismatch.assets[0]!.detail.corporateActions as { code: string }).code, "xstocks_event_identity_mismatch");
  call = 0;
  const haltedFetch: typeof fetch = async () => {
    call += 1;
    return new Response(JSON.stringify(call === 1 ? xRegistry({ isTradingHalted: true }) : xPage([])), { status: 200 });
  };
  const halted = await readXstocks([xasset], { fetchImpl: haltedFetch });
  assert.ok(halted.assets[0]!.blockers.includes("issuer_trading_halted"));
});

test("Backpack selects exact parent and Solana token, validates decimals and flags", () => {
  const parsed = parseBackpackRegistry(backpackRegistry(), basset);
  assert.equal(parsed.identity.observedDecimals, 6);
  assert.equal(parsed.listing.minimumDeposit, "0.0100");
  assert.equal(parsed.listing.operationalAvailability, "available");
  assert.throws(() => parseBackpackRegistry(backpackRegistry([backpackToken(), backpackToken()]), basset), /backpack_solana_token_duplicate/);
  assert.throws(() => parseBackpackRegistry(backpackRegistry([backpackToken({ nativeDecimals: 8 })]), basset), /backpack_decimals_mismatch/);
  assert.throws(() => parseBackpackRegistry(backpackRegistry([backpackToken({ withdrawalFee: "garbage" })]), basset), /invalid_decimal_string/);
  assert.throws(() => parseBackpackRegistry(backpackRegistry(), { ...basset, issuerId: "ondo" }), /asset_identity_family_mismatch/);
});

test("Backpack disabled operations are blockers and event ledger stays unavailable", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(backpackRegistry([backpackToken({ depositEnabled: false })])), { status: 200 });
  const report = await readBackpack([basset], { fetchImpl });
  assert.equal(report.state, "observed");
  assert.ok(report.assets[0]!.blockers.includes("issuer_deposits_disabled"));
  assert.equal(report.assets[0]!.detail.corporateActions.state, "unavailable");
  assert.equal(report.assets[0]!.detail.corporateActions.zeroDividendYearEstablished, false);
});

test("Backpack registry has an isolated 8 MiB response cap", async () => {
  const validLarge = backpackRegistry();
  (validLarge[0] as Record<string, unknown>).ignoredPadding = "x".repeat(2 * 1024 * 1024 + 64);
  const accepted = await readBackpack([basset], {
    fetchImpl: async () => new Response(JSON.stringify(validLarge), { status: 200 }),
  });
  assert.equal(accepted.state, "observed");
  assert.equal(accepted.assets[0]!.identity.state, "observed");

  const oversized = backpackRegistry();
  (oversized[0] as Record<string, unknown>).ignoredPadding = "x".repeat(BACKPACK_MAX_BYTES + 1);
  const rejected = await readBackpack([basset], {
    fetchImpl: async () => new Response(JSON.stringify(oversized), { status: 200 }),
  });
  assert.equal(rejected.state, "failed");
  assert.equal(rejected.requests[0]!.error, "response_too_large");
});

test("Ondo identity requires exact solana-900 chain and supplied decimals", () => {
  const valid = [{ symbol: "KOon", addresses: [
    { networkChainId: "solana-devnet-900", address: oasset.mint, decimals: 9 },
    { networkChainId: "solana-900", address: oasset.mint, decimals: 9 },
  ] }];
  assert.equal(parseOndoAddresses(valid, oasset).observedMint, oasset.mint);
  assert.throws(() => parseOndoAddresses([{ symbol: "KOon", addresses: [valid[0]!.addresses[0]] }], oasset), /ondo_solana_address_missing/);
  assert.throws(() => parseOndoAddresses(valid, { ...oasset, issuerId: "xstocks" }), /asset_identity_family_mismatch/);
});

test("Ondo preserves exact multiplier strings and notices without normalizing events", () => {
  const multiplier = parseOndoMultiplier({ history: [{ sharesMultiplier: "1.002300000000000000", changeTimestamp: 1_799_999_999_000 }], timestamp: 1_800_000_000_000 });
  assert.equal(multiplier.history[0]!.sharesMultiplier, "1.002300000000000000");
  assert.equal(multiplier.normalizedDividendEvents, false);
  assert.throws(() => parseOndoMultiplier({ history: [{ sharesMultiplier: 1.2, changeTimestamp: 1 }], timestamp: 2 }), /numeric_factor_not_exact_string/);
  const dividend = parseOndoDividend({ ticker: "KO", dividendYield: "0.024500", payoutFrequency: "quarterly", lastCashAmount: "0.51", lastPaymentDate: "2026-07-01", timestamp: 1_800_000_000_000 }, "KO");
  assert.equal(dividend.officialExDate, null);
  assert.equal(dividend.normalizedDividendEvent, false);
  assert.throws(() => parseOndoDividend({ ticker: "KO", dividendYield: 0.02, payoutFrequency: "quarterly", lastCashAmount: "0.51", lastPaymentDate: "2026-07-01", timestamp: 1 }, "KO"), /numeric_factor_not_exact_string/);
  const statuses = parseOndoStatuses([{ symbol: "KOon", status: "upcoming", type: "scheduled", updateSharesMultiplier: true }], new Set(["KOon"]));
  assert.equal(statuses.get("KOon")![0]!.normalizedDividendEvent, false);
});
