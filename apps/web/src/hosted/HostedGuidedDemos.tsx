import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GuidedDemosApp, type GuidedHostedLifecycle } from '../demos/GuidedDemosApp';
import { createGuidedClient } from '../demos/client';
import { changeHostedSession, HostedSessionError, initialHostedSession, readHostedSession, type HostedSession } from './session';

const POLL_MS = 2_000;
const START_DEADLINE_MS = 90_000;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The private sandbox service is unavailable.';
}

export function HostedGuidedDemos() {
  const [session, setSession] = useState<HostedSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const sessionRef = useRef<HostedSession | null>(null);
  const operationRef = useRef<Promise<HostedSession> | null>(null);
  const initialRef = useRef<Promise<HostedSession> | null>(null);
  const generationRef = useRef(0);
  const startingAtRef = useRef(0);

  const accept = useCallback((next: HostedSession) => {
    sessionRef.current = next;
    setSession(next);
    setChecking(false);
    if (next.status === 'starting' && startingAtRef.current === 0) startingAtRef.current = Date.now();
    if (next.status !== 'starting') startingAtRef.current = 0;
    setError(next.error ?? '');
    setUncertain(false);
  }, []);

  useEffect(() => {
    let active = true;
    const generation = ++generationRef.current;
    const request = initialHostedSession('guided');
    initialRef.current = request;
    void request.then((next) => { if (active && generation === generationRef.current) accept(next); }, (cause: unknown) => {
      if (!active || generation !== generationRef.current) return;
      setChecking(false);
      setError(message(cause));
    });
    return () => { active = false; };
  }, [accept]);

  const check = useCallback(async () => {
    const generation = ++generationRef.current;
    setChecking(true);
    try {
      const next = await readHostedSession('guided');
      if (generation !== generationRef.current) throw new Error('A newer sandbox status replaced this check.');
      if (sessionRef.current?.status === 'expired' && next.status === 'ready' && next.sessionId === sessionRef.current.sessionId) {
        throw new Error('The expired sandbox cannot be resumed. Start a fresh guided demo.');
      }
      accept(next);
      return next;
    } catch (cause) {
      if (generation === generationRef.current) { setChecking(false); setError(message(cause)); }
      throw cause;
    }
  }, [accept]);

  useEffect(() => {
    if (session?.status !== 'starting' || busy || error) return;
    if (Date.now() - startingAtRef.current >= START_DEADLINE_MS) {
      setError('The sandbox is still starting. Check its progress manually.');
      return;
    }
    const timer = setTimeout(() => { void check().catch(() => undefined); }, POLL_MS);
    return () => clearTimeout(timer);
  }, [busy, check, error, session]);

  useEffect(() => {
    if (session?.status !== 'ready' || !session.expiresAt) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = setTimeout(() => {
      const current = sessionRef.current;
      if (current?.sessionId !== session.sessionId || current.status !== 'ready') return;
      generationRef.current += 1;
      accept({ ...current, status: 'expired', runtimeUrl: null, error: 'This private sandbox has expired.' });
    }, Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [accept, session]);

  const waitReady = useCallback(async (first: HostedSession): Promise<HostedSession> => {
    let current = first;
    const deadline = Date.now() + START_DEADLINE_MS;
    while (current.status === 'starting') {
      if (Date.now() >= deadline) throw new Error('The sandbox is still starting. Check its progress below.');
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
      current = await check();
    }
    if (current.status !== 'ready') throw new Error(current.error || 'The sandbox stopped before it was ready.');
    return current;
  }, [check]);

  const ensureReady = useCallback((): Promise<HostedSession> => {
    if (operationRef.current) return operationRef.current;
    const operation = (async () => {
      setBusy(true);
      setError('');
      try {
        let current = sessionRef.current;
        if (!current && initialRef.current) {
          try { current = await initialRef.current; accept(current); } catch { current = await check(); }
        }
        if (!current) current = await check();
        if (current.status === 'ready') return current;
        if (current.status === 'starting') return await waitReady(current);
        if (uncertain) throw new Error('The previous request outcome is unknown. Check sandbox status before starting again.');
        const expected = current.sessionId;
        const action = expected ? 'reset' : 'start';
        const generation = ++generationRef.current;
        let next: HostedSession;
        try {
          next = await changeHostedSession('guided', action, expected);
          if (generation !== generationRef.current) throw new Error('The sandbox session changed during this request.');
        } catch (cause) {
          if (generation !== generationRef.current) throw cause;
          // A failed POST may have succeeded server-side. Read once; never replay it here.
          try {
            const observed = await check();
            const changed = action === 'start'
              ? observed.status === 'starting' || observed.status === 'ready'
              : observed.sessionId !== expected && (observed.status === 'starting' || observed.status === 'ready');
            if (changed) return await waitReady(observed);
          } catch {
            setUncertain(true);
            setError('The request outcome is unknown and sandbox status could not be checked. Check status before trying again.');
            throw cause;
          }
          const detail = cause instanceof HostedSessionError && cause.status === 429
            ? message(cause)
            : `${message(cause)} The session status was checked; no new sandbox was found.`;
          setError(detail);
          throw cause;
        }
        accept(next);
        return await waitReady(next);
      } catch (cause) {
        setError((current) => current || message(cause));
        throw cause;
      } finally {
        setBusy(false);
      }
    })();
    operationRef.current = operation;
    void operation.finally(() => { if (operationRef.current === operation) operationRef.current = null; }).catch(() => undefined);
    return operation;
  }, [accept, check, uncertain, waitReady]);

  const expire = useCallback((reason = 'This guided sandbox expired or was replaced.', expectedSessionId?: string, expectedRuntimeId?: string) => {
    const current = sessionRef.current;
    if (!current) return;
    if (expectedSessionId && current.sessionId !== expectedSessionId) return;
    if (expectedRuntimeId && current.runtimeId !== expectedRuntimeId) return;
    generationRef.current += 1;
    accept({ ...current, status: 'expired', runtimeUrl: null, error: reason });
    setError(reason);
  }, [accept]);

  const reset = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.sessionId) return;
    expire('Starting a fresh guided sandbox…');
    await ensureReady();
  }, [ensureReady, expire]);

  const clientFor = useCallback((ready: HostedSession) => createGuidedClient(ready.runtimeUrl!, {
    expectedRuntimeId: ready.runtimeId!, hosted: true,
    onExpired: (reason) => expire(reason, ready.sessionId!, ready.runtimeId!),
  }), [expire]);
  const client = useMemo(() => session?.status === 'ready' && session.runtimeUrl && session.runtimeId
    ? clientFor(session)
    : null, [clientFor, session?.runtimeId, session?.runtimeUrl, session?.status]);

  const lifecycle: GuidedHostedLifecycle = { session, checking, busy, error, uncertain, ensureReady, check, reset,
    clientFor,
  };
  return <GuidedDemosApp client={client} hostedLifecycle={lifecycle} />;
}
