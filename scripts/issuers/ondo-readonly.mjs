#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const ONDO_ORIGIN = "https://api.gm.ondo.finance";
export const DEFAULT_ENV_FILE = "/Users/node/.config/dividendx/issuer-api.env";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_SYMBOLS = Object.freeze([
  "KOon",
  "AAPLon",
  "MSFTon",
  "MUon",
  "NKEon",
  "IBMon",
]);
export const MISSING_ANNUAL_SETTLEMENT_GUARANTEES = Object.freeze([
  "authoritative ex-date coverage for every qualified event",
  "classification of every multiplier change",
  "revision and cancellation finality",
  "complete calendar-year event coverage",
  "custody eligibility and settlement attestation",
]);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const COMMON_ENDPOINTS = Object.freeze([
  "/v1/assets/all/addresses",
  "/v1/status/assets",
]);
const STOP_STATUSES = new Set([401, 403, 429]);
const SYMBOL_SET = new Set(ALLOWED_SYMBOLS);

export class SafeCheckerError extends Error {
  constructor(code) {
    super(code);
    this.name = "SafeCheckerError";
    this.code = code;
  }
}

function fail(code) {
  throw new SafeCheckerError(code);
}

function safeErrorCode(error) {
  return error instanceof SafeCheckerError ? error.code : "request_failed";
}

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..");
}

export async function loadApiKey(
  envFile = DEFAULT_ENV_FILE,
  { readFileImpl = readFile } = {},
) {
  let source;
  try {
    source = await readFileImpl(envFile, "utf8");
  } catch {
    fail("credential_file_unavailable");
  }

  let values;
  try {
    values = parseEnv(source);
  } catch {
    fail("credential_file_invalid");
  }

  const apiKey = values.ONDO_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    fail("ondo_api_key_missing");
  }
  return apiKey.trim();
}

export function parseSymbols(value) {
  const symbols = value.split(",").map((symbol) => symbol.trim()).filter(Boolean);
  if (symbols.length === 0 || new Set(symbols).size !== symbols.length) {
    fail("invalid_symbols");
  }
  for (const symbol of symbols) {
    if (!SYMBOL_SET.has(symbol)) fail("invalid_symbols");
  }
  return symbols;
}

export function parseCliArgs(argv) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: null,
    rawDir: null,
    symbols: ["KOon"],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equalsAt = argument.indexOf("=");
    const name = equalsAt === -1 ? argument : argument.slice(0, equalsAt);
    let value = equalsAt === -1 ? null : argument.slice(equalsAt + 1);

    if (name === "--help") return { ...options, help: true };
    if (!["--env-file", "--output", "--raw-dir", "--symbols"].includes(name)) {
      fail("invalid_arguments");
    }
    if (value === null) {
      index += 1;
      value = argv[index];
    }
    if (typeof value !== "string" || value === "") fail("invalid_arguments");

    if (name === "--env-file") options.envFile = value;
    if (name === "--output") options.output = value;
    if (name === "--raw-dir") options.rawDir = value;
    if (name === "--symbols") options.symbols = parseSymbols(value);
  }
  return options;
}

export function buildEndpoints(symbols = ["KOon"]) {
  if (!Array.isArray(symbols) || symbols.length === 0 || new Set(symbols).size !== symbols.length) {
    fail("invalid_symbols");
  }
  for (const symbol of symbols) {
    if (!SYMBOL_SET.has(symbol)) fail("invalid_symbols");
  }
  return [
    ...COMMON_ENDPOINTS,
    ...symbols.flatMap((symbol) => [
      `/v1/assets/${symbol}/shares-multiplier?range=all`,
      `/v1/assets/${symbol}/dividends`,
    ]),
  ];
}

export function assertAllowedUrl(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(input, ONDO_ORIGIN);
  } catch {
    fail("endpoint_not_allowed");
  }
  if (
    url.origin !== ONDO_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    fail("endpoint_not_allowed");
  }

  const exact = `${url.pathname}${url.search}`;
  if (COMMON_ENDPOINTS.includes(exact)) return url;

  const historyMatch = url.pathname.match(/^\/v1\/assets\/([^/]+)\/shares-multiplier$/);
  if (historyMatch && SYMBOL_SET.has(historyMatch[1])) {
    const parameters = [...url.searchParams.entries()];
    if (parameters.length === 1 && parameters[0][0] === "range" && parameters[0][1] === "all") {
      return url;
    }
  }

  const dividendMatch = url.pathname.match(/^\/v1\/assets\/([^/]+)\/dividends$/);
  if (dividendMatch && SYMBOL_SET.has(dividendMatch[1]) && url.search === "") return url;
  fail("endpoint_not_allowed");
}

