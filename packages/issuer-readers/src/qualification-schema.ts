import { SELECTED_ASSETS } from "./catalog.js";
import { array, bool, civilDate, exactDecimal, fail, integer, object, string, timestamp } from "./schema.js";
import type { IssuerId, IssuerReadReport, SelectedAsset } from "./types.js";
import type { ValidatedSupplement, ValidatedXstocksAsset } from "./qualification-types.js";
import type { XstocksEventRevision } from "./xstocks.js";

export const QUALIFICATION_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const QUALIFICATION_MAX_ASSETS = 15;
export const QUALIFICATION_MAX_SOURCE_RECORDS = 10_000;
export const QUALIFICATION_MAX_SUPPLEMENT_ITEMS = 100;
const SHA256 = /^[0-9a-f]{64}$/;

function sha256(value: unknown, code = "malformed_digest"): string {
  const result = string(value, code);
  if (!SHA256.test(result)) fail(code);
  return result;
}

function sourceDigest(value: unknown): string {
  const result = string(value, "malformed_digest");
  if (!/^sha256:[0-9a-f]{64}$/.test(result)) fail("malformed_digest");
  return result;
}

function nullableString(value: unknown, code: string): string | null {
  return value === null ? null : string(value, code);
}

function exactAsset(value: unknown): SelectedAsset {
  const row = object(value, "malformed_selected_asset");
  const issuerId = string(row.issuerId, "malformed_selected_asset") as IssuerId;
  const symbol = string(row.symbol, "malformed_selected_asset");
  const candidate: SelectedAsset = {
    issuerId,
    symbol,
    underlying: string(row.underlying, "malformed_selected_asset"),
    mint: string(row.mint, "malformed_selected_asset"),
    decimals: integer(row.decimals, "malformed_selected_asset"),
    tokenProgram: string(row.tokenProgram, "malformed_selected_asset"),
    chain: string(row.chain, "malformed_selected_asset") as SelectedAsset["chain"],
  };
  const frozen = SELECTED_ASSETS.find((asset) => asset.symbol === symbol);
  if (!frozen || Object.keys(candidate).some((key) => candidate[key as keyof SelectedAsset] !== frozen[key as keyof SelectedAsset])) {
    fail("catalog_identity_mismatch");
  }
  return { ...candidate };
}

function component(value: unknown, code = "malformed_component"): Record<string, unknown> {
  const row = object(value, code);
  const state = string(row.state, code);
  if (!["observed", "partial", "failed", "unavailable", "skipped"].includes(state)) fail(code);
  if (state === "observed" || state === "partial") {
    if (row.value === undefined) fail(code);
  } else string(row.code, code);
  return row;
}

function eventRevision(value: unknown): XstocksEventRevision {
  const row = object(value, "malformed_event_revision");
  const nullableDecimal = (name: string): string | null => row[name] === null ? null : exactDecimal(row[name]);
  const nullableText = (name: string): string | null => nullableString(row[name], "malformed_event_revision");
  const revision: XstocksEventRevision = {
    eventId: string(row.eventId, "malformed_event_revision"),
    sourceVersion: integer(row.sourceVersion, "malformed_event_revision"),
    symbol: string(row.symbol, "malformed_event_revision"),
    xstockIsin: string(row.xstockIsin, "malformed_event_revision"),
    spvSymbol: string(row.spvSymbol, "malformed_event_revision"),
    spvIsin: string(row.spvIsin, "malformed_event_revision"),
    action: string(row.action, "malformed_event_revision"),
    status: string(row.status, "malformed_event_revision"),
    multiplierOld: exactDecimal(row.multiplierOld, { positive: true }),
    multiplierNew: exactDecimal(row.multiplierNew, { positive: true }),
    createdTime: timestamp(row.createdTime, "malformed_event_revision"),
    effectiveTime: timestamp(row.effectiveTime, "malformed_event_revision"),
    grossCashflowUsd: nullableDecimal("grossCashflowUsd"),
    netCashflowUsd: nullableDecimal("netCashflowUsd"),
    withholdingTaxRate: nullableDecimal("withholdingTaxRate"),
    fromUnits: nullableDecimal("fromUnits"),
    toUnits: nullableDecimal("toUnits"),
    redemptionPriceUsd: nullableDecimal("redemptionPriceUsd"),
    notes: nullableText("notes"),
    sourceDigest: sourceDigest(row.sourceDigest),
    officialExDate: null,
    settlementClassification: null,
    sourceFinalityAttested: false,
  };
  if (!revision.eventId || revision.sourceVersion < 0 || row.officialExDate !== null || row.settlementClassification !== null || row.sourceFinalityAttested !== false) {
    fail("malformed_event_revision");
  }
  return revision;
}

