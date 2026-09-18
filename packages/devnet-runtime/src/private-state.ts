import { constants, lstat, mkdir, open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { invariant } from './errors.js';
import type { PrivateRuntimeState } from './types.js';

const DEFAULT_WALLET = resolve(homedir(), '.config/solana/id.json');

async function assertPrivateFile(path: string): Promise<string> {
  invariant(isAbsolute(path), 'PRIVATE_PATH_INVALID');
  const metadata = await lstat(path);
  const uid = process.getuid?.();
  invariant(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
    && uid !== undefined && metadata.uid === uid && (metadata.mode & 0o077) === 0,
  'PRIVATE_FILE_UNSAFE');
  return realpath(path);
}

export async function loadExplicitSigner(path: string, expectedPublicKey: string): Promise<Keypair> {
  const actual = await assertPrivateFile(path);
  invariant(actual !== DEFAULT_WALLET, 'DEFAULT_WALLET_REFUSED');
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(actual, 'utf8')); } catch { throw new Error('SIGNER_FILE_INVALID'); }
  invariant(Array.isArray(parsed) && parsed.length === 64
    && parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255), 'SIGNER_FILE_INVALID');
  const signer = Keypair.fromSecretKey(Uint8Array.from(parsed));
  invariant(signer.publicKey.toBase58() === expectedPublicKey, 'SIGNER_PUBLIC_KEY_MISMATCH');
  return signer;
}

export async function ensurePrivateStateDirectory(path: string, repositoryRoot: string): Promise<string> {
  invariant(isAbsolute(path), 'STATE_PATH_INVALID');
  const allowedRoot = resolve(repositoryRoot, '.local-tools');
  const parent = await realpath(dirname(path));
  invariant(parent === allowedRoot && path.startsWith(`${allowedRoot}${sep}`) && basename(path).length > 0,
    'STATE_PATH_INVALID', 'state directory must be a direct child of repository .local-tools');
  await mkdir(path, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const requestedMetadata = await lstat(path);
  invariant(!requestedMetadata.isSymbolicLink(), 'STATE_DIRECTORY_UNSAFE');
  const actual = await realpath(path);
  invariant(actual.startsWith(`${allowedRoot}${sep}`), 'STATE_PATH_INVALID');
  const metadata = await lstat(actual);
  const uid = process.getuid?.();
  invariant(metadata.isDirectory() && !metadata.isSymbolicLink() && uid !== undefined && metadata.uid === uid
    && (metadata.mode & 0o077) === 0, 'STATE_DIRECTORY_UNSAFE');
  return actual;
}

async function writeExclusive(path: string, contents: string, mode: number): Promise<void> {
  let handle;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally { await handle?.close().catch(() => undefined); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function loadOrCreateStateSigner(directory: string, name: string): Promise<Keypair> {
  invariant(/^[a-z][a-z0-9-]{0,31}$/.test(name), 'STATE_SIGNER_NAME_INVALID');
  const secretPath = join(directory, `${name}.json`);
  const publicPath = join(directory, `${name}.pubkey`);
  try {
    await stat(secretPath);
    const expected = (await readFile(publicPath, 'utf8')).trim();
    return loadExplicitSigner(secretPath, expected);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const signer = Keypair.generate();
  await writeExclusive(secretPath, `${JSON.stringify([...signer.secretKey])}\n`, 0o600);
  await writeExclusive(publicPath, `${signer.publicKey.toBase58()}\n`, 0o600);
  return signer;
}

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  invariant(isAbsolute(path), 'PRIVATE_PATH_INVALID');
  const parent = await realpath(dirname(path));
  const metadata = await lstat(parent);
  invariant(metadata.isDirectory() && (metadata.mode & 0o077) === 0, 'STATE_DIRECTORY_UNSAFE');
  const temporary = join(parent, `.${process.pid}-${Date.now()}.tmp`);
  await writeExclusive(temporary, `${JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2)}\n`, 0o600);
  await rename(temporary, path);
  await syncDirectory(parent);
}

export async function writePublicJson(path: string, value: unknown): Promise<void> {
  invariant(isAbsolute(path), 'PUBLIC_PATH_INVALID');
  const parent = await realpath(dirname(path));
  await writeExclusive(path, `${JSON.stringify(value, null, 2)}\n`, 0o644);
  await syncDirectory(parent);
}

export async function readPrivateState(path: string): Promise<PrivateRuntimeState> {
  const actual = await assertPrivateFile(path);
  const value = JSON.parse(await readFile(actual, 'utf8')) as PrivateRuntimeState;
  invariant(value.schema === 'dividendx-devnet-private-state-v1', 'STATE_SCHEMA_INVALID');
  return value;
}
