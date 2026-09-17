#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildQualificationDossier, DEFAULT_MAX_OBSERVATION_AGE_MS, safeQualificationSummary } from "./qualification.js";
import { readQualificationJsonFile, writePrivateQualificationArchive } from "./qualification-files.js";
import { fail, safeCode } from "./schema.js";
import { validateYear } from "./reader.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

interface ReviewCliOptions {
  command: "review" | null;
  year: number | null;
  snapshot?: string;
  supplement?: string;
  archiveDir?: string;
  now?: Date;
  maximumObservationAgeMs: number;
  help: boolean;
}

export function parseQualificationCli(argv: string[]): ReviewCliOptions {
  const result: ReviewCliOptions = { command: null, year: null, maximumObservationAgeMs: DEFAULT_MAX_OBSERVATION_AGE_MS, help: false };
  let index = 0;
  if (argv[0] === "review") { result.command = "review"; index = 1; }
  else if (argv[0] === "--help") { result.help = true; return result; }
  else fail("invalid_arguments");
  for (; index < argv.length; index += 1) {
    const raw = argv[index]!;
    const at = raw.indexOf("=");
    const name = at < 0 ? raw : raw.slice(0, at);
    if (name === "--help") { result.help = true; continue; }
    if (!["--year", "--snapshot", "--supplement", "--archive-dir", "--now", "--maximum-observation-age-ms"].includes(name)) fail("invalid_arguments");
    const value = at < 0 ? argv[++index] : raw.slice(at + 1);
    if (!value) fail("invalid_arguments");
    if (name === "--year") result.year = Number(value);
    if (name === "--snapshot") result.snapshot = value;
    if (name === "--supplement") result.supplement = value;
    if (name === "--archive-dir") result.archiveDir = value;
    if (name === "--maximum-observation-age-ms") result.maximumObservationAgeMs = Number(value);
    if (name === "--now") {
      const now = new Date(value);
      if (!Number.isFinite(now.valueOf())) fail("invalid_arguments");
      result.now = now;
    }
  }
  if (!result.help && (result.year === null || !result.snapshot)) fail("required_arguments_missing");
  if (result.year !== null) validateYear(result.year);
  if (!Number.isSafeInteger(result.maximumObservationAgeMs) || result.maximumObservationAgeMs < 0) fail("invalid_arguments");
  return result;
}

export const QUALIFICATION_HELP = `Usage: npm --prefix packages/issuer-readers run review -- --year YYYY --snapshot /private/report.json [options]

Options:
  --supplement /path/evidence.json       Optional public candidate evidence
  --archive-dir /private/review-dir      Write a new owner-only detailed dossier
  --now ISO-8601                         Deterministic review time
  --maximum-observation-age-ms N         Current-mint review age (default 86400000)
  --help                                 Show this help
`;

export async function qualificationMain(argv = process.argv.slice(2), stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout): Promise<number> {
  const options = parseQualificationCli(argv);
  if (options.help) { stdout.write(QUALIFICATION_HELP); return 0; }
  const snapshot = await readQualificationJsonFile(options.snapshot!);
  const supplement = options.supplement ? await readQualificationJsonFile(options.supplement) : null;
  const dossier = await buildQualificationDossier({
    report: snapshot.value as never,
    reportBytes: snapshot.bytes,
    supplement: supplement?.value,
    supplementBytes: supplement?.bytes,
  }, {
    requestedYear: options.year!, now: options.now, maximumObservationAgeMs: options.maximumObservationAgeMs,
  });
  let archiveWritten = false;
  if (options.archiveDir) {
    await writePrivateQualificationArchive(dossier, options.archiveDir, { repoRoot: REPO_ROOT });
    archiveWritten = true;
  }
  stdout.write(`${JSON.stringify({ ...safeQualificationSummary(dossier), archiveWritten }, null, 2)}\n`);
  return 0;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (direct) qualificationMain().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: safeCode(error) })}\n`);
  process.exitCode = 1;
});
