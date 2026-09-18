import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PublicKey, type Connection } from '@solana/web3.js';
import { quoteRedemption } from '@dividendx/transaction-sdk';
import type { WalletAccount } from '@wallet-standard/base';
import { formatClaim, formatStock, parseRawAmount, parseStockAmount, shortAddress } from './amounts';
import { confirmedRuntimeSignatures, executeHolderAction, fetchWalletSeries } from './chain';
import { loadManifest, RUNTIME_CONFIG, RuntimeRequestError, runtimePost, verifyRuntimeIdentity } from './runtime';
import {
  compatibleAccount,
  connectWallet,
  createTemporaryWallet,
  discoverWallets,
  isCompatibleWallet,
  subscribeWalletRegistry,
  watchWallet,
} from './wallet-standard';
import type {
  CompatibleWallet,
  ConnectedWallet,
  LocalAssetManifest,
  LocalManifest,
  LocalSeriesManifest,
  UiReceipt,
  WalletSeriesSnapshot,
} from './types';

type Tab = 'market' | 'split' | 'redeem';
type RuntimeState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; manifest: LocalManifest; connection: Connection };

function Mark() { return <span className="p-mark" aria-hidden="true"><i /><b /></span>; }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'The action failed.'; }

function contextKey(manifest: LocalManifest | undefined, asset: LocalAssetManifest | undefined, series: LocalSeriesManifest | undefined, account: WalletAccount | undefined): string {
  return [manifest?.runtimeId, manifest?.genesisHash, manifest?.deploymentDomainHex, asset?.id, asset?.issuerIdHex, asset?.collateralMint, series?.year, series?.address, account?.address].filter(Boolean).join(':');
}

function PhaseBadge({ snapshot }: { snapshot: WalletSeriesSnapshot }) {
  const labels = { funding: 'Deposits open', collecting: 'Collecting dividends', matured_pending: 'Matured · awaiting finalization', redeemable: 'Ready to redeem', exception: 'Custody exception' };
  return <div className={`wallet-phase ${snapshot.eligibility.productPhase}`}><i /><span>{labels[snapshot.eligibility.productPhase]}</span></div>;
}

function eligibilityReason(reason: string): string {
  return ({
    custody_deficit: 'the vault needs attention',
    admission_disabled: 'new deposits are paused',
    observation_stale: 'the token review needs refreshing',
    observation_unverified_or_future: 'the token review is unavailable',
    series_journal_blocks_funding: 'this year already has dividend activity',
    mint_profile_changed_or_unverified: 'the stock token settings changed',
    not_mature: 'the year has not ended',
    journal_unresolved: 'dividend records are still open',
    source_coverage_not_attested: 'annual coverage is not finalized',
  } as Record<string, string>)[reason] ?? 'the series is unavailable';
}

