import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ipAddress } from '@vercel/functions';
import type { SandboxKind } from './contract.js';

export const VISITOR_COOKIE = '__Host-dxv';
const COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/;

export function requireServerSecret(value = process.env.DIVIDENDX_SESSION_SECRET): Buffer {
  if (!value) throw new Error('DIVIDENDX_SESSION_SECRET is required');
  const secret = Buffer.from(value, 'utf8');
  if (secret.length < 32) throw new Error('DIVIDENDX_SESSION_SECRET must contain at least 32 bytes');
  return secret;
}

export function issueVisitorCookie(): string {
  return randomBytes(32).toString('base64url');
}

export function readVisitorCookie(headers: Headers): string | null {
  const raw = headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === VISITOR_COOKIE) {
      const value = rest.join('=');
      return COOKIE_VALUE.test(value) ? value : null;
    }
  }
  return null;
}

export function visitorCookieHeader(value: string, maxAgeSeconds = 86_400): string {
  if (!COOKIE_VALUE.test(value)) throw new Error('invalid visitor cookie value');
  return `${VISITOR_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function hmacHex(secret: Buffer, purpose: string, value: string): string {
  return createHmac('sha256', secret).update(`${purpose}\0${value}`).digest('hex');
}

export function visitorHash(secret: Buffer, cookie: string): string { return hmacHex(secret, 'visitor', cookie); }
export function ipHash(secret: Buffer, ip: string | undefined): string { return hmacHex(secret, 'ip', ip ?? 'unknown'); }
export function gatewayToken(secret: Buffer, sessionId: string): string { return hmacHex(secret, 'gateway', sessionId); }
export function providerName(secret: Buffer, sessionId: string): string { return `dx-${hmacHex(secret, 'provider', sessionId).slice(0, 32)}`; }

export function newSessionId(): string { return randomBytes(16).toString('hex'); }

export function exactAllowedOrigins(value = process.env.DIVIDENDX_SITE_ORIGIN): Set<string> {
  if (!value) throw new Error('DIVIDENDX_SITE_ORIGIN is required');
  const result = new Set<string>();
  for (const item of value.split(',')) {
    const candidate = item.trim();
    const url = new URL(candidate);
    if (url.origin !== candidate || (url.protocol !== 'https:' && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(candidate))) {
      throw new Error('DIVIDENDX_SITE_ORIGIN contains an invalid origin');
    }
    result.add(candidate);
  }
  return result;
}

export function requireMutationOrigin(request: Request, allowed: Set<string>): void {
  const origin = request.headers.get('origin');
  if (!origin || !allowed.has(origin)) throw new HttpFailure(403, 'origin is not allowed');
  if (request.headers.get('x-dividendx-session') !== '1') throw new HttpFailure(403, 'missing session mutation header');
}

export function rejectForeignOrigin(request: Request, allowed: Set<string>): void {
  const origin = request.headers.get('origin');
  if (origin && !allowed.has(origin)) throw new HttpFailure(403, 'origin is not allowed');
}

export function trustedIp(request: Request): string | undefined { return ipAddress(request); }

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseKind(value: string): SandboxKind {
  if (value !== 'wallet' && value !== 'guided') throw new HttpFailure(404, 'route not found');
  return value;
}

export class HttpFailure extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) { super(message); }
}
