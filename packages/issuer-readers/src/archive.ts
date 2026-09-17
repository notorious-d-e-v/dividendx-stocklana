import { randomUUID } from "node:crypto";
import { constants, lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fail } from "./schema.js";
import type { IssuerReadReport } from "./types.js";

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}
async function nearestExisting(path: string): Promise<{ lexical: string; actual: string }> {
  let current = path;
  while (true) {
    try { return { lexical: current, actual: await realpath(current) }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") fail("archive_path_invalid");
      const parent = dirname(current);
      if (parent === current) fail("archive_path_invalid");
      current = parent;
    }
  }
}

export async function prepareArchiveDirectory(directory: string, options: { repoRoot: string; credentialPaths?: string[] }): Promise<string> {
  if (!isAbsolute(directory)) fail("archive_path_must_be_absolute");
  const candidate = resolve(directory);
  const repo = await realpath(resolve(options.repoRoot)).catch(() => fail("repository_root_unavailable"));
  const nearest = await nearestExisting(candidate);
  const predicted = resolve(nearest.actual, relative(nearest.lexical, candidate));
  if (within(repo, predicted)) fail("archive_inside_repository");
  for (const credential of options.credentialPaths ?? []) {
    const lexical = resolve(credential);
    if (candidate === lexical || within(candidate, lexical)) fail("archive_conflicts_with_credential");
    const actual = await realpath(lexical).catch(() => null);
    if (actual && (predicted === actual || within(predicted, actual))) fail("archive_conflicts_with_credential");
  }
  let existed = true;
  try { await lstat(candidate); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") fail("archive_path_invalid");
    existed = false;
  }
  if (!existed) await mkdir(candidate, { recursive: true, mode: 0o700 }).catch(() => fail("archive_directory_unavailable"));
  const metadata = await lstat(candidate).catch(() => fail("archive_path_invalid"));
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail("archive_path_invalid");
  if ((metadata.mode & 0o077) !== 0 || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) fail("archive_directory_not_private");
  const actual = await realpath(candidate).catch(() => fail("archive_path_invalid"));
  if (within(repo, actual)) fail("archive_inside_repository");
  return actual;
}

export async function writePrivateArchive(report: IssuerReadReport, directory: string, options: {
  repoRoot: string; credentialPaths?: string[]; now?: () => Date; uuid?: () => string;
}): Promise<string> {
  const safeDirectory = await prepareArchiveDirectory(directory, options);
  const stamp = (options.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, "-");
  const name = `issuer-observations-${stamp}-${(options.uuid ?? randomUUID)()}.json`;
  if (basename(name) !== name) fail("archive_path_invalid");
  const target = join(safeDirectory, name);
  let handle;
  try {
    handle = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    fail("archive_write_failed");
  } finally { await handle?.close().catch(() => undefined); }
  return target;
}
