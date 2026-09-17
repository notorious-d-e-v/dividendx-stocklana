import assert from "node:assert/strict";
import { chmod, link, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildQualificationDossier,
  QUALIFICATION_MAX_FILE_BYTES,
  readQualificationJsonFile,
  safeQualificationSummary,
  SELECTED_ASSETS,
  writePrivateQualificationArchive,
  type IssuerReadReport,
  type XstocksEventRevision,
} from "../src/index.js";

const now = new Date("2026-09-17T22:41:05.618Z");
const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const msft = SELECTED_ASSETS.find((asset) => asset.symbol === "MSFTx")!;
const aapl = SELECTED_ASSETS.find((asset) => asset.symbol === "AAPLx")!;
const supplementPath = new URL("../../../../planning/evidence/msftx-qualification-candidates-2026-09-17.json", import.meta.url);
const supplementBytes = await readFile(supplementPath);
const supplementFixture = JSON.parse(supplementBytes.toString("utf8")) as Record<string, any>;
const historyDigest = `sha256:${supplementFixture.sources.find((item: any) => item.name === "history").sha256}`;

function revisions(): XstocksEventRevision[] {
  return supplementFixture.issuerEvents.map((event: Record<string, any>) => ({
    eventId: event.eventId,
    sourceVersion: event.version,
    symbol: event.xstockSymbol,
    xstockIsin: event.xstockIsin,
    spvSymbol: event.spvSymbol,
    spvIsin: event.spvIsin,
    action: event.caType,
    status: event.status,
    multiplierOld: event.multiplierOld,
    multiplierNew: event.multiplierNew,
    createdTime: event.createdTimeUtc,
    effectiveTime: event.effectiveTimeUtc,
    grossCashflowUsd: event.grossCashflowUsd,
    netCashflowUsd: event.netCashflowUsd,
    withholdingTaxRate: event.withholdingTaxRate,
    fromUnits: null,
    toUnits: null,
    redemptionPriceUsd: null,
    notes: null,
    sourceDigest: historyDigest,
    officialExDate: null,
    settlementClassification: null,
    sourceFinalityAttested: false,
  }));
}

function identity(asset = msft) {
  return {
    state: "observed",
    value: {
      issuerId: asset.issuerId,
      chain: asset.chain,
      symbol: asset.symbol,
      expectedMint: asset.mint,
      observedMint: asset.mint,
      mintMatches: true,
      expectedDecimals: asset.decimals,
      observedDecimals: null,
      decimalsReobserved: false,
      decimalsMatch: null,
      expectedTokenProgram: asset.tokenProgram,
      observedTokenProgram: null,
      tokenProgramReobserved: false,
    },
  };
}

function report(records = revisions(), selected = [msft]): IssuerReadReport {
  return {
    schema: "dividendx-issuer-observations-v1",
    requestedYear: 2026,
    startedAt: "2026-09-17T22:40:00.000Z",
    completedAt: "2026-09-17T22:41:00.000Z",
    selected: selected.map((asset) => ({ ...asset })),
    issuers: [{
      issuerId: "xstocks",
      state: "observed",
      assets: selected.map((asset) => ({
        asset: { ...asset },
        identity: identity(asset) as never,
        detail: {
          registry: { state: "observed", value: {
            id: `asset-${asset.symbol}`,
            isin: asset.symbol === "MSFTx" ? "CH1436219203" : "CH1436219773",
            isTradingHalted: false,
            underlying: {
              symbol: asset.underlying,
              isin: asset.symbol === "MSFTx" ? "US5949181045" : "US0378331005",
              listingCountry: "US",
            },
          } },
          corporateActions: { state: "observed", value: {
            records: asset.symbol === "MSFTx" ? records : [],
            latestObservedHeads: [],
            fullyFetched: true,
            annualCoverageAttested: false,
            zeroDividendYearEstablished: false,
          } },
        },
        blockers: ["complete_annual_coverage_and_finality"],
        settlementReady: false,
      })),
      requests: [{ endpoint: "/history", retrievedAt: "2026-09-17T22:40:30.000Z", status: 200, dataDigest: historyDigest, error: null }],
      stopped: null,
    }],
    settlementReady: false,
    blockers: ["complete_annual_coverage_and_finality"],
  };
}

function jsonBytes(value: unknown): Buffer { return Buffer.from(JSON.stringify(value)); }

async function build(source = report(), supplement: Record<string, any> | undefined = structuredClone(supplementFixture), reviewNow = now) {
  return buildQualificationDossier({
    report: source,
    reportBytes: jsonBytes(source),
    supplement,
    supplementBytes: supplement ? jsonBytes(supplement) : undefined,
  }, { requestedYear: 2026, now: reviewNow });
}

