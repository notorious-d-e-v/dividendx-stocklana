import { constants, lstat, open, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prepareArchiveDirectory } from "./archive.js";
import { fail } from "./schema.js";
import { ONDO_DEFAULT_ENV_FILE } from "./ondo.js";
import { QUALIFICATION_MAX_FILE_BYTES } from "./qualification-schema.js";
import type { QualificationDossier } from "./qualification-types.js";

export const QUALIFICATION_CREDENTIAL_PATHS = Object.freeze([ONDO_DEFAULT_ENV_FILE]);

export interface LoadedJsonFile {
  path: string;
  bytes: Buffer;
  value: unknown;
}

export async function readQualificationJsonFile(path: string, credentialPaths: readonly string[] = QUALIFICATION_CREDENTIAL_PATHS): Promise<LoadedJsonFile> {
  const candidate = resolve(path);
  for (const credential of credentialPaths) {
    if (candidate === resolve(credential)) fail("credential_file_input_refused");
  }
  const metadata = await lstat(candidate).catch(() => fail("input_file_unavailable"));
  if (metadata.isSymbolicLink()) fail("input_symlink_refused");
  if (!metadata.isFile()) fail("input_not_regular_file");
  if (metadata.size > QUALIFICATION_MAX_FILE_BYTES) fail("input_file_too_large");
  const actual = await realpath(candidate).catch(() => fail("input_file_unavailable"));
  for (const credential of credentialPaths) {
    const credentialActual = await realpath(resolve(credential)).catch(() => null);
    if (credentialActual && actual === credentialActual) fail("credential_file_input_refused");
  }
  let handle;
  try {
    handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile()) fail("input_not_regular_file");
    if (opened.size > QUALIFICATION_MAX_FILE_BYTES) fail("input_file_too_large");
    for (const credential of credentialPaths) {
      const credentialMetadata = await stat(resolve(credential)).catch(() => null);
      if (credentialMetadata && credentialMetadata.dev === opened.dev && credentialMetadata.ino === opened.ino) fail("credential_file_input_refused");
    }
    const buffer = Buffer.allocUnsafe(QUALIFICATION_MAX_FILE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > QUALIFICATION_MAX_FILE_BYTES) fail("input_file_too_large");
    const bytes = buffer.subarray(0, offset);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { fail("malformed_json"); }
    return { path: actual, bytes, value };
  } catch (error) {
    if (error instanceof Error && error.name === "ReaderError") throw error;
    return fail("input_file_unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writePrivateQualificationArchive(dossier: QualificationDossier, directory: string, options: {
  repoRoot: string;
  credentialPaths?: string[];
  now?: () => Date;
  uuid?: () => string;
}): Promise<string> {
  if (!isAbsolute(directory)) fail("archive_path_must_be_absolute");
  const safeDirectory = await prepareArchiveDirectory(directory, {
    repoRoot: options.repoRoot,
    credentialPaths: options.credentialPaths ?? [...QUALIFICATION_CREDENTIAL_PATHS],
  });
  const stamp = (options.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, "-");
  const name = `issuer-qualification-${stamp}-${(options.uuid ?? randomUUID)()}.json`;
  if (basename(name) !== name) fail("archive_path_invalid");
  const target = join(safeDirectory, name);
  let handle;
  try {
    handle = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(dossier, null, 2)}\n`, "utf8");
  } catch {
    fail("archive_write_failed");
  } finally {
    await handle?.close().catch(() => undefined);
  }
  return target;
}