function AmountField({ label, decimals, balance, disabled, submitLabel, onSubmit, parse, formatBalance, preview }: {
  label: string;
  decimals: number;
  balance?: bigint;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (raw: bigint) => Promise<void>;
  parse?: (value: string) => bigint;
  formatBalance?: (raw: bigint) => string;
  preview?: (raw: bigint) => ReactNode;
}) {
  const [value, setValue] = useState('');
  const [exactMax, setExactMax] = useState<bigint>();
  const [error, setError] = useState('');
  let previewRaw: bigint | undefined;
  try { if (value) previewRaw = exactMax ?? (parse ? parse(value) : parseRawAmount(value, decimals)); } catch { /* submit shows the validation error */ }
  const run = async () => {
    setError('');
    try { await onSubmit(exactMax ?? (parse ? parse(value) : parseRawAmount(value, decimals))); } catch (cause) { setError(message(cause)); }
  };
  return <div className="wallet-amount-field">
    <label><span>{label}</span><div><input value={value} inputMode="decimal" placeholder="0" disabled={disabled} onChange={(event) => { setValue(event.target.value); setExactMax(undefined); setError(''); }} /><b>tokens</b></div></label>
    {balance !== undefined && <div className="wallet-max"><span>Available · {formatBalance ? formatBalance(balance) : formatClaim(balance, decimals)}</span><button type="button" disabled={disabled || balance === 0n} onClick={() => { setValue(formatBalance ? formatBalance(balance) : formatClaim(balance, decimals, decimals)); setExactMax(balance); }}>Max</button></div>}
    {previewRaw !== undefined && preview && <p className="quote-line">{preview(previewRaw)}</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    <button className="p-primary" disabled={disabled || !value} onClick={run}>{submitLabel}<span>→</span></button>
  </div>;
}

function TransferCard({ side, snapshot, asset, disabled, onTransfer }: {
  side: 'pt' | 'dr'; snapshot: WalletSeriesSnapshot; asset: LocalAssetManifest; disabled: boolean;
  onTransfer: (side: 'pt' | 'dr', raw: bigint, recipient: PublicKey) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState('');
  const balance = side === 'pt' ? snapshot.ptRaw : snapshot.drRaw;
  return <article className="wallet-action-card compact"><div><p className="eyebrow">Wallet transfer · {side.toUpperCase()}</p><h3>Send these tokens to another wallet.</h3><p>This moves tokens between wallets. It is not a sale.</p></div>
    <label className="recipient"><span>Recipient wallet</span><input value={recipient} placeholder="Solana address" onChange={(event) => setRecipient(event.target.value.trim())} /></label>
    <AmountField label={`${side.toUpperCase()} amount`} decimals={asset.decimals} balance={balance} disabled={disabled || !recipient} submitLabel={`Transfer ${side.toUpperCase()}`} onSubmit={(raw) => onTransfer(side, raw, new PublicKey(recipient))} />
  </article>;
}

function RedemptionCard({ side, snapshot, asset, disabled, onRedeem }: {
  side: 'pt' | 'dr'; snapshot: WalletSeriesSnapshot; asset: LocalAssetManifest; disabled: boolean;
  onRedeem: (side: 'pt' | 'dr', raw: bigint, allowZero: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const balance = side === 'pt' ? snapshot.ptRaw : snapshot.drRaw;
  let raw = 0n;
  let output = 0n;
  try {
    if (value) {
      raw = parseRawAmount(value, asset.decimals);
      output = quoteRedemption(snapshot.quote.series, snapshot.quote.vaultRaw, side, raw, balance, true, snapshot.quote.clock.unixTimestamp, snapshot.quote.clock.unixTimestamp + 60n).collateralOutputRaw;
    }
  } catch { /* The submit path returns the precise validation error. */ }
  const zero = raw > 0n && output === 0n;
  const run = async () => {
    setError('');
    try { await onRedeem(side, parseRawAmount(value, asset.decimals), zero && consent); } catch (cause) { setError(message(cause)); }
  };
  return <article className="wallet-action-card"><p className="eyebrow">Independent redemption · {side.toUpperCase()}</p><h3>{side === 'pt' ? 'Stock exposure' : 'Dividend rights'}</h3>
    <label><span>Claim amount</span><div className="amount-input"><input value={value} inputMode="decimal" placeholder="0" disabled={disabled} onChange={(event) => { setValue(event.target.value); setConsent(false); setError(''); }} /><b>{side.toUpperCase()}</b></div></label>
    <div className="wallet-max"><span>Available · {formatClaim(balance, asset.decimals)}</span><button disabled={disabled || balance === 0n} onClick={() => { setValue(formatClaim(balance, asset.decimals, asset.decimals)); setConsent(false); }}>Max</button></div>
    <p className="quote-line">Current quote · <b>{formatStock(output, asset.decimals, snapshot.quote.mintProfile.scale.activeBits)} {asset.symbol}</b></p>
    {zero && <label className="zero-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />I understand this permanently burns these claims for zero stock tokens.</label>}
    {error && <p role="alert" className="field-error">{error}</p>}
    <button className="p-primary" disabled={disabled || raw <= 0n || (zero && !consent)} onClick={run}>{zero ? `Close zero-value ${side.toUpperCase()}` : `Redeem ${side.toUpperCase()}`}<span>→</span></button>
  </article>;
}

export function WalletApp() {
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: 'loading' });
  const [wallets, setWallets] = useState<CompatibleWallet[]>([]);
  const [connected, setConnected] = useState<ConnectedWallet>();
  const [tab, setTab] = useState<Tab>('market');
  const [assetId, setAssetId] = useState('');
  const [year, setYear] = useState<number>();
  const [snapshot, setSnapshot] = useState<WalletSeriesSnapshot>();
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<UiReceipt[]>([]);
  const [walletRevision, setWalletRevision] = useState(0);
  const activeKey = useRef('');
  const submitting = useRef(false);
  const bootGeneration = useRef(0);
  const readGeneration = useRef(0);
  const pendingRead = useRef<{ key: string; generation: number } | undefined>(undefined);
  const snapshotPresent = useRef(false);
  const network = RUNTIME_CONFIG.network;

  const manifest = runtime.kind === 'ready' ? runtime.manifest : undefined;
  const connection = runtime.kind === 'ready' ? runtime.connection : undefined;
  const asset = manifest?.assets.find((candidate) => candidate.id === assetId) ?? manifest?.assets[0];
  const series = asset?.series.find((candidate) => candidate.year === year) ?? asset?.series[0];
  const key = `${contextKey(manifest, asset, series, connected?.account)}:wallet-${walletRevision}`;
  activeKey.current = key;
  snapshotPresent.current = Boolean(snapshot);

  const boot = useCallback(async () => {
    const generation = ++bootGeneration.current;
    setRuntime({ kind: 'loading' }); setError('');
    try {
      const nextManifest = await loadManifest();
      const nextConnection = await verifyRuntimeIdentity(nextManifest);
      if (bootGeneration.current !== generation) return;
      setRuntime({ kind: 'ready', manifest: nextManifest, connection: nextConnection });
      setAssetId((current) => current || nextManifest.assets[0]!.id);
      setYear((current) => current ?? nextManifest.assets[0]!.series[0]?.year);
    } catch (cause) { if (bootGeneration.current === generation) setRuntime({ kind: 'error', message: message(cause) }); }
  }, []);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    const refresh = () => setWallets(discoverWallets(network));
    refresh();
    return subscribeWalletRegistry(refresh);
  }, [network]);
  useEffect(() => {
    if (!connected || connected.temporary) return;
    return watchWallet(connected.wallet, ({ accounts, chains, features }) => {
      activeKey.current = `${activeKey.current}:wallet-change`;
      setWalletRevision((value) => value + 1);
      if (chains || features) {
        setSnapshot(undefined);
        if (!isCompatibleWallet(connected.wallet, network)) {
          setConnected(undefined);
          setNotice('Wallet capabilities changed. Connect again to continue.');
          return;
        }
      }
      if (!accounts) return;
      const sameAddress = accounts.filter((candidate) => candidate.address === connected.account.address);
      const account = compatibleAccount(sameAddress, network) ?? compatibleAccount(accounts, network);
      if (!account) { setConnected(undefined); setNotice('Wallet disconnected or changed to an incompatible account.'); return; }
      setConnected({ ...connected, account });
    });
  }, [connected?.wallet, connected?.account.address, connected?.temporary, network]);

  const refreshSnapshot = useCallback(async (background = false) => {
    if (!manifest || !connection || !asset || !series) return;
    const requestedKey = `${contextKey(manifest, asset, series, connected?.account)}:wallet-${walletRevision}`;
    // A poll must not supersede a slower pending read and hide its eventual timeout.
    if (background && pendingRead.current?.key === requestedKey) return;
    const generation = ++readGeneration.current;
    pendingRead.current = { key: requestedKey, generation };
    if (!background) { setLoadingSnapshot(true); setError(''); }
    try {
      const owner = connected ? new PublicKey(connected.account.publicKey) : undefined;
      const next = await fetchWalletSeries(connection, manifest, asset, series, owner);
      if (activeKey.current === requestedKey && readGeneration.current === generation) { setSnapshot(next); setSnapshotStale(false); }
    } catch (cause) {
      if (activeKey.current === requestedKey && readGeneration.current === generation) {
        if (background && snapshotPresent.current) setSnapshotStale(true);
        else { setSnapshot(undefined); setSnapshotStale(false); setError(message(cause)); }
      }
    }
    finally {
      if (pendingRead.current?.generation === generation) pendingRead.current = undefined;
      if (activeKey.current === requestedKey && readGeneration.current === generation) setLoadingSnapshot(false);
    }
  }, [manifest, connection, asset, series, connected?.account.address, walletRevision]);
  useEffect(() => { setSnapshot(undefined); setSnapshotStale(false); void refreshSnapshot(); }, [refreshSnapshot]);
  useEffect(() => {
    if (!manifest || !asset || !series) return;
    const updateVisible = () => { if (document.visibilityState === 'visible') void refreshSnapshot(true); };
    window.addEventListener('focus', updateVisible);
    const interval = window.setInterval(updateVisible, 9_000);
    return () => { window.removeEventListener('focus', updateVisible); window.clearInterval(interval); };
  }, [manifest, asset, series, connected?.account.address, refreshSnapshot]);

  const chooseAsset = (id: string) => {
    const next = manifest?.assets.find((candidate) => candidate.id === id);
    if (!next || (asset?.id === id && series?.year === next.series[0]?.year)) return;
    setAssetId(id); setYear(next?.series[0]?.year); setSnapshot(undefined); setNotice(''); setError('');
  };
  const connect = async (wallet: CompatibleWallet, temporary = false) => {
    setError('');
    try { const account = await connectWallet(wallet, network); setConnected({ wallet, account, temporary }); setNotice(`${wallet.name} connected for ${network === 'devnet' ? 'Solana devnet' : 'local'} signing.`); }
    catch (cause) { setError(message(cause)); }
  };
  const addReceipt = (label: string, receipt: { signature: string; slot: number; confirmationStatus: string }) => {
    setReceipts((current) => [{ label, signature: receipt.signature, slot: receipt.slot, status: receipt.confirmationStatus }, ...current].slice(0, 8));
  };

  const runAction = async (action: Parameters<typeof executeHolderAction>[0]['action'], raw: bigint, options: { allowZero?: boolean; recipient?: PublicKey } = {}) => {
    if (submitting.current) throw new Error('Another transaction is already in progress.');
    if (!manifest || !asset || !series || !connected) throw new Error('Connect a wallet and choose a verified annual series.');
    const captured = key;
    submitting.current = true; setBusy(true); setError(''); setNotice('Waiting for wallet signature…');
    try {
      const receipt = await executeHolderAction({ action, manifest, asset, series, connected, amountRaw: raw, ...options, isCurrent: () => activeKey.current === captured });
      if (activeKey.current !== captured) return;
      addReceipt(action, receipt); setNotice(`Confirmed in slot ${receipt.slot}.`);
      await refreshSnapshot();
    } catch (cause) { if (activeKey.current === captured) { setError(message(cause)); setNotice(''); } throw cause; }
    finally { submitting.current = false; setBusy(false); }
  };

  const faucet = async () => {
    if (submitting.current || !manifest || !asset || !connected) return;
    const captured = key; submitting.current = true; setBusy(true); setError(''); setNotice(`Requesting bounded ${network === 'devnet' ? 'devnet' : 'local'} test assets…`);
    let verified: Connection | undefined;
    try {
      verified = await verifyRuntimeIdentity(manifest);
      const result = await runtimePost<{ signatures: string[] }>(manifest, '/faucet', { owner: connected.account.address, assetId: asset.id });
      const confirmed = await confirmedRuntimeSignatures(verified, result.signatures);
      if (activeKey.current !== captured) return;
      confirmed.forEach((receipt) => addReceipt('test faucet', receipt));
      setNotice(`${confirmed.length} ${network === 'devnet' ? 'devnet' : 'local'} faucet transaction${confirmed.length === 1 ? '' : 's'} confirmed.`);
      await refreshSnapshot();
    } catch (cause) {
      if (activeKey.current === captured) {
        const partial = cause instanceof RuntimeRequestError ? cause.result as { signatures?: string[] } | undefined : undefined;
        if (verified && partial?.signatures?.length) {
          try {
            const confirmed = await confirmedRuntimeSignatures(verified, partial.signatures);
            confirmed.forEach((receipt) => addReceipt('partial test faucet', receipt));
            setNotice(`${confirmed.length} faucet transaction${confirmed.length === 1 ? '' : 's'} confirmed before the runtime stopped.`);
          } catch { setNotice(''); }
        } else setNotice('');
        setError(message(cause));
      }
    }
    finally { submitting.current = false; setBusy(false); }
  };

  const advance = async (step: string) => {
    if (submitting.current || !manifest || !asset) return;
    const captured = key; submitting.current = true; setBusy(true); setError(''); setNotice('Applying a network-wide test date step…');
    let verified: Connection | undefined;
    try {
      verified = await verifyRuntimeIdentity(manifest);
      const result = await runtimePost<{ signatures: string[]; message: string }>(manifest, '/advance', { step, assetId: asset.id });
      const confirmed = await confirmedRuntimeSignatures(verified, result.signatures);
      if (activeKey.current !== captured) return;
      confirmed.forEach((receipt) => addReceipt(`date control: ${step}`, receipt)); setNotice(result.message);
      await refreshSnapshot();
    } catch (cause) {
      if (activeKey.current === captured) {
        const partial = cause instanceof RuntimeRequestError ? cause.result as { signatures?: string[]; message?: string; partial?: boolean } | undefined : undefined;
        if (verified && partial?.signatures?.length) {
          try {
            const confirmed = await confirmedRuntimeSignatures(verified, partial.signatures);
            confirmed.forEach((receipt) => addReceipt(`partial date control: ${step}`, receipt));
            setNotice(`${confirmed.length} step transaction${confirmed.length === 1 ? '' : 's'} confirmed before the runtime stopped.`);
          } catch { setNotice(''); }
        } else setNotice('');
        setError(message(cause));
      }
    }
    finally { submitting.current = false; setBusy(false); }
  };

  if (runtime.kind === 'loading') return <main className="wallet-gate"><Mark /><h1>Connecting to the {network === 'devnet' ? 'Solana devnet service' : 'local runtime'}…</h1><p>Verifying genesis, program and deployment identity.</p></main>;
  if (runtime.kind === 'error') return <main className="wallet-gate" data-testid="runtime-error"><Mark /><p className="eyebrow">Runtime unavailable</p><h1>The {network === 'devnet' ? 'devnet service' : 'local runtime'} could not be verified.</h1><p>{network === 'devnet' ? 'DividendX could not reach or verify the required public test service. Retry checks the same configured service again.' : 'DividendX could not reach or verify the required localhost service. Retry checks it again; it does not start the service.'}</p><div className="wallet-runtime-error"><b>Runtime check failed</b><p>{runtime.message}</p></div>{network === 'local' && <><p>From the project root, start the runtime and wait until it reports ready:</p><code className="wallet-runtime-command">npm --prefix packages/local-runtime start</code></>}<div className="wallet-gate-actions"><button className="p-primary" onClick={boot}>Retry {network === 'devnet' ? 'devnet service' : 'localhost runtime'}</button><a href="/demos/">Open guided demos</a><a href="/">Return to annual reference</a></div></main>;

  const verifiedManifest = runtime.manifest;
  const activeBits = snapshot?.quote.mintProfile.scale.activeBits;
  const holder = connected?.account.address;
  const devnet = verifiedManifest.kind === 'devnet';
  const runtimeLabel = devnet ? 'Solana devnet' : verifiedManifest.kind === 'surfnet' ? 'Local SBF sandbox' : 'Local validator';
  const faucetEnabled = devnet ? verifiedManifest.faucetEnabled === true : verifiedManifest.faucetEnabled !== false;
  const seriesName = asset && series ? `${asset.symbol} · ${series.year}` : 'No series';

  return <><a className="p-skip" href="#wallet-main">Skip to content</a>
    <header className="p-header wallet-header"><a className="p-brand" href="/"><Mark />DividendX</a><nav aria-label="Primary">{(['market', 'split', 'redeem'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</nav><span className="balance-label">{holder ? shortAddress(holder) : 'Wallet disconnected'}</span></header>
    <div className="preview-banner wallet-banner"><b>{devnet ? 'Public devnet · test assets' : 'Local demo · test tokens'}</b><span>{devnet ? 'Deposits close 1 Jan 2027 and maturity is 1 Jan 2028. Public time cannot be advanced; no qualified issuer payouts are available.' : `Real program transactions in a local Solana sandbox. Date controls are ${verifiedManifest.clockControl ? 'available' : 'unavailable'}.`}</span><a href="/demos/">Guided demos →</a><a href="/">Open annual reference →</a></div>
    <main id="wallet-main" className="p-page wallet-page">
      <section className="wallet-network" aria-label="Verified runtime"><div><span className="online-dot" />Verified {runtimeLabel}</div><span>{devnet ? 'Test assets on public Solana devnet' : 'Connected to the local demo network'}</span></section>

      <section className="wallet-connect"><div><p className="eyebrow">Wallet</p><h2>{connected ? connected.wallet.name : 'Connect your wallet or create a test wallet.'}</h2>{connected ? <p><code>{connected.account.address}</code>{connected.temporary && ' · reload loses this disposable key'}</p> : <p>Use a wallet to try the {devnet ? 'public devnet' : 'local'} flow. The temporary wallet exists only in this browser tab.</p>}</div><div className="wallet-buttons">{connected ? <button onClick={() => { setConnected(undefined); setNotice('Wallet disconnected.'); }}>Disconnect</button> : <>{wallets.map((wallet) => <button key={wallet.name} onClick={() => void connect(wallet)}>{wallet.name}</button>)}<button data-testid="temporary-wallet" onClick={() => void connect(createTemporaryWallet(network), true)}>Create temporary test wallet</button>{wallets.length === 0 && <small>No compatible {devnet ? 'devnet ' : ''}installed wallet found.</small>}</>}</div></section>

      {notice && <div className="p-success" role="status">{notice}</div>}
      {error && <div className="p-error" role="alert">{error}</div>}
      {snapshotStale && <div className="p-error" role="status" data-testid="stale-balances">Balances may be out of date because the {devnet ? 'devnet' : 'local'} RPC stopped responding. Refresh before continuing.</div>}

      <section className="wallet-selector"><label><span>Exact {devnet ? 'devnet' : 'local'} stock token</span><select value={asset?.id ?? ''} onChange={(event) => chooseAsset(event.target.value)}>{verifiedManifest.assets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.company} · {candidate.symbol} · {candidate.issuerLabel}</option>)}</select></label><label><span>Annual series</span><select value={series?.year ?? ''} onChange={(event) => setYear(Number(event.target.value))}>{asset?.series.map((candidate) => <option key={candidate.year} value={candidate.year}>{candidate.year}</option>)}</select></label><div className="wallet-selector-actions"><button disabled={loadingSnapshot} onClick={() => void refreshSnapshot()}>Refresh balances</button>{faucetEnabled ? <button disabled={busy || !holder} onClick={faucet}>Request test SOL + {asset?.symbol}</button> : <small>Test faucet unavailable for this deployment.</small>}</div></section>

      {loadingSnapshot && <p className="wallet-loading">Updating your balances…</p>}
      {snapshot && asset && series && <>
        <section className="wallet-position"><div><p className="eyebrow">Verified annual series</p><h1>{asset.company}<span>{series.year}</span></h1><p>{asset.symbol} · {asset.issuerLabel} · {asset.decimals} decimals</p><PhaseBadge snapshot={snapshot} /></div><div className="wallet-balances"><div><span>Stock token</span><b>{formatStock(snapshot.collateralRaw, asset.decimals, activeBits!)}</b><small>{asset.symbol}</small></div><div><span>Stock exposure</span><b>{formatClaim(snapshot.ptRaw, asset.decimals)}</b><small>PT-{asset.symbol}-{series.year}</small></div><div><span>Dividend rights</span><b>{formatClaim(snapshot.drRaw, asset.decimals)}</b><small>DR-{asset.symbol}-{series.year}</small></div></div></section>

        {tab === 'market' && <section className="wallet-market"><div><p className="eyebrow">Market</p><h2>Choose a company and its exact stock token.</h2><p>Each token shows its test issuer profile and decimals.</p></div><div className="wallet-company-list">{Array.from(new Set(verifiedManifest.assets.map((candidate) => candidate.company))).map((company) => <article key={company}><h3>{company}</h3><div className="wallet-market-grid">{verifiedManifest.assets.filter((candidate) => candidate.company === company).map((candidate) => <button className={candidate.id === asset.id ? 'active' : ''} key={candidate.id} onClick={() => { chooseAsset(candidate.id); setTab('split'); }}><b>{candidate.symbol}</b><small>{candidate.issuerLabel} · {candidate.decimals} decimals</small></button>)}</div></article>)}</div><div className="venue-unavailable"><b>AMM trading unavailable in this app</b><span>No venue or cash price is connected here. The guided route is a separate test flow.</span></div></section>}

        {tab === 'split' && <section className="wallet-actions"><article className="wallet-action-card hero"><div><p className="eyebrow">Split</p><h2>One stock. Two annual tokens.</h2><p>Deposit stock tokens and get two assets: stock exposure and this year's dividend rights.</p></div><div><AmountField key={`deposit-${key}`} label={`Deposit ${asset.symbol}`} decimals={asset.decimals} balance={snapshot.collateralRaw} parse={(value) => parseStockAmount(value, asset.decimals, activeBits!)} formatBalance={(raw) => formatStock(raw, asset.decimals, activeBits!, 12)} preview={(raw) => <>You receive · <b>{formatClaim(raw, asset.decimals)} PT + {formatClaim(raw, asset.decimals)} DR</b></>} disabled={!connected || busy || snapshotStale || !snapshot.eligibility.depositsOpen} submitLabel={`Split into PT + DR`} onSubmit={(raw) => runAction('deposit', raw)} />{!snapshot.eligibility.depositsOpen && <p className="blocked-reason">Deposits unavailable because {snapshot.eligibility.reasons.map(eligibilityReason).join(', ') || 'annual funding is closed'}.</p>}</div></article></section>}

        {tab === 'redeem' && <section className="wallet-actions"><div className="redeem-intro"><p className="eyebrow">Redeem</p><h2>{snapshot.quote.series.phase === 'finalized' ? 'Redeem either token on its own.' : 'Combine matching tokens to get your stock back.'}</h2><p>After the year is finalized, stock exposure and dividend rights redeem separately.</p></div>{snapshot.quote.series.phase !== 'finalized' ? <article className="wallet-action-card"><p className="eyebrow">Paired recombination</p><h3>Get your stock token back</h3><p>Use the same amount of PT and DR.</p><AmountField key={`recombine-${key}`} label="Matching pair amount" decimals={asset.decimals} balance={snapshot.ptRaw < snapshot.drRaw ? snapshot.ptRaw : snapshot.drRaw} preview={(raw) => <>You receive · <b>{formatStock(raw, asset.decimals, activeBits!)} {asset.symbol}</b></>} disabled={!connected || busy || snapshotStale} submitLabel="Combine & return stock" onSubmit={(raw) => runAction('recombine', raw)} /></article> : <div className="redemption-grid"><RedemptionCard key={`pt-${key}`} side="pt" snapshot={snapshot} asset={asset} disabled={!connected || busy || snapshotStale} onRedeem={(side, raw, allowZero) => runAction(`redeem-${side}`, raw, { allowZero })} /><RedemptionCard key={`dr-${key}`} side="dr" snapshot={snapshot} asset={asset} disabled={!connected || busy || snapshotStale} onRedeem={(side, raw, allowZero) => runAction(`redeem-${side}`, raw, { allowZero })} /></div>}<div className="transfer-grid"><TransferCard key={`transfer-pt-${key}`} side="pt" snapshot={snapshot} asset={asset} disabled={!connected || busy || snapshotStale} onTransfer={(side, raw, recipient) => runAction(`transfer-${side}`, raw, { recipient })} /><TransferCard key={`transfer-dr-${key}`} side="dr" snapshot={snapshot} asset={asset} disabled={!connected || busy || snapshotStale} onTransfer={(side, raw, recipient) => runAction(`transfer-${side}`, raw, { recipient })} /></div></section>}

        <details className="wallet-details"><summary>Verified account details</summary><dl><div><dt>Program</dt><dd>{verifiedManifest.programId}</dd></div><div><dt>Genesis</dt><dd>{verifiedManifest.genesisHash}</dd></div><div><dt>Runtime</dt><dd>{verifiedManifest.runtimeId}</dd></div><div><dt>Deployment domain</dt><dd>{verifiedManifest.deploymentDomainHex}</dd></div><div><dt>Collateral mint</dt><dd>{asset.collateralMint}</dd></div><div><dt>Series</dt><dd>{series.address}</dd></div><div><dt>PT mint</dt><dd>{series.ptMint}</dd></div><div><dt>DR mint</dt><dd>{series.drMint}</dd></div><div><dt>RPC context slot</dt><dd>{snapshot.quote.contextSlot}</dd></div><div><dt>Chain time</dt><dd>{snapshot.quote.clock.unixTimestamp.toString()}</dd></div></dl></details>
      </>}

      {!devnet && <details className="clock-controls"><summary>Network-wide test dates</summary><div className="clock-layout"><div><p className="eyebrow">Controlled annual lifecycle</p><h2>Annual lifecycle controls</h2>{verifiedManifest.clockControl ? <p>These steps change the shared local network and submit real program transactions.</p> : <p>Faithful clock control is unavailable in this runtime. Finalized claims may be inspected only when already present onchain.</p>}</div><div>{['start-year', 'record-dividends', 'end-year', 'finalize'].map((step) => <button key={step} disabled={!verifiedManifest.clockControl || busy} onClick={() => void advance(step)}>{step.replace('-', ' ')}</button>)}</div></div></details>}

      {receipts.length > 0 && <section className="wallet-receipts"><p className="eyebrow">Confirmed receipts</p>{receipts.map((receipt) => <article key={`${receipt.signature}-${receipt.label}`}><div><b>{receipt.label}</b><span>Slot {receipt.slot} · {receipt.status}</span></div>{devnet ? <a href={`https://explorer.solana.com/tx/${encodeURIComponent(receipt.signature)}?cluster=devnet`} target="_blank" rel="noreferrer"><code>{receipt.signature}</code><span className="sr-only"> Open in Solana Explorer</span></a> : <code>{receipt.signature}</code>}</article>)}</section>}
    </main><footer className="p-footer wallet-footer"><div><Mark /><span>DividendX {devnet ? 'devnet' : 'local'} transaction application · {seriesName}</span></div><a href="/rehearsal/">Historical rehearsal</a></footer>
  </>;
}
