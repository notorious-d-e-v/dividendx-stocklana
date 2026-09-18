import { Connection, PublicKey, type FetchFn } from '@solana/web3.js';
import {
  DIVIDENDX_IDL,
  DIVIDENDX_PROGRAM_ID,
  configPda,
  fetchProgramAccountsCoherently,
  normalizeConfigAccount,
} from '@dividendx/transaction-sdk';
import type { LocalManifest, WalletNetwork } from './types';

export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEVNET_DEPLOYMENT_DOMAIN_HEX = 'ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab';
export const DEFAULT_DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const RPC_TIMEOUT_MS = 15_000;

export interface RuntimeConfig {
  network: WalletNetwork;
  runtimeUrl: string;
  manifestUrl: string;
  rpcUrl?: string;
}

export class RuntimeRequestError extends Error {
  constructor(message: string, readonly result?: unknown) { super(message); this.name = 'RuntimeRequestError'; }
}

interface RpcFetchOptions {
  retryTransient?: boolean;
  scheduler?: RequestScheduler;
}

interface SlotWaiter {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason?: unknown) => void;
  abort: () => void;
}

class RequestScheduler {
  private active = 0;
  private readonly waiters: SlotWaiter[] = [];

  constructor(private readonly limit: number) {}

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    return new Promise((resolve, reject) => {
      const waiter: SlotWaiter = {
        signal, resolve, reject,
        abort: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', waiter.abort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.advance();
    };
  }

  private advance(): void {
    while (this.active < this.limit && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.signal.removeEventListener('abort', waiter.abort);
      if (waiter.signal.aborted) { waiter.reject(waiter.signal.reason); continue; }
      this.active += 1;
      waiter.resolve(this.releaseOnce());
    }
  }
}

const devnetRequestScheduler = new RequestScheduler(2);

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(done, delayMs);
    function done() { signal.removeEventListener('abort', aborted); resolve(); }
    function aborted() { globalThis.clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', aborted, { once: true });
  });
}

async function drainRejectedResponse(response: Response): Promise<void> {
  try { await response.arrayBuffer(); }
  catch { try { await response.body?.cancel(); } catch { /* The deadline may already have aborted the body. */ } }
}

export function createBoundedRpcFetch(timeoutMs = RPC_TIMEOUT_MS, label = 'Local RPC', options: RpcFetchOptions = {}): FetchFn {
  return (async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(new Error(`${label} request timed out after ${timeoutMs / 1_000} seconds.`)), timeoutMs);
    try {
      const attempts = options.retryTransient ? 4 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const release = options.scheduler ? await options.scheduler.acquire(controller.signal) : () => undefined;
        let response: Response;
        let retry = false;
        try {
          response = await globalThis.fetch(input, { ...init, signal: controller.signal });
          retry = Boolean(options.retryTransient && (response.status === 429 || response.status === 503) && attempt + 1 < attempts);
          if (retry) await drainRejectedResponse(response);
        }
        finally { release(); }
        if (!retry) return response;
        const retryAfter = Number(response.headers.get('retry-after'));
        const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await abortableDelay(backoffMs, controller.signal);
      }
      throw new Error(`${label} request exhausted its retry attempts.`);
    } catch (cause) {
      if (controller.signal.aborted && !callerSignal?.aborted) throw controller.signal.reason;
      throw cause;
    } finally {
      globalThis.clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }) as FetchFn;
}

export function createDevnetRpcFetch(timeoutMs = RPC_TIMEOUT_MS): FetchFn {
  return createBoundedRpcFetch(timeoutMs, 'Devnet RPC', { retryTransient: true, scheduler: devnetRequestScheduler });
}

export function createNetworkConnection(rpcUrl: string, network: WalletNetwork, wsUrl?: string): Connection {
  if (network === 'local') localHttpUrl(rpcUrl);
  else devnetRpcUrl(rpcUrl);
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    ...(network === 'local' && wsUrl ? { wsEndpoint: localWsUrl(wsUrl, rpcUrl).toString() } : {}),
    fetch: network === 'devnet' ? createDevnetRpcFetch() : createBoundedRpcFetch(),
    confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
    disableRetryOnRateLimit: true,
  });
}

export function createLocalConnection(rpcUrl: string, wsUrl?: string): Connection {
  return createNetworkConnection(rpcUrl, 'local', wsUrl);
}

function localHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.username || url.password || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('The wallet app accepts only a loopback HTTP runtime and RPC.');
  }
  return url;
}

function localWsUrl(value: string, rpcUrl: string): URL {
  const url = new URL(value);
  const rpc = localHttpUrl(rpcUrl);
  const port = Number(url.port);
  if (url.protocol !== 'ws:' || url.hostname !== rpc.hostname || url.username || url.password || url.search || url.hash
    || !url.port || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Local WebSocket URL must be a ws:// endpoint on the RPC loopback hostname with an explicit valid port and no credentials, query or fragment.');
  }
  return url;
}