test("real-shaped MSFTx review remains blocked and preserves unknown and future evidence", async () => {
  const dossier = await build();
  const asset = dossier.assets[0]!;
  assert.equal(dossier.state, "blocked");
  assert.equal(dossier.settlementReady, false);
  assert.equal(dossier.signable, false);
  assert.equal(asset.currentHeads.length, 5);
  assert.equal(asset.revisions.filter((item) => item.candidateCompanyDates?.yearMembership === "in_year").length, 3);
  assert.equal(asset.revisions.filter((item) => item.candidateCompanyDates === null).length, 2);
  assert.equal(dossier.supplementReview?.announcements.length, 4);
  assert.equal(dossier.supplementReview?.announcements.filter((item) => item.linkedCurrentEventIds.length === 0).length, 1);
  assert.equal(asset.currentMint?.independentlyDecoded, true);
  assert.equal(asset.currentMint?.profileMatchesClaim, true);
  assert.equal(asset.currentMint?.configuredPairMatches.length, 1);
  assert.ok(asset.blockers.includes("current_mint_cannot_fill_historical_factor_evidence"));
});

test("catalog, year, grouping, readiness and bytes are runtime-bound", async () => {
  const wrongCatalog = report();
  (wrongCatalog.selected[0] as any).mint = "wrong";
  await assert.rejects(build(wrongCatalog), /catalog_identity_mismatch/);
  const wrongYear = report(); wrongYear.requestedYear = 2025;
  await assert.rejects(build(wrongYear), /requested_year_mismatch/);
  const duplicate = report(); duplicate.selected.push({ ...msft });
  await assert.rejects(build(duplicate), /duplicate_selected_asset/);
  const ready = report(); (ready as any).settlementReady = true;
  await assert.rejects(build(ready), /readiness_assertion_refused/);
  const source = report();
  await assert.rejects(buildQualificationDossier({ report: source, reportBytes: Buffer.from("{}") }, { requestedYear: 2026, now }), /observation_bytes_mismatch/);
  const contradictory = report();
  (contradictory.issuers[0]!.assets[0]!.identity as any).value.decimalsMatch = true;
  await assert.rejects(build(contradictory), /observed_identity_mismatch/);
});

test("civil dates enforce leap years and membership uses ex-date only", async () => {
  const leap = structuredClone(supplementFixture);
  leap.companyAnnouncements[0].officialCivilExDate = "2024-02-29";
  const dossier = await build(report(), leap);
  const joined = dossier.assets[0]!.revisions.find((item) => item.eventId === leap.candidateJoins[0].eventId)!;
  assert.equal(joined.candidateCompanyDates?.yearMembership, "outside_year");
  const invalid = structuredClone(leap); invalid.companyAnnouncements[0].officialCivilExDate = "2025-02-29";
  await assert.rejects(build(report(), invalid), /malformed_civil_date/);
});

test("missing, ambiguous, stale and duplicate candidate links block", async () => {
  const missing = structuredClone(supplementFixture); missing.candidateJoins = [];
  assert.ok((await build(report(), missing)).assets[0]!.blockers.includes("candidate_join_missing"));
  const ambiguous = structuredClone(supplementFixture); ambiguous.candidateJoins.push({ ...ambiguous.candidateJoins[0] });
  assert.ok((await build(report(), ambiguous)).assets[0]!.blockers.includes("candidate_join_ambiguous"));
  const stale = structuredClone(supplementFixture); stale.candidateJoins[0].sourceVersion = 1;
  assert.ok((await build(report(), stale)).assets[0]!.blockers.includes("candidate_join_stale_revision"));
  const duplicate = structuredClone(supplementFixture); duplicate.candidateJoins[1].companyAnnouncementId = duplicate.candidateJoins[0].companyAnnouncementId;
  assert.ok((await build(report(), duplicate)).blockers.includes("duplicate_entitlement_candidate"));
  const currency = structuredClone(supplementFixture); currency.companyAnnouncements[0].currency = "EUR";
  assert.ok((await build(report(), currency)).assets[0]!.blockers.includes("candidate_currency_mismatch"));
  const conflictingEvent = structuredClone(supplementFixture);
  conflictingEvent.issuerEvents.find((item: any) => item.eventId === conflictingEvent.candidateJoins[0].eventId).multiplierNew = "1.1";
  assert.ok((await build(report(), conflictingEvent)).assets[0]!.blockers.includes("candidate_supplement_event_conflict"));
});

