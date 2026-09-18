import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type HostedSandboxKind = 'wallet' | 'guided';
export type HostedSessionStatus = 'none' | 'starting' | 'ready' | 'expired' | 'failed';

export interface HostedSession {
  schemaVersion: 1;
  kind: HostedSandboxKind;
  status: HostedSessionStatus;
  sessionId: string | null;
  runtimeId: string | null;
  expiresAt: string | null;
  runtimeUrl: string | null;
  error: string | null;
}

const SESSION_ID = /^[0-9a-f]{32}$/;
const POLL_MS = 2_000;
const POLL_DEADLINE_MS = 90_000;
export const SESSION_READ_TIMEOUT_MS = 10_000;
export const SESSION_MUTATION_TIMEOUT_MS = 90_000;
const initialReads = new Map<HostedSandboxKind, Promise<HostedSession>>();

export class HostedSessionError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'HostedSessionError'; }
}

function publicError(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return typeof record.error === 'string' ? record.error : typeof record.message === 'string' ? record.message : fallback;
}

export function validateHostedSession(value: unknown, kind: HostedSandboxKind): HostedSession {
  if (!value || typeof value !== 'object') throw new Error('The hosted session response is invalid.');
  const session = value as Partial<HostedSession>;
  const statuses: HostedSessionStatus[] = ['none', 'starting', 'ready', 'expired', 'failed'];
  if (session.schemaVersion !== 1 || session.kind !== kind || !statuses.includes(session.status as HostedSessionStatus)) {
    throw new Error('The hosted session response has the wrong schema, kind or status.');
  }
  if (!(session.sessionId === null || (typeof session.sessionId === 'string' && SESSION_ID.test(session.sessionId)))) {
    throw new Error('The hosted session ID is invalid.');
  }
  if (!(session.runtimeId === null || (typeof session.runtimeId === 'string' && session.runtimeId.length >= 3 && session.runtimeId.length <= 128))) {
    throw new Error('The hosted runtime ID is invalid.');
  }
  if (!(session.error === null || typeof session.error === 'string')) throw new Error('The hosted session error is invalid.');
  if (!(session.expiresAt === null || (typeof session.expiresAt === 'string' && Number.isFinite(Date.parse(session.expiresAt))))) {
    throw new Error('The hosted session expiry is invalid.');
  }
  if (!(session.runtimeUrl === null || typeof session.runtimeUrl === 'string')) throw new Error('The hosted runtime URL is invalid.');
  if (session.status === 'ready') {
    if (!session.sessionId || !session.runtimeId || !session.expiresAt) throw new Error('The ready hosted session is incomplete.');
    const expected = `/api/sandbox/${kind}/${session.sessionId}`;
    if (session.runtimeUrl !== expected) throw new Error('The hosted runtime URL does not match this session.');
    if (Date.parse(session.expiresAt) <= Date.now()) throw new Error('The hosted session has already expired.');
  } else if (session.runtimeUrl !== null) {
    throw new Error('A hosted runtime URL is available only when the session is ready.');
  }
  return session as HostedSession;
}

async function requestSession(kind: HostedSandboxKind, init?: RequestInit, timeoutMs = SESSION_READ_TIMEOUT_MS): Promise<HostedSession> {
  const response = await fetch(`/api/sandbox/${kind}/session`, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new HostedSessionError(publicError(value, `The hosted session service returned HTTP ${response.status}.`), response.status);
  return validateHostedSession(value, kind);
}

export function readHostedSession(kind: HostedSandboxKind): Promise<HostedSession> {
  return requestSession(kind);
}

function initialHostedSession(kind: HostedSandboxKind): Promise<HostedSession> {
  const current = initialReads.get(kind);
  if (current) return current;
  const request = readHostedSession(kind);
  initialReads.set(kind, request);
  void request.finally(() => globalThis.setTimeout(() => {
    if (initialReads.get(kind) === request) initialReads.delete(kind);
  }, 0)).catch(() => undefined);
  return request;
}

export function changeHostedSession(kind: HostedSandboxKind, action: 'start' | 'reset', expectedSessionId: string | null): Promise<HostedSession> {
  return requestSession(kind, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DividendX-Session': '1' },
    body: JSON.stringify({ action, expectedSessionId }),
  }, SESSION_MUTATION_TIMEOUT_MS);
}

function Mark() { return <span className="hosted-mark" aria-hidden="true"><i /><b /></span>; }

