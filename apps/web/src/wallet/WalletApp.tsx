import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { PublicKey, type Connection } from '@solana/web3.js';
import { quoteRedemption } from '@dividendx/transaction-sdk';
import type { WalletAccount } from '@wallet-standard/base';
import { formatClaim, formatStock, parseRawAmount, parseStockAmount, shortAddress } from './amounts';
import { walletMarketCatalog } from './catalog';
import { fetchWalletInventory, type WalletInventory } from './inventory';
import { confirmedRuntimeSignatures, executeHolderAction, fetchWalletSeries, waitForRuntimeSignatures } from './chain';
import { loadManifest, RUNTIME_CONFIG, RuntimeRequestError, runtimePost, type RuntimeConfig, verifyRuntimeIdentity } from './runtime';
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
import { BrandLogo } from '../BrandLogo';

type Tab = 'market' | 'split' | 'redeem';
type RuntimeState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; manifest: LocalManifest; connection: Connection };

function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'The action failed.'; }
function presentedSymbol(symbol: string): string { return symbol.replace(/^Test(?=[A-Z])/, ''); }
function presentedIssuer(label: string): string { return label.replace(/\s+test profile$/i, ''); }
const walletDownloads = [
  { name: 'Phantom', url: 'https://phantom.com/download', initial: 'P' },
  { name: 'Solflare', url: 'https://www.solflare.com/download/', initial: 'S' },
  { name: 'Backpack', url: 'https://backpack.app/download', initial: 'B' },
] as const;
const issuerOrder: Record<string, number> = { Ondo: 0, 'Backpack/Trek': 1, xStocks: 2 };
function CompanyDot({ company }: { company: string }) {
  const style = ({ 'Coca-Cola': 'coca-cola', Apple: 'apple', Microsoft: 'microsoft', Micron: 'micron', Nike: 'nike', IBM: 'ibm' } as Record<string, string>)[company] ?? 'other';
  return <span className={`wallet-company-dot ${style}`} aria-hidden="true" />;
}
function LegacyStockSplitDiagram() {
  return <div className="wallet-hero-visual" aria-hidden="true"><span className="wallet-hero-stock">STOCK</span><span className="wallet-hero-fork">↗<br />↘</span><span className="wallet-hero-claims"><b>PT <small>stock exposure</small></b><b>DR <small>dividend rights</small></b></span></div>;
}
function StockSplitHeroArt() {
  if (new URLSearchParams(window.location.search).get('usehero') === 'diagram') return <LegacyStockSplitDiagram />;
  return <figure className="wallet-hero-art"><img src="/illustrations/stock-dividend-separation-v2.webp" width="960" height="640" alt="A stock certificate separates into a blue PT certificate and an amber dividend claim" /><figcaption><span>PT · stock exposure</span><span>DR · annual dividend rights</span></figcaption></figure>;
}
function QuotePending({ error }: { error: boolean }) {
  return <div className="wallet-quote-pending" data-testid="quote-checking" role="status">{error ? 'This quote could not be checked. Refresh balances to try again.' : 'Checking this annual series before actions are available…'}</div>;
}
function AccountValue({ address, label, devnet }: { address: string; label: string; devnet: boolean }) {
  const code = <code>{address}</code>;
  return devnet ? <a href={`https://solscan.io/account/${encodeURIComponent(address)}?cluster=devnet`} target="_blank" rel="noopener noreferrer" aria-label={`View ${label} on Solscan`}>{code}<span className="sr-only"> (opens in a new tab)</span></a> : code;
}

function WalletChoices({ wallets, connected, sandbox, devnet, connectingWallet, onConnect, onTemporary, onDisconnect }: {
  wallets: CompatibleWallet[];
  connected: ConnectedWallet | undefined;
  sandbox: boolean;
  devnet: boolean;
  connectingWallet: string;
  onConnect: (wallet: CompatibleWallet) => void;
  onTemporary: () => void;
  onDisconnect: () => void;
}) {
  return connected ? <div className="wallet-choice-body"><p><b>{connected.wallet.name}</b></p><p className="wallet-connected-address"><AccountValue address={connected.account.address} label="wallet address" devnet={devnet} /></p>
    {connected.temporary && <p>Your temporary wallet exists only in this tab. Reloading loses its key.</p>}
    <button type="button" onClick={onDisconnect}>Disconnect wallet</button></div>
    : <div className="wallet-choice-body"><p>Choose a wallet to use with this {devnet ? 'Solana Devnet' : sandbox ? 'private sandbox' : 'local network'}.</p>
      {!sandbox && <><h3>Available wallets</h3><div className="wallet-choice-list">{wallets.map((wallet) => <button type="button" key={wallet.name} disabled={Boolean(connectingWallet)} onClick={() => onConnect(wallet)}><img src={wallet.icon} alt="" aria-hidden="true" /><span>{connectingWallet === wallet.name ? `Connecting ${wallet.name}…` : wallet.name}</span><span aria-hidden="true">→</span></button>)}{wallets.length === 0 && <p>No compatible wallet extension detected.</p>}</div>
        {walletDownloads.some((entry) => !wallets.some((wallet) => wallet.name.toLowerCase().includes(entry.name.toLowerCase()))) && <><h3>Get a wallet</h3><div className="wallet-choice-list">{walletDownloads.filter((entry) => !wallets.some((wallet) => wallet.name.toLowerCase().includes(entry.name.toLowerCase()))).map((entry) => <a key={entry.name} href={entry.url} target="_blank" rel="noopener noreferrer"><span className={`wallet-install-icon ${entry.name.toLowerCase()}`}>{entry.initial}</span><span>Install {entry.name}</span><span aria-hidden="true">↗</span></a>)}</div></>}
      </>}
      <h3>Quick test</h3><div className="wallet-choice-list"><button type="button" data-testid="temporary-wallet" disabled={Boolean(connectingWallet)} onClick={onTemporary}><span className="wallet-install-icon temporary">D</span><span>{connectingWallet === 'Temporary wallet' ? 'Creating temporary wallet…' : 'Create temporary wallet'}</span><span aria-hidden="true">→</span></button></div>
      <small>Temporary wallet keys exist only in this tab and disappear on reload.</small>
    </div>;
}

function contextKey(manifest: LocalManifest | undefined, asset: LocalAssetManifest | undefined, series: LocalSeriesManifest | undefined, account: WalletAccount | undefined): string {
  return [manifest?.runtimeId, manifest?.genesisHash, manifest?.deploymentDomainHex, manifest?.programId,
    asset?.id, asset?.issuerIdHex, asset?.assetPolicy, asset?.collateralMint,
    series?.year, series?.address, series?.ptMint, series?.drMint, series?.vault, account?.address].filter(Boolean).join(':');
}

function PhaseBadge({ snapshot }: { snapshot: WalletSeriesSnapshot }) {
  const labels = { funding: 'Deposits open', collecting: 'Collecting dividends', matured_pending: 'Matured · awaiting finalization', redeemable: 'Ready to redeem', exception: 'Custody exception' };
  return <div className={`wallet-phase ${snapshot.eligibility.productPhase}`}><i /><span>{labels[snapshot.eligibility.productPhase]}</span></div>;
}

