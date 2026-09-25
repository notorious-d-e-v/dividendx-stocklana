import { useEffect, useState } from 'react';
import { formatScaled, formatUnits, toRawAmount, type AssetDescriptor, type EventDescriptor, type IssuerId } from '@dividendx/sdk';
import type { AnnualClaimSide } from '../../../packages/sdk/src/annual-reference';
import assetData from '@fixtures/catalog.json';
import eventData from '@fixtures/events.json';
import { AnnualProductClient, type AnnualProductState, type ProductAccount, type ProductAnnualSeries, type ProductYear } from './annual-product-client';
import { BrandLogo } from './BrandLogo';

const assets = assetData as AssetDescriptor[];
const events = eventData as EventDescriptor[];
const eventMap = new Map(events.map((event) => [event.id, event]));
const productClient = new AnnualProductClient(assets, events);
const defaultAsset = assets.find((asset) => asset.symbol === 'KOx')!;
const companyOrder = ['Coca-Cola', 'Apple', 'Microsoft', 'Micron', 'Nike', 'IBM'];
const issuerLabel: Record<IssuerId, string> = { xstocks: 'xStocks', backpack: 'Backpack / Trek', ondo: 'Ondo' };

type ProductTab = 'market' | 'split' | 'redeem';
type Filter = 'all' | IssuerId;

function min(a: bigint, b: bigint) { return a < b ? a : b; }
function textError(cause: unknown) { return (cause as Error)?.message || 'That action could not be completed.'; }
function sourceDate(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)); }
function statusText(series: ProductAnnualSeries): string {
  if (series.stage === 'finalized') return 'Ready to redeem';
  if (series.stage === 'year_ended') return 'Year ended · awaiting finalization';
  if (series.stage === 'collecting') return 'Collecting dividends';
  return 'Deposits open · year not started';
}
function stockRaw(state: AnnualProductState, assetId: string, account: ProductAccount): bigint {
  return state.stockRaw[account][assetId] ?? 0n;
}

