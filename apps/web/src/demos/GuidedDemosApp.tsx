import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { DEMO_ASSETS, type DemoAsset, type DemoSnapshot, type DemoState, type DemoWallet } from '../../../../packages/guided-runtime/src/contract';
import { amountContext, displayBalance, displayDelta, type BalanceKey } from './amounts';
import { createGuidedClient, DemoHttpError, type GuidedClient } from './client';
import { DEMO_STEPS, stepCopy } from './steps';
import type { HostedSession } from '../hosted/session';

export interface GuidedHostedLifecycle {
  session: HostedSession | null;
  checking: boolean;
  busy: boolean;
  error: string;
  uncertain: boolean;
  ensureReady: () => Promise<HostedSession>;
  check: () => Promise<HostedSession>;
  reset: () => Promise<void>;
  clientFor: (session: HostedSession) => GuidedClient;
}

type WalletRole = 'provider' | 'buyer';
interface ChangeSet { before: DemoSnapshot; after: DemoSnapshot }

const ASSET_LABELS: Record<DemoAsset['id'], { symbol: string; issuer: string }> = {
  'xstocks-test-kox': { symbol: 'KOx', issuer: 'xStocks' },
  'backpack-test-mu': { symbol: 'MU', issuer: 'Backpack/Trek' },
  'ondo-test-ibm': { symbol: 'IBMon', issuer: 'Ondo' },
};

function assetLabel(asset: DemoAsset) { return ASSET_LABELS[asset.id]; }

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
  { key: 'stockRaw', label: 'Tokenized stock', unit: 'stock' },
  { key: 'ptRaw', label: 'Stock exposure', unit: 'PT' },
  { key: 'drRaw', label: 'Dividend rights', unit: 'DR' },
  { key: 'quoteRaw', label: 'USDC', unit: 'USDC' },
  { key: 'lpRaw', label: 'Raydium liquidity', unit: 'LP' },
];

function WalletPanel({ role, wallet, snapshot, active, changes, coreOnly = false }: {
  role: WalletRole;
  wallet: DemoWallet | null;
  snapshot: DemoSnapshot | null;
  active: boolean;
  changes: ChangeSet | null;
  coreOnly?: boolean;
}) {
  const name = role === 'provider' ? 'Stock holder' : 'Dividend buyer';
  const stockName = snapshot?.asset.company ?? 'Tokenized stock';
  const context = snapshot ? amountContext(snapshot) : null;
  const beforeWallet = changes?.before[role];
  const afterWallet = changes?.after[role];
  return <article className={`demo-wallet ${active ? 'is-active' : ''}`} data-testid={`wallet-${role}`}>
    <header>
      <div><p className="demo-kicker">Demo actor</p><h3>{name}</h3></div>
      <span className={active ? 'signer active' : 'signer'}>{active ? 'Signs current action' : 'Demo wallet'}</span>
    </header>
    <p className="wallet-address">{wallet ? <><code title={wallet.address}>{shortAddress(wallet.address)}</code><span>Local address</span></> : <span>Created when the demo starts</span>}</p>
    <dl className="balance-list">
      {BALANCES.filter(({ key }) => !coreOnly || ['stockRaw', 'ptRaw', 'drRaw'].includes(key)).map(({ key, label, unit }) => {
        const delta = context && beforeWallet && afterWallet ? displayDelta(beforeWallet[key], afterWallet[key], key, context) : null;
        return <div key={key}>
          <dt>{key === 'stockRaw' ? stockName : label} <small>{unit}</small></dt>
          <dd title={wallet ? `${wallet[key]} raw units` : undefined}><motion.span key={`${wallet?.address ?? 'empty'}-${key}-${wallet?.[key] ?? ''}`} initial={{ opacity: .45 }} animate={{ opacity: 1 }} transition={{ duration: .24 }}>{wallet && context ? displayBalance(wallet[key], key, context) : '—'}</motion.span></dd>
          {delta && <span className={delta.startsWith('+') ? 'delta positive' : 'delta negative'} aria-label={`Latest change ${delta}`}>{delta}</span>}
        </div>;
      })}
    </dl>
  </article>;
}

function Progress({ state, chapter }: { state: DemoState | null; chapter: 1 | 2 | 3 }) {
  const completed = new Set(state?.completedSteps ?? []);
  const steps = DEMO_STEPS.filter((step) => step.chapter === chapter);
  const currentIndex = steps.findIndex((step) => step.id === state?.activeStep || step.id === state?.nextStep);
  return <ol className="demo-progress" aria-label={`Part ${chapter} progress`}>
    {steps.map((step, index) => {
      const isComplete = completed.has(step.id);
      const isCurrent = state?.activeStep === step.id || state?.nextStep === step.id;
      const isFailed = state?.status === 'failed' && state.activeStep === step.id;
      if (!isComplete && !isCurrent && index > currentIndex + 1) return null;
      return <li key={step.id} className={`${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''} ${isFailed ? 'failed' : ''}`}>
        <motion.span key={isComplete ? `${step.id}-done` : `${step.id}-pending`} className="step-index" initial={{ opacity: .5, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .2 }}>{isComplete ? '✓' : index + 1}</motion.span>
        <div><p>{step.eyebrow}</p><h3>{state?.asset && step.id === 'core-split' ? `Split 100 ${state.asset.company} stocks.` : state?.asset && step.id === 'dividend-split' ? `Split the returned 100 ${state.asset.company} stocks.` : step.title}</h3>{isCurrent && <small>{step.why}</small>}</div>
        <span className="step-state">{isComplete ? 'Complete' : isFailed ? 'Stopped' : isCurrent ? state?.status === 'running' ? 'Running' : 'Next' : 'Upcoming'}</span>
      </li>;
    })}
  </ol>;
}