export function HostedSessionGate({ kind, children }: {
  kind: HostedSandboxKind;
  children: (session: HostedSession, expire: (message?: string) => void, reset: () => Promise<void>) => ReactNode;
}) {
  const [session, setSession] = useState<HostedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState('');
  const pollStartedAt = useRef(0);
  const requestGeneration = useRef(0);
  const [pollEpoch, setPollEpoch] = useState(0);

  const accept = useCallback((next: HostedSession) => {
    setSession(next);
    setLoading(false);
    setMessage(next.error ?? '');
    if (next.status === 'starting' && pollStartedAt.current === 0) pollStartedAt.current = Date.now();
    if (next.status !== 'starting') pollStartedAt.current = 0;
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true); setMessage('');
    try {
      const next = await readHostedSession(kind);
      if (requestGeneration.current !== generation) return;
      accept(next);
      if (next.status === 'starting') setPollEpoch((value) => value + 1);
    }
    catch (cause) {
      if (requestGeneration.current !== generation) return;
      setLoading(false); setMessage(cause instanceof Error ? cause.message : 'The hosted session service is unavailable.');
    }
  }, [accept, kind]);

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    setLoading(true); setMessage('');
    void initialHostedSession(kind).then((next) => {
      if (!active || requestGeneration.current !== generation) return;
      accept(next);
      if (next.status === 'starting') setPollEpoch((value) => value + 1);
    }, (cause: unknown) => {
      if (!active || requestGeneration.current !== generation) return;
      setLoading(false); setMessage(cause instanceof Error ? cause.message : 'The hosted session service is unavailable.');
    });
    return () => { active = false; };
  }, [accept, kind]);
  useEffect(() => {
    if (session?.status !== 'starting') return;
    let active = true;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const poll = async () => {
      if (!active) return;
      if (Date.now() - pollStartedAt.current >= POLL_DEADLINE_MS) {
        setMessage('The sandbox is still starting. Check its progress manually.');
        return;
      }
      const generation = ++requestGeneration.current;
      try {
        const next = await readHostedSession(kind);
        if (!active || requestGeneration.current !== generation) return;
        accept(next);
        if (next.status !== 'starting') return;
      } catch (cause) {
        if (!active || requestGeneration.current !== generation) return;
        setMessage(cause instanceof Error ? cause.message : 'Could not check sandbox progress.');
      }
      if (active) timer = globalThis.setTimeout(() => void poll(), POLL_MS);
    };
    timer = globalThis.setTimeout(() => void poll(), POLL_MS);
    return () => { active = false; if (timer !== undefined) globalThis.clearTimeout(timer); };
  }, [accept, kind, pollEpoch, session?.sessionId, session?.status]);
  useEffect(() => {
    if (session?.status !== 'ready' || !session.expiresAt) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = globalThis.setTimeout(() => setSession({ ...session, status: 'expired', runtimeUrl: null, error: 'This private sandbox has expired.' }), Math.min(2_147_483_647, Math.max(0, remaining)));
    return () => globalThis.clearTimeout(timer);
  }, [session]);

  const expire = useCallback((reason = 'This sandbox is expired or was replaced. Start a fresh sandbox to continue.') => {
    setSession((current) => current ? { ...current, status: 'expired', runtimeUrl: null, error: reason } : current);
    setMessage(reason);
  }, []);

  const startOrReset = useCallback(async () => {
    if (mutating) return;
    const expected = session?.sessionId ?? null;
    const action = expected ? 'reset' : 'start';
    const generation = ++requestGeneration.current;
    setMutating(true); setMessage('');
    try {
      const next = await changeHostedSession(kind, action, expected);
      if (requestGeneration.current !== generation) return;
      accept(next);
      if (next.status === 'starting') setPollEpoch((value) => value + 1);
    }
    catch (cause) {
      if (requestGeneration.current !== generation) return;
      setMessage(cause instanceof Error ? cause.message : 'The sandbox could not be started.');
      try {
        const reconciled = await readHostedSession(kind);
        if (requestGeneration.current !== generation) return;
        const changed = action === 'start'
          ? reconciled.status === 'starting' || reconciled.status === 'ready'
          : reconciled.sessionId !== expected && (reconciled.status === 'starting' || reconciled.status === 'ready');
        if (changed) {
          accept(reconciled);
          if (reconciled.status === 'starting') setPollEpoch((value) => value + 1);
          return;
        }
      } catch { /* Preserve the original unknown mutation outcome. */ }
      throw cause;
    }
    finally { if (requestGeneration.current === generation) setMutating(false); }
  }, [accept, kind, mutating, session?.sessionId]);

  if (session?.status === 'ready') return <>{children(session, expire, startOrReset)}</>;
  const title = kind === 'wallet' ? 'Private wallet sandbox' : 'Private guided sandbox';
  const starting = session?.status === 'starting';
  return <main className="hosted-gate" data-testid="hosted-session-gate">
    <Mark />
    <p className="hosted-eyebrow">{title}</p>
    <h1>{starting ? 'Starting your isolated test network…' : session?.status === 'expired' ? 'This sandbox has expired.' : session?.status === 'failed' ? 'The sandbox stopped.' : 'Try DividendX in a private sandbox.'}</h1>
    <p>Each visitor gets a separate synthetic network for up to 15 minutes. It uses test assets only and does not hold your wallet keys.</p>
    <p className="hosted-warning">Reloading reconnects to the same network, but a temporary wallet key exists only in this tab and is lost on reload.</p>
    {starting && <div className="hosted-progress" role="status"><i />Provisioning the runtime and checking its identity. This can take up to 90 seconds.</div>}
    {message && <div className="hosted-error" role="alert">{message}</div>}
    <div className="hosted-actions">
      {starting ? <button type="button" disabled={loading} onClick={() => void refresh()}>{loading ? 'Checking…' : 'Check progress'}</button>
        : <button type="button" disabled={mutating || loading} onClick={() => void startOrReset().catch(() => undefined)}>{mutating ? 'Requesting…' : session?.sessionId ? 'Start a fresh sandbox' : 'Start private sandbox'}</button>}
      <a href={kind === 'wallet' ? '/app/' : '/sandbox/'}>{kind === 'wallet' ? 'Use public devnet' : 'Open wallet sandbox'}</a>
      <a href="/">Annual reference</a>
    </div>
  </main>;
}