function InventoryChoices({ tab, connected, inventory, loading, error, devnet, selectedAssetId, selectedYear, onChoose, onFaucet, onConnect, busy, faucetEnabled }: {
  tab: 'split' | 'redeem'; connected: boolean; inventory?: WalletInventory; loading: boolean; error: string; devnet: boolean;
  selectedAssetId: string; selectedYear?: number; onChoose: (assetId: string, year?: number) => void;
  onFaucet: () => void; onConnect: (event: MouseEvent<HTMLButtonElement>) => void;
  busy: boolean; faucetEnabled: boolean;
}) {
  if (connected && !inventory && !error) return <section className="wallet-holdings" data-testid={`${tab}-holdings`}><p>Checking your wallet holdings…</p></section>;
  if (error && !inventory) return <section className="wallet-holdings" data-testid={`${tab}-holdings`}><p role="alert">Wallet holdings could not be checked: {error}</p></section>;
  if (!inventory) return <section className="wallet-empty" data-testid="empty-inventory"><h2>Connect a wallet to continue.</h2><p>Your supported holdings will appear here.</p><button type="button" className="p-primary" data-testid="connect-to-continue" onClick={onConnect}>Connect wallet <span>→</span></button></section>;
  const holdings = tab === 'split'
    ? inventory.assets.filter((asset) => asset.collateralRaw > 0n).map((asset) => ({ asset, year: asset.assetId === selectedAssetId ? selectedYear : asset.series[0]?.year, amount: asset.stockDisplayAmount, token: presentedSymbol(asset.symbol) }))
    : inventory.assets.flatMap((asset) => asset.series.filter((series) => series.ptRaw > 0n || series.drRaw > 0n).map((series) => ({ asset, year: series.year, amount: `${formatClaim(series.ptRaw, asset.decimals)} PT · ${formatClaim(series.drRaw, asset.decimals)} DR`, token: `${presentedSymbol(asset.symbol)} · ${series.year}` })));
  return <section className="wallet-holdings" data-testid={`${tab}-holdings`}><div><p className="eyebrow">Your wallet</p><h2>{tab === 'split' ? 'Stock tokens you can split' : 'Annual tokens you can redeem'}</h2>{loading && <small>Refreshing holdings…</small>}{error && <p role="alert">Wallet holdings could not be refreshed: {error}</p>}</div>
    {holdings.length ? <div className="wallet-holding-list">{holdings.map(({ asset, year, amount, token }) => <button type="button" key={`${asset.assetId}-${year}`} className={selectedAssetId === asset.assetId && selectedYear === year ? 'active' : ''} aria-pressed={selectedAssetId === asset.assetId && selectedYear === year} onClick={() => onChoose(asset.assetId, year)}><CompanyDot company={asset.company} /><span><b>{asset.company}</b><small>{token} · {presentedIssuer(asset.issuerLabel)}</small></span><strong>{amount}</strong></button>)}</div>
      : <div className="wallet-empty" data-testid="empty-inventory"><h3>{tab === 'split' ? 'No supported stock tokens yet.' : 'No PT or DR tokens yet.'}</h3><p>{tab === 'split' ? `Choose a stock above and request ${devnet ? 'synthetic Devnet' : 'test'} tokens to try Split.` : 'Request stock tokens and split them first to get PT and DR.'}</p>{faucetEnabled && <button type="button" data-testid="empty-inventory-faucet" disabled={busy} onClick={onFaucet}>Request stock tokens <span>→</span></button>}</div>}
  </section>;
}

function PositionBalances({ snapshot, inventory, asset, series }: { snapshot?: WalletSeriesSnapshot; inventory?: WalletInventory['assets'][number]; asset: LocalAssetManifest; series: LocalSeriesManifest }) {
  const symbol = presentedSymbol(asset.symbol);
  const heldSeries = inventory?.series.find((candidate) => candidate.year === series.year);
  if (!snapshot && !inventory) return <p className="wallet-balance-pending">Checking this series…</p>;
  return <div className="wallet-balances"><div><span>Stock token</span><b>{inventory?.stockDisplayAmount ?? formatStock(snapshot!.collateralRaw, asset.decimals, snapshot!.quote.mintProfile.scale.activeBits)}</b><small>{symbol}</small></div><div><span>Stock exposure</span><b>{formatClaim(heldSeries?.ptRaw ?? snapshot?.ptRaw ?? 0n, asset.decimals)}</b><small>PT-{symbol}-{series.year}</small></div><div><span>Dividend rights</span><b>{formatClaim(heldSeries?.drRaw ?? snapshot?.drRaw ?? 0n, asset.decimals)}</b><small>DR-{symbol}-{series.year}</small></div></div>;
}

function HomeBalanceBox({ label, value, unit, testId }: { label: string; value: string; unit: string; testId: string }) {
  return <div className="wallet-home-balance-box" data-testid={testId}><span>{label}</span><b>{value}</b><small>{unit}</small></div>;
}

function MarketHoldingActions({ stockHeld, claimsHeld, assetId, year, onSelect }: {
  stockHeld: boolean; claimsHeld: boolean; assetId: string; year: number;
  onSelect: (tab: 'split' | 'redeem', assetId: string, year: number) => void;
}) {
  return <div className="wallet-market-series-actions">
    {stockHeld && <button type="button" data-testid="market-holding-split" onClick={() => onSelect('split', assetId, year)}>Split {year}<span aria-hidden="true">→</span></button>}
    {claimsHeld && <button type="button" data-testid="market-holding-redeem" onClick={() => onSelect('redeem', assetId, year)}>Redeem {year}<span aria-hidden="true">→</span></button>}
  </div>;
}

