import { useEffect, useState } from 'react';
import {
  createDemoClient,
  formatScaled,
  formatUnits,
  parseUsdc,
  toRawAmount,
  type AssetDescriptor,
  type ClaimSide,
  type DemoSeries,
  type DemoState,
  type EventDescriptor,
  type IssuerId,
  type WalletId,
} from '@dividendx/sdk';
import assetData from '@fixtures/catalog.json';
import eventData from '@fixtures/events.json';

const assets = assetData as AssetDescriptor[];
const events = eventData as EventDescriptor[];
const eventMap = new Map(events.map((event) => [event.id, event]));
const productClient = createDemoClient(assets, events);
const defaultAsset = assets.find((asset) => asset.symbol === 'KOx')!;
const companyOrder = ['Coca-Cola', 'Apple', 'Microsoft', 'Micron', 'Nike', 'IBM'];
const issuerLabel: Record<IssuerId, string> = { xstocks: 'xStocks', backpack: 'Backpack / Trek', ondo: 'Ondo' };

type ProductTab = 'market' | 'split' | 'redeem';
type Filter = 'all' | IssuerId;

function Mark() { return <span className="p-mark" aria-hidden="true"><i /><b /></span>; }
function textError(cause: unknown) { return (cause as Error)?.message || 'That action could not be completed.'; }
function date(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined, timeZone: 'UTC' }).format(new Date(value)); }
function min(a: bigint, b: bigint) { return a < b ? a : b; }