function CurrentAction({ state, unavailable, pending, hosted, awaitingSandbox, selectedAssetId, onSelectAsset, onAction, onReconnect, lastResult, onSeeWallet, wiggleStep, reduceMotion }: {
  state: DemoState | null;
  unavailable: boolean;
  pending: boolean;
  hosted: boolean;
  awaitingSandbox?: boolean;
  selectedAssetId: DemoAsset['id'] | null;
  onSelectAsset: (id: DemoAsset['id']) => void;
  onAction: () => void;
  onReconnect: () => void;
  lastResult?: string | null;
  onSeeWallet?: () => void;
  wiggleStep?: string | null;
  reduceMotion: boolean | null;
}) {
  const selectedAsset = Object.values(DEMO_ASSETS).find((asset) => asset.id === selectedAssetId);
  if (unavailable && !awaitingSandbox) return <section className="current-action unavailable" aria-labelledby="current-action-title">
    <p className="demo-kicker">{hosted ? 'Private sandbox' : 'Local runtime'}</p><h2 id="current-action-title">The guided demo is unavailable.</h2>
    <p>{hosted ? 'This session-bound sandbox could not be reached. Check the same sandbox again; no action is repeated.' : <>In a terminal, run <code className="startup-command">npm run demo:guided</code>, then check again.</>} {state ? 'The last received balances may be out of date.' : 'No wallet extension is needed.'}</p>
    <button className="demo-primary" onClick={onReconnect}>Check {hosted ? 'sandbox' : 'runtime'} again</button>
  </section>;

  if (!state && !awaitingSandbox) return <section className="current-action" aria-busy="true"><p className="demo-kicker">{hosted ? 'Private sandbox' : 'Local runtime'}</p><h2>Connecting to the guided demo…</h2></section>;

  if (!state || state.status === 'idle') return <section className="current-action" aria-labelledby="current-action-title">
    <p className="demo-kicker">Part one · choose a company</p><h2 id="current-action-title">Choose a tokenized stock to follow.</h2>
    <p>Choose a company for this demo. The 100 tokenized stocks appear in your test wallet when you start.</p>
    <div className="asset-choices" role="group" aria-label="Choose a stock">
      {Object.values(DEMO_ASSETS).map((asset) => <button key={asset.id} type="button" className={selectedAssetId === asset.id ? 'asset-choice selected' : 'asset-choice'} aria-pressed={selectedAssetId === asset.id} onClick={() => onSelectAsset(asset.id)} disabled={pending}>
            <span className="asset-choice-symbol">{assetLabel(asset).symbol}</span><span><strong>{asset.company}</strong><small>{assetLabel(asset).issuer}</small></span><span className="asset-choice-check" aria-hidden="true">{selectedAssetId === asset.id ? '✓' : '○'}</span>
      </button>)}
    </div>
    <button className="demo-primary" data-testid="prepare-guided-profile" disabled={pending || !selectedAssetId} onClick={onAction}>{pending ? 'Preparing…' : selectedAsset ? `Get 100 tokenized ${selectedAsset.company}` : 'Choose a company to start'}</button>
    <small className="action-note">The sandbox supplies sample stock and USDC balances. No real funds or wallet extension are needed.</small>
  </section>;

  if (state.status === 'failed') return <section className="current-action failed" aria-labelledby="current-action-title">
    <p className="demo-kicker">Run stopped safely</p><h2 id="current-action-title">Keep the partial receipt, then start fresh.</h2>
    <p>{state.error || 'The runtime stopped before the journey completed.'} Submitted signatures remain below as evidence and this failed step will not be replayed.</p>
    <button className="demo-primary" disabled={pending} onClick={onAction}>{pending ? 'Preparing…' : 'Start a fresh demo'}</button>
  </section>;

  if (state.status === 'complete') return <section className="current-action complete" aria-labelledby="current-action-title">
    <p className="demo-kicker">All three parts complete</p><h2 id="current-action-title">The claims remained backed through trading and redemption.</h2>
    <p>The two demo wallets finished their separate exits. Raydium’s locked residual claims remain in the pool and stay backed.</p>
    <button className="demo-primary" disabled={pending} onClick={onAction}>{pending ? 'Preparing…' : 'Run the journey again'}</button>
  </section>;

  const step = stepCopy(state.activeStep === 'setup' ? null : state.activeStep ?? state.nextStep);
  const working = pending || state.status === 'preparing' || state.status === 'running';
  return <section id="current-tour-action" className="current-action" aria-labelledby="current-action-title" aria-busy={working}>
    <p className="demo-kicker">{state.activeStep === 'setup' ? 'Preparing the wallets' : step?.eyebrow ?? 'Current action'}</p>
    <h2 id="current-action-title">{state.activeStep === 'setup' ? 'Creating wallets and assets.' : step?.id === 'core-split' && state.asset ? `Split 100 ${state.asset.company} stocks.` : step?.id === 'dividend-split' && state.asset ? `Split the returned 100 ${state.asset.company} stocks.` : step?.title ?? 'Waiting for the next step.'}</h2>
    <p>{state.activeStep === 'setup' ? 'The service is starting its own local network. Wallet keys stay in the test service.' : step?.why}</p>
    <p className="action-signer"><span>{step?.actor === 'buyer' ? 'Dividend buyer' : state.activeStep === 'setup' ? 'Demo service' : step?.actor === 'system' ? 'Demo timeline' : 'Stock holder'}</span>{step?.actor === 'system' || !step ? ' · no browser signer' : ' signs this action'}</p>
    {lastResult && <div className="action-result" role="status"><b>What changed</b><p>{lastResult}</p>{onSeeWallet && <motion.button type="button" className="wallet-jump" data-wiggle={wiggleStep === state.completedSteps.at(-1) && !reduceMotion ? 'true' : undefined} onClick={onSeeWallet} animate={wiggleStep === state.completedSteps.at(-1) && !reduceMotion ? { x: [0, -2, 2, -1, 0], rotate: [0, -1, 1, 0] } : undefined} transition={{ duration: .45, ease: 'easeInOut' }}>See wallet changes ↓</motion.button>}</div>}
    <button className="demo-primary" data-demo-step={step?.id} disabled={working || !step} onClick={onAction}>{working ? 'Action in progress…' : step?.id === 'core-split' && state.asset ? `Split 100 ${state.asset.company} stocks` : step?.id === 'dividend-split' && state.asset ? `Split 100 ${state.asset.company} stocks for the year` : step?.action ?? 'Waiting…'}</button>
  </section>;
}

