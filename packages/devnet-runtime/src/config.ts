import { Connection, type ConnectionConfig } from '@solana/web3.js';
import { DEFAULT_DEVNET_RPC_URL } from './constants.js';
import { invariant } from './errors.js';

export function parseDevnetRpcUrl(value = DEFAULT_DEVNET_RPC_URL): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('RPC_URL_INVALID'); }
  invariant(url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
    && !url.search && !url.hash && (url.pathname === '/' || url.pathname === ''), 'RPC_URL_INVALID',
  'devnet RPC must be an explicit HTTPS origin without credentials, path, query, or fragment');
  return url.toString().replace(/\/$/, '');
}

export function connectionForRpc(rpcUrl: string, fetchImpl: typeof fetch = globalThis.fetch): Connection {
  const config: ConnectionConfig = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60_000,
    disableRetryOnRateLimit: true,
    fetch: boundedFetch(fetchImpl),
  };
  return new Connection(parseDevnetRpcUrl(rpcUrl), config);
}

export function boundedFetch(fetchImpl: typeof fetch, timeoutMs = 15_000): typeof fetch {
  invariant(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000, 'RPC_TIMEOUT_INVALID');
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const signals = [AbortSignal.timeout(timeoutMs)];
      if (init?.signal) signals.push(init.signal);
      response = await fetchImpl(input, { ...init, signal: AbortSignal.any(signals) });
      if (response.status !== 429 && response.status !== 503) return response;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    return response!;
  }) as typeof fetch;
}