function ProductHeader({ tab, setTab }: { tab: ProductTab; setTab: (tab: ProductTab) => void }) {
  return <>
    <header className="p-header">
      <button className="p-brand" onClick={() => setTab('market')} aria-label="DividendX home"><Mark />DividendX</button>
      <nav aria-label="Primary">{(['market', 'split', 'redeem'] as ProductTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
      <span className="balance-label">Your test balance</span>
    </header>
    <div className="preview-banner"><b>Interactive preview · test balances</b><span>No tokens or transactions are onchain yet.</span><a href="/rehearsal/">Open detailed rehearsal →</a></div>
  </>;
}

function CapabilityStrip() {
  return <section className="capabilities"><div><p className="eyebrow">Use your tokens</p><h2>Built to move beyond the split.</h2><p>PT and DR are designed as separate tokens. These actions need deployed tokens and a compatible venue.</p></div><div className="capability-list"><button disabled>Transfer <span>Requires onchain tokens</span></button><button disabled>Trade <span>No live market connected</span></button><button disabled>Provide liquidity <span>No pool connected</span></button></div></section>;
}

function ProductMarket({ choose }: { choose: (asset: AssetDescriptor) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const visible = assets.filter((asset) => `${asset.company} ${asset.underlying} ${asset.symbol}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || asset.issuerId === filter));
  const hasCompanies = companyOrder.some((company) => visible.some((asset) => asset.company === company));
  return <main id="product-main" className="p-page market-product">
    <section className="p-hero"><p className="eyebrow">Market</p><h1>Choose a stock.<br /><span>Separate its dividends.</span></h1><p>Pick the company first, then the exact stock token and issuer.</p></section>
    <section className="p-filters"><label><span>Search company or ticker</span><input placeholder="Coca-Cola, KO…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div aria-label="Issuer filter">{(['all', 'xstocks', 'backpack', 'ondo'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All issuers' : issuerLabel[item]}</button>)}</div></section>
    <section className="company-directory">{companyOrder.map((company) => {
      const tokens = visible.filter((asset) => asset.company === company);
      if (!tokens.length) return null;
      return <article className="company-section" key={company}>
        <header><span>Company</span><h2>{company}</h2><b>{tokens[0].underlying}</b></header>
        <div className="token-children"><p>Available stock tokens</p>{tokens.map((asset) => <button key={asset.id} className="token-child" onClick={() => choose(asset)} data-testid={`product-asset-${asset.symbol}`}><span><b>{asset.symbol}</b><small>{issuerLabel[asset.issuerId]}</small></span>{asset.eventFixtureId ? <><em className="ready">Historical example ready</em><strong>Try split →</strong></> : <><em>Dividend data pending</em><small>{asset.issuerId === 'ondo' ? 'A verified dividend event is still needed.' : 'This event still needs review.'}</small></>}</button>)}</div>
      </article>;
    })}{!hasCompanies && <div className="product-empty"><h2>No matching stock tokens</h2><p>Clear the search or choose another issuer.</p></div>}</section>
  </main>;
}

function TokenBalances({ state, series, asset, wallet = 'seller' }: { state: DemoState; series: DemoSeries; asset: AssetDescriptor; wallet?: WalletId }) {
  const claims = state.wallets[wallet].claims[series.id] ?? { pt: 0n, dr: 0n };
  return <div className="your-tokens"><div><span className="pt-dot" /><p>Stock exposure <b>PT</b></p><strong>{formatUnits(claims.pt, asset.decimals, 6)}</strong><small>tokens</small></div><span className="plus">+</span><div><span className="dr-dot" /><p>Dividend rights <b>DR</b></p><strong>{formatUnits(claims.dr, asset.decimals, 6)}</strong><small>tokens</small></div></div>;
}

function Details({ asset, event, preview }: { asset: AssetDescriptor; event?: EventDescriptor; preview?: ReturnType<typeof productClient.preview> }) {
  return <details className="product-details"><summary>Details & sources</summary><div className="detail-grid"><div><span>Company / token / issuer</span><b>{asset.company} · {asset.symbol} · {issuerLabel[asset.issuerId]}</b></div><div><span>Exact mint</span><code>{asset.mint}</code></div>{event && <><div><span>Historical event</span><b>{date(event.actualEventAt)} UTC</b></div><div><span>Series</span><code>{event.id}</code></div><div><span>Factors</span><code>M0 {event.m0} · M1 {event.m1}</code></div></>}{preview && <><div><span>Exact deposited collateral</span><code>{preview.collateralRaw.toString()} raw</code></div><div><span>Exact claim mint</span><code>{preview.pairedClaimRaw.toString()} raw PT + DR</code></div><div><span>Redemption allocations</span><code>PT {preview.ptPoolRaw.toString()} · DR {preview.drPoolRaw.toString()} raw</code></div></>}</div><p>PT and DR mint in equal raw quantities. The entered stock amount uses the token’s display multiplier, so its readable number can differ from the claim-token quantity.</p><div className="detail-links">{[...asset.sourceUrls, ...(event?.sourceUrls ?? [])].filter((url, index, all) => all.indexOf(url) === index).map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Source {index + 1} ↗</a>)}</div></details>;
}

function ProductSplit({ selected, state, refresh, goRedeem, onCreated }: { selected: AssetDescriptor; state: DemoState; refresh: () => void; goRedeem: (id: string) => void; onCreated: (id: string) => void }) {
  const [amount, setAmount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const event = selected.eventFixtureId ? eventMap.get(selected.eventFixtureId) : undefined;
  let preview: ReturnType<typeof productClient.preview> | undefined;
  let previewError = '';
  if (event) { try { preview = productClient.preview(selected.id, amount); } catch (cause) { previewError = textError(cause); } }
  const series = event ? state.series[event.id] : undefined;
  const balanceFactor = series?.replayClock === 'at_event' ? event?.m1 : event?.m0;
  const balance = event && balanceFactor ? formatScaled(state.wallets.seller.collateral[selected.id] ?? 0n, selected.decimals, balanceFactor, 4) : '0';
  async function split() { setBusy(true); setError(''); try { await productClient.deposit(selected.id, amount); refresh(); onCreated(event!.id); } catch (cause) { setError(textError(cause)); } finally { setBusy(false); } }
  const seriesFinished = series?.phase === 'cancelled' || series?.phase === 'complete';
  return <main id="product-main" className="p-page split-product">
    <section className="split-product-head"><div><p className="eyebrow">Split</p><h1>One stock.<br /><span>Two tokens.</span></h1><p>{selected.company} · {selected.symbol} · {issuerLabel[selected.issuerId]}</p></div><img src="/assets/stock-dividend-coupon.png" alt="Blue stock certificate with an amber dividend coupon detached by a narrow gap." /></section>
    <section className="split-action-panel"><div className="deposit-side"><span className="flow-label">You deposit</span><label><span>Stock amount</span><div><input data-testid="product-split-amount" value={amount} inputMode="decimal" disabled={!event} onChange={(e) => setAmount(e.target.value)} /><b>{selected.symbol}</b></div></label><p>Your test balance · <b>{balance} {selected.symbol}</b></p></div><div className="flow-arrow" aria-hidden="true">→</div><div className="receive-side"><span className="flow-label">You receive</span>{preview ? <div className="mint-result" data-testid="mint-result"><div><span className="pt-dot" /><b>{formatUnits(preview.pairedClaimRaw, selected.decimals, 6)} PT</b><small>Stock exposure</small></div><span>+</span><div><span className="dr-dot" /><b>{formatUnits(preview.pairedClaimRaw, selected.decimals, 6)} DR</b><small>Dividend rights</small></div></div> : <p className="pending-copy">Choose a token with a reviewed historical example.</p>}</div></section>
    <div className="claim-explainer"><p><span className="pt-dot" /><b>Stock exposure (PT)</b> is the stock exposure, without this dividend.</p><p><span className="dr-dot" /><b>Dividend rights (DR)</b> is the dividend portion, paid in {selected.symbol}.</p></div>
    {(error || previewError) && <div role="alert" className="p-error">{error || previewError}</div>}
    {!series ? <button className="p-primary split-button" data-testid="product-split-action" disabled={!preview || preview.collateralRaw === 0n || busy} onClick={split}>{busy ? 'Splitting test balance…' : 'Split'} <span>→</span></button> : seriesFinished ? <section className="after-split"><p className="eyebrow">Series complete</p><h2>{series.phase === 'cancelled' ? 'Your stock token was returned.' : 'All claims were redeemed.'}</h2><p>Reset the preview to start this historical example again.</p></section> : <section className="after-split"><p className="eyebrow">Your tokens</p><TokenBalances state={state} series={series} asset={selected} /><button className="p-primary" onClick={() => goRedeem(series.id)}>Redeem <span>→</span></button></section>}
    <CapabilityStrip />
    <Details asset={selected} event={event} preview={preview} />
  </main>;
}

function AmountControl({ label, balance, decimals, onSubmit, payout, eligible, unit, busy, actionLabel = 'Redeem' }: { label: string; balance: bigint; decimals: number; onSubmit: (raw: bigint) => void; payout: (raw: bigint) => string; eligible?: (raw: bigint) => boolean; unit: string; busy: boolean; actionLabel?: string }) {
  const [input, setInput] = useState('');
  let raw = 0n;
  try { raw = input ? toRawAmount(input, decimals, '1') : 0n; } catch { raw = 0n; }
  const payoutText = payout(raw);
  return <div className="amount-control"><label><span>{label}</span><input value={input} inputMode="decimal" placeholder="0" onChange={(e) => setInput(e.target.value)} /></label><div className="amount-shortcuts"><button disabled={!balance} onClick={() => setInput(formatUnits(balance / 2n, decimals, decimals))}>50%</button><button disabled={!balance} onClick={() => setInput(formatUnits(balance, decimals, decimals))}>Max</button></div><p>You receive · <b>{payoutText} {unit}</b></p><button className="p-primary" disabled={busy || raw <= 0n || raw > balance || (eligible ? !eligible(raw) : false)} onClick={() => onSubmit(raw)}>{actionLabel}</button></div>;
}

function ProductRedeem({ state, refresh, activeId, setActiveId, owner }: { state: DemoState; refresh: () => void; activeId: string; setActiveId: (id: string) => void; owner: WalletId }) {
  const seriesList = Object.values(state.series);
  const series = state.series[activeId] ?? seriesList.at(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => { setError(''); setSuccess(''); }, [series?.id, owner]);
  if (!series) return <main id="product-main" className="p-page redeem-empty"><p className="eyebrow">Redeem</p><h1>Your tokens will appear here.</h1><p>Choose a historical example in Market and split a test balance first.</p></main>;
  const asset = assets.find((item) => item.id === series.assetId)!;
  const event = eventMap.get(series.eventId)!;
  const claims = state.wallets[owner].claims[series.id] ?? { pt: 0n, dr: 0n };
  const capacity = min(claims.pt, claims.dr);
  const clockFactor = series.replayClock === 'before_event' ? event.m0 : event.m1;
  const underlyingBalance = formatScaled(state.wallets[owner].collateral[asset.id] ?? 0n, asset.decimals, clockFactor, 6);
  function redemptionRaw(side: ClaimSide, raw: bigint): bigint { try { return raw > 0n && raw <= claims[side] ? productClient.previewRedemption(series.id, owner, side, raw) : 0n; } catch { return 0n; } }
  function redemptionDisplay(side: ClaimSide, raw: bigint): string { const exact = redemptionRaw(side, raw); const shown = formatScaled(exact, asset.decimals, event.m1, 6); return exact > 0n && /^0(?:\.0+)?$/.test(shown) ? '<0.000001' : shown; }
  function action(label: string, work: () => Promise<unknown>) { setBusy(true); setError(''); setSuccess(''); work().then(() => { refresh(); setSuccess(label); }).catch((cause) => setError(textError(cause))).finally(() => setBusy(false)); }
  const select = seriesList.length > 1 ? <label className="series-picker"><span>Token series</span><select value={series.id} onChange={(e) => setActiveId(e.target.value)}>{seriesList.map((item) => { const token = assets.find((candidate) => candidate.id === item.assetId)!; return <option value={item.id} key={item.id}>{token.company} · {token.symbol} · {issuerLabel[token.issuerId]}</option>; })}</select></label> : null;
  return <main id="product-main" className="p-page redeem-product">
    <section className="redeem-head"><div><p className="eyebrow">Redeem</p><h1>{asset.company} <span>{asset.symbol}</span></h1><p>{issuerLabel[asset.issuerId]} · {owner === 'seller' ? 'Your test balance' : 'Dividend buyer'}</p></div>{select}</section>
    <TokenBalances state={state} series={series} asset={asset} wallet={owner} />
    <p className="underlying-balance">{asset.symbol} stock-token balance · <b>{underlyingBalance} {asset.symbol}</b></p>
    {error && <div role="alert" className="p-error">{error}</div>}{success && <div role="status" className="p-success">✓ {success}</div>}
    {(series.phase === 'open' || series.phase === 'closed') && <section className="redeem-mode"><div><p className="eyebrow">Combine PT + DR</p><h2>Get your stock token back.</h2><p>Matching PT and DR from this exact series combine into the underlying {asset.symbol}. You can combine up to {formatUnits(capacity, asset.decimals, 6)} pairs.</p></div><AmountControl key={`${series.id}-${owner}-combine-${capacity}`} label="Paired amount" balance={capacity} decimals={asset.decimals} busy={busy} unit={asset.symbol} actionLabel="Combine & redeem stock" payout={(raw) => formatScaled(raw <= capacity ? raw : 0n, asset.decimals, clockFactor, 6)} onSubmit={(raw) => action(`You received ${formatScaled(raw, asset.decimals, clockFactor, 6)} ${asset.symbol}`, () => productClient.recombine(series.id, owner, raw))} /></section>}
    {series.phase === 'settled' && <section className="redeem-mode separate"><div><p className="eyebrow">Redeem tokens</p><h2>Redeem each token separately.</h2><p>Each side returns its share in {asset.symbol}. You never need to own the other side after payout is ready.</p></div><div className="separate-controls"><AmountControl key={`${series.id}-${owner}-pt-${claims.pt}`} label={`Stock exposure · ${formatUnits(claims.pt, asset.decimals, 6)} PT`} balance={claims.pt} decimals={asset.decimals} busy={busy} unit={asset.symbol} payout={(raw) => redemptionDisplay('pt', raw)} eligible={(raw) => redemptionRaw('pt', raw) > 0n} onSubmit={(raw) => action(`You received ${redemptionDisplay('pt', raw)} ${asset.symbol}`, () => productClient.redeem(series.id, owner, 'pt', raw))} /><AmountControl key={`${series.id}-${owner}-dr-${claims.dr}`} label={`Dividend rights · ${formatUnits(claims.dr, asset.decimals, 6)} DR`} balance={claims.dr} decimals={asset.decimals} busy={busy} unit={asset.symbol} payout={(raw) => redemptionDisplay('dr', raw)} eligible={(raw) => redemptionRaw('dr', raw) > 0n} onSubmit={(raw) => action(`You received ${redemptionDisplay('dr', raw)} ${asset.symbol}`, () => productClient.redeem(series.id, owner, 'dr', raw))} /></div></section>}
    {(series.phase === 'cancelled' || series.phase === 'complete') && <section className="product-complete"><span>✓</span><div><p className="eyebrow">Complete</p><h2>{series.phase === 'cancelled' ? 'Stock token returned.' : 'All of this series has been redeemed.'}</h2><p>{series.phase === 'cancelled' ? 'All matching PT and DR were combined. No tokens remain in this series.' : 'You’ve redeemed all PT and DR in this example.'}</p></div></section>}
    <Details asset={asset} event={event} />
  </main>;
}

function SimulationControls({ state, refresh, activeId, owner, setOwner, reset }: { state: DemoState; refresh: () => void; activeId: string; owner: WalletId; setOwner: (id: WalletId) => void; reset: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const series = state.series[activeId] ?? Object.values(state.series).at(-1);
  useEffect(() => { setMessage(''); }, [series?.id]);
  async function settle() { if (!series) return; setBusy(true); setMessage(''); try { const latest = productClient.getState().series[series.id]; if (latest.phase === 'open') await productClient.closeDeposits(series.id); if (productClient.getState().series[series.id].phase === 'closed') await productClient.settle(series.id); refresh(); setMessage('Dividend payout is ready in the simulation.'); } catch (cause) { refresh(); setMessage(textError(cause)); } finally { setBusy(false); } }
  async function partialSale() { if (!series) return; setBusy(true); setMessage(''); try { const sellerDr = productClient.getState().wallets.seller.claims[series.id]?.dr ?? 0n; const raw = sellerDr * 40n / 100n; const asset = assets.find((item) => item.id === series.assetId)!; const quote = productClient.quoteSale(series.id, raw, parseUsdc(asset.issuerId === 'backpack' ? '5' : '30')); await productClient.acceptSale(quote.id); refresh(); setMessage(`Dividend buyer paid ${asset.issuerId === 'backpack' ? '5' : '30'} test USDC for 40% of your DR.`); } catch (cause) { setMessage(textError(cause)); } finally { setBusy(false); } }
  const target = series ? assets.find((item) => item.id === series.assetId) : undefined;
  return <details className="simulation-controls"><summary>Preview controls</summary><div><p>Simulation only{target ? ` for ${target.company} ${target.symbol}` : ''}. Refresh and Reset preview both start over.</p><div className="sim-actions"><button onClick={settle} disabled={!series || busy || series.phase === 'settled' || series.phase === 'complete' || series.phase === 'cancelled'}>Show dividend payout ready</button><button onClick={partialSale} disabled={!series || busy || series.phase !== 'open' || !(state.wallets.seller.claims[series.id]?.dr > 0n)}>Sell 40% DR to Dividend buyer</button><button onClick={() => setOwner(owner === 'seller' ? 'buyer' : 'seller')} disabled={!series}>View {owner === 'seller' ? 'Dividend buyer' : 'Your test balance'}</button><button onClick={reset}>Reset preview</button><a href="/rehearsal/">Open detailed rehearsal →</a></div>{message && <p role="status" className="sim-message">{message}</p>}</div></details>;
}

export function ProductApp() {
  const [tab, setTab] = useState<ProductTab>('market');
  const [selected, setSelected] = useState(defaultAsset);
  const [state, setState] = useState(() => productClient.getState());
  const [activeId, setActiveId] = useState('');
  const [owner, setOwner] = useState<WalletId>('seller');
  const refresh = () => setState(productClient.getState());
  const choose = (asset: AssetDescriptor) => { setSelected(asset); setActiveId(asset.eventFixtureId && state.series[asset.eventFixtureId] ? asset.eventFixtureId : ''); setOwner('seller'); setTab('split'); };
  const goRedeem = (id: string) => { setActiveId(id); setOwner('seller'); setTab('redeem'); };
  const reset = () => { productClient.reset(); refresh(); setActiveId(''); setOwner('seller'); setTab('market'); };
  return <><a className="p-skip" href="#product-main">Skip to content</a><ProductHeader tab={tab} setTab={setTab} />{tab === 'market' && <ProductMarket choose={choose} />}{tab === 'split' && <ProductSplit key={selected.id} selected={selected} state={state} refresh={refresh} goRedeem={goRedeem} onCreated={setActiveId} />}{tab === 'redeem' && <ProductRedeem state={state} refresh={refresh} activeId={activeId} setActiveId={setActiveId} owner={owner} />}<footer className="p-footer"><div><Mark /><span>DividendX product preview</span></div><SimulationControls state={state} refresh={refresh} activeId={activeId} owner={owner} setOwner={setOwner} reset={reset} /></footer></>;
}
