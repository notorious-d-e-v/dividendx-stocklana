# Pitch fact check

> Scope update, 16 September 2026: the current multi-issuer plan is [Solana issuer synthesis](solana-issuer-synthesis.md) and [architecture](adapter-decision.md). This file preserves earlier evidence/review; xStocks-only scope or deferral of native Solana Backpack/Ondo is superseded.

Astra review, 16 September 2026. Rechecked the four deck metrics against their primary sources during slide production.

| Claim | Confirmed meaning and source | Deck treatment |
|---|---|---|
| More than 21 million dividend contracts traded in 2024 | Eurex's [6 January 2025 release](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358) covers index dividend futures/options and single-stock dividend futures. | Historical turnover in contracts, not dollars or open interest. |
| $96.4 million average daily trading volume in 2024 | [Pendle team's 4 February 2025 review](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f), under “Pendle V2 highlights for 2024.” | Attribute as Pendle-reported. Supports a yield-trading precedent, not demand for DivX. Omit the article's internally inconsistent year-end TVL sentence. |
| $1.75 trillion global dividends in 2024 | [Janus Henderson Global Dividend Index release](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/). | Historical annual cash flow. Not DivX revenue or addressable market. |
| $2.92 billion distributed tokenized-stock value | [RWA.xyz Stocks dashboard](https://app.rwa.xyz/stocks), observed 16 September 2026; dashboard date also 16 September 2026. | Current value outstanding, including listed stocks and ETFs represented natively or synthetically. Dividend-paying supported xStocks are a subset. |

Do not add these metrics together or put unlike units on a comparison axis. They establish category context and precedents only.

## Product truth for this version

- Existing: approved interface and historical calculator, with saved issuer and Solana evidence.
- Planned: program custody, paired claim issuance, claim sale, and independent onchain redemption.
- Dividend rights settle in reinvested xStock units. Their dollar value can change.
- The KOx illustration models 100 displayed units before its 15 September 2026 adjustment. It does not claim a deposit captured that historical event.
- The issuer's event classification is trusted input cross-checked against the token multiplier. The multiplier alone does not distinguish dividends from other corporate actions.
- Pendle's yield-splitting design is a precedent. Do not claim it is inherently unable to support tokenized equities.
- Backpack remains a candidate pending suitable corporate-action data; no partnership or integration claim.

## Final review gate

Check all nine final slide renders individually, the actual PPTX package and finalizer report, editable text/diagrams, speaker-note URLs, and the narration's current/planned language. Confirm the real screenshot retains its historical context and the visible calculator/vault status.

## Revision evidence

- [Traditional participants](pitch-tradfi-participants.md): CME documents dividend supply from banks' structured-product books. Eurex's 2025 whitepaper, pages 31–32, documents Survista's single-stock dividend-futures strategy and dealer-supply discounts. Astra checked both primary sources. These are traditional-market examples, not DivX customers.
- [Coca-Cola dollars](pitch-dollar-example.md): $37.10 net reinvestment for 100 share-equivalents; the issuer cashflow and multiplier ratio imply $89.35/share, giving approximately $8,935 of remaining stock exposure at the same reference price. This derived valuation is labeled and is not a live quote, guaranteed cash redemption or observed DR sale.
- [Expansion evidence](pitch-expansion-evidence.md): xStocks, selected Backpack tokens and Ondo have Solana representations. Coinbase is on Base. Robinhood's new wallet-held tokens run on Robinhood Chain; its older Classic product is distinct. Astra checked Coinbase's current product page and Robinhood's 1 July 2026 launch announcement. Cross-network support remains a roadmap.
- Official Solana [token documentation](https://solana.com/docs/tokens) supports divisible token units and inspectable balances/supply; [transaction documentation](https://solana.com/docs/core/transactions) supports atomic execution. Auditability refers to the program and token records, not independent proof of offchain share custody or an audit certification.
