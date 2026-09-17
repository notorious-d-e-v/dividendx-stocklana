# Issuer public policy check

**Research only — 18 September 2026 (Asia/Makassar). This does not approve an issuer, asset, event, annual period, attestation or settlement.**

This bounded follow-up checked official public documentation for the unresolved xStocks policy questions and for any additional Backpack/Trek or Ondo historical action ledger. It used public documentation/search pages and GET documentation only: no credentials, outreach, state changes, endpoint guessing, RPC signature scans or application/runtime changes.

## What changed from the 17 September record

1. **Backed's public legal material identifies a source hierarchy for the product, but not for corporate-action operations.** The [Backed legal-documentation page](https://assets.backed.fi/legal-documentation) says an investment decision must be based on the official documents published under securities law, while also saying website information may be amended without notice. It links the current Base Prospectus and supplements. The [MSFTx product page](https://assets.backed.fi/products/microsoft-xstock) binds MSFTx to issuer Backed Assets (JE) Limited, certificate ISIN `CH1436219203`, and Microsoft underlying ISIN `US5949181045`. This strengthens the legal product identity and shows that website/API material is not itself the governing product document. It does **not** say whether the corporate-action API, the Solana multiplier state, an underlying-company notice, or a prospectus calculation-agent determination prevails when event dates or factors disagree.

2. **Fresh xStocks product/developer text repeats the normal timing rule but supplies no event-specific mapping.** The official [Dividends and Stock Splits page](https://docs.xstocks.fi/docs/dividends-and-stock-splits) says activation is set for 00:30 UTC on the day immediately following the ex-date. The [developer multiplier guide](https://docs.xstocks.fi/developers/multipliers) separately labels onchain and API multiplier sourcing. Neither page explains the observed MSFTx March/May/August timing differences, joins a corporate-action `eventId` to an ex-date, or states which source wins on conflict. The three 2026 MSFTx joins therefore remain candidates.

3. **No public issuer prose defining `Initial`, `Corrected`, `Cancelled` or `Scheduled` was found.** The official corporate-action schema exposes those values, `eventId`, and `version`, but the reviewed official xStocks [corporate-action reference](https://docs.xstocks.fi/apis/openapi/corporate-actions), [developer overview](https://docs.xstocks.fi/developers), [multiplier guide](https://docs.xstocks.fi/developers/multipliers), and [v2 changelog](https://docs.xstocks.fi/changelog) do not define their state machine, replacement relationship, terminal state, retention, or correction deadline. In particular, `Initial` still cannot be interpreted as accepted or final, and a higher version still cannot be assumed to supersede every prior record without an issuer rule.

4. **No annual completeness/finality signal appeared.** The public history pagination proves only that a response was fully consumed. None of the reviewed xStocks pages publishes an issuer/mint/year close marker, late-action window, final digest, revision cutoff, or zero-event attestation. Prospectus validity/expiry concerns the offering document and is not corporate-action period finality.

## Backpack/Trek and Ondo ledger check

| Issuer surface | Public result | Settlement implication |
|---|---|---|
| [Backpack Exchange API](https://docs.backpack.exchange/) | The current official API page contains no documented `dividend` or `corporate` operation. Its `history` operations concern account trading, borrow/lend, interest, RFQ and quotes. The public [assets endpoint](https://api.backpack.exchange/api/v1/assets) remains identity/current-operability data only. | No public historical Trek/Backpack stock action ledger was exposed beyond the already-reviewed asset registry. MU's reconstructed transaction remains one onchain observation, not a complete issuer ledger. |
| [Ondo documentation index](https://docs.ondo.finance/llms.txt) | The official index lists the complete documented API surface. Relevant entries remain dividend summary, shares-multiplier history, asset statuses, registry/metadata and market data; it lists no historical corporate-action/event endpoint. | No additional documented action ledger was found. |
| [Ondo shares-multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset) | `range=all` means all historical **multiplier changes**, but the page explicitly warns: “some asset events do not result in the shares multiplier value changing.” It returns value/timestamp points, not event class, ex-date, revision or cancellation history. | Even an `all` response cannot prove the complete corporate-action set or a zero-event period. |
| [Ondo dividend information](https://docs.ondo.finance/api-reference/assets/get-dividend-information-for-an-asset) | The response is a latest summary (`dividendYield`, `payoutFrequency`, `lastCashAmount`, `lastPaymentDate`, update timestamp), not a row ledger. | It cannot bind a historical event ID/ex-date to exact before/after multipliers. |
| [Ondo asset statuses](https://docs.ondo.finance/api-reference/status/get-asset-statuses) and [corporate-action explanation](https://docs.ondo.finance/ondo-stocks/corporate-actions) | Current/upcoming pause records can carry an `eventId`, `cash_dividend` reason and `updateSharesMultiplier`; policy says the normal pause starts just before the ex-date. The narrative also warns that exact ETF distributions may arrive very near or after hours before the ex-date. Neither source promises archival retention or a historical join to multiplier rows. | A contemporaneously archived status may help form a candidate join, but current status is not a durable annual ledger or finality proof. |

## Exact questions still requiring issuer answers

### xStocks / Backed

1. For corporate-action IDs `7c31ccb0-9a9e-471e-af0b-47921ca5dcd4`, `5ed19bd9-5444-49fc-aadd-de45c617faaa`, and `e06d3eca-7b09-40b6-a904-6bb880e3f205`, what are the authoritative underlying-company ex-date, record date, payment date and issuer multiplier activation time, and what stable field joins each event to its multiplier-history row and Solana update?
2. What do `Initial`, `Corrected`, `Scheduled` and `Cancelled` mean; which statuses are terminal; does a correction retain the same `eventId`; which version supersedes which record; and can a previously effective event later be corrected or cancelled?
3. When the underlying-company notice, corporate-action API, multiplier-history API and onchain multiplier disagree, which source is authoritative for (a) entitlement date, (b) event classification and (c) exact applied factor? Is that precedence stated in a governing or calculation-agent document?
4. What source-retention, coverage and late-addition/correction rules let an integrator establish that all actions for an exact xStock ISIN and mint have been accounted for over a period? An issuer-provided close assertion would help if available, but a custom signed calendar-year certificate is not required; DividendX's attestor must define its own reviewed finalization and subsequent-dispute policy from documented source guarantees.

### Backpack/Trek

Provide the durable issuer action ledger or public program/account contract for the exact `.US` mint, including event ID/type, civil ex-date, exact factor transition, revision/cancellation lifecycle, retention, and issuer/mint/year completeness assertion. The exchange API's account histories are not substitutes.

### Ondo

Provide the archival relationship between status `eventId`, official civil ex-date/reference market, dividend classification, multiplier change(s), and any correction/cancellation record. Also specify how events that do not change the multiplier are represented and how an exact asset/mint/year is declared complete and final.

## Qualification result

Nothing found changes the existing blocked result. Public documentation improved the description of source roles and sharpened the Ondo incompleteness proof, but it did not resolve the event/date joins, lifecycle semantics, canonical operational authority, or post-period finality required by `spec/issuer-qualification-v1.md`.
