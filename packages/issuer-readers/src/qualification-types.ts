import type { SelectedAsset, IssuerReadReport } from "./types.js";
import type { XstocksEventRevision } from "./xstocks.js";

export type QualificationBlocker = string;

export interface CandidateEncoding {
  decimal: string;
  bits: string;
  provenance: "derived_from_api_decimal_not_historical_mint_bits";
}

export interface CandidateCompanyDates {
  announcementId: string;
  exDate: string;
  paymentDate: string;
  yearMembership: "in_year" | "outside_year";
  futureAsOfReview: boolean;
  authority: "researcher_candidate_not_issuer_confirmed";
}

export interface EventRevisionReview {
  eventId: string;
  sourceVersion: number;
  isCurrentHead: boolean;
  sourceIdentity: {
    issuerId: "xstocks";
    symbol: string;
    xstockIsin: string;
    underlyingSymbol: string;
    underlyingIsin: string;
    sourceDigest: string;
  };
  sourceAction: string;
  sourceStatus: string;
  effectiveTime: string;
  createdTime: string;
  originalFactors: { m0: string; m1: string };
  candidateEncodings: null | { m0: CandidateEncoding; m1: CandidateEncoding };
  candidateCompanyDates: CandidateCompanyDates | null;
  missingEventInputEvidence: string[];
  blockers: QualificationBlocker[];
  eventInputEmitted: false;
}

export interface CurrentMintReview {
  supplied: boolean;
  retrievedAt: string | null;
  contextSlot: number | null;
  mintDataDigest: string | null;
  clockDataDigest: string | null;
  independentlyDecoded: boolean;
  profileMatchesClaim: boolean;
  latestFactorMatchesActiveBits: boolean;
  configuredPairMatches: {
    eventId: string;
    sourceVersion: number;
    matchKind: "configured_pair_match_not_historical_transition_verified";
  }[];
  currentStateOnly: true;
  blockers: QualificationBlocker[];
}

export interface AssetQualificationReview {
  asset: SelectedAsset;
  observationState: string;
  revisions: EventRevisionReview[];
  currentHeads: { eventId: string; sourceVersion: number }[];
  currentMint: CurrentMintReview | null;
  blockers: QualificationBlocker[];
  annualCoverageComplete: false;
  custodyAdmitted: false;
  settlementReady: false;
  signable: false;
}

export interface QualificationDossier {
  schema: "dividendx-issuer-qualification-dossier-v1";
  version: 1;
  state: "blocked";
  requestedYear: number;
  maturityAt: string;
  generatedAt: string;
  maximumObservationAgeMs: number;
  inputs: {
    observation: {
      sha256: string;
      startedAt: string;
      completedAt: string;
      requestObservations: { retrievedAt: string; dataDigest: string | null }[];
    };
    supplement: null | { sha256: string; asOf: string };
  };
  supplementReview: null | {
    identity: ValidatedSupplement["identity"];
    announcements: {
      id: string;
      officialCivilExDate: string;
      payableDate: string;
      linkedCurrentEventIds: string[];
      futureAsOfReview: boolean;
    }[];
    blockers: QualificationBlocker[];
  };
  selected: SelectedAsset[];
  assets: AssetQualificationReview[];
  blockers: QualificationBlocker[];
  annualCoverageComplete: false;
  custodyAdmitted: false;
  policyResolved: false;
  settlementReady: false;
  signable: false;
  transactionPayloadEmitted: false;
}

export interface QualificationInput {
  report: IssuerReadReport;
  reportBytes: Uint8Array;
  supplement?: unknown;
  supplementBytes?: Uint8Array;
}

export interface ValidatedSupplement {
  asOf: string;
  identity: {
    issuerId: "xstocks";
    symbol: string;
    mint: string;
    xstockIsin: string;
    underlyingSymbol: string;
    underlyingIsin: string;
  };
  announcements: Map<string, {
    id: string;
    underlyingSymbol: string;
    officialCivilExDate: string;
    payableDate: string;
    grossCashflowUsd: string;
    currency: string;
    sourceUrl: string;
    sourceSha256: string;
  }>;
  joins: {
    eventId: string;
    sourceVersion: number;
    companyAnnouncementId: string;
  }[];
  issuerEvents: {
    eventId: string;
    sourceVersion: number;
    symbol: string;
    underlyingSymbol: string;
    xstockIsin: string;
    underlyingIsin: string;
    action: string;
    status: string;
    multiplierOld: string;
    multiplierNew: string;
    createdTime: string;
    effectiveTime: string;
    grossCashflowUsd: string | null;
  }[];
  currentMintObservation: unknown | null;
}

export interface ValidatedXstocksAsset {
  registry: { isin: string; underlyingSymbol: string; underlyingIsin: string };
  records: XstocksEventRevision[];
  componentState: string;
  successfulRequestDigests: Set<string>;
}