async function readBoundedBody(response, maxBytes) {
  const lengthHeader = response.headers?.get?.("content-length");
  if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > maxBytes) {
    fail("response_too_large");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        fail("response_too_large");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof SafeCheckerError) throw error;
    fail("response_read_failed");
  }
  return Buffer.concat(chunks, total);
}

function inspectJson(bytes, apiKey) {
  const keyBytes = Buffer.from(apiKey, "utf8");
  if (keyBytes.length > 0 && bytes.indexOf(keyBytes) !== -1) fail("secret_reflection_refused");

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { json: undefined, shape: "non_utf8", count: null };
  }
  if (text.includes(apiKey)) fail("secret_reflection_refused");
  if (text.trim() === "") return { json: undefined, shape: "empty", count: 0 };

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { json: undefined, shape: "non_json", count: null };
  }
  const canonical = JSON.stringify(json);
  if (canonical.includes(apiKey)) fail("secret_reflection_refused");

  if (Array.isArray(json)) return { json, shape: "array", count: json.length };
  if (json === null) return { json, shape: "null", count: 0 };
  if (typeof json === "object") {
    const history = Array.isArray(json.history) ? json.history.length : null;
    return {
      json,
      shape: "object",
      count: history ?? Object.keys(json).length,
    };
  }
  return { json, shape: typeof json, count: 1 };
}

export async function observeEndpoint(
  endpoint,
  {
    apiKey,
    fetchImpl = globalThis.fetch,
    maxBytes = MAX_RESPONSE_BYTES,
    now = () => new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  },
) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") fail("ondo_api_key_missing");
  const url = assertAllowedUrl(endpoint);
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new SafeCheckerError("request_timed_out"));
    }, timeoutMs);
  });

  const request = (async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) fail("request_timed_out");
      fail("request_failed");
    }
    if (response.redirected) fail("redirect_refused");
    if (response.url) {
      let responseUrl;
      try {
        responseUrl = new URL(response.url);
      } catch {
        fail("unexpected_response_url");
      }
      if (responseUrl.href !== url.href) fail("unexpected_response_url");
    }

    const bytes = await readBoundedBody(response, maxBytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const inspected = inspectJson(bytes, apiKey);
    return {
      record: {
        endpoint: `${url.pathname}${url.search}`,
        retrievedAt: now().toISOString(),
        status: response.status,
        responseShape: inspected.shape,
        count: inspected.count,
        dataDigest: `sha256:${digest}`,
        error: response.ok ? null : "http_status",
      },
      raw: response.ok && inspected.json !== undefined ? bytes : null,
    };
  })();

  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (error instanceof SafeCheckerError) throw error;
    fail("request_failed");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function nearestExistingRealPath(candidate) {
  let current = candidate;
  while (true) {
    try {
      return { path: current, real: await realpath(current) };
    } catch (error) {
      if (error?.code !== "ENOENT") fail("raw_directory_invalid");
      const parent = dirname(current);
      if (parent === current) fail("raw_directory_invalid");
      current = parent;
    }
  }
}

export async function prepareRawDirectory(rawDir, { repoRoot = REPOSITORY_ROOT } = {}) {
  const candidate = resolve(rawDir);
  const lexicalRepo = resolve(repoRoot);
  if (isWithin(lexicalRepo, candidate)) fail("raw_directory_inside_repository");

  let realRepo;
  try {
    realRepo = await realpath(lexicalRepo);
  } catch {
    fail("repository_root_unavailable");
  }
  const ancestor = await nearestExistingRealPath(candidate);
  const predicted = resolve(ancestor.real, relative(ancestor.path, candidate));
  if (isWithin(realRepo, predicted)) fail("raw_directory_inside_repository");

  try {
    await mkdir(candidate, { recursive: true, mode: 0o700 });
  } catch {
    fail("raw_directory_unavailable");
  }
  let actual;
  try {
    actual = await realpath(candidate);
    const metadata = await lstat(candidate);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("raw_directory_invalid");
  } catch (error) {
    if (error instanceof SafeCheckerError) throw error;
    fail("raw_directory_invalid");
  }
  if (isWithin(realRepo, actual)) fail("raw_directory_inside_repository");
  return actual;
}

export async function assertOutputDoesNotAliasCredential(output, envFile) {
  if (!output) return;
  const outputPath = resolve(output);
  const envPath = resolve(envFile);
  if (outputPath === envPath) fail("report_output_conflicts_with_credential");

  let realEnv;
  try {
    realEnv = await realpath(envPath);
  } catch {
    return;
  }
  const ancestor = await nearestExistingRealPath(outputPath);
  const projectedOutput = resolve(ancestor.real, relative(ancestor.path, outputPath));
  if (projectedOutput === realEnv) fail("report_output_conflicts_with_credential");
}

