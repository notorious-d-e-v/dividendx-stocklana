# Equity-dividend prior art and settlement lessons

> Architecture update: this dated research is extended by [annual dividend conventions](annual-dividend-series.md). The current [annual contract](../../spec/annual-series-accounting.md) supersedes earlier one-event DivX recommendations; calendar-year dates are our design choice, not an exact copy of every exchange contract.

Reviewed by Astra on 16 September 2026. This is a design review, not a legal opinion, deployment audit or claim of competitor adoption. Sources are first-party unless explicitly described otherwise. Existing issuer evidence remains dated; this review does not refresh every mint or enable live deposits.

## Traditional contracts establish the use case, not identical mechanics

Eurex's current Orion single-stock dividend-futures specification describes a cash-settled contract on 1,000 shares, a defined maturity, exchange-determined final settlement and corporate-action adjustments. An earlier official dividend-products presentation explains the reference-period treatment: dividends count by ex-date, while special/extraordinary distributions are excluded and handled through adjustments. These are contract-specific rules, not a universal definition of dividend income. [Current product specification](https://www.eurex.com/ex-en/markets/did/ssdf/Orion-Dividend-Futures-2798848), [historical exchange presentation](https://www.eurex.com/resource/blob/80940/d1c444c8bc08cfe72087156dc9288ebd/data/presentation_dividend-derivatives.pdf).

CME's primer describes standalone dividend exposure used for hedging and relative-value trading. This supports the two-sided market rationale already documented in our [participant research](../pitch-tradfi-participants.md). It does not establish demand, pricing or liquidity for DivX itself. [CME primer](https://www.cmegroup.com/articles/2024/equity-index-dividend-futures-a-primer.html).

| Dimension | Exchange dividend future | DivX's selected model |
|---|---|---|
| Entitlement | Defined dividend amount over a contract period | One classified reinvestment event for one exact issuer mint |
| Backing and settlement | Derivative with clearing/margin and cash settlement | Deposited stock tokens allocated into two raw collateral pools |
| Dividend measure | Contract's dividend and corporate-action rules | Issuer's admitted net reinvestment outcome, including its applicable deductions |
| Price exposure | Standalone dividend measure | DR redeems stock tokens, so its dollar value also changes with that token's price |
| Timing | Contract reference period and maturity | Deposit cutoff, issuer activation, evidence acceptance and final allocation are separate |
| Principal | No paired, physically deposited stock claim required | PT owns the remaining stock-token allocation; no dollar guarantee |

**Our decision:** adopt explicit event terms and settlement rules. Do not copy margin, cash guarantees, annual-dividend aggregation or “fixed-dollar income” language. A rapid onchain trade does not accelerate the issuer's corporate-action process.

## Direct equity-strip designs already exist

These are useful design precedents. None was transaction-tested or independently audited by this review.

| Project | Primary evidence | Lesson and limit |
|---|---|---|
| EXDATE | Its introduction describes per-event deposits yielding transferable principal/distribution tokens. Its architecture separates vault custody, event registry and settlement adapters. Crucially, the architecture page explicitly says contracts are **not deployed** and audits have **not** been performed, despite a “Mainnet” footer. [Introduction](https://www.exdate.tech/docs), [architecture](https://www.exdate.tech/docs/contract-architecture) | Strong precedent for event-specific identity and small settlement boundaries. Documentation is not execution proof. Its cash/in-kind settlement adapters are different from our scaled-reinvestment allocation. |
| Fletch | First-party site describes Robinhood Chain PT/YT stock stripping, pools and multiplier accounting. It claims open mainnet markets while also discussing an independent audit before mainnet. [Site](https://www.fletch.finance/) | Product overlap is clear; deployment/audit status remains unverified here. No architecture or novelty decision should depend on its marketing status. |
| hdfi | Site describes multiplier-based stock stripping, shared expiry, a high-water yield index, PT/underlying liquidity and a rate oracle. [Site](https://hdfi.io/) | A similar normalization idea already exists. A high-water multiplier alone cannot distinguish our issuers' splits, dividends or maintenance adjustments. We did not verify its implementation or compatibility. |
| dividends.finance / StockYield | Previously found first-party stock-dividend designs; current dividends.finance retrieval exposed no substantive text. [dividends.finance](https://www.dividends.finance/), [earlier evidence review](../market-evidence.md) | Discovery leads only in this pass; no new mechanical or deployment claim. |

EXDATE's risk page treats amendments/cancellations, inaccurate adapter reports, liquidity and early exit as distinct risks. It says an owner who sold event rights needs matching rights to recombine. Its settlement description distributes delivered outcomes rather than the announced amount. We adopt these questions as requirements, not EXDATE's proposed staking/slashing or basket system. [Risk framework](https://www.exdate.tech/docs/risk-framework), [settlement](https://www.exdate.tech/docs/settlement). The settlement page was readable through the search index; direct retrieval failed, so it is weaker evidence than the directly inspected architecture page.

**Positioning:** no “first,” “only,” or automatic universal compatibility claim. Our defensible work is a Solana-native, issuer-aware implementation with attributable events, conserved collateral and verifiable claim behavior. Competitor pages cannot establish that our integration works.

## Corporate-action attribution is part of the contract

xStocks documents reinvested dividends and stock splits through a shared multiplier, with a scheduled activation distinct from company dates. Its current documentation specifies activation at 00:30 UTC after the ex-date and recommends accounting carefully around updates. The existing KOx fixture preserves its actual issuer record and separate company payment date; generic timing documentation must not overwrite source-specific evidence. [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers), [our event verification](../real-event-refresh.md).

Solana's integration guide says historical amounts require the multiplier at the relevant slot, notes that update timestamps can be backdated, and recommends storing appropriate observation history. Consequently a current mint read cannot prove which event caused a previous change. Preserve issuer effective time, transaction/slot observation and replay time separately. [Solana integration guide](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide).

Our Backpack reconstruction is especially instructive: later ordinary supply operations changed the multiplier after the dividend operation. Preserve the exact `DividendDistribute` boundary; do not feed the latest ratio or a high-water index into DR. Ondo still needs a classified historical event joined to its factors. These are existing issuer findings, not new integrations. [Backpack report](backpack-solana.md), [Ondo report](ondo-solana.md).

## Required outcomes before implementing live-series behavior

1. **Known positive event:** allocate only the admitted net reinvestment; retain the evidence digest and exact accepted revision.
2. **Confirmed zero or cancellation:** a distinct, authenticated outcome must permit PT recovery and explicit zero-value DR closure when the admitted accounting assumptions still hold. The current rehearsal's zero-dividend rejection is not an adequate future live lifecycle.
3. **Missing or disputed evidence:** do not convert silence into zero. Preserve paired recombination when custody works. Separate owners require a predeclared resolution rule; do not invent one after funds arrive.
4. **Unsupported action or neutral adjustment:** do not treat splits, spinoffs, maintenance or unexplained factor changes as yield. Block that settlement path until a separately reviewed rule exists.
5. **Correction after final allocation:** do not rewrite already redeemed claims. Define acceptance/finality and any correction/loss responsibility before enabling a live series.
6. **Collateral freeze, seizure or loss:** do not promise that attestations restore assets or allow early redeemers to consume another holder's backing. Prototype failure states may stop custody; a fair live recovery mechanism remains a separate acceptance gate.

These outcomes feed the [prior-art decision review](prior-art-review.md). They are requirements for the next contract specification; the approved rehearsal, narration and slides remain unchanged.