function RawBalances({ snapshot }: { snapshot: DemoSnapshot }) {
  return <div className="raw-grid">
    {(['provider', 'buyer'] as const).map((role) => <div key={role}><h4>{role === 'provider' ? 'Stock holder' : 'Dividend buyer'} · exact raw units</h4>{BALANCES.map(({ key, label }) => <p key={key}><span>{label}</span><code>{snapshot[role][key]}</code></p>)}</div>)}
    <div><h4>Backing and supply · exact raw units</h4><p><span>Vault</span><code>{snapshot.vaultRaw}</code></p><p><span>PT supply</span><code>{snapshot.ptSupplyRaw}</code></p><p><span>DR supply</span><code>{snapshot.drSupplyRaw}</code></p>{snapshot.pool && <><p><span>Pool DR</span><code>{snapshot.pool.drRaw}</code></p><p><span>Pool locked LP</span><code>{snapshot.pool.lockedLpRaw}</code></p></>}{snapshot.swap && <><p><span>Swap Test USDC paid</span><code>{snapshot.swap.inputQuoteRaw}</code></p><p><span>Swap DR received</span><code>{snapshot.swap.outputDrRaw}</code></p><p><span>Enforced minimum DR</span><code>{snapshot.swap.minimumDrRaw}</code></p></>}</div>
  </div>;
}

function Evidence({ state, receipt, receiptError, receiptLoading, hosted, onOpen }: {
  state: DemoState | null;
  receipt: unknown;
  receiptError: string;
  receiptLoading: boolean;
  hosted: boolean;
  onOpen: (open: boolean) => void;
}) {
  return <details className="demo-evidence" onToggle={(event) => onOpen(event.currentTarget.open)}>
    <summary><span>Evidence & exact accounting</span><small>{state?.transactions.length ?? 0} transaction records</small></summary>
    <div className="evidence-body">
      {state?.snapshot ? <>
        <div className="evidence-facts"><p><span>Local slot</span><b>{state.snapshot.slot}</b></p><p><span>Journal</span><b>{state.snapshot.eventCount} synthetic events · {state.snapshot.phase}</b></p><p><span>Backing check</span><b>{state.snapshot.backingVerified ? 'Verified' : 'Not yet verified'}</b></p><p><span>Observed</span><b>{state.snapshot.observedAt}</b></p></div>
        <RawBalances snapshot={state.snapshot} />
        <div className="identity-list"><p><span>Stock holder</span><code>{state.snapshot.provider.address}</code></p><p><span>Dividend buyer</span><code>{state.snapshot.buyer.address}</code></p><p><span>Test USDC provenance</span><b>Circle devnet mint copied locally · synthetic local balances</b></p><p><span>Canonical Circle devnet mint</span><code>{state.snapshot.quoteAsset.canonicalMint}</code></p><p><span>Observed local quote mint</span><code>{state.snapshot.mints.quote}</code></p><p><span>DividendX program</span><code>{state.snapshot.dividendXProgram}</code></p><p><span>Raydium program</span><code>{state.snapshot.raydiumProgram}</code></p><p><span>Series</span><code>{state.snapshot.series}</code></p>{state.snapshot.pool && <p><span>Local Raydium pool</span><code>{state.snapshot.pool.address}</code></p>}</div>
      </> : <p>No chain snapshot exists yet.</p>}
      <section className="transaction-list"><h3>Submitted transaction records</h3>{state?.transactions.length ? state.transactions.map((transaction, index) => <article key={`${transaction.signature}-${index}`}><div><b>{transaction.name}</b><span>{transaction.step} · {transaction.status}{transaction.slot === null ? '' : ` · slot ${transaction.slot}`}</span></div><code>{transaction.signature}</code></article>) : <p>No transaction has been submitted.</p>}</section>
      <section className="receipt-record"><h3>{hosted ? 'Synthetic private sandbox receipt' : 'Runtime receipt record'}</h3>{receiptLoading ? <p>Loading receipt…</p> : receiptError ? <p className="inline-error">{receiptError}</p> : receipt ? <pre>{JSON.stringify(receipt, null, 2)}</pre> : <p>Open this after a run starts to load its public provenance record.</p>}</section>
    </div>
  </details>;
}