function rawFileName(index, endpoint) {
  const slug = endpoint
    .replace(/^\/v1\//, "")
    .replace(/[?&=]+/g, "-")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${String(index + 1).padStart(3, "0")}-${slug}.json`;
}

async function writeRawExclusive(rawDirectory, index, endpoint, bytes) {
  const target = join(rawDirectory, rawFileName(index, endpoint));
  let handle;
  try {
    handle = await open(
      target,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(bytes);
  } catch {
    fail("raw_response_write_failed");
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function runChecker({
  apiKey,
  symbols = ["KOon"],
  rawDir = null,
  repoRoot = REPOSITORY_ROOT,
  fetchImpl = globalThis.fetch,
  maxBytes = MAX_RESPONSE_BYTES,
  now = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") fail("ondo_api_key_missing");
  const endpoints = buildEndpoints(symbols);
  const rawDirectory = rawDir ? await prepareRawDirectory(rawDir, { repoRoot }) : null;
  const startedAt = now().toISOString();
  const observations = [];
  let stopped = null;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    let observation;
    try {
      observation = await observeEndpoint(endpoint, {
        apiKey,
        fetchImpl,
        maxBytes,
        now,
        timeoutMs,
      });
    } catch (error) {
      const errorCode = safeErrorCode(error);
      observations.push({
        endpoint,
        retrievedAt: now().toISOString(),
        status: null,
        responseShape: "unavailable",
        count: null,
        dataDigest: null,
        error: errorCode,
      });
      if (errorCode === "secret_reflection_refused") {
        stopped = { afterError: errorCode, remainingRequestsSkipped: endpoints.length - index - 1 };
        break;
      }
      continue;
    }

    observations.push(observation.record);
    if (rawDirectory && observation.raw) {
      await writeRawExclusive(rawDirectory, index, endpoint, observation.raw);
    }
    if (STOP_STATUSES.has(observation.record.status)) {
      stopped = { afterStatus: observation.record.status, remainingRequestsSkipped: endpoints.length - index - 1 };
      break;
    }
  }

  return {
    checker: "ondo-readonly-v1",
    origin: ONDO_ORIGIN,
    startedAt,
    completedAt: now().toISOString(),
    requestedSymbols: [...symbols],
    requestMethod: "GET",
    requestsAttempted: observations.length,
    observations,
    stopped,
    evidenceBoundary: {
      observationOnly: true,
      apiPermissionScopeEstablished: false,
      annualSettlementReady: false,
      missingAnnualSettlementGuarantees: [...MISSING_ANNUAL_SETTLEMENT_GUARANTEES],
      note: "Multiplier changes are not classified as dividends by this checker.",
    },
  };
}

export const HELP_TEXT = `Usage: node scripts/issuers/ondo-readonly.mjs [options]

Options:
  --symbols KOon,AAPLon   Allowed subset; defaults to KOon
  --env-file PATH         Env file containing ONDO_API_KEY
  --output PATH           Also write the safe JSON report
  --raw-dir PATH          Exclusively create successful JSON bodies outside the repository
  --help                  Show this help
`;

export function reportHasFailures(report) {
  return Boolean(
    report.stopped ||
    report.observations.some((observation) => (
      observation.error !== null ||
      observation.status === null ||
      observation.status < 200 ||
      observation.status >= 300
    )),
  );
}

export async function main(
  argv = process.argv.slice(2),
  {
    fetchImpl = globalThis.fetch,
    readFileImpl = readFile,
    stdout = process.stdout,
  } = {},
) {
  const options = parseCliArgs(argv);
  if (options.help) {
    stdout.write(HELP_TEXT);
    return 0;
  }
  await assertOutputDoesNotAliasCredential(options.output, options.envFile);
  const apiKey = await loadApiKey(options.envFile, { readFileImpl });
  const report = await runChecker({
    apiKey,
    fetchImpl,
    symbols: options.symbols,
    rawDir: options.rawDir,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (serialized.includes(apiKey)) fail("secret_output_refused");
  if (options.output) {
    try {
      await writeFile(options.output, serialized, { encoding: "utf8", mode: 0o600 });
    } catch {
      fail("report_write_failed");
    }
  }
  stdout.write(serialized);
  return reportHasFailures(report) ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      const code = safeErrorCode(error);
      process.stderr.write(`${JSON.stringify({ error: code })}\n`);
      process.exitCode = 1;
    });
}
