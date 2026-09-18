export type SandboxKind = 'wallet' | 'guided';
export type PublicSessionStatus = 'none' | 'starting' | 'ready' | 'expired' | 'failed';
export type StoredSessionStatus = 'starting' | 'ready' | 'expired' | 'failed' | 'resetting';

export interface PublicSession {
  schemaVersion: 1;
  kind: SandboxKind;
  status: PublicSessionStatus;
  sessionId: string | null;
  runtimeId: string | null;
  expiresAt: string | null;
  runtimeUrl: string | null;
  error: string | null;
}

export interface SessionRecord {
  id: string;
  visitorHash: string;
  ipHash: string;
  kind: SandboxKind;
  providerName: string;
  status: StoredSessionStatus;
  createdAt: string;
  provisioningDeadline: string;
  expiresAt: string;
  tombstoneUntil: string;
  createAttemptedAt: string;
  launchAttemptedAt: string | null;
  providerStatus: string | null;
  providerExpiresAt: string | null;
  providerDomain: string | null;
  runtimeId: string | null;
  genesisHash: string | null;
  deploymentDomainHex: string | null;
  forwardedTotal: number;
  mutationTotal: number;
  minuteWindow: string;
  minuteCount: number;
  errorCode: string | null;
}

export interface DailyCounter {
  global: number;
  visitors: Record<string, number>;
  ips: Record<string, number>;
}

export interface SessionLedger {
  schemaVersion: 1;
  revision: number;
  sessions: Record<string, SessionRecord>;
  latest: Record<string, string>;
  daily: Record<string, DailyCounter>;
  visitorLastCreatedAt: Record<string, string>;
}

export interface Limits {
  active: number;
  dailyGlobal: number;
  dailyVisitor: number;
  dailyIp: number;
  creationCooldownMs: number;
  lifetimeMs: number;
  provisioningMs: number;
  tombstoneMs: number;
  requestsTotal: number;
  requestsPerMinute: number;
  mutationsTotal: number;
}

export const DEFAULT_LIMITS: Limits = {
  active: 4,
  dailyGlobal: 100,
  dailyVisitor: 6,
  dailyIp: 30,
  creationCooldownMs: 30_000,
  lifetimeMs: 15 * 60_000,
  provisioningMs: 90_000,
  tombstoneMs: 24 * 60 * 60_000,
  requestsTotal: 2_000,
  requestsPerMinute: 240,
  mutationsTotal: 120,
};

export const SESSION_ID = /^[0-9a-f]{32}$/;
export const LEDGER_PATH = 'private/dividendx/hosted-sessions-v1.json';
export const MAX_LEDGER_BYTES = 1_048_576;
export const MAX_REQUEST_BYTES = 262_144;
export const MAX_RESPONSE_BYTES = 2 * 1_048_576;
export const PROVIDER_PORT = 3000;
export const PROVIDER_ROOT = '/vercel/sandbox/dividendx';
export const PROVIDER_COMMAND = ['node', 'packages/hosted-gateway/src/main.mjs'] as const;
export const PROGRAM_ID = '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE';
export const PUBLIC_GENESIS_HASHES = new Set([
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);

export function emptyLedger(): SessionLedger {
  return { schemaVersion: 1, revision: 0, sessions: {}, latest: {}, daily: {}, visitorLastCreatedAt: {} };
}

export function publicSession(record: SessionRecord | undefined, kind: SandboxKind): PublicSession {
  if (!record) return { schemaVersion: 1, kind, status: 'none', sessionId: null, runtimeId: null, expiresAt: null, runtimeUrl: null, error: null };
  const status: PublicSessionStatus = record.status === 'resetting' ? 'starting' : record.status;
  return {
    schemaVersion: 1,
    kind: record.kind,
    status,
    sessionId: record.id,
    runtimeId: record.runtimeId,
    expiresAt: record.expiresAt,
    runtimeUrl: status === 'ready' ? `/api/sandbox/${record.kind}/${record.id}` : null,
    error: record.errorCode ? publicError(record.errorCode) : null,
  };
}

export function publicError(code: string): string {
  if (code === 'provisioning_timeout') return 'The sandbox did not become ready in time. Reset it to try again.';
  if (code === 'capacity') return 'Sandbox capacity is currently full. Try again later.';
  if (code === 'expired') return 'This sandbox session has expired.';
  if (code === 'identity_changed') return 'The sandbox identity changed and was closed.';
  if (code === 'stopping') return 'The prior sandbox is still stopping. Try again later.';
  return 'The sandbox is unavailable. Reset it to try again.';
}
