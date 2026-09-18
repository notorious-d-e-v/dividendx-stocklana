import {
  exactAllowedOrigins, ipHash, issueVisitorCookie, readVisitorCookie, rejectForeignOrigin,
  requireServerSecret, safeEqual, trustedIp, visitorCookieHeader, visitorHash,
} from '@dividendx/hosted-broker/security';
import type { RegistryManifest } from '@dividendx/devnet-runtime';
import { createProductionService, frozenManifest } from './production.js';
import { publicError, ServiceError, unexpectedDiagnostic, type SafeDiagnostic } from './errors.js';
import type { FaucetRequest, PublicFundingResult } from './contract.js';
import type { HostedDevnetService } from './service.js';

const MAX_BODY_BYTES = 2_048;
let singleton: HostedDevnetService | null = null;

function production(): HostedDevnetService {
  return singleton ??= createProductionService();
}

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function contentLength(request: Request): number | null {
  const value = request.headers.get('content-length');
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new ServiceError(400, 'content-length is invalid', 'BODY_INVALID');
  return Number(value);
}

async function requestJson(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) {
    throw new ServiceError(415, 'content-type must be application/json', 'CONTENT_TYPE');
  }
  const declared = contentLength(request);
  if (declared !== null && declared > MAX_BODY_BYTES) throw new ServiceError(413, 'request body is too large', 'BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.byteLength;
        if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new ServiceError(413, 'request body is too large', 'BODY_TOO_LARGE'); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  let value: unknown;
  try { value = JSON.parse(body.toString('utf8')); } catch { throw new ServiceError(400, 'request body must be valid JSON', 'BODY_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError(400, 'request body must be an object', 'BODY_INVALID');
  return value as Record<string, unknown>;
}

function faucetRequest(value: Record<string, unknown>): FaucetRequest {
  const keys = Object.keys(value).sort();
  const wanted = ['assetId', 'genesisHash', 'owner', 'runtimeId'];
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new ServiceError(400, 'request fields are invalid', 'BODY_INVALID');
  if (wanted.some((key) => typeof value[key] !== 'string')) throw new ServiceError(400, 'request fields are invalid', 'BODY_INVALID');
  return value as unknown as FaucetRequest;
}

function publicManifest(manifest: RegistryManifest, enabled: boolean): Omit<RegistryManifest, 'faucetEnabled'> & { faucetEnabled: boolean } {
  return { ...structuredClone(manifest), faucetEnabled: enabled };
}

function requireExactOrigin(request: Request, allowed: ReadonlySet<string>): void {
  const origin = request.headers.get('origin');
  if (!origin || !allowed.has(origin)) throw new ServiceError(403, 'origin is not allowed', 'ORIGIN_REJECTED');
}

function reportUnexpected(scope: string, diagnostic: SafeDiagnostic | undefined): void {
  if (diagnostic) console.error(JSON.stringify({ event: 'hosted-devnet-unexpected', scope, diagnostic }));
}

export async function handleDevnetRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.search ? '' : url.pathname;
  try {
    const allowed = exactAllowedOrigins();
    if (request.method === 'GET' && path === '/api/devnet/manifest') {
      rejectForeignOrigin(request, allowed);
      const existing = readVisitorCookie(request.headers);
      const cookie = existing ?? issueVisitorCookie();
      let enabled = false;
      try { enabled = await production().faucetAvailable(); } catch { enabled = false; }
      return json(publicManifest(frozenManifest(), enabled), 200,
        existing ? {} : { 'set-cookie': visitorCookieHeader(cookie) });
    }
    if (request.method === 'POST' && path === '/api/devnet/faucet') {
      requireExactOrigin(request, allowed);
      const cookie = readVisitorCookie(request.headers);
      if (!cookie) throw new ServiceError(401, 'visitor session is required', 'VISITOR_REQUIRED');
      const secret = requireServerSecret();
      const value = faucetRequest(await requestJson(request));
      const response = await production().fund(value, visitorHash(secret, cookie), ipHash(secret, trustedIp(request)));
      return json(response, response.status === 'confirmed' ? 200 : response.status === 'pending' ? 202 : 409);
    }
    throw new ServiceError(404, 'route not found', 'NOT_FOUND');
  } catch (error) {
    const failure = publicError(error);
    reportUnexpected('devnet-http', unexpectedDiagnostic(error));
    const body: PublicFundingResult = {
      signatures: [], status: 'failed', message: failure.message, error: failure.code,
    };
    return json(body, failure.status, failure.retryAfter ? { 'retry-after': String(failure.retryAfter) } : {});
  }
}

export async function handleObservationCron(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.search || url.pathname !== '/api/cron/refresh-observations') {
      throw new ServiceError(404, 'route not found', 'NOT_FOUND');
    }
    const configured = process.env.CRON_SECRET;
    const authorization = request.headers.get('authorization');
    if (!configured || !authorization || !safeEqual(authorization, `Bearer ${configured}`)) {
      throw new ServiceError(401, 'unauthorized', 'UNAUTHORIZED');
    }
    const results = await production().refreshObservations();
    const pending = results.some((item) => item.status === 'pending');
    const failed = results.some((item) => item.status === 'failed');
    return json({ status: failed ? 'failed' : pending ? 'pending' : 'confirmed', results }, failed ? 409 : pending ? 202 : 200);
  } catch (error) {
    const failure = publicError(error);
    reportUnexpected('observation-cron', unexpectedDiagnostic(error));
    return json({ status: 'failed', error: failure.code, message: failure.message }, failure.status);
  }
}

export function resetProductionForTests(): void { singleton = null; }
