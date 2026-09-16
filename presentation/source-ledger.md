# DividendX source ledger

Revised 16 September 2026 for the selected Solana stock package. The deck distinguishes established market precedents, current category context, a working historical calculator, selected candidate assets, issuer qualification and planned execution.

| Slide | Claim or asset | Source and date | Treatment |
|---|---|---|---|
| 2 | Traditional dividend-market sellers and buyers | [Eurex 2025 whitepaper](https://www.eurex.com/resource/blob/4418754/f90fd622a278beb08757729864e93925/data/whitepaper-derivatives-forum-frankfurt-2025.pdf), pp. 31–32; [CME market explainer](https://www.cmegroup.com/articles/2024/trading-dividend-uncertainty.html); [CME primer](https://www.cmegroup.com/articles/2024/equity-index-dividend-futures-a-primer.html) | Banks supply, hedge or recycle dividend risk. Asset managers and hedge funds trade it in either direction. Eurex documents Survista buying discounted single-stock dividend futures. None is claimed as a DividendX user. |
| 3 | Shared Scaled UI reinvestment model | [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers), [Backpack MU](https://learn.backpack.exchange/blog/tokenized-micron-mu), [Ondo corporate actions](https://docs.ondo.finance/ondo-stocks/corporate-actions), accessed 16 Sep 2026 | Qualified tokens can share raw-unit allocation mechanics. Each claim pair remains isolated by issuer, mint and event and redeems in its deposited stock token. No third wrapper token is proposed. |
| 4 | 21M+ dividend contracts in 2024 | [Eurex release](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358), 6 Jan 2025 | Contract turnover precedent, not dollars or DividendX demand. |
| 4 | $96.4M average daily trading volume in 2024 | [Pendle team review](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f), 4 Feb 2025 | Pendle-reported yield-market precedent, not equity-specific demand. |
| 5 | $1.75T global dividends in 2024 | [Janus Henderson](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/), published 2025 | Annual global cash flow, not addressable revenue. |
| 5 | $2.92B distributed tokenized-stock value | [RWA.xyz Stocks](https://app.rwa.xyz/stocks), observed and reconfirmed 16 Sep 2026 | Global context including stocks, ETFs, native and synthetic representations. Eligible Solana dividend tokens are a subset. |
| 6 | Shared engine across issuer families | [xStocks corporate-action API](https://docs.xstocks.fi/apis/openapi/corporate-actions), [Backpack MU](https://learn.backpack.exchange/blog/tokenized-micron-mu), [finalized MU `DividendDistribute` transaction](https://explorer.solana.com/tx/39vTkahE7rUnFypAkKpaHUxwMyuC1nG4nJ12GEm3y9V1Kqep6ijvcX4isqsNXB63s3vsGNDjfi7uFFgH32Te59R), local `planning/evidence/backpack-scope-mu-raw-transactions-2026-09-16.json`, [Ondo corporate actions](https://docs.ondo.finance/ondo-stocks/corporate-actions), [Ondo multiplier API](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [Ondo Solana repository](https://github.com/ondoprotocol/global-markets-solana) | All three observed families use Token-2022 Scaled UI Amount, but event readers and custody requirements differ. xStocks has public event history. Backpack MU has a fully bracketed sourced onchain reconstruction; its official event ledger and finality semantics remain unverified. The current multiplier is not an event factor. Ondo history requires classified event joins, and no Ondo event is source-complete. |
| 6 | Conditional eligibility and permissionless access | [Selected asset package](../planning/research/initial-asset-package.md), [Ondo transferability](https://docs.ondo.finance/ondo-stocks/transferability), and parent-reviewed issuer audit, 16 Sep 2026 | Permissionless means no DividendX holder allowlist or issuer-specific approved-vault onboarding for admitted assets; issuer controls and product restrictions remain. Ondo documents secondary transferability outside the US subject to restrictions; issuer KYC for primary issuance or redemption is separate. Permissioned, no-dividend and fee-bearing products are outside scope. Exact mint, event and custody tests remain required. |
| 6 | Atomic transactions and token ownership | [Solana transactions](https://solana.com/docs/core/transactions), [Solana tokens](https://solana.com/docs/tokens), accessed 16 Sep 2026 | Supports the shared workflow design. No production vault or multi-issuer settlement is complete. |
| 7 | Fractional token units and inspectable state | [Solana tokens](https://solana.com/docs/tokens), [accounts](https://solana.com/docs/core/accounts), [transactions](https://solana.com/docs/core/transactions), [getTokenSupply](https://solana.com/docs/rpc/http/gettokensupply), accessed 16 Sep 2026 | Onchain state can expose balances, claim supply and redemption records. It does not prove offchain reserves, correct issuer data, or correct code. |
| 7 notes | Corporate-action control | [KOx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), [HONx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=HONx&sortBy=createdTimeUtc&sortOrder=asc), accessed 16 Sep 2026 | KOx supplies the accepted cash-dividend event. The exact HONx reverse split and later spinoff remain unsupported dividend events for technical Q&A. |
| 8 | Coca-Cola event and dollar translation | [KOx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), [xStocks mechanics](https://docs.xstocks.fi/developers/multipliers), [Coca-Cola announcement](https://investors.coca-colacompany.com/news-events/press-releases/detail/1165/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-declares-regular-quarterly-dividend) | Event-implied price: `$0.371 / (M1/M0 - 1) ≈ $89.35`. At that basis, 100.0000 KOx ≈ $8,935 and 0.4152 KOx ≈ $37.10. This is not a fetched market quote, sale price or guaranteed cash payout. Issuer adjustment: 15 Sep; company payment: 1 Oct. |
| 8 | Product screenshot | `design/previews/desktop-app.png`, captured from the approved phase-one prototype | Current software: source-backed historical calculator and design prototype. |
| 9 | Selected 15-token candidate package | [Selected asset package](../planning/research/initial-asset-package.md), [finalized 15-mint verification](../planning/evidence/initial-package-parent-verification-2026-09-16.json) at slot 447462406, [xStocks history template](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), [Backpack assets registry](https://api.backpack.exchange/api/v1/assets), [pinned Ondo registry](https://github.com/ondoprotocol/gm-solana-simulator/blob/0688add3c64aadc7006712989e9ec0592b5b10f8/constants.rs), observed 16 Sep 2026 | Six companies: Coca-Cola, Apple, Microsoft, Micron, Nike and IBM. xStocks and Ondo each contribute all six candidate mints; Backpack contributes Micron, Nike and IBM. These are 15 candidates, not completed integrations, and the six companies are not all available from every issuer. |
| 9 | Other-network roadmap | [Coinbase Tokenized Stocks](https://www.coinbase.com/tokenize), [Robinhood Stock Tokens](https://robinhood.com/rhj/stocktokens/), [Robinhood Chain](https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/), observed 16 Sep 2026 | Coinbase products are on Base. The roadmap refers to Robinhood's new wallet-held Chain tokens, not legacy nontransferable Classic tokens. Cross-chain design remains future work. |

## Candidate mint matrix

The exact 15-mint package below is reproduced from the [selected asset package](../planning/research/initial-asset-package.md) and the [finalized parent verification](../planning/evidence/initial-package-parent-verification-2026-09-16.json). Candidate status is mechanical and evidentiary screening, not completed DividendX integration.

| Company | Family | Symbol | Exact Solana mint |
|---|---|---|---|
| Coca-Cola | xStocks | `KOx` | `XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ` |
| Coca-Cola | Ondo | `KOon` | `e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo` |
| Apple | xStocks | `AAPLx` | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| Apple | Ondo | `AAPLon` | `123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo` |
| Microsoft | xStocks | `MSFTx` | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` |
| Microsoft | Ondo | `MSFTon` | `FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo` |
| Micron | xStocks | `MUx` | `XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav` |
| Micron | Backpack/Trek | `MU.US` | `MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1` |
| Micron | Ondo | `MUon` | `Fz9edBpaURPPzpKVRR1A8PENYDEgHqwx5D5th28ondo` |
| Nike | xStocks | `NKEx` | `XsGYpMvKbVt6ViHqRd7cF3s746dAMFBQWcC49hB9VVP` |
| Nike | Backpack/Trek | `NKE.US` | `NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg` |
| Nike | Ondo | `NKEon` | `g646pcdG2Rt5DH9WZzL7VVnVDWCCMTTrnktwE74ondo` |
| IBM | xStocks | `IBMx` | `XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr` |
| IBM | Backpack/Trek | `IBM.US` | `BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk` |
| IBM | Ondo | `IBMon` | `C8bZkgSxXkyT1RgxByp2teJ24hgimPLoyEYoNa9ondo` |

## Stage boundary

- Working now: approved interface and historical calculator.
- Planned next: one shared program and issuer readers for selected xStocks, Backpack and Ondo assets, with isolated vaults and representative test profiles. KOx has a complete source-verified replay fixture. Backpack MU has a sourced onchain reconstruction. An Ondo event still needs authenticated source binding. All vault execution remains planned.
- Eligibility remains conditional. A token needs documented dividend rights, usable event data, compatible custody and tested transfers. Solana presence or Scaled UI alone is insufficient.
- Roadmap: prove one dividend event per issuer, expand within the selected package, then review assets on other networks. Cross-chain custody, settlement and messaging are unimplemented.
- No deployed protocol, completed trade, organic liquidity, partnership, guaranteed yield, or protected dollar principal is claimed.

## Plain-language narration revision

The current script is `presentation/narration.md`. It preserves the nine-slide order and the user’s Backpack-first issuer order. Spoken Pendle volume rounds the sourced $96.4M to “about 96 million dollars” while retaining the daily average and 2024 period. The $2.92B category figure stays on slide 5 but is not repeated in the spoken script. The Coca-Cola dollar values still use the historical event-implied $89.35 reference price; they are not current prices, a DR sale quote or guaranteed cash. Claims pay out in stock-token units.

Solana benefit sources, checked 16 September 2026:

- [Solana institutional payments](https://solana.com/solutions/institutional-payments) supports general fast onchain settlement. No exact latency, dividend payment speed or issuer processing guarantee is asserted.
- [Solana transactions](https://solana.com/docs/core/transactions) supports placing payment and claim transfer together in one transaction. This is DividendX’s intended trade design; it has not yet been implemented or executed.
- [Solana cross-program invocation](https://solana.com/docs/core/cpi) supports other programs integrating the same claims. It does not establish existing wallet integrations or liquidity.
- The existing token/account sources above support divisible units and visible vault/claim records. These records do not certify issuer reserves.

The current v5 PPTX is unchanged by this narration-only revision. Its embedded narration will be synchronized at the next deck export.