function cleanUrl(url: URL, label: string): URL {
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} must not contain credentials, a query or a fragment.`);
  return url;
}

function devnetRpcUrl(value: string): URL {
  const url = cleanUrl(new URL(value), 'Devnet RPC URL');
  if (url.protocol !== 'https:') throw new Error('Devnet RPC URL must be an exact HTTPS endpoint.');
  return url;
}

function runtimeBaseUrl(value: string, network: WalletNetwork): string {
  if (network === 'local') {
    const url = localHttpUrl(value);
    if (url.search || url.hash || url.username || url.password) throw new Error('Local runtime URL must not contain credentials, a query or a fragment.');
    return value.replace(/\/$/, '');
  }
  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.includes('?') || value.includes('#') || value.split('/').includes('..')) throw new Error('Devnet runtime path must be a fixed same-origin path.');
    return value.replace(/\/$/, '');
  }
  const url = cleanUrl(new URL(value), 'Devnet runtime URL');
  if (url.protocol !== 'https:') throw new Error('Devnet runtime URL must use HTTPS.');
  return value.replace(/\/$/, '');
}

export function resolveRuntimeConfig(env: Record<string, string | boolean | undefined>): RuntimeConfig {
  const configuredNetwork = env.VITE_DIVIDENDX_NETWORK;
  if (configuredNetwork !== undefined && configuredNetwork !== 'local' && configuredNetwork !== 'devnet') {
    throw new Error("VITE_DIVIDENDX_NETWORK must be 'local' or 'devnet'.");
  }
  const network: WalletNetwork = configuredNetwork === 'devnet' ? 'devnet' : 'local';
  const derivedDomain = Array.from(new PublicKey(DEVNET_GENESIS_HASH).toBytes(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (derivedDomain !== DEVNET_DEPLOYMENT_DOMAIN_HEX) throw new Error('Pinned devnet deployment domain does not match the devnet genesis public-key bytes.');
  const runtimeUrl = runtimeBaseUrl(
    typeof env.VITE_DIVIDENDX_RUNTIME_URL === 'string' && env.VITE_DIVIDENDX_RUNTIME_URL
      ? env.VITE_DIVIDENDX_RUNTIME_URL
      : network === 'devnet' ? '/api/devnet' : 'http://127.0.0.1:4180',
    network,
  );
  const rpcUrl = network === 'devnet'
    ? devnetRpcUrl(typeof env.VITE_DIVIDENDX_DEVNET_RPC_URL === 'string' && env.VITE_DIVIDENDX_DEVNET_RPC_URL ? env.VITE_DIVIDENDX_DEVNET_RPC_URL : DEFAULT_DEVNET_RPC_URL).toString()
    : undefined;
  return { network, runtimeUrl, manifestUrl: `${runtimeUrl}/manifest`, rpcUrl };
}

export const RUNTIME_CONFIG = resolveRuntimeConfig(import.meta.env ?? {});
export const RUNTIME_URL = RUNTIME_CONFIG.runtimeUrl;

export function bytesFromHex(value: string, label: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be exactly 32 bytes of hex.`);
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

export function validateManifestShape(value: unknown, config = RUNTIME_CONFIG): LocalManifest {
  if (!value || typeof value !== 'object') throw new Error('Runtime manifest is not an object.');
  const manifest = value as LocalManifest;
  if (manifest.schemaVersion !== 1 || typeof manifest.runtimeId !== 'string' || !/^[A-Za-z0-9._:-]{3,128}$/.test(manifest.runtimeId)) throw new Error('Unsupported runtime manifest.');
  if (typeof manifest.faucetEnabled !== 'undefined' && typeof manifest.faucetEnabled !== 'boolean') throw new Error('Runtime faucet setting is malformed.');
  if (typeof manifest.rpcUrl !== 'string' || typeof manifest.genesisHash !== 'string' || !manifest.genesisHash || typeof manifest.programId !== 'string') throw new Error('Runtime network identity is incomplete.');
  if (typeof manifest.deploymentDomainHex !== 'string') throw new Error('Deployment domain must be exactly 32 bytes of hex.');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Runtime manifest contains no assets.');
  new PublicKey(manifest.programId);
  bytesFromHex(manifest.deploymentDomainHex, 'Deployment domain');
  if (config.network === 'local') {
    if (manifest.kind !== 'surfnet' && manifest.kind !== 'local-validator') throw new Error('Unsupported local runtime kind.');
    localHttpUrl(manifest.rpcUrl);
    if (manifest.wsUrl !== undefined) {
      if (typeof manifest.wsUrl !== 'string') throw new Error('Local WebSocket URL is malformed.');
      localWsUrl(manifest.wsUrl, manifest.rpcUrl);
    }
  } else {
    if (manifest.kind !== 'devnet') throw new Error('Runtime is not the configured Solana devnet deployment.');
    if (manifest.wsUrl !== undefined) throw new Error('Devnet manifests cannot configure a WebSocket endpoint.');
    const manifestRpc = devnetRpcUrl(manifest.rpcUrl).toString();
    if (manifestRpc !== config.rpcUrl) throw new Error('Devnet manifest RPC endpoint does not match the configured endpoint.');
    if (manifest.genesisHash !== DEVNET_GENESIS_HASH) throw new Error('Devnet manifest genesis does not match the pinned Solana devnet identity.');
    if (manifest.programId !== DIVIDENDX_PROGRAM_ID.toBase58()) throw new Error('Devnet manifest program identity does not match DividendX.');
    if (manifest.deploymentDomainHex.toLowerCase() !== DEVNET_DEPLOYMENT_DOMAIN_HEX) throw new Error('Devnet manifest deployment domain does not match the pinned deployment.');
    if (manifest.clockControl !== false) throw new Error('Public devnet cannot expose clock control.');
  }
  return manifest;
}

