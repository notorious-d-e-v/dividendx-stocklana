import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DemoSnapshot, DemoState, DemoStep, DemoWallet } from '../../../../packages/guided-runtime/src/contract';
import { amountContext, displayBalance, displayDelta, type BalanceKey } from './amounts';
import { DemoHttpError, readDemoReceipt, readDemoState, runDemoStep, startDemo } from './client';
import { DEMO_STEPS, stepCopy } from './steps';

const PUBLIC_POOL = '2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm';
const PUBLIC_POOL_URL = `https://explorer.solana.com/address/${PUBLIC_POOL}?cluster=devnet`;

type WalletRole = 'provider' | 'buyer';
interface ChangeSet { before: DemoSnapshot; after: DemoSnapshot }

function Mark() {
  return <span className="demo-mark" aria-hidden="true"><i /><i /></span>;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-5)}` : address;
}

function statusLabel(state: DemoState | null, unavailable: boolean): string {
  if (unavailable) return 'Runtime unavailable';
  if (!state) return 'Connecting';
  if (state.status === 'idle') return 'Ready to prepare';
  if (state.status === 'preparing') return 'Preparing local chain';
  if (state.status === 'ready') return 'Ready for next action';
  if (state.status === 'running') return 'Transaction in progress';
  if (state.status === 'failed') return 'Run stopped';
  return 'Journey complete';
}

function actorFor(state: DemoState | null): WalletRole | null {
  if (!state || state.status === 'idle' || state.activeStep === 'setup') return null;
  const step = stepCopy(state.activeStep ?? state.nextStep);
  return step?.actor === 'provider' || step?.actor === 'buyer' ? step.actor : null;
}

const BALANCES: readonly { key: BalanceKey; label: string; unit: string }[] = [
  { key: 'stockRaw', label: 'Test stock', unit: 'stock' },
  { key: 'ptRaw', label: 'Stock exposure', unit: 'PT' },
  { key: 'drRaw', label: 'Dividend rights', unit: 'DR' },
  { key: 'quoteRaw', label: 'Test quote', unit: 'quote' },
  { key: 'lpRaw', label: 'Raydium liquidity', unit: 'LP' },
];

function WalletPanel({ role, wallet, snapshot, active, changes }: {
  role: WalletRole;
  wallet: DemoWallet | null;
  snapshot: DemoSnapshot | null;
  active: boolean;
  changes: ChangeSet | null;
}) {
  const name = role === 'provider' ? 'Stock holder' : 'Dividend buyer';
  const context = snapshot ? amountContext(snapshot) : null;
  const beforeWallet = changes?.before[role];
  const afterWallet = changes?.after[role];
  return <article className={`demo-wallet ${active ? 'is-active' : ''}`} data-testid={`wallet-${role}`}>
    <header>
      <div><p className="demo-kicker">Demo actor</p><h3>{name}</h3></div>
      <span className={active ? 'signer active' : 'signer'}>{active ? 'Signs current action' : 'Server-managed test wallet'}</span>
    </header>
    <p className="wallet-address">{wallet ? <><code title={wallet.address}>{shortAddress(wallet.address)}</code><span>Local address</span></> : <span>Created when the demo starts</span>}</p>
    <dl className="balance-list">
      {BALANCES.map(({ key, label, unit }) => {
        const delta = context && beforeWallet && afterWallet ? displayDelta(beforeWallet[key], afterWallet[key], key, context) : null;
        return <div key={key}>
          <dt>{label} <small>{unit}</small></dt>
          <dd title={wallet ? `${wallet[key]} raw units` : undefined}>{wallet && context ? displayBalance(wallet[key], key, context) : '—'}</dd>
          {delta && <span className={delta.startsWith('+') ? 'delta positive' : 'delta negative'} aria-label={`Latest change ${delta}`}>{delta}</span>}
        </div>;
      })}
    </dl>
  </article>;
}

function Progress({ state }: { state: DemoState | null }) {
  const completed = new Set(state?.completedSteps ?? []);
  return <ol className="demo-progress" aria-label="Demo progress">
    {DEMO_STEPS.map((step, index) => {
      const isComplete = completed.has(step.id);
      const isCurrent = state?.activeStep === step.id || state?.nextStep === step.id;
      const isFailed = state?.status === 'failed' && state.activeStep === step.id;
      return <li key={step.id} className={`${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''} ${isFailed ? 'failed' : ''}`}>
        <span className="step-index">{isComplete ? '✓' : index + 1}</span>
        <div><p>{step.eyebrow}</p><h3>{step.title}</h3>{isCurrent && <small>{step.why}</small>}</div>
        <span className="step-state">{isComplete ? 'Complete' : isFailed ? 'Stopped' : isCurrent ? state?.status === 'running' ? 'Running' : 'Next' : 'Upcoming'}</span>
      </li>;
    })}
  </ol>;
}

function CurrentAction({ state, unavailable, pending, onAction, onReconnect }: {
  state: DemoState | null;
  unavailable: boolean;
  pending: boolean;
  onAction: () => void;
  onReconnect: () => void;
}) {
  if (unavailable) return <section className="current-action unavailable" aria-labelledby="current-action-title">
    <p className="demo-kicker">Local runtime</p><h2 id="current-action-title">The guided demo is unavailable.</h2>
    <p>In a terminal, run <code className="startup-command">npm run demo:guided</code>, then check again. {state ? 'The last received balances may be out of date.' : 'No wallet extension is needed.'}</p>
    <button className="demo-primary" onClick={onReconnect}>Check runtime again</button>
  </section>;

  if (!state) return <section className="current-action" aria-busy="true"><p className="demo-kicker">Local runtime</p><h2>Connecting to the guided demo…</h2></section>;

  if (state.status === 'idle') return <section className="current-action" aria-labelledby="current-action-title">
    <p className="demo-kicker">Start the local journey</p><h2 id="current-action-title">Prepare two disposable test wallets.</h2>
    <p>The test service creates a fresh local network and two test wallets. No wallet extension or private key is needed.</p>
    <button className="demo-primary" disabled={pending} onClick={onAction}>{pending ? 'Preparing…' : 'Prepare demo wallets'}</button>
  </section>;

  if (state.status === 'failed') return <section className="current-action failed" aria-labelledby="current-action-title">
    <p className="demo-kicker">Run stopped safely</p><h2 id="current-action-title">Keep the partial receipt, then start fresh.</h2>
    <p>{state.error || 'The runtime stopped before the journey completed.'} Submitted signatures remain below as evidence and this failed step will not be replayed.</p>
    <button className="demo-primary" disabled={pending} onClick={onAction}>{pending ? 'Preparing…' : 'Start a fresh demo'}</button>
  </section>;

  if (state.status === 'complete') return <section className="current-action complete" aria-labelledby="current-action-title">
    <p className="demo-kicker">All nine actions complete</p><h2 id="current-action-title">The claims remained backed through trading and redemption.</h2>
    <p>The two demo wallets finished their separate exits. Raydium’s locked residual claims remain in the pool and stay backed.</p>
    <button className="demo-primary" disabled={pending} onClick={onAction}>{pending ? 'Preparing…' : 'Run the journey again'}</button>
  </section>;

  const step = stepCopy(state.activeStep === 'setup' ? null : state.activeStep ?? state.nextStep);
  const working = pending || state.status === 'preparing' || state.status === 'running';
  return <section className="current-action" aria-labelledby="current-action-title" aria-busy={working}>
    <p className="demo-kicker">{state.activeStep === 'setup' ? 'Preparing the test wallets' : step?.eyebrow ?? 'Current action'}</p>
    <h2 id="current-action-title">{state.activeStep === 'setup' ? 'Creating test wallets and assets.' : step?.title ?? 'Waiting for the next step.'}</h2>
    <p>{state.activeStep === 'setup' ? 'The service is starting its own local network. Wallet keys stay in the test service.' : step?.why}</p>
    <p className="action-signer"><span>{step?.actor === 'buyer' ? 'Dividend buyer' : step?.actor === 'system' ? 'Demo settlement' : state.activeStep === 'setup' ? 'Test service' : 'Stock holder'}</span>{step ? ' signs this action' : ' · no browser signer'}</p>
    <button className="demo-primary" disabled={working || !step} onClick={onAction}>{working ? 'Action in progress…' : step?.action ?? 'Waiting…'}</button>
  </section>;
}

function RawBalances({ snapshot }: { snapshot: DemoSnapshot }) {
  return <div className="raw-grid">
    {(['provider', 'buyer'] as const).map((role) => <div key={role}><h4>{role === 'provider' ? 'Stock holder' : 'Dividend buyer'} · exact raw units</h4>{BALANCES.map(({ key, label }) => <p key={key}><span>{label}</span><code>{snapshot[role][key]}</code></p>)}</div>)}
    <div><h4>Backing and supply · exact raw units</h4><p><span>Vault</span><code>{snapshot.vaultRaw}</code></p><p><span>PT supply</span><code>{snapshot.ptSupplyRaw}</code></p><p><span>DR supply</span><code>{snapshot.drSupplyRaw}</code></p>{snapshot.pool && <><p><span>Pool DR</span><code>{snapshot.pool.drRaw}</code></p><p><span>Pool locked LP</span><code>{snapshot.pool.lockedLpRaw}</code></p></>}{snapshot.swap && <><p><span>Swap quote paid</span><code>{snapshot.swap.inputQuoteRaw}</code></p><p><span>Swap DR received</span><code>{snapshot.swap.outputDrRaw}</code></p><p><span>Enforced minimum DR</span><code>{snapshot.swap.minimumDrRaw}</code></p></>}</div>
  </div>;
}

function Evidence({ state, receipt, receiptError, receiptLoading, onOpen }: {
  state: DemoState | null;
  receipt: unknown;
  receiptError: string;
  receiptLoading: boolean;
  onOpen: (open: boolean) => void;
}) {
  return <details className="demo-evidence" onToggle={(event) => onOpen(event.currentTarget.open)}>
    <summary><span>Evidence & exact accounting</span><small>{state?.transactions.length ?? 0} transaction records</small></summary>
    <div className="evidence-body">
      {state?.snapshot ? <>
        <div className="evidence-facts"><p><span>Local slot</span><b>{state.snapshot.slot}</b></p><p><span>Journal</span><b>{state.snapshot.eventCount} synthetic events · {state.snapshot.phase}</b></p><p><span>Backing check</span><b>{state.snapshot.backingVerified ? 'Verified' : 'Not yet verified'}</b></p><p><span>Observed</span><b>{state.snapshot.observedAt}</b></p></div>
        <RawBalances snapshot={state.snapshot} />
        <div className="identity-list"><p><span>Stock holder</span><code>{state.snapshot.provider.address}</code></p><p><span>Dividend buyer</span><code>{state.snapshot.buyer.address}</code></p><p><span>DividendX program</span><code>{state.snapshot.dividendXProgram}</code></p><p><span>Raydium program</span><code>{state.snapshot.raydiumProgram}</code></p><p><span>Series</span><code>{state.snapshot.series}</code></p>{state.snapshot.pool && <p><span>Local Raydium pool</span><code>{state.snapshot.pool.address}</code></p>}</div>
      </> : <p>No chain snapshot exists yet.</p>}
      <section className="transaction-list"><h3>Submitted transaction records</h3>{state?.transactions.length ? state.transactions.map((transaction, index) => <article key={`${transaction.signature}-${index}`}><div><b>{transaction.name}</b><span>{transaction.step} · {transaction.status}{transaction.slot === null ? '' : ` · slot ${transaction.slot}`}</span></div><code>{transaction.signature}</code></article>) : <p>No transaction has been submitted.</p>}</section>
      <section className="receipt-record"><h3>Runtime receipt record</h3>{receiptLoading ? <p>Loading receipt…</p> : receiptError ? <p className="inline-error">{receiptError}</p> : receipt ? <pre>{JSON.stringify(receipt, null, 2)}</pre> : <p>Open this after a run starts to load its public provenance record.</p>}</section>
    </div>
  </details>;
}

export function GuidedDemosApp() {
  const [state, setState] = useState<DemoState | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('Connecting to the guided runtime.');
  const [pending, setPending] = useState(false);
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const stateRef = useRef<DemoState | null>(null);
  const expectedRef = useRef<{ revision: number; snapshot: DemoSnapshot | null } | null>(null);
  const receiptKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);

  const acceptState = useCallback((next: DemoState) => {
    const previous = stateRef.current;
    const identityChanged = Boolean(previous && (previous.runtimeId !== next.runtimeId || previous.sessionId !== next.sessionId));
    if (identityChanged) {
      expectedRef.current = null;
      setPending(false);
      setChanges(null);
    } else if (previous && previous.runtimeId === next.runtimeId && previous.sessionId === next.sessionId && next.revision < previous.revision) {
      return;
    }
    const expected = expectedRef.current;
    if (expected && next.revision > expected.revision) {
      setPending(false);
      if (expected.snapshot && next.snapshot && ['ready', 'failed', 'complete'].includes(next.status)) {
        setChanges({ before: expected.snapshot, after: next.snapshot });
        expectedRef.current = null;
      } else if (!expected.snapshot || ['failed', 'complete'].includes(next.status)) {
        expectedRef.current = null;
      }
    }
    const receiptKey = next.sessionId ? `${next.sessionId}:${next.revision}` : null;
    if (receiptKeyRef.current !== receiptKey) {
      setReceipt(null); setReceiptError(''); receiptKeyRef.current = null;
    }
    stateRef.current = next;
    setState(next);
    setConnectionError('');
  }, []);

  const refresh = useCallback(async (announce = false) => {
    const requestSequence = ++requestSequenceRef.current;
    try {
      const next = await readDemoState();
      if (requestSequence < appliedSequenceRef.current) return null;
      appliedSequenceRef.current = requestSequence;
      acceptState(next);
      if (announce) setNotice(`Connected to local runtime revision ${next.revision}.`);
      return next;
    } catch (error) {
      if (requestSequence < appliedSequenceRef.current) return null;
      appliedSequenceRef.current = requestSequence;
      const message = error instanceof Error ? error.message : 'The guided demo runtime is unavailable.';
      setConnectionError(message);
      if (announce) setNotice(message);
      return null;
    }
  }, [acceptState]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!pending && state?.status !== 'preparing' && state?.status !== 'running') return;
    const poll = globalThis.setInterval(() => { void refresh(); }, 900);
    return () => globalThis.clearInterval(poll);
  }, [pending, refresh, state?.status]);

  const action = useCallback(async () => {
    const current = stateRef.current;
    if (!current || pending) return;
    const isStart = current.status === 'idle' || current.status === 'failed' || current.status === 'complete';
    const step = current.nextStep;
    if (!isStart && (!step || !current.sessionId || current.status !== 'ready')) return;
    expectedRef.current = { revision: current.revision, snapshot: current.snapshot };
    setPending(true); setConnectionError(''); setNotice(isStart ? 'Preparing a fresh local demo.' : `Submitting ${stepCopy(step)?.title ?? step}`);
    try {
      if (isStart) await startDemo({ runtimeId: current.runtimeId, expectedRevision: current.revision });
      else await runDemoStep({ runtimeId: current.runtimeId, sessionId: current.sessionId!, expectedRevision: current.revision, step: step! });
      setNotice('Action accepted. Waiting for confirmed local state.');
      await refresh();
    } catch (error) {
      const stale = error instanceof DemoHttpError && error.status === 409;
      setNotice(stale ? 'The runtime state changed before this action. Refreshed without repeating it.' : 'The action outcome was uncertain. Checking runtime state before allowing another action.');
      const next = await refresh();
      if (stale || (next && next.revision === current.revision)) {
        expectedRef.current = null; setPending(false);
      }
    }
  }, [pending, refresh]);

  const reconnect = useCallback(async () => {
    const expected = expectedRef.current;
    const next = await refresh(true);
    if (next && expected && next.revision === expected.revision && (next.status === 'idle' || next.status === 'ready')) {
      expectedRef.current = null;
      setPending(false);
      setNotice('No action was accepted at that revision. It is safe to try again.');
    }
  }, [refresh]);

  const loadReceipt = useCallback(async () => {
    const current = stateRef.current;
    const key = current?.sessionId ? `${current.sessionId}:${current.revision}` : null;
    if (!key || receiptLoading || receiptKeyRef.current === key) return;
    receiptKeyRef.current = key; setReceiptLoading(true); setReceiptError('');
    try {
      const value = await readDemoReceipt();
      const latest = stateRef.current;
      if (latest?.sessionId && `${latest.sessionId}:${latest.revision}` === key) setReceipt(value);
    }
    catch (error) {
      if (receiptKeyRef.current === key) {
        setReceiptError(error instanceof Error ? error.message : 'Could not load the runtime receipt.');
        receiptKeyRef.current = null;
      }
    }
    finally { setReceiptLoading(false); }
  }, [receiptLoading]);

  useEffect(() => { if (evidenceOpen) void loadReceipt(); }, [evidenceOpen, loadReceipt, state?.revision]);

  const snapshot = state?.snapshot ?? null;
  const activeActor = actorFor(state);
  const runtimeUnavailable = Boolean(connectionError);
  const boundaryDetail = useMemo(() => 'The accepted DividendX program and captured genuine Raydium devnet bytecode execute on an isolated local chain. Time advances only inside that disposable test network.', []);

  return <div className="demo-shell">
    <a className="skip-link" href="#demo-main">Skip to demo</a>
    <header className="demo-header">
      <a className="demo-brand" href="/app/"><Mark /><span>DividendX</span></a>
      <nav aria-label="Primary"><a href="/app/">Wallet app</a><a href="/demos/" aria-current="page">Guided demos</a></nav>
      <span className={`runtime-status ${runtimeUnavailable ? 'unavailable' : state?.status ?? ''}`}><i />{statusLabel(state, runtimeUnavailable)}</span>
    </header>
    <aside className="boundary-bar"><strong>Local transactions · Test assets · Accelerated test year</strong><details><summary>What this means</summary><p>{boundaryDetail}</p></details></aside>

    <main id="demo-main">
      <section className="demo-hero">
        <div><p className="demo-kicker">Guided DeFi demo · Raydium</p><h1>Sell dividend rights <span>through a market.</span></h1><p>Follow two test wallets through nine signed actions. Every balance and receipt comes from the local test network.</p><div className="hero-proof"><p>Separate public proof</p><a href={PUBLIC_POOL_URL} target="_blank" rel="noreferrer">Verified devnet test pool <span aria-hidden="true">↗</span></a><small>{PUBLIC_POOL}</small></div></div>
        <CurrentAction state={state} unavailable={runtimeUnavailable} pending={pending} onAction={() => void action()} onReconnect={() => void reconnect()} />
      </section>

      {connectionError && <div className="connection-alert" role="alert"><b>Local runtime connection</b><span>{connectionError} {state ? 'The last received snapshot may be stale.' : ''}</span></div>}
      <p className="sr-status" role="status" aria-live="polite">{notice}</p>

      <section className="wallet-section" aria-labelledby="wallet-heading">
        <header><div><p className="demo-kicker">Two test wallets</p><h2 id="wallet-heading">Two wallets, two owners.</h2></div><p>The test service manages both wallets for this journey. They are separate from your wallet, and no extension is needed.</p></header>
        <div className="wallet-grid">
          <WalletPanel role="provider" wallet={snapshot?.provider ?? null} snapshot={snapshot} active={activeActor === 'provider'} changes={changes} />
          <WalletPanel role="buyer" wallet={snapshot?.buyer ?? null} snapshot={snapshot} active={activeActor === 'buyer'} changes={changes} />
        </div>
      </section>

      <section className="progress-section">
        <div className="section-heading"><p className="demo-kicker">The journey</p><h2>Nine simple actions.</h2></div><Progress state={state} />
      </section>

      {snapshot?.pool && state?.completedSteps.includes('remove-liquidity') && <aside className="pool-note"><div><p className="demo-kicker">Residual pool custody</p><h2>Raydium’s locked claims remain backed.</h2></div><p>The pool currently holds <b>{displayBalance(snapshot.pool.drRaw, 'drRaw', amountContext(snapshot))} DR</b> and <b>{displayBalance(snapshot.pool.lockedLpRaw, 'lpRaw', amountContext(snapshot))} locked LP</b>. Those DR claims are still part of supply and remain backed after both wallets finish.</p></aside>}

      <Evidence state={state} receipt={receipt} receiptError={receiptError} receiptLoading={receiptLoading} onOpen={setEvidenceOpen} />

      <section className="future-demos" aria-labelledby="future-heading">
        <div><p className="demo-kicker">Planned, not integrated</p><h2 id="future-heading">Future guided demos.</h2><p>Each one needs a tested market, reliable pricing and safe handling before it can become an action here.</p></div>
        <div><article><span>01 · Planned</span><h3>Trade stock exposure (PT)</h3><p>Test a real permissionless venue before enabling controls.</p></article><article><span>02 · Research next</span><h3>Borrow against stock exposure</h3><p>Requires defensible oracle, maturity and liquidation handling.</p></article></div>
      </section>
    </main>
    <footer><Mark /><span>DividendX guided demo</span><a href="/app/">Return to the wallet app</a></footer>
  </div>;
}
