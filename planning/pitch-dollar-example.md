# Coca-Cola dollar example for the pitch

Reviewed 16 September 2026. Use the same historical KOx event and 100 pre-event displayed share-equivalents as the working calculator.

## Source facts

The saved issuer response in `planning/evidence/real-events-2026-09-16.json`, captured at 03:14:47 UTC on 16 September, records event `75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e`, revision 2, effective 15 September 2026 at 00:30 UTC:

- Gross cash flow per underlying share: $0.53.
- Net cash flow per underlying share: $0.371, after the event's 30% withholding.
- Multiplier before: 1.0183317967386898; after: 1.0225601246249238.

[Issuer corporate-action history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc) · [xStocks reinvestment and multiplier mechanics](https://docs.xstocks.fi/developers/multipliers).

## Derived valuation

The reinvested-share increase per pre-event share is `M1/M0 - 1`. Dividing the net cash per share by that increase gives an **implied reinvestment reference price**, not an independently fetched execution price or current market quote:

`P = $0.371 / (1.0225601246249238 / 1.0183317967386898 - 1)`

`P = $89.349999989...`, approximately **$89.35 per share**.

At that same reference price:

| Claim | Displayed allocation | Reference dollar value |
|---|---:|---:|
| Stock exposure | approximately 100.0000 KOx | approximately $8,935 |
| Dividend rights | approximately 0.4152210403 KOx | approximately $37.10 |

For 100 underlying share-equivalents, the event records $53 gross and $37.10 net. The net dividend is reinvested, so the claim receives xStock units. At another valuation or redemption price, their dollar value changes. The $37.10 is not an observed DR sale price or a guaranteed cash payout. Both dollar figures use the same reference price; they do not claim the stock's price stays unchanged across an ex-dividend event.

The existing integer calculator uses raw input Q=9,819,982,084, PT=9,779,376,057 and DR=40,606,027. The dollar difference from base-unit truncation is below a cent.

## Pitch treatment

First identify **Coca-Cola (KO), represented by KOx on Solana**. Show dollars prominently and keep the token quantities as secondary labels. On-slide valuation label: **At the event-implied $89.35/share**. Speaker notes carry the derivation and price qualifications above.

Suggested spoken example: “Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about $8,935 of stock exposure from $37.10 of reinvested dividends, valued at the event-implied share price.”

The screenshot remains the actual calculator. Its displayed token quantities must not be edited into fictional dollar UI or a transaction receipt.
