import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  ONDO_DEFAULT_ENV_FILE,
  SELECTED_ASSETS,
  loadReviewedOndoTransport,
  observePublicJson,
  parseCli,
  prepareArchiveDirectory,
  readOndo,
  readSelectedIssuers,
  safeSummary,
  writePrivateArchive,
  type IssuerReadReport,
  type OndoTransport,
} from "../src/index.js";

const oasset = SELECTED_ASSETS.find((asset) => asset.symbol === "KOon")!;
const fixedDate = new Date("2026-09-17T10:00:00.000Z");
const now = () => fixedDate;

function ondoResponse(endpoint: string, value: unknown, status = 200) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    record: {
      endpoint, retrievedAt: fixedDate.toISOString(), status,
      dataDigest: "sha256:fixture", error: status >= 200 && status < 300 ? null : "http_status",
    },
    raw: status >= 200 && status < 300 ? bytes : null,
  };
}
function successfulTransport(): OndoTransport {
  return {
    async loadApiKey() { return "fixture-key"; },
    async observeEndpoint(endpoint) {
      if (endpoint === "/v1/assets/all/addresses") return ondoResponse(endpoint, [{ symbol: "KOon", addresses: [{ networkChainId: "solana-900", address: oasset.mint, decimals: 9 }] }]);
      if (endpoint === "/v1/status/assets") return ondoResponse(endpoint, [{
        symbol: "KOon", status: "upcoming", type: "scheduled",
        reason: { code: "ASSET_PAUSED", message: "cash_dividend", documentation: "https://docs.ondo.finance/" },
        start: "2026-09-18T00:00:00Z", eventId: "notice-id", updateSharesMultiplier: true,
      }]);
      if (endpoint.includes("shares-multiplier")) return ondoResponse(endpoint, { history: [{ sharesMultiplier: "1.012300000000000000", changeTimestamp: 1_799_000_000_000 }], timestamp: 1_800_000_000_000 });
      return ondoResponse(endpoint, { ticker: "KO", dividendYield: "0.0245", payoutFrequency: "quarterly", lastCashAmount: "0.51", lastPaymentDate: "2026-07-01", timestamp: 1_800_000_000_000 });
    },
  };
}

test("missing and blank Ondo credentials return explicit unavailable assets", async () => {
  const missing: OndoTransport = {
    async loadApiKey() { throw Object.assign(new Error("credential_file_unavailable"), { code: "credential_file_unavailable" }); },
    async observeEndpoint() { throw new Error("must not fetch"); },
  };
  const report = await readSelectedIssuers({ year: 2026, issuers: ["ondo"], now, ondo: { transport: missing } });
  assert.equal(report.issuers[0]!.state, "unavailable");
  assert.equal(report.issuers[0]!.assets.length, 6);
  assert.equal(report.issuers[0]!.assets[0]!.identity.state, "unavailable");
  assert.equal((report.issuers[0]!.assets[0]!.identity as { code: string }).code, "credential_file_unavailable");
  const blank = await readSelectedIssuers({ year: 2026, issuers: ["ondo"], symbols: ["KOon"], now, ondo: { transport: successfulTransport(), apiKey: "  " } });
  assert.equal((blank.issuers[0]!.assets[0]!.identity as { code: string }).code, "ondo_api_key_missing");
});

test("Ondo stops issuer requests on 401, 403 and 429 while retaining safe status", async () => {
  for (const status of [401, 403, 429]) {
    let calls = 0;
    const transport: OndoTransport = {
      async loadApiKey() { return "key"; },
      async observeEndpoint(endpoint) { calls += 1; return ondoResponse(endpoint, { code: "secret body" }, status); },
    };
    const report = await readOndo([oasset], { apiKey: "key", transport, now });
    assert.equal(calls, 1);
    assert.equal(report.requests[0]!.status, status);
    assert.equal(report.stopped?.code, status === 429 ? "issuer_rate_limited" : "issuer_authentication_failed");
  }
});

test("successful Ondo observations remain notices and safe summary excludes economics and auth details", async () => {
  const issuer = await readOndo([oasset], { apiKey: "super-secret-key", transport: successfulTransport(), now });
  const report: IssuerReadReport = {
    schema: "dividendx-issuer-observations-v1", requestedYear: 2026,
    startedAt: fixedDate.toISOString(), completedAt: fixedDate.toISOString(), selected: [oasset], issuers: [issuer],
    settlementReady: false, blockers: ["official_civil_ex_dates"],
  };
  assert.equal(issuer.assets[0]!.detail.annualCoverageAttested, false);
  assert.equal(issuer.assets[0]!.detail.zeroDividendYearEstablished, false);
  const serialized = JSON.stringify(safeSummary(report));
  assert.doesNotMatch(serialized, /super-secret-key|0\.0245|0\.51|cash_dividend|notice-id|1\.0123/);
  assert.match(serialized, /"identityVerified":true/);
  assert.match(serialized, /"pauseNotices":1/);
});

test("safe summary exposes sanitized identity and component failure codes", async () => {
  const transport = successfulTransport();
  const original = transport.observeEndpoint.bind(transport);
  transport.observeEndpoint = async (endpoint, options) => {
    if (endpoint === "/v1/assets/all/addresses") return ondoResponse(endpoint, [{ symbol: "KOon", addresses: [{ networkChainId: "solana-900", address: "wrong-mint", decimals: 9 }] }]);
    return original(endpoint, options);
  };
  const issuer = await readOndo([oasset], { apiKey: "key", transport, now });
  const report: IssuerReadReport = { schema: "dividendx-issuer-observations-v1", requestedYear: 2026, startedAt: fixedDate.toISOString(), completedAt: fixedDate.toISOString(), selected: [oasset], issuers: [issuer], settlementReady: false, blockers: [] };
  const summary = JSON.stringify(safeSummary(report));
  assert.match(summary, /ondo_mint_mismatch/);
  assert.doesNotMatch(summary, /wrong-mint/);
});