test("heads are rederived with zero versions, replacement, idempotence and conflicts", async () => {
  const base = revisions()[0]!;
  const zero = { ...base, eventId: "zero", sourceVersion: 0, sourceDigest: historyDigest };
  const one = { ...zero, sourceVersion: 1, multiplierNew: "1.1" };
  const conflict = { ...one, multiplierNew: "1.2" };
  const dossier = await build(report([zero, zero, one, conflict]), undefined);
  assert.deepEqual(dossier.assets[0]!.currentHeads, [{ eventId: "zero", sourceVersion: 1 }]);
  assert.equal(dossier.assets[0]!.revisions.length, 2);
  assert.ok(dossier.assets[0]!.blockers.includes("conflicting_same_version_revision"));
  const unbound = report([base]);
  unbound.issuers[0]!.requests[0]!.dataDigest = `sha256:${"0".repeat(64)}`;
  assert.ok((await build(unbound, undefined)).assets[0]!.blockers.includes("source_digest_not_observed"));
});

test("invalid and falling factors are rejected or blocked without EventInput", async () => {
  const falling = revisions()[0]!;
  const dossier = await build(report([{ ...falling, multiplierOld: "2", multiplierNew: "1" }]), undefined);
  assert.ok(dossier.assets[0]!.blockers.includes("falling_factor_not_ordinary_dividend"));
  assert.equal(dossier.assets[0]!.revisions[0]!.candidateEncodings, null);
  assert.equal(dossier.assets[0]!.revisions[0]!.eventInputEmitted, false);
  const zero = report([{ ...falling, multiplierOld: "0" }]);
  await assert.rejects(build(zero, undefined), /invalid_decimal_string/);
});

test("unsupported, cancelled and Initial records preserve explicit blockers", async () => {
  const base = revisions()[0]!;
  const dossier = await build(report([
    { ...base, eventId: "unsupported", action: "Split", status: "Unknown" },
    { ...base, eventId: "cancel", action: "CashDividend", status: "Cancelled" },
    { ...base, eventId: "initial", status: "Initial" },
  ]), undefined);
  const blockers = dossier.assets[0]!.blockers;
  assert.ok(blockers.includes("unsupported_source_action"));
  assert.ok(blockers.includes("cancellation_semantics_unresolved"));
  assert.ok(blockers.includes("initial_status_finality_unresolved"));
});

test("empty, partial and mature histories never imply completeness", async () => {
  const empty = await build(report([]), undefined, new Date("2028-01-01T00:00:00Z"));
  assert.ok(empty.assets[0]!.blockers.includes("empty_history_not_annual_coverage"));
  assert.ok(!empty.blockers.includes("term_not_matured"));
  assert.equal(empty.annualCoverageComplete, false);
  const falselyObserved = report();
  (falselyObserved.issuers[0]!.assets[0]!.detail as any).corporateActions.value.fullyFetched = false;
  assert.ok((await build(falselyObserved, undefined)).assets[0]!.blockers.includes("issuer_event_history_incomplete"));
  const partial = report([], [msft, aapl]);
  partial.issuers[0]!.assets = partial.issuers[0]!.assets.slice(0, 1);
  partial.issuers[0]!.state = "partial";
  partial.issuers[0]!.stopped = { code: "issuer_rate_limited", remainingSelectedAssetsSkipped: 1 };
  const reviewed = await build(partial, undefined);
  assert.equal(reviewed.assets.find((item) => item.asset.symbol === "AAPLx")?.observationState, "missing");
  const missing = reviewed.assets.find((item) => item.asset.symbol === "AAPLx")!;
  assert.ok(missing.blockers.includes("issuer_event_history_unavailable"));
  assert.ok(!missing.blockers.includes("authenticated_notices_are_not_an_event_ledger"));
});

test("non-xStocks source arrays count toward the total source-record bound", async () => {
  const ondo = SELECTED_ASSETS.find((asset) => asset.symbol === "KOon")!;
  const history = Array.from({ length: 10_001 }, (_, index) => ({ sharesMultiplier: "1", changeTimestampMs: index }));
  const source: any = {
    schema: "dividendx-issuer-observations-v1",
    requestedYear: 2026,
    startedAt: "2026-09-17T22:40:00Z",
    completedAt: "2026-09-17T22:41:00Z",
    selected: [{ ...ondo }],
    issuers: [{
      issuerId: "ondo", state: "observed", stopped: null, requests: [],
      assets: [{
        asset: { ...ondo }, settlementReady: false, blockers: [],
        identity: { state: "observed", value: {
          issuerId: "ondo", chain: ondo.chain, symbol: ondo.symbol,
          expectedMint: ondo.mint, observedMint: ondo.mint, mintMatches: true,
          expectedDecimals: ondo.decimals, observedDecimals: ondo.decimals,
          decimalsReobserved: true, decimalsMatch: true,
          expectedTokenProgram: ondo.tokenProgram, observedTokenProgram: null, tokenProgramReobserved: false,
        } },
        detail: {
          pauses: { state: "observed", value: [] },
          multiplier: { state: "observed", value: { history, sourceTimestampMs: 0, normalizedDividendEvents: false } },
          dividend: { state: "observed", value: {} },
          annualCoverageAttested: false, zeroDividendYearEstablished: false,
        },
      }],
    }],
    settlementReady: false, blockers: [],
  };
  await assert.rejects(buildQualificationDossier({ report: source, reportBytes: jsonBytes(source) }, { requestedYear: 2026, now }), /source_record_limit_exceeded/);
});