function resultCopy(state: DemoState | null): string | null {
  const snapshot = state?.snapshot;
  const last = state?.completedSteps.at(-1);
  if (!snapshot || !last) return null;
  switch (last) {
    case 'core-split': return '100 stocks became 100 PT and 100 DR. The holder now owns two separate claims.';
    case 'core-recombine-partial': return '40 matching pairs returned 40 stocks. 60 PT and 60 DR remain.';
    case 'core-recombine-rest': return 'The other 60 pairs returned 60 stocks. The holder has 100 stocks again.';
    case 'dividend-split': return '100 stocks became 100 PT and 100 DR for the sample year.';
    case 'dividend-quarter-one': return `One sample dividend was recorded. The 100 matching pairs now return ${displayBalance(snapshot.vaultRaw, 'stockRaw', amountContext(snapshot))} stocks; DR count remains 100.`;
    case 'dividend-quarter-two': return `Two sample dividends were recorded. The 100 matching pairs now return ${displayBalance(snapshot.vaultRaw, 'stockRaw', amountContext(snapshot))} stocks; DR count remains 100.`;
    case 'dividend-recombine': return `40 pairs returned ${displayBalance(snapshot.provider.stockRaw, 'stockRaw', amountContext(snapshot))} stocks. 60 PT and 60 DR remain for Part Three.`;
    case 'create-pool': return '24 DR and 4 USDC seeded the pool. The holder received LP tokens.';
    case 'add-liquidity': return 'The holder added 6 USDC and up to 36 DR. Pool rounding may leave a tiny DR remainder; see the wallet for the exact amount.';
    case 'buy-dr': return 'The buyer swapped USDC for dividend rights. The actual DR amount is shown in the wallet and receipt.';
    case 'remove-liquidity': {
      const returned = BigInt(snapshot.provider.quoteRaw);
      const supplied = 10_000_000n;
      const difference = returned - supplied;
      const format = (raw: bigint) => displayBalance(raw.toString(), 'quoteRaw', amountContext(snapshot));
      const comparison = difference > 0n ? `${format(difference)} USDC more than` : difference < 0n ? `${format(-difference)} USDC less than` : 'the same amount as';
      const trade = difference > 0n ? 'After the buyer’s trade, the pool share returns more USDC and fewer DR.' : 'The buyer exchanged USDC for DR, leaving fewer DR in the holder’s pool share.';
      return `The holder withdrew ${format(returned)} USDC—${comparison} the 10 USDC supplied. ${trade}`;
    }
    case 'recombine': return 'Recovered DR and matching PT returned stock before year-end settlement.';
    case 'settle-year': return 'The last two sample dividends were recorded and the year was finalized.';
    case 'redeem-buyer': return 'The buyer redeemed its DR for its assigned dividend-derived stock.';
    case 'redeem-provider': return 'The holder redeemed its remaining PT. The pool residual stays backed.';
  }
}

const localGuidedClient = createGuidedClient();