function MarketBalances({ inventory, loading, error, onRetry, onSelect }: {
  inventory?: WalletInventory; loading: boolean; error: string; onRetry: () => void;
  onSelect: (tab: 'split' | 'redeem', assetId: string, year: number) => void;
}) {
  if (!inventory) return loading || error ? <div className="wallet-market-inventory-status" data-testid="market-inventory-status" role="status">
    <span>{error ? `Wallet balances could not be checked: ${error}` : 'Checking your wallet balances…'}</span>
    {error && <button type="button" onClick={onRetry}>Retry balances</button>}
  </div> : null;
  const owned = inventory.assets.filter((asset) => asset.collateralRaw > 0n || asset.series.some((series) => series.ptRaw > 0n || series.drRaw > 0n));
  if (owned.length === 0) return loading || error ? <div className="wallet-market-inventory-status" data-testid="market-inventory-status" role="status">
    <span>{error ? `Wallet balances could not be refreshed: ${error}` : 'Refreshing your wallet balances…'}</span>
    {error && <button type="button" onClick={onRetry}>Retry balances</button>}
  </div> : null;
  return <section className="wallet-market-balances" data-testid="market-balances" aria-labelledby="market-balances-title">
    <div className="wallet-market-balances-heading"><div><p className="eyebrow">Your wallet</p><h2 id="market-balances-title">Your balances</h2></div>{loading && <small>Refreshing balances…</small>}</div>
    {error && <div className="wallet-market-inventory-status" data-testid="market-inventory-status" role="status"><span>Showing last checked balances. Refresh failed: {error}</span><button type="button" onClick={onRetry}>Retry balances</button></div>}
    <div className="wallet-market-asset-list">{owned.map((asset) => {
      const firstYear = asset.series[0]?.year;
      const visibleSeries = asset.series.filter((series) => series.ptRaw > 0n || series.drRaw > 0n || (asset.collateralRaw > 0n && series.year === firstYear));
      const singleSeries = visibleSeries.length === 1 ? visibleSeries[0] : undefined;
      const symbol = presentedSymbol(asset.symbol);
      return <article className="wallet-market-asset" data-testid="market-balance-asset" key={asset.assetId}>
        <header><CompanyDot company={asset.company} /><div><h3>{asset.company}</h3><p>{symbol} · {presentedIssuer(asset.issuerLabel)}</p></div></header>
        {singleSeries ? <div className="wallet-market-series single" data-testid="market-balance-series">
          <div className="wallet-market-series-heading"><b>{singleSeries.year} annual series</b><span>{symbol} · {presentedIssuer(asset.issuerLabel)}</span></div>
          <div className="wallet-market-series-balances three"><HomeBalanceBox label="Stock token" value={asset.stockDisplayAmount} unit={symbol} testId="market-stock-balance" /><HomeBalanceBox label="Stock exposure" value={formatClaim(singleSeries.ptRaw, asset.decimals)} unit={`PT-${symbol}-${singleSeries.year}`} testId="market-pt-balance" /><HomeBalanceBox label="Dividend rights" value={formatClaim(singleSeries.drRaw, asset.decimals)} unit={`DR-${symbol}-${singleSeries.year}`} testId="market-dr-balance" /></div>
          <MarketHoldingActions stockHeld={asset.collateralRaw > 0n} claimsHeld={singleSeries.ptRaw > 0n || singleSeries.drRaw > 0n} assetId={asset.assetId} year={singleSeries.year} onSelect={onSelect} />
        </div> : <>
          <div className="wallet-market-asset-stock"><HomeBalanceBox label="Stock token" value={asset.stockDisplayAmount} unit={symbol} testId="market-stock-balance" /></div>
          <div className="wallet-market-claim-list">{visibleSeries.map((series) => <div className="wallet-market-series" data-testid="market-balance-series" key={series.year}>
            <div className="wallet-market-series-heading"><b>{series.year} annual series</b><span>{symbol} · {presentedIssuer(asset.issuerLabel)}</span></div>
            <div className="wallet-market-series-balances"><HomeBalanceBox label="Stock exposure" value={formatClaim(series.ptRaw, asset.decimals)} unit={`PT-${symbol}-${series.year}`} testId="market-pt-balance" /><HomeBalanceBox label="Dividend rights" value={formatClaim(series.drRaw, asset.decimals)} unit={`DR-${symbol}-${series.year}`} testId="market-dr-balance" /></div>
            <MarketHoldingActions stockHeld={asset.collateralRaw > 0n} claimsHeld={series.ptRaw > 0n || series.drRaw > 0n} assetId={asset.assetId} year={series.year} onSelect={onSelect} />
          </div>)}</div>
        </>}
      </article>;
    })}</div>
  </section>;
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
    <button className="p-primary" disabled={disabled || !value || previewRaw === undefined || previewRaw <= 0n || (balance !== undefined && previewRaw > balance)} onClick={run}>{submitLabel}<span>→</span></button>
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

export function WalletApp({ runtimeConfig = RUNTIME_CONFIG, onReset }: { runtimeConfig?: RuntimeConfig; onReset?: () => Promise<void> }) {
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: 'loading' });
  const [wallets, setWallets] = useState<CompatibleWallet[]>([]);
  const [connected, setConnected] = useState<ConnectedWallet>();
  const [tab, setTab] = useState<Tab>('market');
  const [assetId, setAssetId] = useState('');
  const [year, setYear] = useState<number>();
  const [snapshotEntry, setSnapshotEntry] = useState<{ key: string; value: WalletSeriesSnapshot }>();
  const snapshotCache = useRef(new Map<string, WalletSeriesSnapshot>());
  const [staleKey, setStaleKey] = useState('');
  const [quoteReadyKey, setQuoteReadyKey] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<UiReceipt[]>([]);
  const [walletRevision, setWalletRevision] = useState(0);
  const [inventory, setInventory] = useState<WalletInventory>();
  const [inventoryKey, setInventoryKey] = useState('');
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryErrorKey, setInventoryErrorKey] = useState('');
  const inventoryGeneration = useRef(0);
  const inventoryIdentity = useRef('');
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [marketAssetId, setMarketAssetId] = useState('');
  const marketDialog = useRef<HTMLDivElement>(null);
  const marketDialogClose = useRef<HTMLButtonElement>(null);
  const marketReturnFocus = useRef<HTMLElement | null>(null);
  const [solResult, setSolResult] = useState<{ identity: string; lamports: number }>();
  const [solError, setSolError] = useState<{ identity: string; message: string }>();
  const [solLoading, setSolLoading] = useState(false);
  const solGeneration = useRef(0);
  const [depositNudgeKey, setDepositNudgeKey] = useState('');
  const [connectingWallet, setConnectingWallet] = useState('');
  const connectGeneration = useRef(0);
  const connectPending = useRef(false);
  const walletTrigger = useRef<HTMLButtonElement>(null);
  const walletDialog = useRef<HTMLDivElement>(null);
  const walletDialogClose = useRef<HTMLButtonElement>(null);
  const walletReturnFocus = useRef<HTMLElement | null>(null);
  const activeKey = useRef('');
  const submitting = useRef(false);
  const bootGeneration = useRef(0);
  const readGeneration = useRef(0);
  const pendingRead = useRef<{ key: string; generation: number } | undefined>(undefined);
  const lifetimeAbort = useRef(new AbortController());
  const network = runtimeConfig.network;
  const sandbox = network === 'sandbox';
  const signingNetwork = sandbox ? 'local' : network;

  const manifest = runtime.kind === 'ready' ? runtime.manifest : undefined;
  const connection = runtime.kind === 'ready' ? runtime.connection : undefined;
  const asset = manifest?.assets.find((candidate) => candidate.id === assetId) ?? manifest?.assets[0];
  const series = asset?.series.find((candidate) => candidate.year === year) ?? asset?.series[0];
  const key = `${contextKey(manifest, asset, series, connected?.account)}:wallet-${walletRevision}`;
  const snapshot = snapshotEntry?.key === key ? snapshotEntry.value : snapshotCache.current.get(key);
  const snapshotStale = staleKey === key;
  const actionReady = quoteReadyKey === key && !loadingSnapshot && !snapshotStale && !busy;
  activeKey.current = key;
  inventoryIdentity.current = `${manifest?.runtimeId ?? ''}:${manifest?.genesisHash ?? ''}:${connected?.account.address ?? ''}:${walletRevision}`;
  const currentInventory = inventoryKey === inventoryIdentity.current ? inventory : undefined;
  const currentInventoryError = inventoryErrorKey === inventoryIdentity.current ? inventoryError : '';
  const currentSol = solResult?.identity === inventoryIdentity.current ? solResult.lamports : undefined;
  const currentSolError = solError?.identity === inventoryIdentity.current ? solError.message : '';

  const openWalletDialog = (event: MouseEvent<HTMLButtonElement>) => {
    walletReturnFocus.current = event.currentTarget;
    setWalletDialogOpen(true);
  };
  const closeWalletDialog = useCallback(() => {
    connectGeneration.current += 1;
    connectPending.current = false;
    setConnectingWallet('');
    setWalletDialogOpen(false);
    window.requestAnimationFrame(() => {
      const target = walletReturnFocus.current?.isConnected ? walletReturnFocus.current : walletTrigger.current;
      target?.focus();
    });
  }, []);
  useEffect(() => {
    if (!walletDialogOpen) return;
    walletDialogClose.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeWalletDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(walletDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [walletDialogOpen, closeWalletDialog]);

  const boot = useCallback(async () => {
    const generation = ++bootGeneration.current;
    setRuntime({ kind: 'loading' }); setError('');
    try {
      const nextManifest = await loadManifest(runtimeConfig);
      const nextConnection = await verifyRuntimeIdentity(nextManifest, runtimeConfig);
      if (bootGeneration.current !== generation) return;
      setRuntime({ kind: 'ready', manifest: nextManifest, connection: nextConnection });
      setAssetId((current) => current || nextManifest.assets[0]!.id);
      setYear((current) => current ?? nextManifest.assets[0]!.series[0]?.year);
    } catch (cause) { if (bootGeneration.current === generation) setRuntime({ kind: 'error', message: message(cause) }); }
  }, [runtimeConfig]);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    lifetimeAbort.current = new AbortController();
    return () => lifetimeAbort.current.abort(new Error('The wallet app was closed or its sandbox session changed.'));
  }, []);
  useEffect(() => {
    const refresh = () => setWallets(sandbox ? [] : discoverWallets(signingNetwork));
    refresh();
    return sandbox ? undefined : subscribeWalletRegistry(refresh);
  }, [sandbox, signingNetwork]);
  useEffect(() => {
    if (!connected || connected.temporary) return;
    return watchWallet(connected.wallet, ({ accounts, chains, features }) => {
      activeKey.current = `${activeKey.current}:wallet-change`;
      setWalletRevision((value) => value + 1);
      if (chains || features) {
        setQuoteReadyKey('');
        if (!isCompatibleWallet(connected.wallet, signingNetwork)) {
          setConnected(undefined);
          setNotice('Wallet capabilities changed. Connect again to continue.');
          return;
        }
      }
      if (!accounts) return;
      const sameAddress = accounts.filter((candidate) => candidate.address === connected.account.address);
      const account = compatibleAccount(sameAddress, signingNetwork) ?? compatibleAccount(accounts, signingNetwork);
      if (!account) { setConnected(undefined); setNotice('Wallet disconnected or changed to an incompatible account.'); return; }
      setConnected({ ...connected, account });
    });
  }, [connected?.wallet, connected?.account.address, connected?.temporary, signingNetwork]);

  const refreshSnapshot = useCallback(async (background = false) => {
    if (!manifest || !connection || !asset || !series) return;
    const requestedKey = `${contextKey(manifest, asset, series, connected?.account)}:wallet-${walletRevision}`;
    // A poll must not supersede a slower pending read and hide its eventual timeout.
    if (background && pendingRead.current?.key === requestedKey) return;
    const generation = ++readGeneration.current;
    pendingRead.current = { key: requestedKey, generation };
    if (!background) { setLoadingSnapshot(true); setQuoteReadyKey(''); setError(''); }
    try {
      const owner = connected ? new PublicKey(connected.account.publicKey) : undefined;
      const next = await fetchWalletSeries(connection, manifest, asset, series, owner);
      if (activeKey.current === requestedKey && readGeneration.current === generation) {
        snapshotCache.current.set(requestedKey, next);
        if (snapshotCache.current.size > 64) snapshotCache.current.delete(snapshotCache.current.keys().next().value!);
        setSnapshotEntry({ key: requestedKey, value: next }); setStaleKey(''); setQuoteReadyKey(requestedKey);
      }
    } catch (cause) {
      if (activeKey.current === requestedKey && readGeneration.current === generation) {
        setStaleKey(requestedKey);
        setQuoteReadyKey('');
        if (!background || !snapshotCache.current.has(requestedKey)) setError(message(cause));
      }
    }
    finally {
      if (pendingRead.current?.generation === generation) pendingRead.current = undefined;
      if (activeKey.current === requestedKey && readGeneration.current === generation) setLoadingSnapshot(false);
    }
  }, [manifest, connection, asset, series, connected?.account.address, walletRevision]);
  useEffect(() => { setQuoteReadyKey(''); if (tab !== 'market') void refreshSnapshot(); }, [refreshSnapshot, tab]);
  useEffect(() => {
    if (tab === 'market' || !manifest || !asset || !series) return;
    const updateVisible = () => { if (document.visibilityState === 'visible') void refreshSnapshot(true); };
    window.addEventListener('focus', updateVisible);
    const interval = window.setInterval(updateVisible, 9_000);
    return () => { window.removeEventListener('focus', updateVisible); window.clearInterval(interval); };
  }, [tab, manifest, asset, series, connected?.account.address, refreshSnapshot]);

  const refreshInventory = useCallback(async () => {
    if (!manifest || !connection || !connected) return;
    const identity = `${manifest.runtimeId}:${manifest.genesisHash}:${connected.account.address}:${walletRevision}`;
    const generation = ++inventoryGeneration.current;
    setInventoryLoading(true); setInventoryError('');
    try {
      const next = await fetchWalletInventory(connection, manifest, new PublicKey(connected.account.publicKey));
      if (inventoryGeneration.current === generation && inventoryIdentity.current === identity) {
        setInventory(next); setInventoryKey(identity); setInventoryError(''); setInventoryErrorKey('');
      }
    } catch (cause) {
      if (inventoryGeneration.current === generation && inventoryIdentity.current === identity) {
        setInventoryError(message(cause)); setInventoryErrorKey(identity);
      }
    } finally {
      if (inventoryGeneration.current === generation && inventoryIdentity.current === identity) setInventoryLoading(false);
    }
  }, [manifest, connection, connected?.account.address, walletRevision]);
  useEffect(() => {
    inventoryGeneration.current += 1;
    setInventory(undefined); setInventoryKey(''); setInventoryError(''); setInventoryErrorKey(''); setInventoryLoading(false);
    if (connected) void refreshInventory();
  }, [connected?.account.address, refreshInventory]);
  useEffect(() => {
    if (!connected) return;
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshInventory(); };
    window.addEventListener('focus', refreshVisible);
    return () => window.removeEventListener('focus', refreshVisible);
  }, [connected?.account.address, refreshInventory]);

  const refreshSol = useCallback(async () => {
    if (!manifest || !connection || !connected) return;
    const identity = `${manifest.runtimeId}:${manifest.genesisHash}:${connected.account.address}:${walletRevision}`;
    const generation = ++solGeneration.current;
    setSolLoading(true); setSolResult(undefined); setSolError(undefined);
    try {
      const lamports = await connection.getBalance(new PublicKey(connected.account.publicKey), 'confirmed');
      if (!Number.isSafeInteger(lamports) || lamports < 0) throw new Error('RPC returned an invalid SOL balance.');
      if (solGeneration.current === generation && inventoryIdentity.current === identity) setSolResult({ identity, lamports });
    } catch (cause) {
      if (solGeneration.current === generation && inventoryIdentity.current === identity) setSolError({ identity, message: message(cause) });
    } finally {
      if (solGeneration.current === generation && inventoryIdentity.current === identity) setSolLoading(false);
    }
  }, [manifest, connection, connected?.account.address, walletRevision]);
  useEffect(() => {
    solGeneration.current += 1; setSolResult(undefined); setSolError(undefined); setSolLoading(false);
    if (marketAssetId && connected) { void refreshSol(); void refreshInventory(); }
  }, [connected?.account.address, marketAssetId, refreshSol, refreshInventory]);

  const closeAssetDialog = useCallback(() => {
    setMarketAssetId('');
    window.requestAnimationFrame(() => {
      const target = marketReturnFocus.current?.isConnected ? marketReturnFocus.current : walletTrigger.current;
      target?.focus();
    });
  }, []);
  useEffect(() => {
    if (!marketAssetId) return;
    marketDialogClose.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeAssetDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(marketDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [marketAssetId, closeAssetDialog]);

  const choosePosition = (id: string, nextYear?: number) => {
    const next = manifest?.assets.find((candidate) => candidate.id === id);
    const selectedYear = nextYear ?? next?.series[0]?.year;
    if (!next || !next.series.some((candidate) => candidate.year === selectedYear)
      || (asset?.id === id && series?.year === selectedYear)) return;
    setAssetId(id); setYear(selectedYear); setQuoteReadyKey(''); setDepositNudgeKey(''); setNotice(''); setError('');
  };
  const chooseAsset = (id: string) => choosePosition(id);
  const openHeldPosition = (nextTab: 'split' | 'redeem', id: string, selectedYear: number) => {
    choosePosition(id, selectedYear);
    setTab(nextTab);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector(`[data-testid="${nextTab}-actions"]`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    })));
  };
  const openAssetDialog = (id: string, trigger: HTMLElement) => {
    if (!manifest?.assets.some((candidate) => candidate.id === id)) return;
    chooseAsset(id);
    marketReturnFocus.current = trigger;
    setMarketAssetId(id);
  };
  const openWalletFromAsset = () => {
    walletReturnFocus.current = marketReturnFocus.current?.isConnected ? marketReturnFocus.current : walletTrigger.current;
    setMarketAssetId('');
    setWalletDialogOpen(true);
  };
  const connect = async (wallet: CompatibleWallet, temporary = false) => {
    if (connectPending.current) return;
    const generation = ++connectGeneration.current;
    connectPending.current = true;
    setConnectingWallet(temporary ? 'Temporary wallet' : wallet.name);
    setError('');
    try {
      const account = await connectWallet(wallet, signingNetwork);
      if (connectGeneration.current !== generation) return;
      setConnected({ wallet, account, temporary });
      setNotice(`${wallet.name} connected for ${network === 'devnet' ? 'Solana devnet' : sandbox ? 'this private sandbox' : 'local'} signing.`);
      closeWalletDialog();
    } catch (cause) { if (connectGeneration.current === generation) setError(message(cause)); }
    finally { if (connectGeneration.current === generation) { connectPending.current = false; setConnectingWallet(''); } }
  };
  const addReceipt = (label: string, receipt: { signature: string; slot: number | null; confirmationStatus: string }) => {
    setReceipts((current) => [{ label, signature: receipt.signature, slot: receipt.slot, status: receipt.confirmationStatus }, ...current].slice(0, 8));
  };

  const runAction = async (action: Parameters<typeof executeHolderAction>[0]['action'], raw: bigint, options: { allowZero?: boolean; recipient?: PublicKey } = {}) => {
    if (submitting.current) throw new Error('Another transaction is already in progress.');
    if (!manifest || !asset || !series || !connected) throw new Error('Connect a wallet and choose a verified annual series.');
    if (!actionReady) throw new Error('Wait for the selected annual series to finish checking.');
    const captured = key;
    submitting.current = true; setBusy(true); setError(''); setNotice('Waiting for wallet signature…');
    try {
      const receipt = await executeHolderAction({ action, manifest, asset, series, connected, amountRaw: raw, ...options, runtimeConfig, signal: lifetimeAbort.current.signal, isCurrent: () => activeKey.current === captured });
      if (activeKey.current !== captured) return;
      addReceipt(action, receipt); setNotice(`Confirmed in slot ${receipt.slot}.`);
      if (action === 'deposit') setDepositNudgeKey(captured);
      await refreshSnapshot();
      await refreshInventory();
      await refreshSol();
    } catch (cause) { if (activeKey.current === captured) { setError(message(cause)); setNotice(''); } throw cause; }
    finally { submitting.current = false; setBusy(false); }
  };

  const faucet = async () => {
    if (submitting.current || !manifest || !asset || !connected) return;
    const captured = key; submitting.current = true; setBusy(true); setError(''); setNotice(`Requesting ${network === 'devnet' ? 'devnet' : 'local'} faucet assets…`);
    let verified: Connection | undefined;
    try {
      verified = await verifyRuntimeIdentity(manifest, runtimeConfig);
      const result = await runtimePost<{ signatures: string[]; status?: string; message?: string }>(manifest, '/faucet', { owner: connected.account.address, assetId: asset.id }, runtimeConfig);
      const confirmed = result.status === 'pending' ? await waitForRuntimeSignatures(verified, result.signatures) : await confirmedRuntimeSignatures(verified, result.signatures);
      if (activeKey.current !== captured) return;
      confirmed.forEach((receipt) => addReceipt('faucet', receipt));
      setNotice(`${confirmed.length} ${network === 'devnet' ? 'devnet' : 'local'} faucet transaction${confirmed.length === 1 ? '' : 's'} confirmed.`);
      await refreshSnapshot();
      await refreshInventory();
      await refreshSol();
    } catch (cause) {
      if (activeKey.current === captured) {
        const partial = cause instanceof RuntimeRequestError ? cause.result as { signatures?: string[]; pending?: boolean } | undefined : undefined;
        if (partial?.pending && partial.signatures?.length) partial.signatures.forEach((signature) => addReceipt('faucet pending', { signature, slot: null, confirmationStatus: 'pending' }));
        if (verified && partial?.signatures?.length) {
          try {
            const confirmed = await confirmedRuntimeSignatures(verified, partial.signatures);
            confirmed.forEach((receipt) => addReceipt('partial faucet', receipt));
            setNotice(`${confirmed.length} faucet transaction${confirmed.length === 1 ? '' : 's'} confirmed before the runtime stopped.`);
            await refreshInventory(); await refreshSol();
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
      verified = await verifyRuntimeIdentity(manifest, runtimeConfig);
      const result = await runtimePost<{ signatures: string[]; message: string }>(manifest, '/advance', { step, assetId: asset.id }, runtimeConfig);
      const confirmed = await confirmedRuntimeSignatures(verified, result.signatures);
      if (activeKey.current !== captured) return;
      confirmed.forEach((receipt) => addReceipt(`date control: ${step}`, receipt)); setNotice(result.message);
      await refreshSnapshot();
      await refreshInventory();
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

  const resetSandbox = async () => {
    if (!onReset || busy) return;
    setBusy(true); setError(''); setNotice('Stopping this sandbox and requesting a fresh isolated network…');
    try { await onReset(); }
    catch (cause) { setError(message(cause)); setNotice(''); setBusy(false); }
  };
  useEffect(() => { setDepositNudgeKey(''); }, [key]);
  const continueToRedeem = () => {
    setTab('redeem'); setDepositNudgeKey('');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector('[data-testid="redeem-actions"]')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    })));
  };
  const continueToSplit = () => {
    closeAssetDialog(); setTab('split');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector('[data-testid="split-actions"]')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    })));
  };

  if (runtime.kind === 'loading') return <main className="wallet-gate"><BrandLogo variant="icon" /><h1>Connecting to the {network === 'devnet' ? 'Solana devnet service' : sandbox ? 'private sandbox' : 'local runtime'}…</h1><p>Verifying genesis, program and deployment identity.</p></main>;
  if (runtime.kind === 'error') return <main className="wallet-gate" data-testid="runtime-error"><BrandLogo variant="icon" /><p className="eyebrow">Runtime unavailable</p><h1>The {network === 'devnet' ? 'devnet service' : sandbox ? 'private sandbox' : 'local runtime'} could not be verified.</h1><p>{network === 'devnet' ? 'DivX could not reach or verify the required public test service. Retry checks the same configured service again.' : sandbox ? 'DivX could not verify this session-bound sandbox. Retry checks the same session; it never creates another one.' : 'DivX could not reach or verify the required localhost service. Retry checks it again; it does not start the service.'}</p><div className="wallet-runtime-error"><b>Runtime check failed</b><p>{runtime.message}</p></div>{network === 'local' && <><p>From the project root, start the runtime and wait until it reports ready:</p><code className="wallet-runtime-command">npm --prefix packages/local-runtime start</code></>}<div className="wallet-gate-actions"><button className="p-primary" onClick={boot}>Retry {network === 'devnet' ? 'devnet service' : sandbox ? 'private sandbox' : 'localhost runtime'}</button><a href="/demos/">Guided Demos</a><a href="/app/">Public Devnet</a></div></main>;

  const verifiedManifest = runtime.manifest;
  const activeBits = snapshot?.quote.mintProfile.scale.activeBits;
  const holder = connected?.account.address;
  const devnet = verifiedManifest.kind === 'devnet';
  const runtimeLabel = devnet ? 'Solana Devnet' : sandbox ? 'Private sandbox' : verifiedManifest.kind === 'surfnet' ? 'Local Sandbox' : 'Local validator';
  const runtimeProofText = devnet ? 'Verified Solana devnet' : sandbox ? 'Verified private SBF sandbox' : verifiedManifest.kind === 'surfnet' ? 'Verified Local SBF sandbox' : 'Verified local validator';
  const faucetEnabled = devnet ? verifiedManifest.faucetEnabled === true : verifiedManifest.faucetEnabled !== false;
  const seriesName = asset && series ? `${presentedSymbol(asset.symbol)} · ${series.year}` : 'No series';
  const marketEntries = walletMarketCatalog(verifiedManifest.assets);
  const marketCompanies = [...new Set(marketEntries.map((entry) => entry.company))];
  const availableCount = marketEntries.filter((entry) => entry.availableAsset).length;
  const presentedAsset = asset ? { ...asset, symbol: presentedSymbol(asset.symbol), issuerLabel: presentedIssuer(asset.issuerLabel) } : undefined;
  const selectedInventoryAsset = currentInventory?.assets.find((candidate) => candidate.assetId === asset?.id);
  const marketAsset = verifiedManifest.assets.find((candidate) => candidate.id === marketAssetId);
  const marketInventoryAsset = currentInventory?.assets.find((candidate) => candidate.assetId === marketAssetId);
  const solKnown = currentSol !== undefined && !solLoading;
  const needsSolTopUp = solKnown && currentSol < 6_000_000;

  return <><a className="p-skip" href="#wallet-main">Skip to content</a>
    <header className="p-header wallet-header"><a className="p-brand" href="/app/" aria-label="DivX"><BrandLogo /></a>
      <nav aria-label="Wallet actions">{(['market', 'split', 'redeem'] as Tab[]).map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</nav>
      <div className="wallet-header-tools"><nav className="wallet-surface-links" aria-label="Explore"><a href="/app/" aria-current={devnet ? 'page' : undefined}>Public Devnet</a><a href="/demos/">Guided Demos</a></nav>
        <div className="wallet-header-status"><section className="wallet-network" aria-label="Verified runtime"><span className="online-dot" aria-hidden="true" /><span className="sr-only">{runtimeProofText}</span><span aria-hidden="true">{runtimeLabel}</span></section>
          <button ref={walletTrigger} className="wallet-trigger" type="button" data-testid="wallet-trigger" aria-haspopup="dialog" aria-expanded={walletDialogOpen} aria-controls={walletDialogOpen ? 'wallet-dialog' : undefined} onClick={openWalletDialog}>{holder ? shortAddress(holder) : 'Connect wallet'}</button></div>
      </div></header>
    <main id="wallet-main" className="p-page wallet-page">
      {sandbox && <div className="wallet-reset-bar"><button className="wallet-reset-link" disabled={busy} onClick={() => void resetSandbox()}>Reset sandbox</button></div>}

      {tab === 'market' && <section className="wallet-market-hero"><div><p className="eyebrow">DivX · {runtimeLabel}</p><h1>One stock.<span>Two tokens.</span></h1><p>Split a stock token into stock exposure (PT) and dividend rights (DR) for a selected year. Explore the available profiles, then connect a wallet to try it.</p></div><StockSplitHeroArt /></section>}

      {notice && <div className="p-success" role="status">{notice}</div>}
      {error && !walletDialogOpen && !marketAssetId && <div className="p-error" role="alert">{error}</div>}
      {tab !== 'market' && snapshotStale && <div className="p-error" role="status" data-testid="stale-balances">Balances may be out of date because the {devnet ? 'devnet' : 'local'} RPC stopped responding. Refresh before continuing.</div>}

      {tab !== 'market' && <section className="wallet-selector compact" aria-label="Selected stock and year">
        <label><span>Stock token</span><select value={asset?.id ?? ''} onChange={(event) => chooseAsset(event.target.value)}>{[...verifiedManifest.assets].sort((left, right) => (issuerOrder[presentedIssuer(left.issuerLabel)] ?? 99) - (issuerOrder[presentedIssuer(right.issuerLabel)] ?? 99)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.company} · {presentedSymbol(candidate.symbol)} · {presentedIssuer(candidate.issuerLabel)}</option>)}</select></label>
        <label><span>Annual series</span><select value={series?.year ?? ''} onChange={(event) => { if (asset) choosePosition(asset.id, Number(event.target.value)); }}>{asset?.series.map((candidate) => <option key={candidate.year} value={candidate.year}>{candidate.year}</option>)}</select></label>
        <div className="wallet-selector-actions"><button disabled={loadingSnapshot || inventoryLoading} onClick={() => { void refreshSnapshot(); void refreshInventory(); void refreshSol(); }}>Refresh balances</button>{faucetEnabled ? <button data-testid="faucet-request" disabled={busy || !holder} onClick={faucet}>Request {asset ? presentedSymbol(asset.symbol) : 'stock'}</button> : <small>Faucet unavailable for this deployment.</small>}</div>
        {devnet && faucetEnabled && <p className="wallet-faucet-note">The Devnet faucet supplies synthetic stock tokens and test SOL. These tokens do not represent issuer-issued shares.</p>}
      </section>}

      {tab !== 'market' && <InventoryChoices tab={tab} connected={Boolean(connected)} inventory={currentInventory} loading={Boolean(connected) && inventoryLoading} error={currentInventoryError} devnet={devnet} selectedAssetId={asset?.id ?? ''} selectedYear={series?.year} onChoose={choosePosition} onFaucet={() => void faucet()} onConnect={openWalletDialog} busy={busy} faucetEnabled={faucetEnabled} />}
      {tab === 'market' && connected && <MarketBalances inventory={currentInventory} loading={inventoryLoading} error={currentInventoryError} onRetry={() => void refreshInventory()} onSelect={openHeldPosition} />}

      {tab !== 'market' && asset && series && <section className="wallet-context" data-testid="compact-position" aria-label="Selected position"><div className="wallet-context-heading"><div><p className="eyebrow">Selected position</p><h2>{asset.company} <span>{presentedSymbol(asset.symbol)} · {series.year}</span></h2></div>{snapshot && <PhaseBadge snapshot={snapshot} />}</div><PositionBalances snapshot={snapshot} inventory={selectedInventoryAsset} asset={asset} series={series} /></section>}

      {tab === 'market' && <section className="wallet-market"><div><p className="eyebrow">Market</p><h2>Explore stock tokens by company.</h2><p>{marketEntries.length} stock tokens across {marketCompanies.length} companies. {availableCount} available {devnet ? 'on devnet' : 'in this runtime'} today.</p></div><div className="wallet-company-list">{marketCompanies.map((company) => <section key={company} aria-label={`${company} stock tokens`}><h3>{company}</h3><div className="wallet-market-grid">{marketEntries.filter((entry) => entry.company === company).sort((left, right) => (issuerOrder[left.issuer] ?? 99) - (issuerOrder[right.issuer] ?? 99)).map((entry) => <button type="button" data-testid="market-stock-card" className={entry.availableAsset?.id === asset?.id ? 'active' : ''} key={entry.id} disabled={!entry.availableAsset} aria-pressed={entry.availableAsset?.id === asset?.id} onClick={(event) => { if (entry.availableAsset) openAssetDialog(entry.availableAsset.id, event.currentTarget); }}><CompanyDot company={entry.company} /><b>{entry.symbol}</b><small>{entry.issuer}</small>{!entry.availableAsset && <span>{devnet ? 'Not yet on devnet' : 'Not available here'}</span>}</button>)}</div></section>)}</div><div className="venue-unavailable"><b>Trading venue unavailable here</b><span>Choose Split or Redeem for the selected token. The Guided Demos page walks through a separate pool example.</span></div></section>}

      {asset && series && <>
        {tab === 'split' && <section className="wallet-actions" data-testid="split-actions">
          <article className="wallet-action-card split-card">
            <div><p className="eyebrow">Split</p><h2>One stock. Two annual tokens.</h2><p>Deposit stock tokens and get stock exposure (PT) plus the selected year's dividend rights (DR).</p></div>
            <div>
              {!snapshot && <QuotePending error={snapshotStale} />}
              {snapshot && <>
                {!actionReady && <QuotePending error={snapshotStale} />}
                <AmountField key={'deposit-' + key} label={'Deposit ' + presentedSymbol(asset.symbol)} decimals={asset.decimals} balance={snapshot.collateralRaw}
                  parse={(value) => parseStockAmount(value, asset.decimals, activeBits!)}
                  formatBalance={(raw) => formatStock(raw, asset.decimals, activeBits!, 12)}
                  preview={(raw) => <>You receive · <b>{formatClaim(raw, asset.decimals)} PT + {formatClaim(raw, asset.decimals)} DR</b></>}
                  disabled={!connected || !actionReady || !snapshot.eligibility.depositsOpen}
                  submitLabel="Split into PT + DR" onSubmit={(raw) => runAction('deposit', raw)} />
                {!snapshot.eligibility.depositsOpen && <p className="blocked-reason">Deposits unavailable because {snapshot.eligibility.reasons.map(eligibilityReason).join(', ') || 'annual funding is closed'}.</p>}
              </>}
            </div>
          </article>
          {depositNudgeKey === key && <aside className="wallet-next-step" data-testid="deposit-next-step"><div><b>Split confirmed.</b><p>Your PT and DR are ready to inspect.</p></div><button type="button" onClick={continueToRedeem}>Continue to Redeem <span aria-hidden="true">→</span></button></aside>}
        </section>}

        {tab === 'redeem' && <section className="wallet-actions" data-testid="redeem-actions">
          <div className="redeem-intro"><p className="eyebrow">Redeem</p><h2>{snapshot?.quote.series.phase === 'finalized' ? 'Redeem either token on its own.' : 'Combine matching tokens to get your stock back.'}</h2><p>After the year is finalized, stock exposure and dividend rights redeem separately.</p></div>
          {!snapshot && <QuotePending error={snapshotStale} />}
          {snapshot && <>
            {!actionReady && <QuotePending error={snapshotStale} />}
            {snapshot.quote.series.phase !== 'finalized'
              ? <article className="wallet-action-card"><p className="eyebrow">Paired recombination</p><h3>Get your stock token back</h3><p>Use the same amount of PT and DR.</p>
                  <AmountField key={'recombine-' + key} label="Matching pair amount" decimals={asset.decimals} balance={snapshot.ptRaw < snapshot.drRaw ? snapshot.ptRaw : snapshot.drRaw}
                    preview={(raw) => <>You receive · <b>{formatStock(raw, asset.decimals, activeBits!)} {presentedSymbol(asset.symbol)}</b></>}
                    disabled={!connected || !actionReady} submitLabel="Combine & return stock" onSubmit={(raw) => runAction('recombine', raw)} />
                </article>
              : <div className="redemption-grid">
                  <RedemptionCard key={'pt-' + key} side="pt" snapshot={snapshot} asset={presentedAsset!} disabled={!connected || !actionReady} onRedeem={(side, raw, allowZero) => runAction('redeem-' + side as 'redeem-pt' | 'redeem-dr', raw, { allowZero })} />
                  <RedemptionCard key={'dr-' + key} side="dr" snapshot={snapshot} asset={presentedAsset!} disabled={!connected || !actionReady} onRedeem={(side, raw, allowZero) => runAction('redeem-' + side as 'redeem-pt' | 'redeem-dr', raw, { allowZero })} />
                </div>}
            <div className="transfer-grid">
              <TransferCard key={'transfer-pt-' + key} side="pt" snapshot={snapshot} asset={presentedAsset!} disabled={!connected || !actionReady} onTransfer={(side, raw, recipient) => runAction('transfer-' + side as 'transfer-pt' | 'transfer-dr', raw, { recipient })} />
              <TransferCard key={'transfer-dr-' + key} side="dr" snapshot={snapshot} asset={presentedAsset!} disabled={!connected || !actionReady} onTransfer={(side, raw, recipient) => runAction('transfer-' + side as 'transfer-pt' | 'transfer-dr', raw, { recipient })} />
            </div>
          </>}
        </section>}

        {tab !== 'market' && snapshot && <details className="wallet-details"><summary>Verified account details</summary><dl><div><dt>Program</dt><dd><AccountValue address={verifiedManifest.programId} label="program account" devnet={devnet} /></dd></div><div><dt>Genesis</dt><dd>{verifiedManifest.genesisHash}</dd></div><div><dt>Runtime</dt><dd>{verifiedManifest.runtimeId}</dd></div><div><dt>Deployment domain</dt><dd>{verifiedManifest.deploymentDomainHex}</dd></div><div><dt>Asset policy</dt><dd><AccountValue address={asset.assetPolicy} label="asset policy" devnet={devnet} /></dd></div><div><dt>Collateral mint</dt><dd><AccountValue address={asset.collateralMint} label="collateral mint" devnet={devnet} /></dd></div><div><dt>Series</dt><dd><AccountValue address={series.address} label="annual series" devnet={devnet} /></dd></div><div><dt>Accumulator</dt><dd><AccountValue address={series.accumulator} label="dividend accumulator" devnet={devnet} /></dd></div><div><dt>Vault</dt><dd><AccountValue address={series.vault} label="series vault" devnet={devnet} /></dd></div><div><dt>PT mint</dt><dd><AccountValue address={series.ptMint} label="PT mint" devnet={devnet} /></dd></div><div><dt>DR mint</dt><dd><AccountValue address={series.drMint} label="DR mint" devnet={devnet} /></dd></div><div><dt>RPC context slot</dt><dd>{snapshot.quote.contextSlot}</dd></div><div><dt>Chain time</dt><dd>{snapshot.quote.clock.unixTimestamp.toString()}</dd></div></dl></details>}
      </>}

      {!devnet && <details className="clock-controls"><summary>Network-wide test dates</summary><div className="clock-layout"><div><p className="eyebrow">Controlled annual lifecycle</p><h2>Annual lifecycle controls</h2>{verifiedManifest.clockControl ? <p>These steps change the shared local network and submit real program transactions.</p> : <p>Faithful clock control is unavailable in this runtime. Finalized claims may be inspected only when already present onchain.</p>}</div><div>{['start-year', 'record-dividends', 'end-year', 'finalize'].map((step) => <button key={step} disabled={!verifiedManifest.clockControl || busy} onClick={() => void advance(step)}>{step.replace('-', ' ')}</button>)}</div></div></details>}

      {receipts.length > 0 && <section className="wallet-receipts"><p className="eyebrow">Transaction receipts</p>{receipts.map((receipt) => <article key={`${receipt.signature}-${receipt.label}`}><div><b>{receipt.label}</b><span>{receipt.slot === null ? 'Slot pending' : `Slot ${receipt.slot}`} · {receipt.status}</span></div>{devnet ? <a href={`https://solscan.io/tx/${encodeURIComponent(receipt.signature)}?cluster=devnet`} target="_blank" rel="noopener noreferrer" aria-label="View transaction on Solscan"><code>{receipt.signature}</code><span className="sr-only"> (opens in a new tab)</span></a> : <code>{receipt.signature}</code>}</article>)}</section>}
    </main><footer className="p-footer wallet-footer"><div><BrandLogo variant="icon" /><span>DivX{tab === 'market' ? '' : ` · ${seriesName}`}</span></div></footer>
    {marketAsset && <div className="wallet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssetDialog(); }}>
      <div ref={marketDialog} id="asset-dialog" className="wallet-dialog wallet-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" data-testid="asset-dialog">
        <header><div><p className="eyebrow">Stock token · {presentedIssuer(marketAsset.issuerLabel)}</p><h2 id="asset-dialog-title">{marketAsset.company} · {presentedSymbol(marketAsset.symbol)}</h2></div><button ref={marketDialogClose} type="button" aria-label="Close stock details" onClick={closeAssetDialog}>×</button></header>
        <div className="wallet-asset-identity"><CompanyDot company={marketAsset.company} /><div><b>{presentedSymbol(marketAsset.symbol)}</b><span>{marketAsset.company} · {presentedIssuer(marketAsset.issuerLabel)}</span></div></div>
        {!connected ? <div className="wallet-asset-funding"><p>Connect a wallet to see your balance and request this synthetic stock token.</p><button type="button" onClick={openWalletFromAsset}>Connect wallet <span aria-hidden="true">→</span></button></div>
          : <div className="wallet-asset-funding">
            <div className="wallet-asset-balance"><span>{currentInventoryError && marketInventoryAsset ? 'Last checked wallet balance' : 'In your wallet'}</span><strong data-testid="asset-stock-balance">{marketInventoryAsset ? marketInventoryAsset.stockDisplayAmount : currentInventoryError ? 'Unavailable' : 'Checking…'}</strong><small>{presentedSymbol(marketAsset.symbol)}</small></div>
            {currentInventoryError && <p role="alert">Stock balance could not be refreshed: {currentInventoryError} <button type="button" onClick={() => void refreshInventory()}>Retry stock balance</button></p>}
            {marketInventoryAsset && marketInventoryAsset.collateralRaw > 0n
              ? <><p>You already hold this stock token. Choose Split to use it with the selected annual series.</p><button type="button" className="wallet-asset-primary" onClick={continueToSplit}>Continue to Split <span aria-hidden="true">→</span></button></>
              : <><p data-testid="asset-sol-status">{solLoading || (!solKnown && !currentSolError) ? 'Checking wallet SOL balance…' : currentSolError ? 'SOL balance unavailable.' : !devnet ? 'The sandbox faucet supplies stock tokens and funds each wallet once per session.' : needsSolTopUp ? 'The faucet will top your wallet up to 0.006 SOL on Devnet.' : 'Your wallet has at least 0.006 SOL; no SOL top-up is needed.'}</p>
                {solKnown && <p className="wallet-sol-current">Current wallet balance: {(currentSol / 1_000_000_000).toFixed(6)} SOL.</p>}
                {currentSolError && <button type="button" onClick={() => void refreshSol()}>Retry SOL balance</button>}
                {faucetEnabled ? <button type="button" className="wallet-asset-primary" data-testid="asset-get-tokens" disabled={busy || !solKnown || !marketInventoryAsset || Boolean(currentInventoryError)} onClick={() => void faucet()}>{!devnet ? 'Request ' + presentedSymbol(marketAsset.symbol) : needsSolTopUp ? 'Get 10 ' + presentedSymbol(marketAsset.symbol) + ' + Devnet SOL' : 'Get 10 ' + presentedSymbol(marketAsset.symbol)} <span aria-hidden="true">→</span></button> : <p>Faucet unavailable for this deployment.</p>}
                <small>Faucet grants are subject to wallet and daily limits.</small>
              </>}
          </div>}
        {notice && <p className="p-success" role="status">{notice}</p>}
        {error && <p className="p-error" role="alert">{error}</p>}
      </div>
    </div>}
    {walletDialogOpen && <div className="wallet-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWalletDialog(); }}><div ref={walletDialog} id="wallet-dialog" className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title"><header><div><p className="eyebrow">Wallet</p><h2 id="wallet-dialog-title">{connected ? 'Your wallet' : 'Connect a wallet'}</h2></div><button ref={walletDialogClose} type="button" aria-label="Close wallet dialog" onClick={closeWalletDialog}>×</button></header>{error && <p className="p-error" role="alert">{error}</p>}<WalletChoices wallets={wallets} connected={connected} sandbox={sandbox} devnet={devnet} connectingWallet={connectingWallet} onConnect={(wallet) => void connect(wallet)} onTemporary={() => void connect(createTemporaryWallet(signingNetwork), true)} onDisconnect={() => { setConnected(undefined); setNotice('Wallet disconnected.'); closeWalletDialog(); }} /></div></div>}
  </>;
}