function validateIdentity(value: unknown, asset: SelectedAsset): void {
  const part = component(value, "malformed_identity_component");
  if (part.state !== "observed") return;
  const identity = object(part.value, "malformed_identity_component");
  if (string(identity.issuerId) !== asset.issuerId || string(identity.chain) !== asset.chain || string(identity.symbol) !== asset.symbol ||
      string(identity.expectedMint) !== asset.mint || string(identity.observedMint) !== asset.mint || bool(identity.mintMatches) !== true ||
      integer(identity.expectedDecimals) !== asset.decimals || string(identity.expectedTokenProgram) !== asset.tokenProgram) {
    fail("observed_identity_mismatch");
  }
  const observedDecimals = identity.observedDecimals === null ? null : integer(identity.observedDecimals, "malformed_identity_component");
  const decimalsReobserved = bool(identity.decimalsReobserved, "malformed_identity_component");
  const decimalsMatch = identity.decimalsMatch === null ? null : bool(identity.decimalsMatch, "malformed_identity_component");
  if ((decimalsReobserved && (observedDecimals !== asset.decimals || decimalsMatch !== true)) ||
      (!decimalsReobserved && (observedDecimals !== null || decimalsMatch !== null)) ||
      identity.observedTokenProgram !== null || identity.tokenProgramReobserved !== false) {
    fail("observed_identity_mismatch");
  }
}

export interface ValidatedObservation {
  report: IssuerReadReport;
  xstocks: Map<string, ValidatedXstocksAsset>;
  requestObservations: { retrievedAt: string; dataDigest: string | null }[];
}

