import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  ONDO_ORIGIN,
  SafeCheckerError,
  assertAllowedUrl,
  assertOutputDoesNotAliasCredential,
  buildEndpoints,
  loadApiKey,
  main,
  observeEndpoint,
  parseCliArgs,
  prepareRawDirectory,
  runChecker,
} from "./ondo-readonly.mjs";

const FAKE_KEY = "test-key-that-is-not-a-credential";

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("loads quoted env syntax without shell evaluation", async () => {
  const key = await loadApiKey("ignored", {
    readFileImpl: async () => "IGNORED=$(do-not-run)\nONDO_API_KEY=\"quoted#fake=value\"\n",
  });
  assert.equal(key, "quoted#fake=value");
});

test("rejects unavailable, invalid, and missing credentials with safe errors", async () => {
  await assert.rejects(
    loadApiKey("ignored", { readFileImpl: async () => { throw new Error(`leak ${FAKE_KEY}`); } }),
    (error) => error instanceof SafeCheckerError && error.code === "credential_file_unavailable" && !error.message.includes(FAKE_KEY),
  );
  await assert.rejects(
    loadApiKey("ignored", { readFileImpl: async () => "NOT_THE_KEY=value\n" }),
    (error) => error.code === "ondo_api_key_missing",
  );
  await assert.rejects(
    loadApiKey("ignored", { readFileImpl: async () => null }),
    (error) => error.code === "credential_file_invalid",
  );
});

test("defaults to KOon and accepts only the fixed symbol subset", () => {
  assert.deepEqual(parseCliArgs([]).symbols, ["KOon"]);
  assert.deepEqual(parseCliArgs(["--symbols", "AAPLon,MSFTon"]).symbols, ["AAPLon", "MSFTon"]);
  assert.equal(buildEndpoints().length, 4);
  assert.equal(buildEndpoints(ALLOWED_SYMBOLS).length, 14);
  assert.throws(() => parseCliArgs(["--symbols", "TSLAon"]), /invalid_symbols/);
  assert.throws(() => parseCliArgs(["--symbols", "KOon,KOon"]), /invalid_symbols/);
});

test("allows only the fixed HTTPS host and exact GET paths", async () => {
  const expectedEndpoint = "/v1/assets/KOon/shares-multiplier?range=all";
  let called = 0;
  const result = await observeEndpoint(expectedEndpoint, {
    apiKey: FAKE_KEY,
    fetchImpl: async (url, init) => {
      called += 1;
      assert.equal(url.origin, ONDO_ORIGIN);
      assert.equal(`${url.pathname}${url.search}`, expectedEndpoint);
      assert.equal(init.method, "GET");
      assert.equal(init.headers["x-api-key"], FAKE_KEY);
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      return jsonResponse({ history: [] });
    },
  });
  assert.equal(called, 1);
  assert.equal(result.record.responseShape, "object");
  assert.equal(result.record.count, 0);
  assert.throws(() => assertAllowedUrl("http://api.gm.ondo.finance/v1/status/assets"), /endpoint_not_allowed/);
  assert.throws(() => assertAllowedUrl("https://evil.example/v1/status/assets"), /endpoint_not_allowed/);
  assert.throws(() => assertAllowedUrl("/v1/assets/KOon/shares-multiplier?range=recent"), /endpoint_not_allowed/);
  assert.throws(() => assertAllowedUrl("/v1/assets/KOon/trade"), /endpoint_not_allowed/);
});

test("refuses redirected responses", async () => {
  await assert.rejects(
    observeEndpoint("/v1/status/assets", {
      apiKey: FAKE_KEY,
      fetchImpl: async () => ({
        redirected: true,
        url: "",
        status: 200,
        ok: true,
        headers: new Headers(),
        body: null,
      }),
    }),
    (error) => error.code === "redirect_refused",
  );
});

for (const status of [401, 403, 429]) {
  test(`stops sequential requests after HTTP ${status}`, async () => {
    let calls = 0;
    const report = await runChecker({
      apiKey: FAKE_KEY,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ error: "controlled" }, { status });
      },
    });
    assert.equal(calls, 1);
    assert.equal(report.requestsAttempted, 1);
    assert.equal(report.stopped.afterStatus, status);
    assert.equal(report.stopped.remainingRequestsSkipped, 3);
    assert.equal(report.evidenceBoundary.apiPermissionScopeEstablished, false);
    assert.equal(report.evidenceBoundary.annualSettlementReady, false);
  });
}

test("times out a request and exposes no underlying error text", async () => {
  await assert.rejects(
    observeEndpoint("/v1/status/assets", {
      apiKey: FAKE_KEY,
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error(`reflected ${FAKE_KEY}`)), { once: true });
      }),
    }),
    (error) => error.code === "request_timed_out" && !error.message.includes(FAKE_KEY),
  );
});

