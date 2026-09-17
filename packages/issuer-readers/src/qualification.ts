import { createHash } from "node:crypto";
import { TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { PublicKey, SYSVAR_CLOCK_PUBKEY, type AccountInfo } from "@solana/web3.js";
import {
  decodeCanonicalMultiplier,
  decodeClockAccount,
  eventRetentionRatio,
  f64ToBits,
  inspectMintProfile,
} from "@dividendx/transaction-sdk";
import { safeCode, stableJson, fail, object, string, timestamp, integer, bool, exactDecimal } from "./schema.js";
import { QUALIFICATION_MAX_FILE_BYTES, validateObservationReport, validateSupplement } from "./qualification-schema.js";
import type {
  AssetQualificationReview,
  CandidateCompanyDates,
  CandidateEncoding,
  CurrentMintReview,
  EventRevisionReview,
  QualificationDossier,
  QualificationInput,
  ValidatedSupplement,
} from "./qualification-types.js";
import type { SelectedAsset } from "./types.js";
import type { XstocksEventRevision } from "./xstocks.js";

export const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const CLOCK_ADDRESS = "SysvarC1ock11111111111111111111111111111111";
export const CLOCK_OWNER = "Sysvar1111111111111111111111111111111111111";
export const DEFAULT_MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const SHA256 = /^[0-9a-f]{64}$/;

export interface QualificationOptions {
  requestedYear: number;
  now?: Date;
  maximumObservationAgeMs?: number;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function boundJson(bytes: Uint8Array, supplied: unknown, mismatchCode: string): unknown {
  if (bytes.byteLength > QUALIFICATION_MAX_FILE_BYTES) fail("input_file_too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { fail("malformed_json"); }
  if (stableJson(parsed) !== stableJson(supplied)) fail(mismatchCode);
  return parsed;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function semanticRevision(record: XstocksEventRevision): string {
  const { sourceDigest: _digest, ...semantic } = record;
  return stableJson(semantic);
}

function reduceRevisions(records: XstocksEventRevision[]): {
  revisions: XstocksEventRevision[];
  heads: Map<string, XstocksEventRevision>;
  conflicts: Set<string>;
} {
  const versions = new Map<string, XstocksEventRevision>();
  const conflicts = new Set<string>();
  for (const record of records) {
    const key = `${record.eventId}\0${record.sourceVersion}`;
    const prior = versions.get(key);
    if (prior && semanticRevision(prior) !== semanticRevision(record)) conflicts.add(record.eventId);
    if (!prior) versions.set(key, record);
  }
  const revisions = [...versions.values()];
  const heads = new Map<string, XstocksEventRevision>();
  for (const record of revisions) {
    const head = heads.get(record.eventId);
    if (!head || record.sourceVersion > head.sourceVersion) heads.set(record.eventId, record);
  }
  return { revisions, heads, conflicts };
}

function candidateEncoding(decimal: string): CandidateEncoding {
  const numeric = Number(decimal);
  if (!Number.isFinite(numeric) || numeric <= 0) fail("invalid_candidate_factor");
  const bits = f64ToBits(numeric);
  decodeCanonicalMultiplier(bits);
  return { decimal, bits: bits.toString(), provenance: "derived_from_api_decimal_not_historical_mint_bits" };
}

function candidateDates(
  joins: ValidatedSupplement["joins"],
  supplement: ValidatedSupplement,
  record: XstocksEventRevision,
  requestedYear: number,
  reviewDate: string,
): { dates: CandidateCompanyDates | null; blockers: string[] } {
  const matching = joins.filter((join) => join.eventId === record.eventId && join.sourceVersion === record.sourceVersion);
  const blockers: string[] = [];
  if (matching.length === 0) return { dates: null, blockers: ["candidate_join_missing"] };
  if (matching.length > 1) blockers.push("candidate_join_ambiguous");
  const announcement = supplement.announcements.get(matching[0]!.companyAnnouncementId);
  if (!announcement) return { dates: null, blockers: [...blockers, "candidate_announcement_missing"] };
  if (announcement.underlyingSymbol !== record.spvSymbol || announcement.grossCashflowUsd !== record.grossCashflowUsd) blockers.push("candidate_announcement_conflict");
  if (announcement.currency !== "USD") blockers.push("candidate_currency_mismatch");
  const year = Number(announcement.officialCivilExDate.slice(0, 4));
  return {
    dates: {
      announcementId: announcement.id,
      exDate: announcement.officialCivilExDate,
      paymentDate: announcement.payableDate,
      yearMembership: year === requestedYear ? "in_year" : "outside_year",
      futureAsOfReview: announcement.officialCivilExDate > reviewDate,
      authority: "researcher_candidate_not_issuer_confirmed",
    },
    blockers,
  };
}

function reviewRevision(
  record: XstocksEventRevision,
  isHead: boolean,
  asset: SelectedAsset,
  supplement: ValidatedSupplement | null,
  requestedYear: number,
  reviewDate: string,
  conflict: boolean,
  sourceDigestObserved: boolean,
): EventRevisionReview {
  const blockers: string[] = [];
  let encodings: EventRevisionReview["candidateEncodings"] = null;
  try {
    const m0 = candidateEncoding(record.multiplierOld);
    const m1 = candidateEncoding(record.multiplierNew);
    eventRetentionRatio(BigInt(m0.bits), BigInt(m1.bits));
    encodings = { m0, m1 };
  } catch {
    blockers.push(Number(record.multiplierNew) < Number(record.multiplierOld)
      ? "falling_factor_not_ordinary_dividend" : "invalid_candidate_factor");
  }
  if (conflict) blockers.push("conflicting_same_version_revision");
  if (!sourceDigestObserved) blockers.push("source_digest_not_observed");
  if (record.action !== "CashDividend") blockers.push("unsupported_source_action");
  else blockers.push("ordinary_dividend_taxonomy_unresolved");
  if (/cancel/i.test(record.action) || /cancel/i.test(record.status)) blockers.push("cancellation_semantics_unresolved");
  blockers.push(record.status === "Initial" ? "initial_status_finality_unresolved" : "source_status_semantics_unresolved");
  const matched = supplement && supplement.identity.symbol === asset.symbol
    ? candidateDates(supplement.joins, supplement, record, requestedYear, reviewDate)
    : { dates: null, blockers: isHead ? ["candidate_join_missing"] : [] };
  if (isHead) blockers.push(...matched.blockers);
  const missing = [
    "authoritative_classification_and_event_join",
    "historical_before_bits",
    "historical_after_bits",
    "source_finality",
    "observed_slot",
    "normalized_revision_mapping",
  ];
  return {
    eventId: record.eventId,
    sourceVersion: record.sourceVersion,
    isCurrentHead: isHead,
    sourceIdentity: {
      issuerId: "xstocks",
      symbol: record.symbol,
      xstockIsin: record.xstockIsin,
      underlyingSymbol: record.spvSymbol,
      underlyingIsin: record.spvIsin,
      sourceDigest: record.sourceDigest,
    },
    sourceAction: record.action,
    sourceStatus: record.status,
    effectiveTime: record.effectiveTime,
    createdTime: record.createdTime,
    originalFactors: { m0: record.multiplierOld, m1: record.multiplierNew },
    candidateEncodings: encodings,
    candidateCompanyDates: matched.dates,
    missingEventInputEvidence: missing,
    blockers: unique([...blockers, ...missing]),
    eventInputEmitted: false,
  };
}

function strictBase64(value: unknown): Buffer {
  const encoded = string(value, "malformed_account_data");
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail("malformed_account_data");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded) fail("malformed_account_data");
  return decoded;
}

function claimedBigInt(value: unknown): bigint {
  const raw = string(value, "malformed_numeric_claim");
  if (!/^\d+$/.test(raw)) fail("malformed_numeric_claim");
  return BigInt(raw);
}

function claimedSignedBigInt(value: unknown): bigint {
  const raw = string(value, "malformed_numeric_claim");
  if (!/^-?\d+$/.test(raw)) fail("malformed_numeric_claim");
  return BigInt(raw);
}

function accountInfo(data: Buffer, owner: PublicKey): AccountInfo<Buffer> {
  return { data, owner, executable: false, lamports: 0, rentEpoch: 0 };
}

async function reviewCurrentMint(
  value: unknown,
  asset: SelectedAsset,
  now: Date,
  maxAge: number,
  records: XstocksEventRevision[],
): Promise<CurrentMintReview> {
  const root = object(value, "malformed_current_mint_observation");
  if (root.schema !== "dividendx-current-mint-observation-v1" || root.settlementReady !== false ||
      root.historicalBeforeAfterBitsVerified !== false || root.liveCustodyAdmission !== false) fail("readiness_assertion_refused");
  const retrievedAt = timestamp(root.retrievedAt, "malformed_current_mint_observation");
  const contextSlot = integer(root.contextSlot, "malformed_current_mint_observation");
  const blockers: string[] = [];
  if (root.genesisHash !== SOLANA_MAINNET_GENESIS) blockers.push("mainnet_genesis_mismatch");
  if (root.commitment !== "finalized") blockers.push("commitment_not_finalized");
  if (root.mint !== asset.mint) blockers.push("current_mint_identity_mismatch");
  try {
    const endpoint = new URL(string(root.endpoint, "malformed_current_mint_observation"));
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) fail("malformed_current_mint_observation");
  } catch (error) {
    if (safeCode(error) === "malformed_current_mint_observation") throw error;
    fail("malformed_current_mint_observation");
  }
  const observedTime = Date.parse(retrievedAt);
  if (observedTime > now.valueOf()) blockers.push("current_mint_observation_from_future");
  else if (now.valueOf() - observedTime > maxAge) blockers.push("current_mint_observation_stale");

  const accounts = (root.accounts as unknown);
  if (!Array.isArray(accounts) || accounts.length !== 2) fail("malformed_current_mint_accounts");
  const parsed = accounts.map((value) => {
    const row = object(value, "malformed_current_mint_account");
    const claimedDigest = string(row.sha256, "malformed_digest");
    if (!SHA256.test(claimedDigest)) fail("malformed_digest");
    const data = strictBase64(row.dataBase64);
    return { address: string(row.address), owner: string(row.owner), data, claimedDigest, actualDigest: digest(data) };
  });
  const mintAccount = parsed.find((entry) => entry.address === asset.mint);
  const clockAccount = parsed.find((entry) => entry.address === CLOCK_ADDRESS);
  if (!mintAccount) blockers.push("current_mint_account_missing");
  if (!clockAccount) blockers.push("clock_account_missing");
  for (const entry of parsed) if (entry.actualDigest !== entry.claimedDigest) blockers.push(entry === clockAccount ? "clock_data_digest_mismatch" : "mint_data_digest_mismatch");
  if (mintAccount?.owner !== asset.tokenProgram) blockers.push("current_mint_owner_mismatch");
  if (clockAccount?.owner !== CLOCK_OWNER) blockers.push("clock_owner_mismatch");

  const clockClaim = object(root.clock, "malformed_clock_claim");
  const claimedClock = {
    slot: claimedBigInt(clockClaim.slot),
    epochStartTimestamp: claimedSignedBigInt(clockClaim.epochStartTimestamp),
    epoch: claimedBigInt(clockClaim.epoch),
    leaderScheduleEpoch: claimedBigInt(clockClaim.leaderScheduleEpoch),
    unixTimestamp: claimedSignedBigInt(clockClaim.unixTimestamp),
    contextSlot: integer(clockClaim.contextSlot, "malformed_clock_claim"),
  };
  const profileClaim = object(root.profile, "malformed_profile_claim");
  const scaleClaim = object(profileClaim.scale, "malformed_profile_claim");
  const controlsFingerprint = string(profileClaim.controlsFingerprint, "malformed_profile_claim");
  if (!SHA256.test(controlsFingerprint)) fail("malformed_profile_claim");
  const claimedProfile = {
    decimals: integer(profileClaim.decimals, "malformed_profile_claim"),
    extensionsMask: claimedBigInt(profileClaim.extensionsMask),
    currentBits: claimedBigInt(scaleClaim.currentBits),
    pendingBits: claimedBigInt(scaleClaim.pendingBits),
    pendingEffectiveTimestamp: claimedSignedBigInt(scaleClaim.pendingEffectiveTimestamp),
    activeBits: claimedBigInt(scaleClaim.activeBits),
    controlsFingerprint,
    accountingFactorsSupported: bool(profileClaim.accountingFactorsSupported, "malformed_profile_claim"),
  };
  const latestDecimal = exactDecimal(root.latestSourceMultiplier, { positive: true });
  const claimedLatestMatch = bool(root.latestSourceMultiplierMatchesActiveBits, "malformed_current_mint_observation");

  let independentlyDecoded = false;
  let profileMatchesClaim = false;
  let latestFactorMatchesActiveBits = false;
  const configuredPairMatches: CurrentMintReview["configuredPairMatches"] = [];
  if (mintAccount && clockAccount) {
    try {
      const clock = decodeClockAccount(accountInfo(clockAccount.data, new PublicKey(clockAccount.owner)), contextSlot);
      const clockMatches = clock.slot === claimedClock.slot &&
        clock.epochStartTimestamp === claimedClock.epochStartTimestamp &&
        clock.epoch === claimedClock.epoch && clock.leaderScheduleEpoch === claimedClock.leaderScheduleEpoch &&
        clock.unixTimestamp === claimedClock.unixTimestamp &&
        clock.contextSlot === claimedClock.contextSlot && clock.contextSlot === contextSlot;
      if (!clockMatches || clock.slot !== BigInt(contextSlot)) blockers.push("clock_claim_mismatch");
      const mintAddress = new PublicKey(mintAccount.address);
      const owner = new PublicKey(mintAccount.owner);
      const mint = unpackMint(mintAddress, accountInfo(mintAccount.data, owner), TOKEN_2022_PROGRAM_ID);
      const profile = await inspectMintProfile(mint, clock);
      independentlyDecoded = true;
      if (!profile.accountingFactorsSupported) blockers.push("current_mint_factors_unsupported");
      const controls = Buffer.from(profile.controlsFingerprint).toString("hex");
      profileMatchesClaim = profile.decimals === claimedProfile.decimals &&
        profile.extensionsMask === claimedProfile.extensionsMask &&
        profile.scale.currentBits === claimedProfile.currentBits &&
        profile.scale.pendingBits === claimedProfile.pendingBits &&
        profile.scale.pendingEffectiveTimestamp === claimedProfile.pendingEffectiveTimestamp &&
        profile.scale.activeBits === claimedProfile.activeBits &&
        controls === claimedProfile.controlsFingerprint &&
        profile.accountingFactorsSupported === claimedProfile.accountingFactorsSupported;
      if (!profileMatchesClaim || profile.decimals !== asset.decimals) blockers.push("current_mint_profile_mismatch");
      for (const record of records) {
        try {
          const effectiveSeconds = BigInt(Math.floor(Date.parse(record.effectiveTime) / 1000));
          if (f64ToBits(Number(record.multiplierOld)) === profile.scale.currentBits &&
              f64ToBits(Number(record.multiplierNew)) === profile.scale.pendingBits &&
              effectiveSeconds === profile.scale.pendingEffectiveTimestamp) {
            configuredPairMatches.push({
              eventId: record.eventId,
              sourceVersion: record.sourceVersion,
              matchKind: "configured_pair_match_not_historical_transition_verified",
            });
          }
        } catch { /* Invalid candidate factors are recorded by the event review. */ }
      }
      latestFactorMatchesActiveBits = f64ToBits(Number(latestDecimal)) === profile.scale.activeBits;
      if (!latestFactorMatchesActiveBits || claimedLatestMatch !== latestFactorMatchesActiveBits) blockers.push("latest_factor_claim_mismatch");
    } catch {
      blockers.push("current_mint_decode_failed");
    }
  }
  return {
    supplied: true,
    retrievedAt,
    contextSlot,
    mintDataDigest: mintAccount?.actualDigest ?? null,
    clockDataDigest: clockAccount?.actualDigest ?? null,
    independentlyDecoded,
    profileMatchesClaim,
    latestFactorMatchesActiveBits,
    configuredPairMatches,
    currentStateOnly: true,
    blockers: unique(blockers),
  };
}

function observationState(report: QualificationInput["report"], symbol: string): string {
  for (const issuer of report.issuers) {
    const found = issuer.assets.find((item) => item.asset.symbol === symbol);
    if (found) return found.identity.state;
  }
  return "missing";
}

export async function buildQualificationDossier(input: QualificationInput, options: QualificationOptions): Promise<QualificationDossier> {
  if (!Number.isSafeInteger(options.requestedYear) || options.requestedYear < 1000 || options.requestedYear > 9999) fail("invalid_year");
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.valueOf())) fail("invalid_now");
  const maximumObservationAgeMs = options.maximumObservationAgeMs ?? DEFAULT_MAX_OBSERVATION_AGE_MS;
  if (!Number.isSafeInteger(maximumObservationAgeMs) || maximumObservationAgeMs < 0) fail("invalid_maximum_observation_age");
  const reportValue = boundJson(input.reportBytes, input.report, "observation_bytes_mismatch");
  const validated = validateObservationReport(reportValue, options.requestedYear);
  if ((input.supplement === undefined) !== (input.supplementBytes === undefined)) fail("supplement_bytes_mismatch");
  const supplementValue = input.supplement === undefined ? null : boundJson(input.supplementBytes!, input.supplement, "supplement_bytes_mismatch");
  const supplement = supplementValue === null ? null : validateSupplement(supplementValue);
  const reviewDate = now.toISOString().slice(0, 10);
  const supplementBlockers: string[] = [];
  const observationBlockers: string[] = [];
  const startedAtMs = Date.parse(validated.report.startedAt);
  const completedAtMs = Date.parse(validated.report.completedAt);
  if (completedAtMs < startedAtMs) observationBlockers.push("observation_report_time_inverted");
  if (startedAtMs > now.valueOf() || completedAtMs > now.valueOf()) observationBlockers.push("observation_report_from_future");
  else if (now.valueOf() - completedAtMs > maximumObservationAgeMs) observationBlockers.push("observation_report_stale");
  for (const request of validated.requestObservations) {
    const requestMs = Date.parse(request.retrievedAt);
    if (requestMs > now.valueOf()) observationBlockers.push("source_observation_from_future");
    else if (now.valueOf() - requestMs > maximumObservationAgeMs) observationBlockers.push("source_observation_stale");
    if (requestMs < startedAtMs || requestMs > completedAtMs) observationBlockers.push("source_observation_outside_report_window");
  }
  let supplementAsset: SelectedAsset | null = null;
  if (supplement) {
    supplementAsset = validated.report.selected.find((asset) => asset.symbol === supplement.identity.symbol) ?? null;
    const observed = validated.xstocks.get(supplement.identity.symbol);
    if (!supplementAsset) supplementBlockers.push("supplement_identity_not_selected");
    else if (supplementAsset.issuerId !== supplement.identity.issuerId || supplementAsset.mint !== supplement.identity.mint || supplementAsset.underlying !== supplement.identity.underlyingSymbol ||
      !observed || observed.registry.isin !== supplement.identity.xstockIsin || observed.registry.underlyingIsin !== supplement.identity.underlyingIsin) {
      supplementBlockers.push("supplement_identity_mismatch");
    }
  }

  const assets: AssetQualificationReview[] = [];
  const currentAnnouncementUse = new Map<string, Set<string>>();
  for (const asset of validated.report.selected) {
    const assetBlockers = ["complete_annual_coverage_unproven", "source_finality_policy_unresolved", "live_custody_admission_missing"];
    const revisions: EventRevisionReview[] = [];
    const heads: { eventId: string; sourceVersion: number }[] = [];
    const observed = validated.xstocks.get(asset.symbol);
    const assetSupplement = supplement && supplement.identity.symbol === asset.symbol && supplementBlockers.length === 0 ? supplement : null;
    if (observed) {
      if (observed.componentState !== "observed") assetBlockers.push("issuer_event_history_incomplete");
      const reduced = reduceRevisions(observed.records);
      for (const record of reduced.revisions) {
        const head = reduced.heads.get(record.eventId);
        const isHead = head === record;
        const review = reviewRevision(record, isHead, asset, assetSupplement, options.requestedYear, reviewDate,
          reduced.conflicts.has(record.eventId), observed.successfulRequestDigests.has(record.sourceDigest));
        revisions.push(review);
        if (isHead) {
          heads.push({ eventId: record.eventId, sourceVersion: record.sourceVersion });
          assetBlockers.push(...review.blockers);
          if (review.candidateCompanyDates) {
            const uses = currentAnnouncementUse.get(review.candidateCompanyDates.announcementId) ?? new Set<string>();
            uses.add(record.eventId); currentAnnouncementUse.set(review.candidateCompanyDates.announcementId, uses);
          }
        }
      }
      if (observed.records.length === 0) assetBlockers.push("empty_history_not_annual_coverage");
      if (assetSupplement) {
        for (const join of assetSupplement.joins) {
          const head = reduced.heads.get(join.eventId);
          if (!head) assetBlockers.push("candidate_join_event_missing");
          else if (head.sourceVersion !== join.sourceVersion) assetBlockers.push("candidate_join_stale_revision");
          const supplementalEvents = assetSupplement.issuerEvents.filter((item) => item.eventId === join.eventId && item.sourceVersion === join.sourceVersion);
          if (supplementalEvents.length !== 1) assetBlockers.push(supplementalEvents.length === 0 ? "candidate_supplement_event_missing" : "candidate_supplement_event_ambiguous");
          else {
            const supplied = supplementalEvents[0]!;
            if (supplied.symbol !== assetSupplement.identity.symbol || supplied.underlyingSymbol !== assetSupplement.identity.underlyingSymbol ||
                supplied.xstockIsin !== assetSupplement.identity.xstockIsin || supplied.underlyingIsin !== assetSupplement.identity.underlyingIsin ||
                (head && (supplied.action !== head.action || supplied.status !== head.status || supplied.multiplierOld !== head.multiplierOld ||
                  supplied.multiplierNew !== head.multiplierNew || supplied.createdTime !== head.createdTime || supplied.effectiveTime !== head.effectiveTime ||
                  supplied.grossCashflowUsd !== head.grossCashflowUsd))) assetBlockers.push("candidate_supplement_event_conflict");
          }
          if (!assetSupplement.announcements.has(join.companyAnnouncementId)) assetBlockers.push("candidate_announcement_missing");
        }
      }
    } else {
      assetBlockers.push(asset.issuerId === "xstocks" ? "issuer_event_history_unavailable"
        : asset.issuerId === "backpack" ? "issuer_corporate_action_ledger_unavailable"
          : "authenticated_notices_are_not_an_event_ledger");
    }
    let currentMint: CurrentMintReview | null = null;
    if (assetSupplement?.currentMintObservation) {
      currentMint = await reviewCurrentMint(assetSupplement.currentMintObservation, asset, now, maximumObservationAgeMs, observed?.records ?? []);
      assetBlockers.push(...currentMint.blockers, "current_mint_cannot_fill_historical_factor_evidence", "current_mint_cannot_admit_custody");
    }
    assets.push({
      asset: { ...asset }, observationState: observationState(validated.report, asset.symbol), revisions,
      currentHeads: heads, currentMint, blockers: unique(assetBlockers), annualCoverageComplete: false,
      custodyAdmitted: false, settlementReady: false, signable: false,
    });
  }
  for (const [announcementId, eventIds] of currentAnnouncementUse) {
    if (eventIds.size > 1) {
      supplementBlockers.push("duplicate_entitlement_candidate");
      for (const review of assets.flatMap((asset) => asset.revisions).filter((item) => item.isCurrentHead && item.candidateCompanyDates?.announcementId === announcementId)) {
        review.blockers = unique([...review.blockers, "duplicate_entitlement_candidate"]);
      }
    }
  }
  if (supplementBlockers.length && supplementAsset) {
    const review = assets.find((item) => item.asset.symbol === supplementAsset!.symbol);
    if (review) review.blockers = unique([...review.blockers, ...supplementBlockers]);
  }
  const maturityAt = `${String(options.requestedYear + 1).padStart(4, "0")}-01-01T00:00:00.000Z`;
  const blockers = [
    "complete_annual_coverage_unproven",
    "source_finality_policy_unresolved",
    "live_custody_admission_missing",
    "qualification_policy_unresolved",
    ...(now.valueOf() < Date.parse(maturityAt) ? ["term_not_matured"] : []),
    ...(options.requestedYear < 2020 || options.requestedYear > 2100 ? ["program_year_range_unsupported"] : []),
    ...observationBlockers,
    ...supplementBlockers,
    ...assets.flatMap((asset) => asset.blockers),
  ];
  const supplementReview = supplement ? {
    identity: supplement.identity,
    announcements: [...supplement.announcements.values()].map((announcement) => ({
      id: announcement.id,
      officialCivilExDate: announcement.officialCivilExDate,
      payableDate: announcement.payableDate,
      linkedCurrentEventIds: [...(currentAnnouncementUse.get(announcement.id) ?? new Set<string>())].sort(),
      futureAsOfReview: announcement.officialCivilExDate > reviewDate,
    })),
    blockers: unique(supplementBlockers),
  } : null;
  return {
    schema: "dividendx-issuer-qualification-dossier-v1",
    version: 1,
    state: "blocked",
    requestedYear: options.requestedYear,
    maturityAt,
    generatedAt: now.toISOString(),
    maximumObservationAgeMs,
    inputs: {
      observation: {
        sha256: digest(input.reportBytes),
        startedAt: validated.report.startedAt,
        completedAt: validated.report.completedAt,
        requestObservations: validated.requestObservations,
      },
      supplement: supplement && input.supplementBytes ? { sha256: digest(input.supplementBytes), asOf: supplement.asOf } : null,
    },
    supplementReview,
    selected: validated.report.selected.map((asset) => ({ ...asset })),
    assets,
    blockers: unique(blockers),
    annualCoverageComplete: false,
    custodyAdmitted: false,
    policyResolved: false,
    settlementReady: false,
    signable: false,
    transactionPayloadEmitted: false,
  };
}

