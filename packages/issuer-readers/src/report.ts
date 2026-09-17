import type { IssuerAssetObservation, IssuerReadReport } from "./types.js";

function countDetails(asset: IssuerAssetObservation): Record<string, number> {
  const detail = asset.detail as Record<string, unknown>;
  const counts: Record<string, number> = {};
  const component = (name: string): Record<string, unknown> | null => {
    const value = detail[name];
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  };
  const actions = component("corporateActions");
  if (actions) {
    const value = actions.value && typeof actions.value === "object" ? actions.value as Record<string, unknown> : null;
    counts.corporateActionRecords = Array.isArray(value?.records) ? value.records.length : 0;
  }
  const pauses = component("pauses");
  if (pauses) counts.pauseNotices = Array.isArray(pauses.value) ? pauses.value.length : 0;
  const multiplier = component("multiplier");
  if (multiplier) {
    const value = multiplier.value && typeof multiplier.value === "object" ? multiplier.value as Record<string, unknown> : null;
    counts.multiplierPoints = Array.isArray(value?.history) ? value.history.length : 0;
  }
  return counts;
}

function componentStates(asset: IssuerAssetObservation): Record<string, { state: string; code?: string }> {
  const detail = asset.detail as Record<string, unknown>;
  const result: Record<string, { state: string; code?: string }> = {};
  for (const [name, candidate] of Object.entries(detail)) {
    if (!candidate || typeof candidate !== "object" || !("state" in candidate)) continue;
    const component = candidate as { state?: unknown; code?: unknown };
    if (typeof component.state !== "string") continue;
    result[name] = typeof component.code === "string" ? { state: component.state, code: component.code } : { state: component.state };
  }
  return result;
}

export function safeSummary(report: IssuerReadReport): object {
  return {
    schema: "dividendx-issuer-summary-v1",
    requestedYear: report.requestedYear,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    settlementReady: false,
    blockers: [...report.blockers],
    issuers: report.issuers.map((issuer) => ({
      issuerId: issuer.issuerId,
      state: issuer.state,
      stopped: issuer.stopped,
      assets: issuer.assets.map((asset) => ({
        symbol: asset.asset.symbol,
        chain: asset.asset.chain,
        expectedMint: asset.asset.mint,
        expectedDecimals: asset.asset.decimals,
        expectedTokenProgram: asset.asset.tokenProgram,
        tokenProgramReobserved: asset.identity.state === "observed" ? asset.identity.value.tokenProgramReobserved : false,
        identityState: asset.identity.state,
        identityCode: asset.identity.state === "observed" ? null : asset.identity.code,
        identityVerified: asset.identity.state === "observed",
        observedDecimals: asset.identity.state === "observed" ? asset.identity.value.observedDecimals : null,
        decimalsReobserved: asset.identity.state === "observed" ? asset.identity.value.decimalsReobserved : false,
        counts: countDetails(asset),
        components: componentStates(asset),
        blockers: [...asset.blockers],
      })),
      requests: issuer.requests.map((request) => ({ ...request })),
    })),
  };
}

export function reportHasFailures(report: IssuerReadReport): boolean {
  return report.issuers.some((issuer) => issuer.state !== "observed");
}