function ProductHeader({ tab, setTab }: { tab: ProductTab; setTab: (tab: ProductTab) => void }) {
  return <>
    <header className="p-header">
      <button className="p-brand" onClick={() => setTab('market')} aria-label="DivX home"><BrandLogo /></button>
      <nav aria-label="Primary">{(['market', 'split', 'redeem'] as ProductTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
      <span className="balance-label">Your test balance</span>
    </header>
    <div className="preview-banner"><b>Annual reference · in-memory</b><span>No wallet, program, issuer reader, or venue is connected.</span><a href="/app/" aria-label="Open local wallet app">App →</a><a href="/demos/">Guided demos →</a><a href="/rehearsal/">Open legacy event rehearsal →</a></div>
  </>;
}

function CapabilityStrip() {
  return <section className="capabilities"><div><p className="eyebrow">Use your tokens</p><h2>Built to move beyond the split.</h2><p>PT and DR are designed as separate tokens. These venue actions still require deployed claims and compatible infrastructure.</p></div><div className="capability-list"><button disabled>Wallet transfer <span>Requires onchain tokens</span></button><button disabled>Trade on AMM <span>No live market connected</span></button><button disabled>Provide liquidity <span>No pool connected</span></button></div></section>;
}

function ProductMarket({ choose }: { choose: (asset: AssetDescriptor) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const visible = assets.filter((asset) => `${asset.company} ${asset.underlying} ${asset.symbol}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || asset.issuerId === filter));
  const hasCompanies = companyOrder.some((company) => visible.some((asset) => asset.company === company));
  return <main id="product-main" className="p-page market-product">
    <section className="p-hero"><p className="eyebrow">Market</p><h1>Choose a stock.<br /><span>Separate a year of dividends.</span></h1><p>Pick the exact stock token and issuer, then choose its annual PT and DR series.</p></section>
    <section className="p-filters"><label><span>Search company or ticker</span><input placeholder="Coca-Cola, KO…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div aria-label="Issuer filter">{(['all', 'xstocks', 'backpack', 'ondo'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All issuers' : issuerLabel[item]}</button>)}</div></section>
    <section className="company-directory">{companyOrder.map((company) => {
      const tokens = visible.filter((asset) => asset.company === company);
      if (!tokens.length) return null;
      return <article className="company-section" key={company}>
        <header><span>Company</span><h2>{company}</h2><b>{tokens[0].underlying}</b></header>
        <div className="token-children"><p>Available stock tokens</p>{tokens.map((asset) => <button key={asset.id} className="token-child" onClick={() => choose(asset)} data-testid={`product-asset-${asset.symbol}`}><span><b>{asset.symbol}</b><small>{issuerLabel[asset.issuerId]}</small></span>{asset.eventFixtureId ? <><em className="ready">Historical factors · test term dates</em><strong>Choose annual series →</strong></> : <><em>Dividend data pending</em><small>{asset.issuerId === 'ondo' ? 'A verified Ondo dividend event is still needed.' : 'This asset still needs a reviewed event source.'}</small></>}</button>)}</div>
      </article>;
    })}{!hasCompanies && <div className="product-empty"><h2>No matching stock tokens</h2><p>Clear the search or choose another issuer.</p></div>}</section>
  </main>;
}

function TokenBalances({ series, asset, account = 'seller' }: { series: ProductAnnualSeries; asset: AssetDescriptor; account?: ProductAccount }) {
  const claims = series.model.accounts[account];
  return <div className="your-tokens"><div><span className="pt-dot" /><p>Stock exposure <b>PT</b></p><strong>{formatUnits(claims.ptRaw, asset.decimals, 6)}</strong><small>{series.model.ptSymbol}</small></div><span className="plus">+</span><div><span className="dr-dot" /><p>Annual dividend rights <b>DR</b></p><strong>{formatUnits(claims.drRaw, asset.decimals, 6)}</strong><small>{series.model.drSymbol}</small></div></div>;
}

function Details({ asset, event, year, series, previewRaw }: { asset: AssetDescriptor; event?: EventDescriptor; year: ProductYear; series?: ProductAnnualSeries; previewRaw?: bigint }) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const links = [...asset.sourceUrls, ...(event?.sourceUrls ?? [])].filter((url, index, all) => all.indexOf(url) === index);
  return <details className="product-details"><summary>Details & sources</summary><div className="detail-grid">
    <div><span>Company / token / issuer</span><b>{asset.company} · {asset.symbol} · {issuerLabel[asset.issuerId]}</b></div>
    <div><span>Exact mint</span><code>{asset.mint}</code></div>
    <div><span>Annual term identity</span><code>Solana · {asset.issuerId} · {asset.mint} · {year}</code></div>
    <div><span>Claims</span><code>PT-{asset.symbol}-{year} · DR-{asset.symbol}-{year}</code></div>
    <div><span>Deposit cutoff</span><b>{start} 00:00 UTC</b></div>
    <div><span>Term end / maturity</span><b>{end} 00:00 UTC</b></div>
    <div><span>Included events</span><b>Qualified dividends whose verified ex-date is in {year}</b></div>
    {event && <><div><span>Original sourced effective / activation time</span><b>{sourceDate(event.actualEventAt)} UTC</b></div><div><span>Verified source ex-date</span><b>Not present in this source fixture</b></div><div><span>Original source factors</span><code>M0 {event.m0} · M1 {event.m1}</code></div><div><span>Company payment date</span><b>{event.companyPaymentDate}</b></div></>}
    {series?.sourceTestExDate && <div><span>Synthetic term date for sourced factors</span><b>{series.sourceTestExDate} · test only</b></div>}
    {series?.syntheticTestExDate && <div><span>Second synthetic dividend</span><b>{series.syntheticTestExDate} · factor {series.activeFactor}</b></div>}
    {previewRaw !== undefined && <div><span>Exact paired claim mint</span><code>{previewRaw.toString()} raw PT + DR</code></div>}
    {series && <><div><span>Current test factor</span><code>{series.activeFactor}</code></div><div><span>Current annual allocation</span><code>PT {series.allocation.ptPoolRaw.toString()} · DR {series.allocation.drPoolRaw.toString()} raw</code></div><div><span>Lifecycle</span><b>{statusText(series)}</b></div></>}
  </div><p>Ex-date decides annual membership. Payment can arrive later, so maturity freezes the event window but does not finalize the journal or forfeit PT/DR claims.</p><p className="source-warning">One sourced dividend example, not a complete annual payout or a 2027 forecast. Its factors are replayed against clearly synthetic term dates because the source fixtures do not verify ex-dates.</p><div className="detail-links">{links.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Source {index + 1} ↗</a>)}</div></details>;
}

function ProductSplit({ selected, state, refresh, goRedeem, onCreated }: { selected: AssetDescriptor; state: AnnualProductState; refresh: () => void; goRedeem: (id: string) => void; onCreated: (id: string) => void }) {
  const [amount, setAmount] = useState('100');
  const [year, setYear] = useState<ProductYear>(2027);
  const [error, setError] = useState('');
  const event = selected.eventFixtureId ? eventMap.get(selected.eventFixtureId) : undefined;
  const id = event ? productClient.seriesId(selected, year) : '';
  const series = id ? state.series[id] : undefined;
  let previewRaw: bigint | undefined;
  let previewError = '';
  if (event && !series) { try { previewRaw = productClient.previewDeposit(selected, amount); } catch (cause) { previewError = textError(cause); } }
  const factor = series?.activeFactor ?? event?.m0 ?? '1';
  const balance = formatScaled(stockRaw(state, selected.id, 'seller'), selected.decimals, factor, 4);
  function split() { setError(''); try { const created = productClient.deposit(selected, year, amount); refresh(); onCreated(created); } catch (cause) { setError(textError(cause)); } }
  return <main id="product-main" className="p-page split-product">
    <section className="split-product-head"><div><p className="eyebrow">Split</p><h1>One stock.<br /><span>Two annual tokens.</span></h1><p>{selected.company} · {selected.symbol} · {issuerLabel[selected.issuerId]}</p></div><img src="/assets/stock-dividend-coupon.png" alt="Blue stock certificate with an amber dividend coupon detached by a narrow gap." /></section>
    <div className="annual-notice"><b>Deposit before the year starts.</b><span>New deposits close at 1 January {year} 00:00 UTC. DR follows every qualified ex-date inside that calendar year.</span></div>
    {event && <p className="term-disclosure"><b>Historical factors · test term dates.</b> One historical factor example, not a full-year payout or forecast.</p>}
    <section className="split-action-panel"><div className="deposit-side"><span className="flow-label">You deposit</span><label><span>Annual series</span><select data-testid="product-year" value={year} onChange={(e) => { setYear(Number(e.target.value) as ProductYear); setError(''); }}><option value={2027}>Calendar 2027</option><option value={2028}>Calendar 2028</option></select></label><label><span>Stock amount</span><div><input data-testid="product-split-amount" value={amount} inputMode="decimal" disabled={!event || !!series} onChange={(e) => setAmount(e.target.value)} /><b>{selected.symbol}</b></div></label><p>Current test stock balance · <b>{balance} {selected.symbol}</b></p></div><div className="flow-arrow" aria-hidden="true">→</div><div className="receive-side"><span className="flow-label">You receive</span>{previewRaw !== undefined ? <div className="mint-result" data-testid="mint-result"><div><span className="pt-dot" /><b>{formatUnits(previewRaw, selected.decimals, 6)} PT</b><small>PT-{selected.symbol}-{year}</small></div><span>+</span><div><span className="dr-dot" /><b>{formatUnits(previewRaw, selected.decimals, 6)} DR</b><small>DR-{selected.symbol}-{year}</small></div></div> : series ? <TokenBalances series={series} asset={selected} /> : <p className="pending-copy">Choose a token with a reviewed historical factor example.</p>}</div></section>
    <div className="claim-explainer"><p><span className="pt-dot" /><b>Stock exposure (PT)</b> receives the remainder after the year's qualified dividends.</p><p><span className="dr-dot" /><b>Dividend rights (DR)</b> carries the whole accrued annual entitlement when transferred.</p></div>
    {(error || previewError) && <div role="alert" className="p-error">{error || previewError}</div>}
    {!series ? <button className="p-primary split-button" data-testid="product-split-action" disabled={previewRaw === undefined || previewRaw === 0n} onClick={split}>Split into PT-{selected.symbol}-{year} + DR-{selected.symbol}-{year}<span>→</span></button> : <section className="after-split"><div className={`series-status ${series.stage}`}><i /><span>{statusText(series)}</span></div><p className="eyebrow">Your annual claims</p><TokenBalances series={series} asset={selected} /><button className="p-primary" onClick={() => goRedeem(series.id)}>Open series <span>→</span></button></section>}
    <CapabilityStrip />
    <Details asset={selected} event={event} year={year} series={series} previewRaw={previewRaw} />
  </main>;
}

function AmountControl({ label, balance, decimals, onSubmit, payout, unit, actionLabel }: { label: string; balance: bigint; decimals: number; onSubmit: (raw: bigint) => void; payout: (raw: bigint) => string; unit: string; actionLabel: string }) {
  const [input, setInput] = useState('');
  let raw = 0n;
  try { raw = input ? toRawAmount(input, decimals, '1') : 0n; } catch { raw = 0n; }
  return <div className="amount-control"><label><span>{label}</span><input value={input} inputMode="decimal" placeholder="0" onChange={(e) => setInput(e.target.value)} /></label><div className="amount-shortcuts"><button disabled={!balance} onClick={() => setInput(formatUnits(balance / 2n, decimals, decimals))}>50%</button><button disabled={!balance} onClick={() => setInput(formatUnits(balance, decimals, decimals))}>Max</button></div><p>You receive · <b>{payout(raw)} {unit}</b></p><button className="p-primary" disabled={raw <= 0n || raw > balance} onClick={() => onSubmit(raw)}>{actionLabel}</button></div>;
}

function RedemptionControl({ series, asset, account, side, run, closeZero }: { series: ProductAnnualSeries; asset: AssetDescriptor; account: ProductAccount; side: AnnualClaimSide; run: (raw: bigint) => void; closeZero: (raw: bigint) => void }) {
  const [input, setInput] = useState('');
  const [consent, setConsent] = useState(false);
  const balance = side === 'pt' ? series.model.accounts[account].ptRaw : series.model.accounts[account].drRaw;
  let raw = 0n;
  try { raw = input ? toRawAmount(input, asset.decimals, '1') : 0n; } catch { raw = 0n; }
  let payout = 0n;
  if (raw > 0n && raw <= balance) { try { payout = productClient.previewRedemption(series.id, account, side, raw); } catch { payout = 0n; } }
  const display = formatScaled(payout, asset.decimals, series.activeFactor, 6);
  const valid = raw > 0n && raw <= balance;
  const zero = valid && payout === 0n;
  return <div className="amount-control redemption-control"><label><span>{side === 'pt' ? 'Stock exposure' : 'Annual dividend rights'} · {formatUnits(balance, asset.decimals, 6)} {side.toUpperCase()}</span><input value={input} inputMode="decimal" placeholder="0" onChange={(e) => { setInput(e.target.value); setConsent(false); }} /></label><div className="amount-shortcuts"><button disabled={!balance} onClick={() => setInput(formatUnits(balance / 2n, asset.decimals, asset.decimals))}>50%</button><button disabled={!balance} onClick={() => setInput(formatUnits(balance, asset.decimals, asset.decimals))}>Max</button></div><p>You receive · <b>{display} {asset.symbol}</b></p><button className="p-primary" disabled={!valid || zero} onClick={() => run(raw)}>Redeem</button>{zero && <div className="zero-close"><label><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I understand this closes these claims for zero stock tokens.</label><button disabled={!consent} onClick={() => closeZero(raw)}>Close zero-value {side.toUpperCase()} claims</button></div>}</div>;
}

function ProductRedeem({ state, refresh, activeId, setActiveId, account }: { state: AnnualProductState; refresh: () => void; activeId: string; setActiveId: (id: string) => void; account: ProductAccount }) {
  const seriesList = Object.values(state.series);
  const series = state.series[activeId] ?? seriesList.at(-1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => { setError(''); setSuccess(''); }, [series?.id, account]);
  if (!series) return <main id="product-main" className="p-page redeem-empty"><p className="eyebrow">Redeem</p><h1>Your annual tokens will appear here.</h1><p>Choose a stock and deposit before its test year begins.</p></main>;
  const asset = assets.find((item) => item.id === series.assetId)!;
  const source = eventMap.get(series.sourceEventId)!;
  const claims = series.model.accounts[account];
  const capacity = min(claims.ptRaw, claims.drRaw);
  const completed = series.model.ptSupplyRaw === 0n && series.model.drSupplyRaw === 0n;
  const balance = formatScaled(stockRaw(state, asset.id, account), asset.decimals, series.activeFactor, 6);
  function action(label: string, work: () => unknown) { setError(''); setSuccess(''); try { work(); refresh(); setSuccess(label); } catch (cause) { setError(textError(cause)); } }
  const select = <label className="series-picker"><span>Annual token series</span><select value={series.id} onChange={(e) => setActiveId(e.target.value)}>{seriesList.map((item) => { const token = assets.find((candidate) => candidate.id === item.assetId)!; return <option value={item.id} key={item.id}>{token.company} · {token.symbol} · {item.year}</option>; })}</select></label>;
  return <main id="product-main" className="p-page redeem-product">
    <section className="redeem-head"><div><p className="eyebrow">Redeem</p><h1>{asset.company} <span>{series.year}</span></h1><p>{asset.symbol} · {issuerLabel[asset.issuerId]} · {account === 'seller' ? 'Your test balance' : 'Dividend buyer'}</p></div>{select}</section>
    <p className="term-disclosure"><b>Historical factors · test term dates.</b> One historical factor example, not a full-year payout or forecast.</p>
    <div className={`series-status prominent ${series.stage}`} data-testid="series-status"><i /><div><b>{statusText(series)}</b><span>{series.model.ptSymbol} + {series.model.drSymbol}</span></div></div>
    <TokenBalances series={series} asset={asset} account={account} />
    <p className="underlying-balance">Current test stock balance · <b>{balance} {asset.symbol}</b></p>
    {error && <div role="alert" className="p-error">{error}</div>}{success && <div role="status" className="p-success">✓ {success}</div>}
    {!series.model.finalized && !completed && <section className="redeem-mode"><div><p className="eyebrow">Paired recombination</p><h2>Get the current stock token back.</h2><p>Matching PT and DR can recombine before finalization, including after dividends accrue or the year ends. Sold DR must be reacquired before its PT can recombine.</p></div><AmountControl key={`${series.id}-${account}-${capacity}`} label={`Matching ${series.model.ptSymbol} + ${series.model.drSymbol}`} balance={capacity} decimals={asset.decimals} unit={asset.symbol} actionLabel="Combine & return stock" payout={(raw) => formatScaled(raw <= capacity ? raw : 0n, asset.decimals, series.activeFactor, 6)} onSubmit={(raw) => action(`Returned ${formatScaled(raw, asset.decimals, series.activeFactor, 6)} ${asset.symbol} in memory. No chain receipt was created.`, () => productClient.recombine(series.id, account, raw))} /></section>}
    {series.model.finalized && !completed && <section className="redeem-mode separate"><div><p className="eyebrow">Independent redemption</p><h2>Redeem PT and DR separately.</h2><p>Finalization freezes the two stock-token pools. DR keeps its accumulated claim after maturity and remains transferable and redeemable without forfeiture.</p></div><div className="separate-controls"><RedemptionControl key={`${series.id}-${account}-pt-${claims.ptRaw}`} series={series} asset={asset} account={account} side="pt" run={(raw) => action('PT redeemed from the frozen annual pool.', () => productClient.redeem(series.id, account, 'pt', raw))} closeZero={(raw) => action('Zero-value PT claims closed with explicit consent.', () => productClient.closeZero(series.id, account, 'pt', raw))} /><RedemptionControl key={`${series.id}-${account}-dr-${claims.drRaw}`} series={series} asset={asset} account={account} side="dr" run={(raw) => action('DR redeemed from the frozen annual pool.', () => productClient.redeem(series.id, account, 'dr', raw))} closeZero={(raw) => action('Zero-value DR claims closed with explicit consent.', () => productClient.closeZero(series.id, account, 'dr', raw))} /></div></section>}
    {completed && <section className="product-complete"><span>✓</span><div><p className="eyebrow">Complete</p><h2>All of this annual series has been redeemed.</h2><p>Its frozen PT and DR pools are fully accounted for.</p></div></section>}
    <Details asset={asset} event={source} year={series.year} series={series} />
  </main>;
}

function SimulationControls({ state, refresh, activeId, account, setAccount, reset }: { state: AnnualProductState; refresh: () => void; activeId: string; account: ProductAccount; setAccount: (id: ProductAccount) => void; reset: () => void }) {
  const [message, setMessage] = useState('');
  const series = state.series[activeId] ?? Object.values(state.series).at(-1);
  useEffect(() => { setMessage(''); }, [series?.id]);
  function run(label: string, work: () => unknown) { setMessage(''); try { work(); refresh(); setMessage(label); } catch (cause) { setMessage(textError(cause)); } }
  const asset = series ? assets.find((item) => item.id === series.assetId) : undefined;
  return <details className="simulation-controls"><summary>Preview controls</summary><div><p>Controlled annual simulation{asset ? ` for ${asset.company} ${asset.symbol} ${series!.year}` : ''}. These buttons do not attest issuer finality or create chain receipts.</p><div className="sim-actions"><button disabled={!series || series.stage !== 'deposits_open'} onClick={() => run('Year started. New deposits to this series are closed.', () => productClient.startYear(series!.id))}>Start year · close deposits</button><button disabled={!series || series.stage !== 'collecting' || series.sourceReplayed} onClick={() => run('Historical factor example replayed on a synthetic test term date. Allocation accrued; redemption remains locked.', () => productClient.replaySource(series!.id))}>Replay example dividend</button><button disabled={!series || series.stage !== 'collecting' || !series.sourceReplayed || series.syntheticAdded} onClick={() => run('A second, entirely synthetic test dividend was added.', () => productClient.addSyntheticDividend(series!.id))}>Add synthetic dividend</button><button disabled={!series || series.stage !== 'collecting'} onClick={() => run('Year ended. Event membership is frozen; redemption still awaits finalization.', () => productClient.endYear(series!.id))}>End year</button><button disabled={!series || series.stage !== 'year_ended'} onClick={() => run('Synthetic test journal finalized. PT and DR can now redeem independently.', () => productClient.finalize(series!.id))}>Finalize test journal</button><button disabled={!series || series.saleCompleted || series.model.accounts.seller.drRaw === 0n} onClick={() => run(`Dividend buyer paid ${asset?.issuerId === 'backpack' ? '5' : '30'} test USDC for 40% of DR. Cash and claims moved atomically in memory.`, () => productClient.sellFortyPercentDr(series!.id))}>Sell 40% DR to Dividend buyer</button><button disabled={!series} onClick={() => setAccount(account === 'seller' ? 'buyer' : 'seller')}>View {account === 'seller' ? 'Dividend buyer' : 'Your test balance'}</button><button onClick={reset}>Reset preview</button><a href="/rehearsal/">Open legacy event rehearsal →</a></div>{series && <p className="cash-ledger">Test USDC · You {formatUnits(state.cashUsdcRaw.seller, 6, 2)} · Buyer {formatUnits(state.cashUsdcRaw.buyer, 6, 2)} · Total {formatUnits(state.cashUsdcRaw.seller + state.cashUsdcRaw.buyer, 6, 2)}</p>}{message && <p role="status" className="sim-message">{message}</p>}</div></details>;
}

export function ProductApp() {
  const [tab, setTab] = useState<ProductTab>('market');
  const [selected, setSelected] = useState(defaultAsset);
  const [state, setState] = useState(() => productClient.getState());
  const [activeId, setActiveId] = useState('');
  const [account, setAccount] = useState<ProductAccount>('seller');
  const refresh = () => setState(productClient.getState());
  const choose = (asset: AssetDescriptor) => { setSelected(asset); const id = productClient.seriesId(asset, 2027); setActiveId(state.series[id] ? id : ''); setAccount('seller'); setTab('split'); };
  const goRedeem = (id: string) => { setActiveId(id); setAccount('seller'); setTab('redeem'); };
  const reset = () => { productClient.reset(); refresh(); setActiveId(''); setAccount('seller'); setTab('market'); };
  return <><a className="p-skip" href="#product-main">Skip to content</a><ProductHeader tab={tab} setTab={setTab} />{tab === 'market' && <ProductMarket choose={choose} />}{tab === 'split' && <ProductSplit key={selected.id} selected={selected} state={state} refresh={refresh} goRedeem={goRedeem} onCreated={setActiveId} />}{tab === 'redeem' && <ProductRedeem state={state} refresh={refresh} activeId={activeId} setActiveId={setActiveId} account={account} />}<footer className="p-footer"><div><BrandLogo variant="icon" /><span>DivX annual reference preview</span></div><SimulationControls state={state} refresh={refresh} activeId={activeId} account={account} setAccount={setAccount} reset={reset} /></footer></>;
}