export function validateObservationReport(value: unknown, requestedYear: number): ValidatedObservation {
  const root = object(value, "malformed_observation_report");
  if (root.schema !== "dividendx-issuer-observations-v1") fail("unsupported_observation_schema");
  if (integer(root.requestedYear, "malformed_requested_year") !== requestedYear) fail("requested_year_mismatch");
  timestamp(root.startedAt, "malformed_observation_timestamp");
  timestamp(root.completedAt, "malformed_observation_timestamp");
  if (root.settlementReady !== false) fail("readiness_assertion_refused");
  const selectedRaw = array(root.selected, "malformed_selected_assets");
  if (selectedRaw.length < 1 || selectedRaw.length > QUALIFICATION_MAX_ASSETS) fail("selected_asset_limit_exceeded");
  const selected = selectedRaw.map(exactAsset);
  if (new Set(selected.map((asset) => asset.symbol)).size !== selected.length) fail("duplicate_selected_asset");

  const issuers = array(root.issuers, "malformed_issuer_groups");
  const expectedIssuers = new Set(selected.map((asset) => asset.issuerId));
  if (issuers.length !== expectedIssuers.size) fail("issuer_grouping_mismatch");
  const seenIssuers = new Set<string>();
  const seenAssets = new Set<string>();
  const stoppedIssuers = new Set<string>();
  const xstocks = new Map<string, ValidatedXstocksAsset>();
  const requestObservations: { retrievedAt: string; dataDigest: string | null }[] = [];
  let sourceRecords = 0;
  for (const issuerValue of issuers) {
    const issuer = object(issuerValue, "malformed_issuer_group");
    const issuerId = string(issuer.issuerId, "malformed_issuer_group") as IssuerId;
    if (!expectedIssuers.has(issuerId) || seenIssuers.has(issuerId)) fail("issuer_grouping_mismatch");
    seenIssuers.add(issuerId);
    if (!["observed", "partial", "unavailable", "failed"].includes(string(issuer.state, "malformed_issuer_group"))) fail("malformed_issuer_group");
    if (issuer.stopped !== null) {
      const stopped = object(issuer.stopped, "malformed_issuer_stop");
      string(stopped.code, "malformed_issuer_stop");
      if (stopped.remainingRequestsSkipped !== undefined) integer(stopped.remainingRequestsSkipped, "malformed_issuer_stop");
      if (stopped.remainingSelectedAssetsSkipped !== undefined) integer(stopped.remainingSelectedAssetsSkipped, "malformed_issuer_stop");
      stoppedIssuers.add(issuerId);
    }
    const requests = array(issuer.requests, "malformed_source_records");
    const successfulRequestDigests = new Set<string>();
    sourceRecords += requests.length;
    for (const requestValue of requests) {
      const request = object(requestValue, "malformed_source_record");
      string(request.endpoint, "malformed_source_record");
      const retrievedAt = timestamp(request.retrievedAt, "malformed_source_record");
      if (request.status !== null) integer(request.status, "malformed_source_record");
      if (request.dataDigest !== null) sourceDigest(request.dataDigest);
      if (typeof request.status === "number" && request.status >= 200 && request.status < 300 && typeof request.dataDigest === "string") successfulRequestDigests.add(request.dataDigest);
      nullableString(request.error, "malformed_source_record");
      requestObservations.push({ retrievedAt, dataDigest: request.dataDigest as string | null });
    }
    for (const assetValue of array(issuer.assets, "malformed_issuer_assets")) {
      const assetRow = object(assetValue, "malformed_issuer_asset");
      const asset = exactAsset(assetRow.asset);
      if (asset.issuerId !== issuerId || !selected.some((item) => item.symbol === asset.symbol) || seenAssets.has(asset.symbol)) fail("issuer_grouping_mismatch");
      seenAssets.add(asset.symbol);
      if (assetRow.settlementReady !== false) fail("readiness_assertion_refused");
      validateIdentity(assetRow.identity, asset);
      array(assetRow.blockers, "malformed_asset_blockers").forEach((item) => string(item, "malformed_asset_blockers"));
      const detail = object(assetRow.detail, "malformed_asset_detail");
      if (issuerId === "xstocks") {
        const registryPart = component(detail.registry);
        const actionPart = component(detail.corporateActions);
        let registry = { isin: "", underlyingSymbol: "", underlyingIsin: "" };
        if (registryPart.state === "observed") {
          const observed = object(registryPart.value, "malformed_registry_component");
          const underlying = object(observed.underlying, "malformed_registry_component");
          registry = {
            isin: string(observed.isin, "malformed_registry_component"),
            underlyingSymbol: string(underlying.symbol, "malformed_registry_component"),
            underlyingIsin: string(underlying.isin, "malformed_registry_component"),
          };
          if (registry.underlyingSymbol !== asset.underlying) fail("observed_identity_mismatch");
        }
        let records: XstocksEventRevision[] = [];
        let fullyFetched: boolean | null = null;
        if (actionPart.state === "observed" || actionPart.state === "partial") {
          const action = object(actionPart.value, "malformed_event_component");
          records = array(action.records, "malformed_event_component").map(eventRevision);
          sourceRecords += records.length;
          fullyFetched = bool(action.fullyFetched, "malformed_event_component");
          if (action.annualCoverageAttested !== false || action.zeroDividendYearEstablished !== false) fail("readiness_assertion_refused");
          for (const record of records) {
            if (record.symbol !== asset.symbol || (registry.isin && (record.xstockIsin !== registry.isin || record.spvSymbol !== registry.underlyingSymbol || record.spvIsin !== registry.underlyingIsin))) {
              fail("observed_event_identity_mismatch");
            }
          }
          if (!fullyFetched) actionPart.state = "partial";
        }
        xstocks.set(asset.symbol, { registry, records, componentState: string(actionPart.state), successfulRequestDigests });
      } else {
        const corporate = detail.corporateActions;
        if (issuerId === "backpack") {
          const eventPart = object(corporate, "malformed_event_component");
          if (eventPart.state !== "unavailable" || eventPart.annualCoverageAttested !== false || eventPart.zeroDividendYearEstablished !== false) fail("malformed_event_component");
        } else {
          if (detail.annualCoverageAttested !== false || detail.zeroDividendYearEstablished !== false) fail("readiness_assertion_refused");
          const pauses = component(detail.pauses);
          if (pauses.state === "observed" || pauses.state === "partial") sourceRecords += array(pauses.value, "malformed_event_component").length;
          const multiplier = component(detail.multiplier);
          if (multiplier.state === "observed" || multiplier.state === "partial") {
            sourceRecords += array(object(multiplier.value, "malformed_event_component").history, "malformed_event_component").length;
          }
          const dividend = component(detail.dividend);
          if (dividend.state === "observed" || dividend.state === "partial") { object(dividend.value, "malformed_event_component"); sourceRecords += 1; }
        }
      }
    }
  }
  if (sourceRecords > QUALIFICATION_MAX_SOURCE_RECORDS) fail("source_record_limit_exceeded");
  for (const asset of selected) if (!seenAssets.has(asset.symbol) && !stoppedIssuers.has(asset.issuerId)) fail("issuer_grouping_mismatch");
  array(root.blockers, "malformed_report_blockers").forEach((item) => string(item, "malformed_report_blockers"));
  return { report: value as IssuerReadReport, xstocks, requestObservations };
}

