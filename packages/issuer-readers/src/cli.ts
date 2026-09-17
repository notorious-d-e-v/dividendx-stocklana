#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writePrivateArchive } from "./archive.js";
import { ONDO_DEFAULT_ENV_FILE } from "./ondo.js";
import { readSelectedIssuers } from "./reader.js";
import { reportHasFailures, safeSummary } from "./report.js";
import { fail, safeCode } from "./schema.js";
import type { IssuerId } from "./types.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const ISSUERS = new Set<IssuerId>(["xstocks", "backpack", "ondo"]);

interface CliOptions { year: number | null; issuers?: IssuerId[]; symbols?: string[]; archiveDir?: string; ondoEnvFile: string; help: boolean }
function list(value: string): string[] {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!values.length || values.length !== new Set(values).size) fail("invalid_arguments");
  return values;
}
export function parseCli(argv: string[]): CliOptions {
  const result: CliOptions = { year: null, ondoEnvFile: ONDO_DEFAULT_ENV_FILE, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]!;
    const at = raw.indexOf("=");
    const name = at < 0 ? raw : raw.slice(0, at);
    if (name === "--help") { result.help = true; continue; }
    if (!["--year", "--issuer", "--symbol", "--archive-dir", "--ondo-env-file"].includes(name)) fail("invalid_arguments");
    const value = at < 0 ? argv[++index] : raw.slice(at + 1);
    if (!value) fail("invalid_arguments");
    if (name === "--year") result.year = Number(value);
    if (name === "--issuer") {
      const values = list(value);
      if (values.some((item) => !ISSUERS.has(item as IssuerId))) fail("invalid_arguments");
      result.issuers = values as IssuerId[];
    }
    if (name === "--symbol") result.symbols = list(value);
    if (name === "--archive-dir") result.archiveDir = value;
    if (name === "--ondo-env-file") result.ondoEnvFile = value;
  }
  if (!result.help && result.year === null) fail("year_required");
  return result;
}

export const HELP = `Usage: npm --prefix packages/issuer-readers run read -- --year YYYY [options]

Options:
  --issuer xstocks,backpack,ondo  Optional issuer subset
  --symbol KOx,MU.US,KOon        Optional selected-symbol subset
  --archive-dir /private/path    Write a new owner-only detailed snapshot outside Git
  --ondo-env-file /private/path  External ONDO_API_KEY file
  --help                          Show this help
`;

export async function main(argv = process.argv.slice(2), stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout): Promise<number> {
  const options = parseCli(argv);
  if (options.help) { stdout.write(HELP); return 0; }
  const report = await readSelectedIssuers({
    year: options.year!, issuers: options.issuers, symbols: options.symbols,
    ondo: { envFile: options.ondoEnvFile },
  });
  let archiveWritten = false;
  if (options.archiveDir) {
    await writePrivateArchive(report, options.archiveDir, { repoRoot: REPO_ROOT, credentialPaths: [options.ondoEnvFile] });
    archiveWritten = true;
  }
  stdout.write(`${JSON.stringify({ ...safeSummary(report), archiveWritten }, null, 2)}\n`);
  return reportHasFailures(report) ? 1 : 0;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (direct) main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: safeCode(error) })}\n`); process.exitCode = 1;
});