test("sanitizes fetch failures that contain the key", async () => {
  await assert.rejects(
    observeEndpoint("/v1/status/assets", {
      apiKey: FAKE_KEY,
      fetchImpl: async () => { throw new Error(`upstream echoed ${FAKE_KEY}`); },
    }),
    (error) => error.code === "request_failed" && !error.message.includes(FAKE_KEY),
  );
});

test("preserves decimal multiplier strings in exclusive mode-0600 raw JSON", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ondo-readonly-test-"));
  const fakeRepository = join(temporary, "repo");
  const rawDir = join(temporary, "raw");
  await mkdir(fakeRepository);
  const decimal = "1.0012300";
  const payload = { history: [{ sharesMultiplier: decimal, changeTimestamp: 1700000000123 }] };
  const report = await runChecker({
    apiKey: FAKE_KEY,
    repoRoot: fakeRepository,
    rawDir,
    fetchImpl: async () => jsonResponse(payload),
  });
  const files = await readdir(rawDir);
  assert.equal(files.length, 4);
  const historyFile = files.find((file) => file.includes("shares-multiplier"));
  const stored = JSON.parse(await readFile(join(rawDir, historyFile), "utf8"));
  assert.equal(stored.history[0].sharesMultiplier, decimal);
  assert.equal((await stat(join(rawDir, historyFile))).mode & 0o777, 0o600);
  const expectedDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  assert.ok(report.observations.some((record) => record.dataDigest === `sha256:${expectedDigest}`));
});

test("refuses secret-reflecting bodies in reports and persisted data", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ondo-secret-test-"));
  const fakeRepository = join(temporary, "repo");
  const rawDir = join(temporary, "raw");
  await mkdir(fakeRepository);
  const report = await runChecker({
    apiKey: FAKE_KEY,
    repoRoot: fakeRepository,
    rawDir,
    fetchImpl: async () => jsonResponse({ nested: { echoed: FAKE_KEY } }),
  });
  assert.equal(report.observations.length, 1);
  assert.ok(report.observations.every((record) => record.error === "secret_reflection_refused"));
  assert.equal(report.stopped.afterError, "secret_reflection_refused");
  assert.equal(report.stopped.remainingRequestsSkipped, 3);
  assert.equal(JSON.stringify(report).includes(FAKE_KEY), false);
  assert.deepEqual(await readdir(rawDir), []);
});

test("CLI prints a safe failed report and returns nonzero", async () => {
  let printed = "";
  let calls = 0;
  const exitCode = await main(["--env-file", "ignored"], {
    readFileImpl: async () => `ONDO_API_KEY=${FAKE_KEY}\n`,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: "controlled" }, { status: 401 });
    },
    stdout: { write: (chunk) => { printed += chunk; } },
  });
  assert.equal(exitCode, 1);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(printed).stopped.afterStatus, 401);
  assert.equal(printed.includes(FAKE_KEY), false);
});

test("report output cannot alias the credential file through a symlink", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ondo-output-test-"));
  const envFile = join(temporary, "issuer.env");
  const outputLink = join(temporary, "report.json");
  await writeFile(envFile, `ONDO_API_KEY=${FAKE_KEY}\n`, { mode: 0o600 });
  await symlink(envFile, outputLink);
  await assert.rejects(
    assertOutputDoesNotAliasCredential(outputLink, envFile),
    (error) => error.code === "report_output_conflicts_with_credential",
  );
  assert.equal(await readFile(envFile, "utf8"), `ONDO_API_KEY=${FAKE_KEY}\n`);
});

test("rejects raw directories in the repository and symlink escapes into it", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ondo-path-test-"));
  const fakeRepository = join(temporary, "repo");
  const outside = join(temporary, "outside");
  await mkdir(fakeRepository);
  await mkdir(outside);

  await assert.rejects(
    prepareRawDirectory(join(fakeRepository, "raw"), { repoRoot: fakeRepository }),
    (error) => error.code === "raw_directory_inside_repository",
  );

  const link = join(outside, "repo-link");
  await symlink(fakeRepository, link);
  await assert.rejects(
    prepareRawDirectory(join(link, "raw"), { repoRoot: fakeRepository }),
    (error) => error.code === "raw_directory_inside_repository",
  );
});

test("bounds response bytes without exposing response content", async () => {
  await assert.rejects(
    observeEndpoint("/v1/status/assets", {
      apiKey: FAKE_KEY,
      maxBytes: 8,
      fetchImpl: async () => new Response(`long-${FAKE_KEY}`),
    }),
    (error) => error.code === "response_too_large" && !error.message.includes(FAKE_KEY),
  );
});