test("stale, future and inverted observation controls are deterministic", async () => {
  const stale = report();
  stale.startedAt = "2026-09-15T00:00:00Z"; stale.completedAt = "2026-09-15T00:01:00Z";
  stale.issuers[0]!.requests[0]!.retrievedAt = "2026-09-15T00:00:30Z";
  assert.ok((await build(stale, undefined)).blockers.includes("observation_report_stale"));
  const future = report(); future.completedAt = "2026-09-18T00:00:00Z"; future.issuers[0]!.requests[0]!.retrievedAt = "2026-09-18T00:00:00Z";
  assert.ok((await build(future, undefined)).blockers.includes("observation_report_from_future"));
  const inverted = report(); inverted.startedAt = "2026-09-17T22:42:00Z";
  assert.ok((await build(inverted, undefined)).blockers.includes("observation_report_time_inverted"));
  const mintFuture = structuredClone(supplementFixture); mintFuture.currentMintObservation.retrievedAt = "2026-09-18T00:00:00Z";
  assert.ok((await build(report(), mintFuture)).assets[0]!.blockers.includes("current_mint_observation_from_future"));
});

test("tampered mint/Clock bytes and profile claims block independently", async () => {
  const clockTamper = structuredClone(supplementFixture);
  const clock = clockTamper.currentMintObservation.accounts[1];
  clock.dataBase64 = `${clock.dataBase64.slice(0, -2)}A=`;
  assert.ok((await build(report(), clockTamper)).assets[0]!.blockers.includes("clock_data_digest_mismatch"));
  const claimTamper = structuredClone(supplementFixture);
  claimTamper.currentMintObservation.profile.scale.activeBits = "4607209005307177708";
  assert.ok((await build(report(), claimTamper)).assets[0]!.blockers.includes("current_mint_profile_mismatch"));
});

test("safe summary cannot reflect source text, URLs, queries or contents", async () => {
  const injected = structuredClone(supplementFixture);
  injected.candidateJoins[0].basis = "SECRET_BASIS";
  injected.sources[0].url += "?credential=SECRET_QUERY";
  injected.sources[0].finalUrl = injected.sources[0].url;
  const summary = JSON.stringify(safeQualificationSummary(await build(report(), injected)));
  assert.doesNotMatch(summary, /SECRET_BASIS|SECRET_QUERY|news\.microsoft/);
});

test("file loading rejects symlinks, hard-linked credential aliases and oversize growth", async () => {
  const root = await mkdtemp(join(tmpdir(), "qualification-files-"));
  const credential = join(root, "credential.env");
  const alias = join(root, "alias.json");
  await writeFile(credential, "harmless fixture");
  await link(credential, alias);
  await assert.rejects(readQualificationJsonFile(alias, [credential]), /credential_file_input_refused/);
  const ordinary = join(root, "ordinary.json"); await writeFile(ordinary, "{}");
  const symbolic = join(root, "symbolic.json"); await symlink(ordinary, symbolic);
  await assert.rejects(readQualificationJsonFile(symbolic, []), /input_symlink_refused/);
  const oversize = join(root, "oversize.json"); await writeFile(oversize, Buffer.alloc(QUALIFICATION_MAX_FILE_BYTES + 1));
  await assert.rejects(readQualificationJsonFile(oversize, []), /input_file_too_large/);
  const directory = join(root, "directory"); await mkdir(directory);
  await assert.rejects(readQualificationJsonFile(directory, []), /input_not_regular_file/);
});

test("private archives are owner-only and exclusive", async () => {
  const dossier = await build();
  const root = await mkdtemp(join(tmpdir(), "qualification-archive-"));
  const archive = join(root, "private");
  const first = await writePrivateQualificationArchive(dossier, archive, {
    repoRoot,
    now: () => now,
    uuid: () => "fixed",
  });
  assert.equal((await stat(archive)).mode & 0o777, 0o700);
  assert.equal((await stat(first)).mode & 0o777, 0o600);
  await assert.rejects(writePrivateQualificationArchive(dossier, archive, {
    repoRoot,
    now: () => now,
    uuid: () => "fixed",
  }), /archive_write_failed/);
  await chmod(archive, 0o755);
  await assert.rejects(writePrivateQualificationArchive(dossier, archive, { repoRoot }), /archive_directory_not_private/);
});
