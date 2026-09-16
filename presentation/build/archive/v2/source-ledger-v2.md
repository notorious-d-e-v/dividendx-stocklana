# DividendX source ledger

Reviewed 16 September 2026. The deck distinguishes historical evidence, current category context, a working calculator, and planned vault behavior.

| Slide | Claim or asset | Source and date | Treatment |
|---|---|---|---|
| 3 | xStocks multiplier mechanics | [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers), accessed 16 Sep 2026 | Mechanism is proposed; DR settles in reinvested xStock units. |
| 4 | 21M+ dividend contracts in 2024 | [Eurex release](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358), 6 Jan 2025 | Contract turnover precedent, not dollars or DividendX demand. |
| 4 | $96.4M average daily trading volume in 2024 | [Pendle team review](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f), 4 Feb 2025 | Pendle-reported yield-market precedent, not equity-specific demand. |
| 5 | $1.75T global dividends in 2024 | [Janus Henderson](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/), published 2025 | Annual global cash flow, not addressable revenue. |
| 5 | $2.92B distributed tokenized-stock value | [RWA.xyz Stocks](https://app.rwa.xyz/stocks), observed 16 Sep 2026 | Includes stocks and ETFs, native and synthetic. Eligible dividend-paying xStocks are a subset. |
| 6 | Solana Token Extensions and Scaled UI Amount | [Token Extensions](https://solana.com/docs/tokens/extensions), [Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount), accessed 16 Sep 2026 | Infrastructure reference. Planned program behavior is not presented as implemented. |
| 7 | KOx cash dividend and HONx reverse split | [KOx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), [HONx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=HONx&sortBy=createdTimeUtc&sortOrder=asc), accessed 16 Sep 2026 | Event-level classification; the later HONx spinoff is separately unsupported. |
| 7 | Pendle normalization precedent | [Pendle StandardizedYield](https://docs.pendle.finance/pendle-v2-dev/Contracts/StandardizedYield), accessed 16 Sep 2026 | Pendle can normalize rebasing assets. DividendX adds equity-event rules on Solana. |
| 8 | KOx event and company dates | [KOx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), [Coca-Cola announcement](https://investors.coca-colacompany.com/news-events/press-releases/detail/1165/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-declares-regular-quarterly-dividend), 15 Jul 2026 | Issuer adjustment: 15 Sep. Company payment: 1 Oct. Screenshot remains a historical scenario. |
| 8 | Product screenshot | `design/previews/desktop-app.png`, captured from the approved phase-one prototype | Current software: source-backed historical calculator and design prototype. |
| 9 | Backpack expansion candidate | [Backpack corporate-actions explainer](https://learn.backpack.exchange/articles/what-are-corporate-actions), accessed 16 Sep 2026 | Candidate only. No partnership or supported integration claim. |

## Stage boundary

- Working now: approved interface and historical calculator.
- Planned next: vault custody, paired claim issuance, claim sale, and independent onchain redemption with test assets.
- Later: a future live series, subject to event finality, transfer testing, and trusted corporate-action data.
- No deployed protocol, completed trade, organic liquidity, partnership, guaranteed yield, or protected dollar principal is claimed.
