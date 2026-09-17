import { Connection, type ConnectionConfig } from '@solana/web3.js';
import { invariant } from './errors.js';
import type { ExecutionManifest } from './types.js';

export interface RetryPolicy { attempts: number; baseDelayMs: number; maxDelayMs: number }
export const DEFAULT_RETRY_POLICY: RetryPolicy = { attempts: 4, baseDelayMs: 250, maxDelayMs: 2_000 };

export function boundedRetryFetch(policy: RetryPolicy = DEFAULT_RETRY_POLICY, fetchImpl: typeof fetch = globalThis.fetch): typeof fetch {
  invariant(Number.isSafeInteger(policy.attempts) && policy.attempts >= 1 && policy.attempts <= 5, 'RPC_RETRY_INVALID');
  invariant(policy.baseDelayMs >= 0 && policy.maxDelayMs >= policy.baseDelayMs && policy.maxDelayMs <= 5_000, 'RPC_RETRY_INVALID');
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
      response = await fetchImpl(input, init);
      if (response.status !== 429 && response.status !== 503) return response;
      if (attempt + 1 === policy.attempts) return response;
      const retryAfter = response.headers.get('retry-after');
      const headerDelay = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1_000 : 0;
      const delay = Math.min(policy.maxDelayMs, Math.max(headerDelay, policy.baseDelayMs * 2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return response!;
  }) as typeof fetch;
}

export function connectionForManifest(manifest: ExecutionManifest, fetchImpl?: typeof fetch): Connection {
  const config: ConnectionConfig = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60_000,
    disableRetryOnRateLimit: true,
    fetch: boundedRetryFetch(DEFAULT_RETRY_POLICY, fetchImpl),
  };
  return new Connection(manifest.rpcUrl, config);
}