function httpsUrl(value: unknown): string {
  const result = string(value, "malformed_source_url");
  let url: URL;
  try { url = new URL(result); } catch { fail("malformed_source_url"); }
  if (url.protocol !== "https:" || url.username || url.password) fail("malformed_source_url");
  return result;
}

export function validateSupplement(value: unknown): ValidatedSupplement {
  const root = object(value, "malformed_supplement");
  if (root.schema !== "dividendx-public-qualification-research-v1") fail("unsupported_supplement_schema");
  if (root.settlementReady !== false || root.historyPaginationIsAnnualCoverage !== false) fail("readiness_assertion_refused");
  const asOf = civilDate(root.asOf);
  string(root.purpose, "malformed_supplement");
  const identityRow = object(root.identity, "malformed_supplement_identity");
  const identity = {
    issuerId: string(identityRow.issuerId, "malformed_supplement_identity") as "xstocks",
    symbol: string(identityRow.symbol, "malformed_supplement_identity"),
    mint: string(identityRow.mint, "malformed_supplement_identity"),
    xstockIsin: string(identityRow.xstockIsin, "malformed_supplement_identity"),
    underlyingSymbol: string(identityRow.underlyingSymbol, "malformed_supplement_identity"),
    underlyingIsin: string(identityRow.underlyingIsin, "malformed_supplement_identity"),
  };
  if (identity.issuerId !== "xstocks") fail("unsupported_supplement_identity");
  const referenceMarket = object(identityRow.registryReferenceMarket, "malformed_supplement_identity");
  for (const name of ["mic", "abbreviation", "name", "timezone"]) string(referenceMarket[name], "malformed_supplement_identity");

  const sources = array(root.sources, "malformed_supplement_sources");
  if (sources.length > QUALIFICATION_MAX_SUPPLEMENT_ITEMS) fail("supplement_source_limit_exceeded");
  const sourcePairs = new Set<string>();
  for (const sourceValue of sources) {
    const source = object(sourceValue, "malformed_supplement_source");
    string(source.name, "malformed_supplement_source");
    httpsUrl(source.url); httpsUrl(source.finalUrl);
    const status = integer(source.status, "malformed_supplement_source");
    if (status < 100 || status > 599) fail("malformed_supplement_source");
    timestamp(source.retrievedAt, "malformed_supplement_source");
    const digest = sha256(source.sha256);
    sourcePairs.add(`${string(source.finalUrl)}\0${digest}`);
    sourcePairs.add(`${string(source.url)}\0${digest}`);
  }

  const announcements = new Map<string, {
    id: string; underlyingSymbol: string; officialCivilExDate: string; payableDate: string;
    grossCashflowUsd: string; currency: string; sourceUrl: string; sourceSha256: string;
  }>();
  const announcementRows = array(root.companyAnnouncements, "malformed_company_announcements");
  if (announcementRows.length > QUALIFICATION_MAX_SUPPLEMENT_ITEMS) fail("supplement_announcement_limit_exceeded");
  for (const value of announcementRows) {
    const row = object(value, "malformed_company_announcement");
    const announcement = {
      id: string(row.id, "malformed_company_announcement"),
      underlyingSymbol: string(row.underlyingSymbol, "malformed_company_announcement"),
      officialCivilExDate: civilDate(row.officialCivilExDate),
      payableDate: civilDate(row.payableDate),
      grossCashflowUsd: exactDecimal(row.grossCashflowUsd, { positive: true }),
      currency: string(row.currency, "malformed_company_announcement"),
      sourceUrl: httpsUrl(row.sourceUrl),
      sourceSha256: sha256(row.sourceSha256),
    };
    bool(row.futureAsOfObservation, "malformed_company_announcement");
    if (!announcement.id || announcements.has(announcement.id) || !sourcePairs.has(`${announcement.sourceUrl}\0${announcement.sourceSha256}`)) fail("company_announcement_source_mismatch");
    announcements.set(announcement.id, announcement);
  }

  const joins = array(root.candidateJoins, "malformed_candidate_joins");
  if (joins.length > QUALIFICATION_MAX_SUPPLEMENT_ITEMS) fail("supplement_join_limit_exceeded");
  const parsedJoins = joins.map((value) => {
    const row = object(value, "malformed_candidate_join");
    if (row.joinStatus !== "candidate" || row.issuerConfirmed !== false || row.sourceFinal !== false || row.settlementReady !== false) fail("readiness_assertion_refused");
    string(row.basis, "malformed_candidate_join");
    return {
      eventId: string(row.eventId, "malformed_candidate_join"),
      sourceVersion: integer(row.sourceVersion, "malformed_candidate_join"),
      companyAnnouncementId: string(row.companyAnnouncementId, "malformed_candidate_join"),
    };
  });
  const issuerEventRows = array(root.issuerEvents, "malformed_supplement_events");
  if (issuerEventRows.length > QUALIFICATION_MAX_SOURCE_RECORDS) fail("source_record_limit_exceeded");
  const issuerEvents = issuerEventRows.map((value) => {
    const row = object(value, "malformed_supplement_event");
    const nullableDecimal = (field: string): string | null => row[field] === null ? null : exactDecimal(row[field]);
    return {
      eventId: string(row.eventId, "malformed_supplement_event"),
      sourceVersion: integer(row.version, "malformed_supplement_event"),
      symbol: string(row.xstockSymbol, "malformed_supplement_event"),
      underlyingSymbol: string(row.spvSymbol, "malformed_supplement_event"),
      xstockIsin: string(row.xstockIsin, "malformed_supplement_event"),
      underlyingIsin: string(row.spvIsin, "malformed_supplement_event"),
      action: string(row.caType, "malformed_supplement_event"),
      status: string(row.status, "malformed_supplement_event"),
      multiplierOld: exactDecimal(row.multiplierOld, { positive: true }),
      multiplierNew: exactDecimal(row.multiplierNew, { positive: true }),
      createdTime: timestamp(row.createdTimeUtc, "malformed_supplement_event"),
      effectiveTime: timestamp(row.effectiveTimeUtc, "malformed_supplement_event"),
      grossCashflowUsd: nullableDecimal("grossCashflowUsd"),
    };
  });
  array(root.openGates, "malformed_open_gates").forEach((item) => string(item, "malformed_open_gates"));
  const currentMintObservation = root.currentMintObservation === null || root.currentMintObservation === undefined ? null : object(root.currentMintObservation, "malformed_current_mint_observation");
  if (currentMintObservation && (currentMintObservation.settlementReady !== false || currentMintObservation.historicalBeforeAfterBitsVerified !== false || currentMintObservation.liveCustodyAdmission !== false)) {
    fail("readiness_assertion_refused");
  }
  return { asOf, identity, announcements, joins: parsedJoins, issuerEvents, currentMintObservation };
}