export function safeQualificationSummary(dossier: QualificationDossier): object {
  return {
    schema: "dividendx-issuer-qualification-summary-v1",
    state: "blocked",
    requestedYear: dossier.requestedYear,
    maturityAt: dossier.maturityAt,
    generatedAt: dossier.generatedAt,
    settlementReady: false,
    signable: false,
    inputs: dossier.inputs,
    blockers: dossier.blockers,
    assets: dossier.assets.map((asset) => ({
      issuerId: asset.asset.issuerId,
      symbol: asset.asset.symbol,
      chain: asset.asset.chain,
      mint: asset.asset.mint,
      decimals: asset.asset.decimals,
      tokenProgram: asset.asset.tokenProgram,
      observationState: asset.observationState,
      revisionCount: asset.revisions.length,
      currentHeadCount: asset.currentHeads.length,
      candidateJoinCount: asset.revisions.filter((revision) => revision.isCurrentHead && revision.candidateCompanyDates !== null).length,
      currentMintChecked: asset.currentMint?.independentlyDecoded ?? false,
      blockers: asset.blockers,
      settlementReady: false,
      signable: false,
    })),
    announcementCount: dossier.supplementReview?.announcements.length ?? 0,
    unlinkedAnnouncementCount: dossier.supplementReview?.announcements.filter((item) => item.linkedCurrentEventIds.length === 0).length ?? 0,
  };
}
