import { Connection, PublicKey, type FetchFn } from '@solana/web3.js';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  configPda,
  fetchProgramAccountsCoherently,
  normalizeConfigAccount,
} from '@dividendx/transaction-sdk';
import type { LocalManifest } from './types';

export const RUNTIME_URL = 'http://127.0.0.1:4180';
export const RPC_TIMEOUT_MS = 15_000;

export class RuntimeRequestError extends Error {
  constructor(message: string, readonly result?: unknown) { super(message); this.name = 'RuntimeRequestError'; }
}

export function createBoundedRpcFetch(timeoutMs = RPC_TIMEOUT_MS): FetchFn {
  return (async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(new Error(`Local RPC request timed out after ${timeoutMs / 1_000} seconds.`)), timeoutMs);
    try {
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted && !callerSignal?.aborted) throw controller.signal.reason;
      throw cause;
    } finally {
      globalThis.clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }) as FetchFn;
}

export function createLocalConnection(rpcUrl: string): Connection {
  localHttpUrl(rpcUrl);
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    fetch: createBoundedRpcFetch(),
    confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
    disableRetryOnRateLimit: true,
  });
}

function localHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.username || url.password || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('The wallet app accepts only a loopback HTTP runtime and RPC.');
  }
  return url;
}

export function bytesFromHex(value: string, label: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be exactly 32 bytes of hex.`);
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

function validateManifestShape(value: unknown): LocalManifest {
  if (!value || typeof value !== 'object') throw new Error('Runtime manifest is not an object.');
  const manifest = value as LocalManifest;
  if (manifest.schemaVersion !== 1 || typeof manifest.runtimeId !== 'string' || !manifest.runtimeId) throw new Error('Unsupported runtime manifest.');
  if (manifest.kind !== 'surfnet' && manifest.kind !== 'local-validator') throw new Error('Unsupported local runtime kind.');
  if (typeof manifest.rpcUrl !== 'string' || typeof manifest.genesisHash !== 'string' || !manifest.genesisHash) throw new Error('Runtime network identity is incomplete.');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Runtime manifest contains no assets.');
  localHttpUrl(manifest.rpcUrl);
  new PublicKey(manifest.programId);
  bytesFromHex(manifest.deploymentDomainHex, 'Deployment domain');
  return manifest;
}

export async function loadManifest(): Promise<LocalManifest> {
  localHttpUrl(RUNTIME_URL);
  const response = await fetch(`${RUNTIME_URL}/manifest`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Local runtime returned HTTP ${response.status}.`);
  return validateManifestShape(await response.json());
}

export async function verifyRuntimeIdentity(manifest: LocalManifest): Promise<Connection> {
  localHttpUrl(manifest.rpcUrl);
  if (manifest.programId !== DIVIDENDX_PROGRAM_ID.toBase58()) throw new Error('Runtime program identity does not match DividendX.');
  const connection = createLocalConnection(manifest.rpcUrl);
  const [genesisHash, programInfo] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfo(DIVIDENDX_PROGRAM_ID, 'confirmed'),
  ]);
  if (genesisHash !== manifest.genesisHash) throw new Error('RPC genesis does not match the runtime manifest.');
  if (!programInfo?.executable) throw new Error('DividendX program is missing or not executable on this runtime.');
  const config = configPda().address;
  const decoded = await fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL, [{ address: config, accountName: 'config' }]);
  const configState = normalizeConfigAccount(config, decoded.accounts[0]!.value);
  const expectedDomain = bytesFromHex(manifest.deploymentDomainHex, 'Deployment domain');
  if (!configState.deploymentDomain.every((byte, index) => byte === expectedDomain[index])) throw new Error('Config deployment domain does not match the runtime manifest.');
  return connection;
}

export async function runtimePost<T>(manifest: LocalManifest, path: '/faucet' | '/advance', body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${RUNTIME_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, genesisHash: manifest.genesisHash, runtimeId: manifest.runtimeId }),
      signal: AbortSignal.timeout(path === '/advance' ? 120_000 : 30_000),
    });
  } catch (cause) {
    const suffix = path === '/advance'
      ? ' Some annual steps may have completed; refresh balances before retrying.'
      : ' Some faucet transactions may have completed; refresh balances before retrying.';
    throw new RuntimeRequestError(`Local runtime request did not finish.${suffix}`, cause);
  }
  const value = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const suffix = path === '/advance'
      ? ' Some annual steps may have completed; refresh balances before retrying.'
      : ' Some faucet transactions may have completed; refresh balances before retrying.';
    throw new RuntimeRequestError(`${(value as { error?: string } | null)?.error || `Local runtime returned HTTP ${response.status}.`}${suffix}`, value);
  }
  return value as T;
}
