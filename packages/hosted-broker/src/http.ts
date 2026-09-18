import { BlobJsonCasStore } from './json-store.js';
import { DEFAULT_LIMITS, MAX_REQUEST_BYTES, SESSION_ID, type SandboxKind } from './contract.js';
import { HostedSessionBroker, type BrokerDependencies } from './broker.js';
import { SessionLedgerRepository, LedgerFailure, systemClock } from './ledger.js';
import { VercelSandboxProvider } from './provider.js';
import {
  HttpFailure, exactAllowedOrigins, ipHash, issueVisitorCookie, readVisitorCookie, rejectForeignOrigin,
  requireMutationOrigin, requireServerSecret, trustedIp, visitorCookieHeader, visitorHash,
} from './security.js';

let shared: { broker: HostedSessionBroker; secret: Buffer; origins: Set<string> } | undefined;

function dependencies(): { broker: HostedSessionBroker; secret: Buffer; origins: Set<string> } {
  if (shared) return shared;
  const secret = requireServerSecret();
  const deps: BrokerDependencies = {
    secret, clock: systemClock, limits: DEFAULT_LIMITS, fetch: globalThis.fetch,
    ledger: new SessionLedgerRepository(new BlobJsonCasStore()),
    provider: new VercelSandboxProvider(),
  };
  return shared = { broker: new HostedSessionBroker(deps), secret, origins: exactAllowedOrigins() };
}

function json(status: number, value: unknown, cookie?: string, retryAfter?: number): Response {
  return Response.json(value, { status, headers: {
    'cache-control': 'no-store, max-age=0', 'content-security-policy': "default-src 'none'", 'x-content-type-options': 'nosniff',
    ...(cookie ? { 'set-cookie': visitorCookieHeader(cookie) } : {}),
    ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
  } });
}

function safeDiagnosticToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : fallback;
}

function reportUnexpected(error: unknown): void {
  let errorClass = 'UnknownError'; let errorCode = '';
  try {
    if (error && (typeof error === 'object' || typeof error === 'function')) {
      errorClass = safeDiagnosticToken((error as { constructor?: { name?: unknown } }).constructor?.name, 'UnknownError');
      errorCode = safeDiagnosticToken((error as { code?: unknown }).code, '');
    }
  } catch { /* Keep the fixed fallback diagnostic. */ }
  console.error(JSON.stringify({ event: 'hosted-broker-unexpected', class: errorClass, ...(errorCode ? { code: errorCode } : {}) }));
}

async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HttpFailure(415, 'content-type must be application/json');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpFailure(413, 'Request body is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      total += item.value.byteLength;
      if (total > maxBytes) { await reader.cancel('request body too large'); throw new HttpFailure(413, 'Request body is too large.'); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function controlBody(bytes: Uint8Array): { action: 'start' | 'reset'; expectedSessionId: string | null } {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw new HttpFailure(400, 'Request body must be valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpFailure(400, 'Request body must be an object.');
  const item = value as Record<string, unknown>; const keys = Object.keys(item).sort();
  if (keys.join(',') !== 'action,expectedSessionId' || (item.action !== 'start' && item.action !== 'reset')
      || (item.expectedSessionId !== null && (typeof item.expectedSessionId !== 'string' || !SESSION_ID.test(item.expectedSessionId)))) {
    throw new HttpFailure(400, 'Request fields do not match the session contract.');
  }
  return item as unknown as { action: 'start' | 'reset'; expectedSessionId: string | null };
}

function route(pathname: string): { kind: SandboxKind; session: boolean; id?: string; path?: string } {
  const match = /^\/api\/sandbox\/(wallet|guided)(?:\/session|\/([0-9a-f]{32})(\/(?:manifest|faucet|advance|rpc|state|receipt|start|step)))$/.exec(pathname);
  if (!match) throw new HttpFailure(404, 'route not found');
  return { kind: match[1] as SandboxKind, session: !match[2], id: match[2], path: match[3] };
}

export function createHostedSessionHandler(overrides?: { broker: HostedSessionBroker; secret: Buffer; origins: Set<string> }) {
  return async function handler(request: Request): Promise<Response> {
    let cookieForResponse: string | undefined;
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.search || requestUrl.hash) throw new HttpFailure(404, 'route not found');
      const selected = route(requestUrl.pathname);
      const active = overrides ?? dependencies();
      rejectForeignOrigin(request, active.origins);
      if (selected.session && request.method !== 'GET' && request.method !== 'POST') throw new HttpFailure(405, 'method not allowed');
      if (!selected.session && request.method !== 'GET' && request.method !== 'POST') throw new HttpFailure(405, 'method not allowed');
      if (!selected.session && request.method === 'POST') {
        const origin = request.headers.get('origin');
        if (!origin || !active.origins.has(origin)) throw new HttpFailure(403, 'origin is not allowed');
      }
      let cookie = readVisitorCookie(request.headers);
      if (selected.session && !cookie) { cookie = issueVisitorCookie(); cookieForResponse = cookie; }
      if (!cookie) throw new HttpFailure(404, 'route not found');
      const visitor = visitorHash(active.secret, cookie);
      if (selected.session) {
        if (request.method === 'GET') return json(200, await active.broker.current(visitor, selected.kind), cookieForResponse);
        requireMutationOrigin(request, active.origins);
        const input = controlBody(await readBody(request, 1_024));
        const network = ipHash(active.secret, trustedIp(request));
        const value = input.action === 'start'
          ? await active.broker.start(visitor, network, selected.kind, input.expectedSessionId)
          : await active.broker.reset(visitor, network, selected.kind, input.expectedSessionId);
        return json(value.status === 'starting' ? 202 : 200, value, cookieForResponse);
      }
      const body = request.method === 'POST' ? await readBody(request, MAX_REQUEST_BYTES) : undefined;
      const result = await active.broker.proxy(visitor, selected.kind, selected.id!, request.method, selected.path!, body);
      return json(result.status, result.value);
    } catch (error) {
      if (error instanceof HttpFailure) return json(error.status, { error: error.message }, cookieForResponse, error.retryAfter);
      if (error instanceof LedgerFailure) {
        const status = error.code === 'capacity' ? 503 : error.code === 'conflict' ? 409 : error.code === 'busy' ? 503 : 429;
        return json(status, { error: error.message }, cookieForResponse, status === 429 || status === 503 ? 30 : undefined);
      }
      reportUnexpected(error);
      return json(503, { error: 'Session service is temporarily unavailable.' }, cookieForResponse, 30);
    }
  };
}

export default createHostedSessionHandler();