export function GuidedDemosApp({ client = localGuidedClient, hostedLifecycle }: { client?: GuidedClient | null; hostedLifecycle?: GuidedHostedLifecycle }) {
  const hosted = Boolean(hostedLifecycle);
  const [state, setState] = useState<DemoState | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState(hostedLifecycle ? 'Choose a company or start the guided tour.' : 'Connecting to the guided runtime.');
  const [pending, setPending] = useState(false);
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<DemoAsset['id'] | null>(null);
  const [wiggleStep, setWiggleStep] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const stateRef = useRef<DemoState | null>(null);
  const expectedRef = useRef<{ revision: number; snapshot: DemoSnapshot | null } | null>(null);
  const receiptKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const wiggleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartScrollRef = useRef(false);
  const actionLockRef = useRef(false);
  const activeRuntimeRef = useRef<string | null>(client?.expectedRuntimeId ?? null);
  const activeRuntimeUrlRef = useRef<string | null>(client?.runtimeUrl ?? null);
  activeRuntimeRef.current = client?.expectedRuntimeId ?? null;
  activeRuntimeUrlRef.current = client?.runtimeUrl ?? null;

  useEffect(() => () => { if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); }, []);

  const acceptState = useCallback((next: DemoState) => {
    if (hosted && next.runtimeId !== activeRuntimeRef.current) return;
    const previous = stateRef.current;
    if (previous?.runtimeId === next.runtimeId && next.revision < previous.revision) return;
    const identityChanged = Boolean(previous && (previous.runtimeId !== next.runtimeId || previous.sessionId !== next.sessionId));
    if (identityChanged) {
      expectedRef.current = null;
      setPending(false);
      setChanges(null);
      setWiggleStep(null);
      if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
    }
    const expected = expectedRef.current;
    if (previous && !identityChanged && !reduceMotion && next.completedSteps.length > previous.completedSteps.length) {
      setWiggleStep(next.completedSteps.at(-1) ?? null);
      if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
      wiggleTimeoutRef.current = setTimeout(() => setWiggleStep(null), 700);
    }
    if (expected && next.revision > expected.revision) {
      setPending(false);
      if (expected.snapshot && next.snapshot && ['ready', 'failed', 'complete'].includes(next.status)) {
        setChanges({ before: expected.snapshot, after: next.snapshot });
        expectedRef.current = null;
      } else if (!expected.snapshot || ['failed', 'complete'].includes(next.status)) {
        expectedRef.current = null;
      }
    }
    const receiptKey = next.sessionId ? `${next.runtimeId}:${next.sessionId}:${next.revision}` : null;
    if (receiptKeyRef.current !== receiptKey) {
      setReceipt(null); setReceiptError(''); receiptKeyRef.current = null;
    }
    stateRef.current = next;
    setState(next);
    setConnectionError('');
  }, [hosted, reduceMotion]);

  useLayoutEffect(() => {
    if (!restartScrollRef.current || !state || state.status === 'complete') return;
    restartScrollRef.current = false;
    document.getElementById('core-heading')?.focus({ preventScroll: true });
    document.getElementById('tour-core')?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
  }, [state, reduceMotion]);

  const refresh = useCallback(async (announce = false) => {
    if (!client) return null;
    const requestSequence = ++requestSequenceRef.current;
    try {
      const next = await client.readState();
      if (client.hosted && (next.runtimeId !== activeRuntimeRef.current || client.runtimeUrl !== activeRuntimeUrlRef.current)) return null;
      if (requestSequence < appliedSequenceRef.current) return null;
      appliedSequenceRef.current = requestSequence;
      acceptState(next);
      if (announce) setNotice(`Connected to guided runtime revision ${next.revision}.`);
      return next;
    } catch (error) {
      if (client.hosted && (client.expectedRuntimeId !== activeRuntimeRef.current || client.runtimeUrl !== activeRuntimeUrlRef.current)) return null;
      if (requestSequence < appliedSequenceRef.current) return null;
      appliedSequenceRef.current = requestSequence;
      const message = error instanceof Error ? error.message : 'The guided demo runtime is unavailable.';
      setConnectionError(message);
      if (announce) setNotice(message);
      return null;
    }
  }, [acceptState, client]);

  useEffect(() => {
    if (!client) {
      stateRef.current = null; expectedRef.current = null; receiptKeyRef.current = null;
      setState(null); setPending(false); setChanges(null); setReceipt(null); setReceiptError(''); setConnectionError('');
      return;
    }
    void refresh();
  }, [client, refresh]);
  useEffect(() => {
    if (!pending && state?.status !== 'preparing' && state?.status !== 'running') return;
    const poll = globalThis.setInterval(() => { void refresh(); }, 900);
    return () => globalThis.clearInterval(poll);
  }, [pending, refresh, state?.status]);

  const action = useCallback(async () => {
    if (actionLockRef.current || pending) return;
    actionLockRef.current = true;
    let current = stateRef.current;
    let actionClient = client;
    try {
      if (hostedLifecycle && (!current || !actionClient || current.runtimeId !== actionClient.expectedRuntimeId)) {
        if (!selectedAssetId) return;
        setPending(true);
        const ready = await hostedLifecycle.ensureReady();
        actionClient = hostedLifecycle.clientFor(ready);
        activeRuntimeRef.current = ready.runtimeId;
        activeRuntimeUrlRef.current = actionClient.runtimeUrl;
        current = await actionClient.readState();
        if (actionClient.expectedRuntimeId !== activeRuntimeRef.current || actionClient.runtimeUrl !== activeRuntimeUrlRef.current) return;
        acceptState(current);
      }
      if (!current || !actionClient) return;
      const isStart = current.status === 'idle' || current.status === 'failed' || current.status === 'complete';
      const step = current.nextStep;
      if (!isStart && (!step || !current.sessionId || current.status !== 'ready')) return;
      expectedRef.current = { revision: current.revision, snapshot: current.snapshot };
      setPending(true); setConnectionError(''); setNotice(isStart ? (hosted ? 'Preparing a fresh guided demo.' : 'Preparing a fresh local demo.') : `Submitting ${stepCopy(step)?.title ?? step}`);
      try {
        if (isStart && hostedLifecycle && (current.status === 'failed' || current.status === 'complete')) {
          restartScrollRef.current = true;
          await hostedLifecycle.reset();
          return;
        }
        if (isStart) {
          const assetId = current.status === 'idle' ? selectedAssetId : current.asset?.id ?? selectedAssetId;
          if (!assetId) { expectedRef.current = null; setPending(false); return; }
          if (current.status === 'complete') restartScrollRef.current = true;
          await actionClient.start({ runtimeId: current.runtimeId, expectedRevision: current.revision, assetId });
        }
        else await actionClient.runStep({ runtimeId: current.runtimeId, sessionId: current.sessionId!, expectedRevision: current.revision, step: step! });
        if (actionClient.hosted && (actionClient.expectedRuntimeId !== activeRuntimeRef.current || actionClient.runtimeUrl !== activeRuntimeUrlRef.current)) return;
        setNotice('Action accepted. Waiting for confirmed guided state.');
        const next = await actionClient.readState();
        acceptState(next);
      } catch (error) {
        if (actionClient.hosted && (actionClient.expectedRuntimeId !== activeRuntimeRef.current || actionClient.runtimeUrl !== activeRuntimeUrlRef.current)) return;
        const stale = error instanceof DemoHttpError && error.status === 409;
        setNotice(stale ? 'The runtime state changed before this action. Refreshed without repeating it.' : 'The action outcome was uncertain. Checking runtime state before allowing another action.');
        const next = await actionClient.readState().then((value) => { acceptState(value); return value; }, () => null);
        if (stale || (next && next.revision === current.revision)) {
          restartScrollRef.current = false;
          expectedRef.current = null; setPending(false);
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The guided sandbox is unavailable.');
      setPending(false);
    } finally { actionLockRef.current = false; }
  }, [acceptState, client, hostedLifecycle, pending, selectedAssetId]);

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
    const key = current?.sessionId ? `${current.runtimeId}:${current.sessionId}:${current.revision}` : null;
    if (!key || !client || receiptLoading || receiptKeyRef.current === key) return;
    receiptKeyRef.current = key; setReceiptLoading(true); setReceiptError('');
    try {
      const value = await client.readReceipt();
      const latest = stateRef.current;
      if (latest?.sessionId && `${latest.runtimeId}:${latest.sessionId}:${latest.revision}` === key && (!client.hosted || (latest.runtimeId === activeRuntimeRef.current && client.runtimeUrl === activeRuntimeUrlRef.current))) setReceipt(value);
    }
    catch (error) {
      if (receiptKeyRef.current === key && (!client.hosted || (current?.runtimeId === activeRuntimeRef.current && client.runtimeUrl === activeRuntimeUrlRef.current))) {
        setReceiptError(error instanceof Error ? error.message : 'Could not load the runtime receipt.');
        receiptKeyRef.current = null;
      }
    }
    finally { setReceiptLoading(false); }
  }, [client, receiptLoading]);

  useEffect(() => { if (evidenceOpen) void loadReceipt(); }, [evidenceOpen, loadReceipt, state?.revision]);

  const viewState = hostedLifecycle && (!client || state?.runtimeId !== client.expectedRuntimeId) ? null : state;
  const awaitingSandbox = hosted && !viewState;
  const snapshot = viewState?.snapshot ?? null;
  const activeActor = actorFor(viewState);
  const runtimeUnavailable = Boolean(connectionError);
  const coreDone = Boolean(viewState?.completedSteps.includes('core-recombine-rest'));
  const dividendDone = Boolean(viewState?.completedSteps.includes('dividend-recombine'));
  const activeChapter = stepCopy(viewState?.activeStep === 'setup' ? null : viewState?.activeStep ?? viewState?.nextStep ?? null)?.chapter ?? (dividendDone ? 3 : coreDone ? 2 : 1);
  const lastCompletedStep = viewState?.completedSteps.at(-1) ?? null;
  const lastResult = stepCopy(lastCompletedStep)?.chapter === activeChapter ? resultCopy(viewState) : null;
  const scrollTo = useCallback((id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' }), [reduceMotion]);


  return <MotionConfig reducedMotion="user"><div className="demo-shell">
    <a className="skip-link" href="#demo-main">Skip to demo</a>
    <header className="demo-header">
      <a className="demo-brand" href="/"><Mark /><span>DividendX</span></a>
      <nav aria-label="Primary"><a href="/app/">Public Devnet</a><a href="/demos/" aria-current="page">Guided Demos</a></nav>
      <span className={`runtime-status ${runtimeUnavailable ? 'unavailable' : viewState?.status ?? ''}`}><i />{hosted && !viewState ? hostedLifecycle?.session?.status === 'starting' ? 'Sandbox starting' : hostedLifecycle?.session?.status === 'expired' ? 'Sandbox expired' : 'Tour ready' : statusLabel(viewState, runtimeUnavailable)}</span>
    </header>
    <aside className="boundary-bar"><strong>{hosted ? 'Private sandbox' : 'Local tour'} · Demo assets · Fast-forwarded year</strong><details><summary>What this means</summary><ul><li>No real funds are involved in this demo.</li><li>Fast-forward through simulated quarterly dividends to explore a full year.</li></ul></details></aside>

    <main id="demo-main">
      <section className="demo-hero">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}><p className="demo-kicker">The DividendX guided tour</p><h1>One stock.<span>Two separate tokens.</span></h1><p>Follow this guided demo to understand how DividendX works.</p><button className="demo-primary hero-cta" type="button" onClick={() => { scrollTo('tour-core'); if (hostedLifecycle) void hostedLifecycle.ensureReady().catch(() => undefined); }}>Start guided tour <span aria-hidden="true">↓</span></button></motion.div>
        <motion.aside className="hero-explainer" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, delay: .08 }} aria-label="Tour overview"><p className="demo-kicker">The idea, in one view</p><div className="hero-stock"><span>TOKENIZED STOCK · {viewState?.asset?.company ?? 'Coca-Cola'} ({viewState?.asset ? assetLabel(viewState.asset).symbol : 'KOx'}) EXAMPLE</span><b>100</b></div><div className="hero-branch" aria-hidden="true"><i /><i /></div><div className="hero-claims"><div><span>PT</span><b>Stock exposure</b></div><div><span>DR</span><b>Dividend rights</b></div></div><h2>Learn how DividendX works</h2><p>DividendX separates a tokenized stock into stock exposure and dividend rights. You can put them back together or use the separate tokens in DeFi.</p></motion.aside>
      </section>

      {hostedLifecycle && <div className="guided-sandbox-status" data-testid="guided-sandbox-status" role="status">
        <span><b>Private test sandbox</b> · Separate synthetic network, disposable demo wallets and sample assets for up to 15 minutes.</span>
        <span>{hostedLifecycle.busy || hostedLifecycle.session?.status === 'starting' ? 'Starting your sandbox…' : hostedLifecycle.session?.status === 'ready' ? 'Sandbox ready.' : hostedLifecycle.session?.status === 'expired' ? 'This sandbox expired. Start fresh to continue.' : hostedLifecycle.checking ? 'Checking your previous session…' : 'Choose a company below or start the tour.'}</span>
        {hostedLifecycle.error && <span className="guided-sandbox-error" role="alert">{hostedLifecycle.error}</span>}
        {(hostedLifecycle.session?.status === 'expired' || hostedLifecycle.session?.status === 'failed') && <button type="button" disabled={hostedLifecycle.busy} onClick={() => { void hostedLifecycle.reset().then(() => scrollTo('tour-core')).catch(() => undefined); }}>Start a fresh guided demo</button>}
        {hostedLifecycle.error && hostedLifecycle.session?.status !== 'expired' && hostedLifecycle.session?.status !== 'failed' && <button type="button" disabled={hostedLifecycle.checking || hostedLifecycle.busy} onClick={() => { void hostedLifecycle.check().catch(() => undefined); }}>Check sandbox status</button>}
      </div>}
      {connectionError && <div className="connection-alert" role="alert"><b>{hosted ? 'Sandbox connection' : 'Local runtime connection'}</b><span>{connectionError} {viewState ? 'The last received snapshot may be stale.' : ''}</span></div>}
      <p className="sr-status" role="status" aria-live="polite">{notice}</p>

      <section id="tour-core" className="tour-chapter" aria-labelledby="core-heading">
        <div className="chapter-heading"><p className="demo-kicker">Part one · Split and recombine</p><h2 id="core-heading" tabIndex={-1}>From one stock to two rights. <span className="chapter-blue">And back.</span></h2></div>
        <div className="chapter-layout"><div className="chapter-story"><div className="chapter-number">01 <span>/ 03</span></div><h3>First, see the core move.</h3><ul className="core-points"><li>PT tracks the stock price side.</li><li>DR represents the dividend rights for the sample year.</li></ul><div className="claim-cards"><div className="claim-card pt"><span>PT</span><b>Principal token</b><small>Stock exposure</small></div><div className="claim-card dr"><span>DR</span><b>Dividend token</b><small>Dividend rights</small></div></div><p className="chapter-hint">A matching PT + DR pair can return stock before final settlement.</p></div>
        <div>{coreDone ? <div className="core-recap"><p className="demo-kicker">Part one result · {viewState?.asset ? assetLabel(viewState.asset).symbol : ''}</p><h3>100 stocks restored.</h3><p>The holder split the 100 stocks, then recombined 40 pairs and the remaining 60.</p><ol><li><span>01</span> Split 100 stocks <b>✓</b></li><li><span>02</span> Recombined 40 pairs <b>✓</b></li><li><span>03</span> Recombined 60 pairs <b>✓</b></li></ol></div> : <><CurrentAction state={viewState} awaitingSandbox={awaitingSandbox} unavailable={runtimeUnavailable} pending={pending} hosted={hosted} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} onAction={() => void action()} onReconnect={() => void reconnect()} lastResult={activeChapter === 1 ? lastResult : null} onSeeWallet={() => scrollTo('core-wallet')} wiggleStep={wiggleStep} reduceMotion={reduceMotion} /><Progress state={viewState} chapter={1} /></>}{snapshot && !coreDone && <div id="core-wallet" className="chapter-balances"><p className="demo-kicker">Stock holder wallet · {assetLabel(snapshot.asset).symbol}</p><WalletPanel role="provider" wallet={snapshot.provider} snapshot={snapshot} active={activeActor === 'provider'} changes={changes} coreOnly /><button type="button" className="return-to-action" onClick={() => scrollTo('current-tour-action')}>Return to next action ↑</button></div>}</div></div>
        {coreDone && <div className="chapter-complete"><span aria-hidden="true">✓</span><div><b>Part one complete.</b><p>Part One returned all 100 stocks to the holder wallet.</p></div><button type="button" data-testid="continue-to-dividends" onClick={() => scrollTo('tour-dividends')}>Continue to Part Two <span aria-hidden="true">→</span></button></div>}
      </section>

      <section id="tour-dividends" className={`tour-chapter dividend-chapter ${coreDone ? '' : 'chapter-locked'}`} aria-labelledby="dividend-heading">
        <div className="chapter-heading"><p className="demo-kicker">Part two · See dividends grow</p><h2 id="dividend-heading">Watch the dividend effect.</h2><p>Split the returned 100 stocks, advance two sample quarters, then recombine 40 pairs to see the allocation change.</p></div>
        {!coreDone ? <div className="chapter-preview"><span aria-hidden="true">↗</span><div><h3>Finish Part One to start the sample year.</h3><p>First return all 100 stocks to the holder wallet.</p></div></div> : <>
          <div className="chapter-layout"><div className="chapter-story"><div className="chapter-number">02 <span>/ 03</span></div><h3>Same number of rights. More stock per pair.</h3><p>Two sample quarterly dividends increase the stock allocation from 1 to 1.02 per matching PT + DR pair. The 100 DR do not become 102 DR. Recombining 40 pairs returns 40.8 stocks and leaves 60 PT plus 60 DR.</p><p className="chapter-hint">These are sample dividend amounts, not forecasts or actual issuer payments.</p></div>
          <div>{dividendDone ? <div className="core-recap"><p className="demo-kicker">Part two result · {viewState?.asset ? assetLabel(viewState.asset).symbol : ''}</p><h3>40 pairs became <span data-testid="dividend-result-stock">{viewState?.completedSteps.includes('create-pool') || !snapshot ? '40.8' : displayBalance(snapshot.provider.stockRaw, 'stockRaw', amountContext(snapshot))}</span> stocks.</h3><p>Two sample quarterly dividends changed the stock allocation. The remaining 60 PT and 60 DR carry into Part Three.</p><ol><li><span>01</span> Split 100 returned stocks <b>✓</b></li><li><span>02</span> Record two sample quarters <b>✓</b></li><li><span>03</span> Recombine 40 pairs <b>✓</b></li></ol></div> : <><CurrentAction state={viewState} awaitingSandbox={awaitingSandbox} unavailable={runtimeUnavailable} pending={pending} hosted={hosted} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} onAction={() => void action()} onReconnect={() => void reconnect()} lastResult={activeChapter === 2 ? lastResult : null} onSeeWallet={() => scrollTo('dividend-wallet')} wiggleStep={wiggleStep} reduceMotion={reduceMotion} /><Progress state={viewState} chapter={2} /></>}{snapshot && !dividendDone && <div id="dividend-wallet" className="chapter-balances"><p className="demo-kicker">Stock holder wallet · {assetLabel(snapshot.asset).symbol}</p><WalletPanel role="provider" wallet={snapshot.provider} snapshot={snapshot} active={activeActor === 'provider'} changes={changes} coreOnly /><button type="button" className="return-to-action" onClick={() => scrollTo('current-tour-action')}>Return to next action ↑</button></div>}</div></div>
          {dividendDone && <div className="chapter-complete"><span aria-hidden="true">✓</span><div><b>Part two complete.</b><p>Part Two left 60 DR for the pool chapter.</p></div><button type="button" data-testid="continue-to-defi" onClick={() => scrollTo('tour-defi')}>Continue to Part Three <span aria-hidden="true">→</span></button></div>}
        </>}
      </section>

      <section id="tour-defi" className={`tour-chapter defi-chapter ${dividendDone ? '' : 'chapter-locked'}`} aria-labelledby="defi-heading">
        <div className="chapter-heading"><p className="demo-kicker">Part three · Dividend rights in a pool</p><h2 id="defi-heading">Put the remaining rights to work.</h2><p>Use the 60 DR left from Part Two in a DR / USDC pool. Watch a buyer acquire DR, then follow both wallets through year end.</p></div>
        {!dividendDone ? <div className="chapter-preview"><span aria-hidden="true">↗</span><div><h3>Finish Part Two to unlock the pool.</h3><p>Recombine 40 pairs after two sample dividends, leaving 60 DR for this chapter.</p></div></div> : <>
          <div className="chapter-layout"><div className="chapter-story"><div className="chapter-number">03 <span>/ 03</span></div><h3>Two owners, different choices.</h3><p>The holder supplies 24 DR and 4 USDC, then up to 36 DR with 6 USDC. A buyer swaps USDC for DR. LP tokens represent the holder’s pool share; DR are the dividend rights. The buyer’s DR covers this year’s accrued and remaining dividends.</p><p className="chapter-hint">The annual deposit cutoff has passed. This chapter uses the 60 DR already created in Part Two.</p><div className="defi-stages"><span>Pool & trade</span><span>Withdraw & recombine</span><span>Fast-forward & redeem</span></div></div><div><CurrentAction state={viewState} awaitingSandbox={awaitingSandbox} unavailable={runtimeUnavailable} pending={pending} hosted={hosted} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} onAction={() => void action()} onReconnect={() => void reconnect()} lastResult={activeChapter === 3 ? lastResult : null} onSeeWallet={() => scrollTo('defi-wallet')} wiggleStep={wiggleStep} reduceMotion={reduceMotion} /><Progress state={viewState} chapter={3} /></div></div>
          <section id="defi-wallet" className="wallet-section" aria-labelledby="wallet-heading"><header><div><p className="demo-kicker">Two wallets</p><h2 id="wallet-heading">Two wallets, two owners.</h2></div><p>The demo manages both wallets. Their balances are separate from yours.</p></header><div className="wallet-grid"><WalletPanel role="provider" wallet={snapshot?.provider ?? null} snapshot={snapshot} active={activeActor === 'provider'} changes={changes} /><WalletPanel role="buyer" wallet={snapshot?.buyer ?? null} snapshot={snapshot} active={activeActor === 'buyer'} changes={changes} /></div><button type="button" className="return-to-action" onClick={() => scrollTo('current-tour-action')}>Return to next action ↑</button></section>
        </>}
      </section>

      {snapshot?.pool && viewState?.completedSteps.includes('remove-liquidity') && <aside className="pool-note"><div><p className="demo-kicker">Residual pool custody</p><h2>Raydium’s locked claims remain backed.</h2></div><p>The pool currently holds <b>{displayBalance(snapshot.pool.drRaw, 'drRaw', amountContext(snapshot))} DR</b> and <b>{displayBalance(snapshot.pool.lockedLpRaw, 'lpRaw', amountContext(snapshot))} locked LP</b>. Those DR claims are still part of supply and remain backed after both wallets finish.</p></aside>}

      <Evidence state={viewState} receipt={receipt} receiptError={receiptError} receiptLoading={receiptLoading} hosted={hosted} onOpen={setEvidenceOpen} />

      <section className="future-demos" aria-labelledby="future-heading">
        <div>
          <p className="demo-kicker">Future guided demos</p>
          <h2 id="future-heading">This is just the beginning.</h2>
          <p>More ways to use your PT and DR. These demos are planned. We’re focusing next on verified issuer data and dividend settlement.</p>
        </div>
        <div className="future-demo-list">
          <article><span>Planned · Streamflow</span><h3>Fixed-price dividend sale</h3><p>Offer your dividend rights at a price you choose.</p></article>
          <article><span>Planned · Jupiter Lock</span><h3>Token locks and vesting</h3><p>Give someone PT or DR tokens that unlock on a schedule.</p></article>
          <article><span>Planned · Squads</span><h3>Shared treasury</h3><p>Hold and manage PT or DR with shared approvals.</p></article>
          <article><span>Planned · Meteora</span><h3>Limit orders</h3><p>Set a target price for a future PT or DR trade.</p></article>
          <article><span>Planned · Jupiter</span><h3>Recurring purchases</h3><p>Buy stock exposure or dividend rights on a schedule.</p></article>
          <article><span>Planned · Combined flow</span><h3>Split and sell in one step</h3><p>Or buy the missing dividend rights to put your stock back together.</p></article>
          <article><span>Needs market groundwork</span><h3>Borrow against PT</h3><p>Requires valuation, liquidation rules and venue admission.</p></article>
        </div>
      </section>
    </main>
    <footer><Mark /><span>DividendX guided demo</span><a href="/app/">Return to the wallet app</a></footer>
  </div></MotionConfig>;
}
