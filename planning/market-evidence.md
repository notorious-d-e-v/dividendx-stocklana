# DividendX market evidence

Verified 2026-09-16. The supplied research brief was treated as an unverified lead list. Figures below deliberately separate annual cash flow, value outstanding/TVL, trading turnover, and open interest (OI).

Updated during the pre-build [prior-art review](research/prior-art-review.md): Pendle's current documentation includes STRCx discrete yield, and EXDATE's architecture page explicitly says its contracts are not deployed. Earlier research suggesting equity-specific integration is simply absent from Pendle is superseded. Historical market figures below were not remeasured during this architecture pass.

## Slide-safe conclusions

1. **Pendle is already relevant to stock dividends.** It normalizes assets through SY and issues PT/YT; current discrete-yield documentation names STRCx and describes time-weighted retrospective distribution. Do not claim Pendle cannot handle equities or that no stock-yield integration exists. DividendX's selected distinction is native Solana issuer/event handling and a transferable whole-event DR. Pendle's official core deployment list currently contains EVM networks and does not list Solana; this does not establish exclusivity among Solana protocols. [Discrete yield](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/DiscreteYield) · [SY docs](https://docs.pendle.finance/pendle-v2-dev/Contracts/StandardizedYield) · [deployments](https://docs.pendle.finance/pendle-v2-dev/Deployments)

2. **The normalization problem is corporate-action attribution, not rebasing itself.** Pendle's SY exposes a common deposit/redemption interface and an `exchangeRate`; its developer docs warn that rebasing assets may not track one-to-one in raw units. xStocks uses one cumulative multiplier for cash dividends, splits, and reverse splits. DividendX must therefore (a) escrow raw xStock units, (b) read current/pending/historical multipliers, and (c) classify each multiplier change before assigning value to the dividend leg. A multiplier delta alone is insufficient because a split is not yield. [Pendle SY docs](https://docs.pendle.finance/pendle-v2-dev/Contracts/StandardizedYield) · [xStocks multiplier docs](https://docs.xstocks.fi/developers/multipliers)

3. **The stock must be under program control.** On Solana, xStocks keeps the raw Token-2022 balance constant and computes displayed equity units as `raw amount × multiplier`. Dividends are reinvested in more underlying shares and reflected through that multiplier. A freely held xStock already receives the accretion, so issuing a dividend right without vaulting the xStock would duplicate the same entitlement. [xStocks developer docs](https://docs.xstocks.fi/developers) · [multiplier docs](https://docs.xstocks.fi/developers/multipliers)

4. **Do not claim “first” or “only.”** Public products already describe essentially the same principal/dividend split for tokenized stocks. Fletch says it has three open PT/YT markets live on Robinhood Chain; EXDATE documents event vaults that mint transferable principal and distribution-right tokens; dividends.finance and hdfi also publish stock-strip designs. These are first-party claims, not independently verified traction, but they are enough to invalidate an unqualified novelty claim. [Fletch](https://www.fletch.finance/) · [EXDATE docs](https://www.exdate.tech/docs) · [dividends.finance](https://www.dividends.finance/) · [hdfi](https://hdfi.io/)

## Four numbers worth using

| Slide claim | What the number actually measures | Source and date | Qualification |
|---|---|---|---|
| **$1.75T global dividends paid in 2024** | Annual corporate cash-flow pool | Janus Henderson Global Dividend Index, published 2025; [press release](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/) | Index estimate covering global corporate dividends. It is neither addressable revenue nor derivative notional. For a fresher supporting point, Q1 2026 dividends were **$424.5B**, per [Janus Henderson, 2026-07-21](https://www.janushenderson.com/corporate/press-releases/global-dividends-rise-10-1-in-q1-2026-as-buybacks-begin-to-soften/). |
| **21M+ Eurex dividend contracts traded in 2024; 8.9M OI / €63B capital value before Dec expiry** | Listed dividend-derivative turnover and open positions | Eurex, published 2025-01; [official release](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358) | This is direct proof of a mature standalone dividend-risk category. Contracts, OI, and capital value are different units; do not add or compare them as one TAM. A narrower 2025 fact: **8.85M single-stock dividend futures contracts traded**, with **€2.7B notional OI at end-Dec 2025**, per [Eurex's Dec-2025 presentation](https://www.eurex.com/resource/blob/80940/c34ec7531aab6e59d26d10c0de49c630/data/presentation-dividend-derivatives.pdf). |
| **$2.92B tokenized-stock distributed value on 2026-09-16** | Current onchain value outstanding; additionally **$13.01B monthly transfer volume** | RWA.xyz Stocks dashboard, observed 2026-09-16; [live dashboard](https://app.rwa.xyz/stocks) | This aggregate covers tokenized public equities, including listed stocks and ETFs issued natively onchain or represented synthetically. It is not the value of dividend-paying xStocks eligible for DividendX. Monthly transfers are flow/turnover and may recycle the same value; they are not TVL or unique demand. The same platform league table showed Backed Finance (xStocks) at **$614.3M** and Ondo at **$837.4M** total value. |
| **Pendle reported $96.4M average daily trading volume in 2024** | Daily trading flow | Pendle team, 2025-02-04; [2025 roadmap/year review](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f) | First-party, self-reported traction; use with attribution. The same article mentions $4.4B year-end TVL inside its 2024 review but inconsistently names 2023 in that sentence. Omit that dated TVL claim unless independently resolved. The volume supports appetite for yield separation, not equity-specific demand. |

## Issuer dividend models

| Issuer/product | Dividend treatment | Product implication |
|---|---|---|
| **xStocks — initial build** | Cash dividends received on collateral are reinvested in more shares. A cumulative multiplier reflects dividends, splits, and reverse splits. On Solana, raw Token-2022 units stay fixed; integrations apply the Scaled UI multiplier for display and transact in raw units. A pending multiplier is published before activation, normally 00:30 UTC on the day after ex-date; current and historical multiplier endpoints are documented. [Official docs](https://docs.xstocks.fi/developers/multipliers) | Best hackathon substrate because the accounting primitive is observable. The demo still needs issuer corporate-action classification and a vault. Pause/guard settlement around multiplier activation as xStocks recommends. |
| **Ondo Stocks — expansion** | Total-return tracker: price exposure plus dividends reinvested into the underlying, net of applicable withholding. Tokens are economic exposure and are not themselves the underlying stock/ETF; current materials list Solana among supported chains. [Product/FAQ](https://ondo.finance/ondo-stocks) · [legal disclaimer](https://docs.ondo.finance/legal/disclaimers) | Same bundled-return problem. Do not promise support until the exact Solana token accounting and corporate-action feed are verified per asset. |
| **Coinbase Tokenized Stocks — expansion** | Official FAQ says raw B20 token count stays fixed while an onchain multiplier reflects reinvested dividends (after withholding/fees) and splits. The product is on Base, backed by shares in regulated bankruptcy-remote custody, and unavailable in restricted jurisdictions including the US. [Coinbase Tokenize](https://www.coinbase.com/tokenize) | Conceptually compatible with an exchange-rate adapter, but Base/B20 support is post-MVP and carries a different token, chain, issuer, and eligibility model. |

## Competitive positioning

Use: **“A Solana-native dividend layer for selected stock tokens across issuers”** or **“Separate one supported dividend event from stock-token exposure, then trade and redeem either claim.”** Support remains conditional on each asset's custody and event checks.

Avoid: “the first onchain dividend market,” “the only tokenized-equity yield protocol,” or “Pendle for stocks” as the whole differentiation. The intended wedge is native Solana, issuer-aware event classification, isolated collateral and independently redeemable event claims. Current execution is a local rehearsal; the program-backed demo is still to build.

Public competitor evidence:

- **Fletch:** PT/YT dividend futures on Robinhood Chain; site claims three open mainnet markets and says an independent audit is planned before mainnet, wording that is internally inconsistent enough to avoid relying on its production status. [Source](https://www.fletch.finance/)
- **EXDATE:** corporate-action event-vault design with transferable principal and event-right tokens. Its architecture page explicitly says no contracts are deployed and no audits performed; a mainnet footer is not evidence to the contrary. [Architecture](https://www.exdate.tech/docs/contract-architecture)
- **StockYield:** public “dividend layer” roadmap for routing multiplier-based dividends and perpetual dividend streams. Treat as roadmap, not deployed proof. [Source](https://stockyield.money/docs/dividend-layer.html)
- **dividends.finance / hdfi:** public principal/dividend and principal/yield strip designs on Robinhood Chain; no independently verified liquidity or audit evidence found in this review. [dividends.finance](https://www.dividends.finance/) · [hdfi](https://hdfi.io/)

## Rejected claims

- **“Pendle cannot support equities / has no stock-dividend design.”** Rejected by its current STRCx discrete-yield documentation. Our exact multi-issuer Solana event contract still requires its own implementation and evidence.
- **“Dividends arrive as USDC/cash to an xStock holder.”** Rejected for xStocks. They are reinvested and represented by the multiplier.
- **“A multiplier increase equals a dividend.”** Rejected. The same multiplier carries splits and reverse splits.
- **“$1.75T is DividendX TAM.”** Rejected. It is annual global dividend cash flow, most of which is outside the accessible tokenized-stock universe.
- **“$13.01B tokenized-stock monthly transfer volume means $13.01B invested.”** Rejected. Transfer volume is a flow and can recycle the same tokens.
- **“No competitor exists / first ever.”** Rejected by current public competitor materials. No independent evidence was found that any one competitor has meaningful volume, so do not claim they do either.
- **Unverified September 2026 figures from the supplied brief.** Not used unless independently supported above.

## Current build dependencies

1. **Mechanics evidence:** the [issuer architecture](adapter-decision.md), [prior-art gates](research/prior-art-review.md) and current program specification govern implementation. The earlier [mechanics audit](mechanics-audit.md) remains dated KOx evidence, not a live feed or the sole source of truth.
2. **Claim math:** define the accounting asset and invariant in raw units. For a fixed event, snapshot `M0`, escrow raw quantity `q`, and allocate only the dividend-classified accretion; specify how rounding and later corrections work.
3. **Settlement denomination:** already selected: redeem the deposited stock token. Automatic cash conversion is deferred. Holding allocated tokens after the event retains stock-price and later-return exposure.
4. **Eligibility and transfer constraints:** issuer instruments are regulated/offshore products. A hackathon demo can show mechanics; a real launch needs jurisdiction, offering, derivatives/securities, KYC/AML, and secondary-transfer analysis.
5. **Oracle/availability:** preserve the verified KOx historical event as a reproducible fixture and cross-check API event versions against the activated onchain multiplier. Do not present a historical event as a live future dividend.
6. **Hackathon scope:** selected xStocks, Backpack/Trek and native Solana Ondo profiles share one engine. Existing KOx and MU fixtures support test execution; Ondo event binding is pending. Build actual claims, custody, redemption and one test AMM flow. Other networks remain later work.
