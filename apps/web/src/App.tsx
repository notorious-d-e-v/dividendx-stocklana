import { useState } from 'react';
import {
  createDemoClient,
  formatScaled,
  formatUnits,
  formatUsdc,
  parseDecimal,
  parseUsdc,
  toRawAmount,
  type AllocationPreview,
  type AssetDescriptor,
  type ClaimSide,
  type DemoCondition,
  type DemoError,
  type DemoReceipt,
  type DemoSeries,
  type DemoState,
  type EventDescriptor,
  type SaleQuote,
  type WalletId,
} from '@dividendx/sdk';
import assetData from '@fixtures/catalog.json';
import eventData from '@fixtures/events.json';
import { BrandLogo } from './BrandLogo';

const assets = assetData as AssetDescriptor[];
const events = eventData as EventDescriptor[];
const eventsById = new Map(events.map((event) => [event.id, event]));
const client = createDemoClient(assets, events);
const defaultAsset = assets.find((asset) => asset.symbol === 'KOx') ?? assets[0];
const companyOrder = ['Coca-Cola', 'Apple', 'Microsoft', 'Micron', 'Nike', 'IBM'];

type Tab = 'market' | 'split' | 'positions';
type IssuerFilter = 'all' | AssetDescriptor['issuerId'];

const issuerNames: Record<AssetDescriptor['issuerId'], string> = {
  xstocks: 'xStocks',
  backpack: 'Backpack / Trek',
  ondo: 'Ondo',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined, timeZone: 'UTC' }).format(new Date(value));
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatPercent(raw: bigint, total: bigint): string {
  if (total <= 0n) return '0.00%';
  const hundredths = (raw * 10000n + total / 2n) / total;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}%`;
}

function errorText(error: unknown): string {
  const value = error as Partial<DemoError>;
  return value?.message || 'The demo action could not be completed.';
}

function receiptPresentation(receipt: DemoReceipt, asset: AssetDescriptor): { title: string; detail: string } {
  const change = (field: string, walletId?: WalletId) => receipt.changes.find((item) => item.field === field && (!walletId || item.walletId === walletId));
  const amount = (raw: bigint | undefined, decimals = asset.decimals) => { const value = raw ?? 0n; return formatUnits(value < 0n ? -value : value, decimals, 6); };
  if (receipt.action === 'deposit') return { title: 'Split created', detail: `${amount(change('pt', 'seller')?.delta)} paired PT and DR claims` };
  if (receipt.action === 'sale') return { title: 'Dividend rights sold', detail: `${amount(change('dr', 'buyer')?.delta)} DR for ${amount(change('usdc', 'seller')?.delta, 6)} test USDC` };
  if (receipt.action === 'close_deposits') return { title: 'Dividend replay started', detail: 'Deposits closed at the historical event' };
  if (receipt.action === 'settle') return { title: 'Dividend settled', detail: 'PT and DR redemption amounts are ready' };
  if (receipt.action === 'recombine') return { title: 'Claims recombined', detail: `${amount(change('collateral')?.delta)} ${asset.symbol} returned` };
  const side = change('pt') ? 'Stock exposure' : 'Dividend rights';
  const field = change('pt') ? 'pt' : 'dr';
  return { title: `${side} redeemed`, detail: `${amount(change(field)?.delta)} ${field.toUpperCase()} claims` };
}

function Status({ asset }: { asset: AssetDescriptor }) {
  if (asset.eventFixtureId) return <span className="status status-ready"><span>●</span> Replay available</span>;
  if (asset.issuerId === 'ondo') return <span className="status status-pending"><span>○</span> Dividend data pending</span>;
  return <span className="status status-muted"><span>○</span> Event review pending</span>;
}

function catalogDetail(asset: AssetDescriptor): string {
  if (asset.eventFixtureId) return 'A sourced historical event is ready for this local rehearsal.';
  if (asset.issuerId === 'ondo') return 'A dividend event has not yet been verified for this token.';
  if (asset.issuerId === 'backpack') return 'A token dividend event still needs to be verified.';
  return 'Dividend information is available. This demo event still needs review.';
}

function Header({ tab, setTab, account, setAccount }: { tab: Tab; setTab: (tab: Tab) => void; account: WalletId; setAccount: (wallet: WalletId) => void }) {
  return (
    <header className="product-header">
      <button className="brand" onClick={() => setTab('market')} aria-label="DivX home"><BrandLogo /></button>
      <nav aria-label="Primary">
        {(['market', 'split', 'positions'] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </nav>
      <div className="account-control">
        <span>Demo account</span>
        <select aria-label="Demo account" value={account} onChange={(event) => setAccount(event.target.value as WalletId)}>
          <option value="seller">Seller</option>
          <option value="buyer">Buyer</option>
        </select>
      </div>
    </header>
  );
}

function DemoRibbon() {
  return (
    <div className="demo-ribbon">
      <span><b>Demo rehearsal · test balances</b></span>
      <span>Historical events are sourced and frozen. Offers and all balance changes are local, resettable examples.</span>
      <span>Source catalog snapshot · 16 Sep 2026</span>
    </div>
  );
}

function Market({ onSelect }: { onSelect: (asset: AssetDescriptor) => void }) {
  const [search, setSearch] = useState('');
  const [issuer, setIssuer] = useState<IssuerFilter>('all');
  const filtered = assets.filter((asset) => {
    const matchesSearch = `${asset.company} ${asset.underlying} ${asset.symbol}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (issuer === 'all' || asset.issuerId === issuer);
  });
  const grouped = companyOrder.map((company) => ({ company, assets: filtered.filter((asset) => asset.company === company) })).filter((group) => group.assets.length);

  return (
    <main id="main" className="page market-page">
      <section className="page-intro">
        <p className="eyebrow">Selected stock directory</p>
        <h1>Choose a stock.<br /><span>Explore its dividends.</span></h1>
        <p>Fifteen observed stock tokens across six companies. Two have sourced historical events prepared for the local rehearsal.</p>
      </section>
      <section className="filters" aria-label="Market filters">
        <label className="search-field"><span>Search company or ticker</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Coca-Cola, KO…" /></label>
        <div className="filter-group" aria-label="Filter by issuer">
          {(['all', 'xstocks', 'backpack', 'ondo'] as IssuerFilter[]).map((value) => (
            <button key={value} className={issuer === value ? 'selected' : ''} onClick={() => setIssuer(value)}>{value === 'all' ? 'All issuers' : issuerNames[value]}</button>
          ))}
        </div>
      </section>
      <section className="directory" aria-live="polite">
        {grouped.map((group) => (
          <article className="company-row" key={group.company}>
            <div className="company-name"><span>Company</span><h2>{group.company}</h2><p>{group.assets[0].underlying}</p></div>
            <div className="issuer-options">
              {group.assets.map((asset) => (
                <button className="asset-option" key={asset.id} onClick={() => onSelect(asset)} data-testid={`asset-${asset.symbol}`}>
                  <span className="asset-topline"><b>{asset.symbol}</b><em>{issuerNames[asset.issuerId]}</em></span>
                  <Status asset={asset} />
                  <span className="asset-detail">{catalogDetail(asset)}</span>
                  <span className="inspect">Inspect event <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </article>
        ))}
        {!grouped.length && <div className="empty-result"><h2>No matching stock tokens</h2><p>Clear the search or choose another issuer.</p></div>}
      </section>
    </main>
  );
}

function SourceInspector({ asset, event }: { asset: AssetDescriptor; event?: EventDescriptor }) {
  return (
    <details className="inspector">
      <summary>Accounting & source inspector</summary>
      <div className="inspector-grid">
        <div><span>Mint</span><code>{asset.mint}</code></div>
        <div><span>Token decimals</span><code>{asset.decimals}</code></div>
        <div><span>Observed slot</span><code>{asset.observedSlot ?? 'Not recorded'}</code></div>
        <div><span>Snapshot</span><code>{asset.snapshotAt}</code></div>
        <div><span>Review status</span><code>{asset.statusDetail}</code></div>
        {event && <>
          <div><span>Event fixture</span><code>{event.id}</code></div>
          <div><span>Issuer event / revision</span><code>{event.issuerEventId ?? 'None'}{event.revision != null ? ` / ${event.revision}` : ''}</code></div>
          <div><span>Exact M0</span><code>{event.m0}</code></div>
          <div><span>Exact M1</span><code>{event.m1}</code></div>
          <div><span>Source digest</span><code>{event.sourceDigest}</code></div>
        </>}
      </div>
      <p className="control-note">Issuer controls: {asset.issuerControlNote}</p>
      <div className="source-links">
        {[...asset.sourceUrls, ...(event?.sourceUrls ?? [])].filter((url, index, all) => all.indexOf(url) === index).map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Source {index + 1} ↗</a>)}
      </div>
    </details>
  );
}

function Allocation({ preview, asset, event }: { preview: AllocationPreview; asset: AssetDescriptor; event: EventDescriptor }) {
  const total = preview.ptPoolRaw + preview.drPoolRaw;
  const dividendWidth = total ? Number((preview.drPoolRaw * 1000000n) / total) / 10000 : 0;
  return (
    <div className="allocation" data-testid="allocation">
      <div className="allocation-rail" aria-label={`Stock exposure ${100 - dividendWidth} percent; dividend rights ${dividendWidth} percent`}>
        <span className="stock-rail" style={{ width: `${100 - dividendWidth}%` }} />
        <span className="dividend-rail" style={{ width: `${dividendWidth}%` }} />
      </div>
      <div className="allocation-row stock-row">
        <span><i />Stock exposure <b>(PT)</b><small>Redeemable after-event allocation</small></span>
        <strong>{formatScaled(preview.ptPoolRaw, asset.decimals, event.m1, 4)} <small>{asset.symbol}</small></strong>
      </div>
      <div className="allocation-row dividend-row">
        <span><i />Dividend rights <b>(DR)</b><small>Dividend-derived stock-token allocation</small></span>
        <strong>{formatScaled(preview.drPoolRaw, asset.decimals, event.m1, 4)} <small>{asset.symbol}</small></strong>
      </div>
      <p className="reconcile"><span>✓</span> The two allocations add back to the full position.</p>
      {event.referencePriceUsd && <div className="historical-context"><b>Historical dollar context</b><span>Stock exposure · approximately {(Number(formatScaled(preview.ptPoolRaw, asset.decimals, event.m1, 8)) * Number(event.referencePriceUsd)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}</span><span>Dividend rights · approximately {(Number(formatScaled(preview.drPoolRaw, asset.decimals, event.m1, 8)) * Number(event.referencePriceUsd)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}</span><small>Display-only estimate using the event’s ${event.referencePriceUsd} reference price. It is separate from the example test-USDC offer.</small></div>}
    </div>
  );
}

function Split({ selected, setSelected, onStarted }: { selected: AssetDescriptor; setSelected: (asset: AssetDescriptor) => void; onStarted: () => void }) {
  const [amount, setAmount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const event = selected.eventFixtureId ? eventsById.get(selected.eventFixtureId) : undefined;
  let preview: AllocationPreview | undefined;
  let previewError = '';
  if (event) {
    try { preview = client.preview(selected.id, amount); } catch (cause) { previewError = errorText(cause); }
  }

  async function startSplit() {
    setBusy(true); setError('');
    try { await client.deposit(selected.id, amount); onStarted(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  return (
    <main id="main" className="page split-page">
      <section className="split-heading">
        <div>
          <p className="eyebrow">Historical split calculator</p>
          <h1>{selected.company} <span>{selected.symbol}</span></h1>
          <p>Preview one collateral position becoming separately usable Stock exposure and Dividend rights claims.</p>
        </div>
        <label className="asset-select"><span>Asset and issuer</span><select value={selected.id} onChange={(e) => setSelected(assets.find((asset) => asset.id === e.target.value)!)}>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.company} · {asset.symbol} · {issuerNames[asset.issuerId]}</option>)}</select></label>
      </section>
      <div className="split-layout">
        <section className="event-column">
          <Status asset={selected} />
          {event ? <>
            <h2>A real dividend event, replayed in historical time.</h2>
            <dl className="fact-list">
              <div><dt>Issuer activation</dt><dd>{formatDate(event.actualEventAt)} UTC</dd></div>
              <div><dt>Event type</dt><dd>Isolated cash dividend</dd></div>
              <div><dt>Company payment date</dt><dd>{event.companyPaymentDate ? formatDate(event.companyPaymentDate) : 'Not recorded'}</dd></div>
              <div><dt>Evidence</dt><dd>{event.evidenceKind === 'issuer_api' ? 'Issuer API record' : 'Finalized onchain reconstruction'}</dd></div>
              <div><dt>Fixture status</dt><dd>{event.issuerRecordStatus}</dd></div>
            </dl>
            <figure className="split-art"><img src="/assets/stock-dividend-coupon.png" alt="Blue stock certificate with an amber dividend coupon detached by a narrow gap." /><figcaption>One backed position; two separately owned claims. Illustration proportions are conceptual.</figcaption></figure>
          </> : <div className="unavailable"><span aria-hidden="true">×</span><h2>This token is not ready for the rehearsal.</h2><p>{selected.statusDetail}</p><p>We need a verified dividend event before this option can be used.</p></div>}
        </section>
        <section className="calculator-column">
          <div className="calculator-heading"><p className="eyebrow">Scenario</p><h2>See what you’d get.</h2><p>Try a pre-event stock amount before using the Seller’s test balance.</p></div>
          <label className="amount-field"><span>Pre-event stock equivalent</span><div><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!event} aria-describedby="amount-unit" data-testid="stock-amount" /><b id="amount-unit">{selected.symbol}</b></div></label>
          {preview && event && <Allocation preview={preview} asset={selected} event={event} />}
          {(previewError || error) && <div role="alert" className="error-banner">{previewError || error}</div>}
          <button className="primary-action" disabled={!event || !preview || preview.collateralRaw === 0n || busy} onClick={startSplit} data-testid="start-split">{busy ? 'Creating local position…' : 'Split from Seller test balance'} <span>→</span></button>
          <p className="action-note">Uses the Seller’s seeded test balance. No wallet, signature, network transaction, or live deposit.</p>
          {preview && <details className="raw-inspector"><summary>Raw allocation values</summary><dl><div><dt>Collateral represented</dt><dd>{preview.collateralRaw.toLocaleString()}</dd></div><div><dt>Paired PT claim supply</dt><dd>{preview.pairedClaimRaw.toLocaleString()}</dd></div><div><dt>Paired DR claim supply</dt><dd>{preview.pairedClaimRaw.toLocaleString()}</dd></div><div><dt>PT redemption allocation</dt><dd>{preview.ptPoolRaw.toLocaleString()}</dd></div><div><dt>DR redemption allocation</dt><dd>{preview.drPoolRaw.toLocaleString()}</dd></div></dl><p>Both claim supplies equal deposited raw Q. Allocation amounts differ because the two claims redeem separate pools.</p></details>}
          <SourceInspector asset={selected} event={event} />
        </section>
      </div>
    </main>
  );
}

function WalletTable({ state, series, asset, factor }: { state: DemoState; series: DemoSeries; asset: AssetDescriptor; factor: string }) {
  const seriesId = series.id;
  const claimBase = series.originalSupplyRaw || series.accountedCollateralRaw;
  return (
    <section className="wallet-ledger" aria-label="Demo balances">
      <div className="ledger-head"><span>Demo balance</span><b>Seller</b><b>Buyer</b></div>
      <div><span>Test USDC</span><strong>{formatUsdc(state.wallets.seller.usdc, 2)}</strong><strong>{formatUsdc(state.wallets.buyer.usdc, 2)}</strong></div>
      <div><span>{asset.symbol} collateral</span><strong>{formatScaled(state.wallets.seller.collateral[asset.id] ?? 0n, asset.decimals, factor, 4)}</strong><strong>{formatScaled(state.wallets.buyer.collateral[asset.id] ?? 0n, asset.decimals, factor, 4)}</strong></div>
      <div className="stock-ledger"><span>Stock exposure (PT) ownership</span><strong>{formatPercent(state.wallets.seller.claims[seriesId]?.pt ?? 0n, claimBase)}</strong><strong>{formatPercent(state.wallets.buyer.claims[seriesId]?.pt ?? 0n, claimBase)}</strong></div>
      <div className="dividend-ledger"><span>Dividend rights (DR) ownership</span><strong>{formatPercent(state.wallets.seller.claims[seriesId]?.dr ?? 0n, claimBase)}</strong><strong>{formatPercent(state.wallets.buyer.claims[seriesId]?.dr ?? 0n, claimBase)}</strong></div>
    </section>
  );
}

function RedemptionControl({ state, asset, event, seriesId, walletId, side, busy, run }: { state: DemoState; asset: AssetDescriptor; event: EventDescriptor; seriesId: string; walletId: WalletId; side: ClaimSide; busy: boolean; run: (wallet: WalletId, side: ClaimSide, raw: bigint) => void }) {
  const balance = state.wallets[walletId].claims[seriesId]?.[side] ?? 0n;
  const [input, setInput] = useState('');
  let raw = 0n;
  try { raw = input ? toRawAmount(input, asset.decimals, '1') : 0n; } catch { raw = 0n; }
  let payout = 0n;
  if (raw > 0n && raw <= balance) {
    try { payout = client.previewRedemption(seriesId, walletId, side, raw); } catch { payout = 0n; }
  }
  const maxDisplay = formatUnits(balance, asset.decimals, asset.decimals);
  return (
    <div className={`redeem-control ${side}`}>
      <div><span>{walletId === 'seller' ? 'Seller' : 'Buyer'} · {side === 'pt' ? 'Stock exposure (PT)' : 'Dividend rights (DR)'}</span><b>{formatUnits(balance, asset.decimals, 4)} claims</b></div>
      <label><span>Claims to redeem</span><input value={input} inputMode="decimal" placeholder="0" onChange={(event) => setInput(event.target.value)} /></label>
      <div className="mini-actions"><button onClick={() => setInput(formatUnits(balance / 2n, asset.decimals, asset.decimals))} disabled={!balance}>50%</button><button onClick={() => setInput(maxDisplay)} disabled={!balance}>Max</button><button className="redeem-button" onClick={() => run(walletId, side, raw)} disabled={busy || raw <= 0n || raw > balance || payout <= 0n}>Redeem · {formatScaled(payout, asset.decimals, event.m1, 4)} {asset.symbol}</button></div>
    </div>
  );
}

function Positions({ account, selected, onReset }: { account: WalletId; selected: AssetDescriptor; onReset: () => void }) {
  const [state, setState] = useState(() => client.getState());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [offer, setOffer] = useState(selected.issuerId === 'backpack' ? '5' : '30');
  const [saleMode, setSaleMode] = useState<'percent' | 'exact'>('percent');
  const [saleAmount, setSaleAmount] = useState('100');
  const [quote, setQuote] = useState<SaleQuote>();
  const availableSeries = Object.values(state.series);
  const [activeSeriesId, setActiveSeriesId] = useState(() => availableSeries.at(-1)?.id ?? '');
  const series = state.series[activeSeriesId] ?? availableSeries.at(-1);
  const asset = series ? assets.find((item) => item.id === series.assetId)! : selected;
  const event = series ? eventsById.get(series.eventId)! : undefined;
  const claims = series ? state.wallets.seller.claims[series.id] : undefined;
  const sellerDr = claims?.dr ?? 0n;

  function refresh() { setState(client.getState()); }
  function run(label: string, action: () => Promise<unknown>) {
    setBusy(label); setError('');
    action().then(() => { refresh(); setQuote(undefined); }).catch((cause) => { refresh(); setQuote(undefined); setError(errorText(cause)); }).finally(() => setBusy(''));
  }
  function saleRaw(): bigint {
    if (saleMode === 'percent') {
      if (!/^\d+(?:\.\d{1,2})?$/.test(saleAmount)) return 0n;
      try {
        const percent = parseDecimal(saleAmount);
        if (percent.numerator <= 0n || percent.numerator > 100n * percent.denominator) return 0n;
        return sellerDr * percent.numerator / (100n * percent.denominator);
      } catch { return 0n; }
    }
    try { return toRawAmount(saleAmount, asset.decimals, '1'); } catch { return 0n; }
  }
  function reviewQuote() {
    setError('');
    try { setQuote(client.quoteSale(series!.id, saleRaw(), parseUsdc(offer))); } catch (cause) { setError(errorText(cause)); }
  }
  function reset() { client.reset(); refresh(); setQuote(undefined); setError(''); onReset(); }
  function condition(value: DemoCondition) { client.setCondition(value); refresh(); setQuote(undefined); setError(value === 'ready' ? '' : `Demo condition set to ${value.replace('_', ' ')}. Try the primary action to inspect the rejection.`); }

  if (!series) return (
    <main id="main" className="page positions-page empty-positions">
      <div><p className="eyebrow">Positions</p><h1>No demo position yet.</h1><p>Calculate an eligible event and start a demo split. The Seller’s collateral and the two claim balances will appear here.</p></div>
      <img src="/assets/stock-and-dividend-composability.png" alt="Blue stock-exposure certificate and amber dividend coupon each linked conceptually to a wallet and trading app." />
      <p className="concept-caption">Concept only: both claims can be held independently. No wallet or app integration is active in this rehearsal.</p>
    </main>
  );

  const settled = series.phase === 'settled';
  const saleDone = state.receipts.some((receipt) => receipt.seriesId === series.id && receipt.action === 'sale');
  const displayFactor = series.replayClock === 'before_event' ? event!.m0 : event!.m1;
  const replay = () => run('replay', async () => { await client.closeDeposits(series.id); await client.settle(series.id); });
  return (
    <main id="main" className="page positions-page">
      <section className="position-title"><div><p className="eyebrow">Two-account rehearsal</p><h1>{asset.company} <span>{asset.symbol}</span></h1><p>Follow custody, sale proceeds, claim ownership and final payouts across both test accounts.</p>{availableSeries.length > 1 && <label className="series-select"><span>Demo position</span><select value={series.id} onChange={(e) => { setActiveSeriesId(e.target.value); setQuote(undefined); setError(''); }}>{availableSeries.map((item) => { const itemAsset = assets.find((candidate) => candidate.id === item.assetId)!; return <option key={item.id} value={item.id}>{itemAsset.company} · {itemAsset.symbol}</option>; })}</select></label>}</div><div className="phase"><span>Replay clock</span><b>{series.replayClock === 'before_event' ? 'Before event' : 'At historical event'}</b><small>Original event · {formatDate(event!.actualEventAt)} UTC</small></div></section>
      <WalletTable state={state} series={series} asset={asset} factor={displayFactor} />
      {error && <div role="alert" className="error-banner position-error">{error}</div>}
      {series.phase === 'open' && !saleDone && sellerDr > 0n && <section className="next-action sale-stage" data-testid="sale-stage">
        <div className="step-number">01</div>
        <div className="step-copy"><p className="eyebrow">Next action</p><h2>Sell Dividend rights to the Buyer.</h2><p>The Buyer pays test USDC and receives DR. The Seller keeps PT and receives the sale proceeds.</p></div>
        <div className="sale-form">
          <fieldset><legend>DR amount</legend><div className="segmented"><button className={saleMode === 'percent' ? 'active' : ''} onClick={() => { setSaleMode('percent'); setSaleAmount('100'); }}>Percentage</button><button className={saleMode === 'exact' ? 'active' : ''} onClick={() => { setSaleMode('exact'); setSaleAmount(''); }}>Exact claims</button></div><label><span>{saleMode === 'percent' ? 'Percentage of Seller DR' : 'DR claim balance'}</span><div className="inline-input"><input value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} inputMode="decimal" data-testid="sale-amount" /><b>{saleMode === 'percent' ? '%' : 'DR'}</b><button onClick={() => setSaleAmount(saleMode === 'percent' ? '100' : formatUnits(sellerDr, asset.decimals, asset.decimals))}>Max</button></div></label><small>{formatUnits(saleRaw(), asset.decimals, 6)} of {formatUnits(sellerDr, asset.decimals, 6)} DR claims</small></fieldset>
          <label className="offer-field"><span>Example total offer · test USDC</span><input value={offer} onChange={(e) => setOffer(e.target.value)} inputMode="decimal" data-testid="offer-input" /><small>Price paid for DR; separate from the projected stock-token redemption allocation.</small></label>
          {!quote ? <button className="primary-action" onClick={reviewQuote} disabled={saleRaw() <= 0n || !offer}>Review Buyer’s offer</button> : <div className="quote-review" data-testid="quote-review"><p><span>Buyer pays Seller</span><b>{formatUsdc(quote.usdcTotalRaw, 2)} test USDC</b></p><p><span>Buyer receives from Seller</span><b>{formatUnits(quote.drRaw, asset.decimals, 6)} DR claims</b></p><small>Buyer-scoped local acceptance · expires in 60 seconds · no signature</small><div><button className="primary-action" onClick={() => run('sale', () => client.acceptSale(quote.id))} disabled={!!busy}>Accept as Buyer</button><button className="secondary-action" onClick={() => run('reject', () => client.acceptSale(quote.id, { reject: true }))} disabled={!!busy}>Reject offer</button><button className="secondary-action" onClick={() => setQuote(undefined)} disabled={!!busy}>Edit offer</button></div></div>}
        </div>
      </section>}
      {series.phase === 'open' && saleDone && <section className="next-action replay-stage"><div className="step-number">02</div><div className="step-copy"><p className="eyebrow">Next action</p><h2>Replay the dividend.</h2><p>The sale is complete. Deposits will close and the local clock will move to the sourced event.</p><button className="primary-action" onClick={replay} disabled={!!busy}>Replay dividend →</button></div></section>}
      {series.phase === 'closed' && <section className="next-action replay-stage"><div className="step-number">03</div><div className="step-copy"><p className="eyebrow">Finish replay</p><h2>Finish settling the dividend.</h2><p>Deposits are already closed at {formatDate(event!.actualEventAt)} UTC. Complete the interrupted replay without moving balances twice.</p><button className="primary-action" onClick={() => run('settle', () => client.settle(series.id))} disabled={!!busy}>Finish replay →</button></div></section>}
      {settled && <section className="next-action redemption-stage"><div className="step-number">03</div><div className="step-copy"><p className="eyebrow">Independent redemption</p><h2>Redeem your share.</h2><p>You are acting as the {account === 'seller' ? 'Seller' : 'Buyer'}. Switch the demo account in the header to redeem the other owner’s claims. Both balances stay visible.</p></div><div className="redemption-grid">{(['pt', 'dr'] as ClaimSide[]).map((side) => <RedemptionControl key={`${account}-${side}`} state={state} asset={asset} event={event!} seriesId={series.id} walletId={account} side={side} busy={!!busy} run={(walletId, claimSide, raw) => run('redeem', () => client.redeem(series.id, walletId, claimSide, raw))} />)}</div></section>}
      {series.phase === 'complete' && <section className="completed-state"><span aria-hidden="true">✓</span><div><p className="eyebrow">Run complete</p><h2>All claims redeemed.</h2><p>PT and DR claim supplies are zero, and both redemption pools are empty. The final collateral and test-USDC balances remain above for review.</p></div><button className="secondary-action" onClick={reset}>Reset & start a new run</button></section>}
      <section className="receipt-log"><div><p className="eyebrow">Local records</p><h2>Demo receipts</h2><p>These are in-memory records, not transaction signatures. Refresh or reset starts over.</p></div><ol>{state.receipts.filter((receipt) => receipt.seriesId === series.id).slice().reverse().map((receipt) => { const view = receiptPresentation(receipt, asset); return <li key={receipt.id}><span>{receipt.action.replace('_', ' ')}</span><div><b>{view.title}</b><small>{view.detail}</small><details><summary>Exact changes</summary><code>{receipt.id}</code>{receipt.changes.map((change, index) => <code key={index}>{change.walletId ?? 'series'} · {change.field} · {change.delta.toString()} raw{change.assetId ? ` · ${shortId(change.assetId)}` : ''}</code>)}</details></div></li>; })}</ol></section>
      <details className="demo-tools"><summary>Demo controls & error states</summary><div><p>Use these controls to rehearse blocked states. Changing condition invalidates open quotes.</p><div className="tool-buttons"><button onClick={() => condition('ready')}>Ready</button><button onClick={() => condition('stale')}>Stale data</button><button onClick={() => condition('paused')}>Paused collateral</button><button onClick={() => condition('rejected_event')}>Rejected event</button><button onClick={() => { setOffer(''); setQuote(undefined); }}>Empty offer</button><button onClick={() => { setBusy('loading'); window.setTimeout(() => setBusy(''), 900); }}>Preview loading</button><button className="reset" onClick={reset}>Reset run</button></div><p className="condition-readout">Current condition: <b>{state.condition.replace('_', ' ')}</b>{busy ? ` · Loading ${busy}…` : ''}</p></div></details>
      <SourceInspector asset={asset} event={event} />
      <p className="account-context">Viewing as <b>{account === 'seller' ? 'Seller' : 'Buyer'}</b>. Both account balances remain visible for auditability.</p>
    </main>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('market');
  const [account, setAccount] = useState<WalletId>('seller');
  const [selected, setSelected] = useState(defaultAsset);
  const select = (asset: AssetDescriptor) => { setSelected(asset); setTab('split'); };
  return <><a className="skip-link" href="#main">Skip to content</a><Header tab={tab} setTab={setTab} account={account} setAccount={setAccount} /><DemoRibbon />{tab === 'market' && <Market onSelect={select} />}{tab === 'split' && <Split key={selected.id} selected={selected} setSelected={setSelected} onStarted={() => setTab('positions')} />}{tab === 'positions' && <Positions account={account} selected={selected} onReset={() => setTab('split')} />}<footer><BrandLogo variant="icon" /><span>DivX · local rehearsal</span><span>Source catalog frozen 16 Sep 2026</span></footer></>;
}
