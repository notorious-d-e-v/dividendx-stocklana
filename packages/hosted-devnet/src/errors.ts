import { HttpFailure } from '@dividendx/hosted-broker/security';

export class ServiceError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'SERVICE_ERROR', readonly retryAfter?: number) {
    super(message);
  }
}

export class LeaseBusyError extends ServiceError {
  constructor() { super(429, 'funding preparation is busy', 'LEASE_BUSY', 2); }
}

export interface SafeDiagnostic { class: string; code?: string }
export interface PublicError {
  status: number;
  message: string;
  code: string;
  retryAfter?: number;
}

function safeToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : fallback;
}

export function safeDiagnostic(error: unknown): SafeDiagnostic {
  let className = 'UnknownError'; let code: unknown;
  try {
    if (error && (typeof error === 'object' || typeof error === 'function')) {
      className = safeToken((error as { constructor?: { name?: unknown } }).constructor?.name, 'UnknownError');
      code = (error as { code?: unknown }).code;
    }
  } catch { return { class: 'UnknownError' }; }
  const safeCode = safeToken(code, '');
  return safeCode ? { class: className, code: safeCode } : { class: className };
}

export function publicError(error: unknown): PublicError {
  if (error instanceof ServiceError) return { status: error.status, message: error.message, code: error.code, retryAfter: error.retryAfter };
  if (error instanceof HttpFailure) {
    return { status: error.status, message: error.message, code: 'REQUEST_REJECTED' };
  }
  return { status: 503, message: 'The devnet test service is temporarily unavailable.', code: 'UNAVAILABLE' };
}

export function unexpectedDiagnostic(error: unknown): SafeDiagnostic | undefined {
  return error instanceof ServiceError || error instanceof HttpFailure ? undefined : safeDiagnostic(error);
}