export async function loadManifest(config = RUNTIME_CONFIG): Promise<LocalManifest> {
  const response = await fetch(config.manifestUrl, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${config.network === 'devnet' ? 'Devnet service' : 'Local runtime'} returned HTTP ${response.status}.`);
  return validateManifestShape(await response.json(), config);
}

export async function verifyRuntimeIdentity(manifest: LocalManifest, config = RUNTIME_CONFIG): Promise<Connection> {
  validateManifestShape(manifest, config);
  if (manifest.programId !== DIVIDENDX_PROGRAM_ID.toBase58()) throw new Error('Runtime program identity does not match DividendX.');
  const connection = createNetworkConnection(manifest.rpcUrl, config.network, manifest.wsUrl);
  const [genesisHash, programInfo] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfo(DIVIDENDX_PROGRAM_ID, 'confirmed'),
  ]);
  if (genesisHash !== manifest.genesisHash) throw new Error('RPC genesis does not match the runtime manifest.');
  if (config.network === 'devnet' && genesisHash !== DEVNET_GENESIS_HASH) throw new Error('RPC is not the pinned Solana devnet network.');
  if (!programInfo?.executable) throw new Error('DividendX program is missing or not executable on this runtime.');
  const configAddress = configPda().address;
  const decoded = await fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL, [{ address: configAddress, accountName: 'config' }]);
  const configState = normalizeConfigAccount(configAddress, decoded.accounts[0]!.value);
  const expectedDomain = bytesFromHex(manifest.deploymentDomainHex, 'Deployment domain');
  if (!configState.deploymentDomain.every((byte, index) => byte === expectedDomain[index])) throw new Error('Config deployment domain does not match the runtime manifest.');
  return connection;
}

export async function runtimePost<T>(manifest: LocalManifest, path: '/faucet' | '/advance', body: Record<string, unknown>, config = RUNTIME_CONFIG): Promise<T> {
  validateManifestShape(manifest, config);
  if (config.network === 'devnet' && path === '/advance') throw new RuntimeRequestError('Public devnet uses real calendar time and does not allow date controls.');
  if (config.network === 'devnet' && path === '/faucet' && manifest.faucetEnabled !== true) throw new RuntimeRequestError('The bounded devnet test faucet is unavailable for this deployment.');
  let response: Response;
  try {
    response = await fetch(`${config.runtimeUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, genesisHash: manifest.genesisHash, runtimeId: manifest.runtimeId }),
      redirect: 'error',
      signal: AbortSignal.timeout(path === '/advance' ? 120_000 : 30_000),
    });
  } catch (cause) {
    const suffix = path === '/advance'
      ? ' Some annual steps may have completed; refresh balances before retrying.'
      : ' Some faucet transactions may have completed; refresh balances before retrying.';
    throw new RuntimeRequestError(`${config.network === 'devnet' ? 'Devnet service' : 'Local runtime'} request did not finish.${suffix}`, cause);
  }
  const value = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const suffix = path === '/advance'
      ? ' Some annual steps may have completed; refresh balances before retrying.'
      : ' Some faucet transactions may have completed; refresh balances before retrying.';
    throw new RuntimeRequestError(`${(value as { error?: string } | null)?.error || `${config.network === 'devnet' ? 'Devnet service' : 'Local runtime'} returned HTTP ${response.status}.`}${suffix}`, value);
  }
  return value as T;
}
