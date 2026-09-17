import { constants, lstat, open, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { invariant } from './errors.js';

export async function loadExplicitSigner(path: string, expectedPublicKey: string): Promise<Keypair> {
  invariant(isAbsolute(path), 'SIGNER_PATH_INVALID');
  const actual = await realpath(path).catch(() => null);
  invariant(actual !== null, 'SIGNER_FILE_UNAVAILABLE');
  invariant(actual !== resolve(homedir(), '.config/solana/id.json'), 'DEFAULT_WALLET_REFUSED');
  const metadata = await lstat(path);
  const uid = process.getuid?.();
  invariant(uid !== undefined && metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1 && metadata.uid === uid
    && (metadata.mode & 0o077) === 0, 'SIGNER_FILE_UNSAFE');
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(actual, 'utf8')); } catch { throw new Error('SIGNER_FILE_INVALID'); }
  invariant(Array.isArray(parsed) && parsed.length === 64 && parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255), 'SIGNER_FILE_INVALID');
  const signer = Keypair.fromSecretKey(Uint8Array.from(parsed));
  invariant(signer.publicKey.toBase58() === expectedPublicKey, 'SIGNER_PUBLIC_KEY_MISMATCH');
  return signer;
}

export async function writeSignerExclusive(path: string, signer: Keypair, allowedDirectory: string): Promise<void> {
  invariant(isAbsolute(path), 'SIGNER_PATH_INVALID');
  const parent = await realpath(resolve(path, '..'));
  invariant(parent === await realpath(allowedDirectory), 'SIGNER_PATH_INVALID');
  let handle;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify([...signer.secretKey])}\n`, 'utf8');
  } catch { throw new Error('SIGNER_WRITE_FAILED'); }
  finally { await handle?.close().catch(() => undefined); }
}
