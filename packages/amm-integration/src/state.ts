import { constants, lstat, mkdir, open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { invariant } from './errors.js';
import { loadExplicitSigner, writeSignerExclusive } from './signers.js';

export async function ensurePrivateStateDirectory(path: string): Promise<string> {
  invariant(isAbsolute(path), 'STATE_PATH_INVALID');
  await mkdir(path, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const actual = await realpath(path);
  const metadata = await lstat(path);
  const uid = process.getuid?.();
  invariant(metadata.isDirectory() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0
    && uid !== undefined && metadata.uid === uid, 'STATE_DIRECTORY_UNSAFE');
  return actual;
}

export async function loadOrCreateStateSigner(directory: string, name: string): Promise<Keypair> {
  invariant(/^[a-z][a-z0-9-]{0,31}$/.test(name), 'STATE_SIGNER_NAME_INVALID');
  const path = join(await ensurePrivateStateDirectory(directory), `${name}.json`);
  const publicPath = join(directory, `${name}.pubkey`);
  try {
    await stat(path);
    const expected = (await readFile(publicPath, 'utf8')).trim();
    return loadExplicitSigner(path, expected);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const signer = Keypair.generate();
  await writeSignerExclusive(path, signer, directory);
  let handle;
  try {
    handle = await open(publicPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${signer.publicKey.toBase58()}\n`);
  } finally { await handle?.close().catch(() => undefined); }
  return signer;
}

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  invariant(isAbsolute(path), 'STATE_PATH_INVALID');
  const parent = await ensurePrivateStateDirectory(dirname(path));
  invariant(dirname(await realpath(parent)) !== parent, 'STATE_PATH_INVALID');
  const temporary = join(parent, `.${process.pid}-${Date.now()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