test("reviewed Ondo transport refuses key reflection and enforces absolute deadline", async () => {
  const transport = await loadReviewedOndoTransport();
  await assert.rejects(() => transport.observeEndpoint("/v1/assets/all/addresses", {
    apiKey: "secret-key",
    fetchImpl: async () => new Response(JSON.stringify({ reflected: "secret-key" }), { status: 200 }),
    now,
  }), (error: unknown) => (error as { code?: string }).code === "secret_reflection_refused");
  await assert.rejects(() => transport.observeEndpoint("/v1/assets/all/addresses", {
    apiKey: "secret-key", fetchImpl: async () => await new Promise<Response>(() => undefined), timeoutMs: 5, now,
  }), (error: unknown) => (error as { code?: string }).code === "request_timed_out");
});

test("public transport is GET-only, bounded, fixed-origin and safe on errors", async () => {
  const url = new URL("https://example.test/data");
  const allowed = (candidate: URL) => candidate.pathname === "/data" && candidate.search === "";
  await assert.rejects(() => observePublicJson(new URL("https://evil.test/data"), { allowedOrigin: url.origin, allowedPath: allowed }), /endpoint_not_allowed/);
  await assert.rejects(() => observePublicJson(url, {
    allowedOrigin: url.origin, allowedPath: allowed, timeoutMs: 5,
    fetchImpl: async () => await new Promise<Response>(() => undefined), now,
  }), /request_timed_out/);
  await assert.rejects(() => observePublicJson(url, {
    allowedOrigin: url.origin, allowedPath: allowed, maxBytes: 2,
    fetchImpl: async () => new Response("long", { status: 200 }), now,
  }), /response_too_large/);
  const malformed = await observePublicJson(url, {
    allowedOrigin: url.origin, allowedPath: allowed,
    fetchImpl: async () => new Response("private bad body", { status: 200 }), now,
  });
  assert.equal(malformed.request.error, "malformed_json");
  assert.doesNotMatch(JSON.stringify(malformed), /private bad body/);
});

function minimalReport(): IssuerReadReport {
  return {
    schema: "dividendx-issuer-observations-v1", requestedYear: 2026,
    startedAt: fixedDate.toISOString(), completedAt: fixedDate.toISOString(),
    selected: [], issuers: [], settlementReady: false, blockers: ["official_civil_ex_dates"],
  };
}

test("private archives are exclusive owner-only snapshots and never overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issuer-readers-private-"));
  await chmod(directory, 0o700);
  const first = await writePrivateArchive(minimalReport(), directory, { repoRoot: process.cwd(), now, uuid: () => "one" });
  const second = await writePrivateArchive(minimalReport(), directory, { repoRoot: process.cwd(), now, uuid: () => "two" });
  assert.notEqual(first, second);
  assert.equal((await lstat(first)).mode & 0o777, 0o600);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal(JSON.parse(await readFile(first, "utf8")).settlementReady, false);
  await assert.rejects(() => writePrivateArchive(minimalReport(), directory, { repoRoot: process.cwd(), now, uuid: () => "one" }), /archive_write_failed/);
});

test("archive rejects repository, credential aliases, symlinks and non-private existing directories without chmod", async () => {
  await assert.rejects(() => prepareArchiveDirectory(resolve(process.cwd(), "packages/issuer-readers/private"), { repoRoot: process.cwd() }), /archive_inside_repository/);
  const root = await mkdtemp(join(tmpdir(), "issuer-readers-safety-"));
  await chmod(root, 0o700);
  const credential = join(root, "archive", "credential.env");
  await assert.rejects(() => prepareArchiveDirectory(join(root, "archive"), { repoRoot: process.cwd(), credentialPaths: [credential] }), /archive_conflicts_with_credential/);
  const openDirectory = join(root, "open");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(openDirectory, { mode: 0o755 }));
  await assert.rejects(() => prepareArchiveDirectory(openDirectory, { repoRoot: process.cwd() }), /archive_directory_not_private/);
  assert.equal((await lstat(openDirectory)).mode & 0o777, 0o755);
  const target = join(root, "target");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(target, { mode: 0o700 }));
  const alias = join(root, "alias");
  await symlink(target, alias);
  await assert.rejects(() => prepareArchiveDirectory(alias, { repoRoot: process.cwd() }), /archive_path_invalid/);
  await writeFile(join(root, "unrelated"), "safe");
});

test("CLI requires year and accepts bounded filters and private archive option", () => {
  assert.throws(() => parseCli([]), /year_required/);
  assert.deepEqual(parseCli(["--year", "2026", "--issuer", "xstocks,ondo", "--symbol=KOx,KOon", "--archive-dir", "/private/tmp/dividendx-issuer-archive"]), {
    year: 2026, issuers: ["xstocks", "ondo"], symbols: ["KOx", "KOon"],
    archiveDir: "/private/tmp/dividendx-issuer-archive", ondoEnvFile: ONDO_DEFAULT_ENV_FILE, help: false,
  });
  assert.throws(() => parseCli(["--year", "2026", "--issuer", "unknown"]), /invalid_arguments/);
});
