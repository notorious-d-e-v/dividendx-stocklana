# Issuer data needed for DividendX

16 September 2026. These are drafts and technical requirements, not messages sent. Public asset discovery is complete enough for the selected package. The missing work is settlement-grade annual corporate-action data: authoritative civil ex-dates, exact factor joins, complete period coverage, revisions and finality.

## Getting access and storing credentials

Ondo's [official API overview](https://docs.ondo.finance/api-reference/overview) directs access requests to **onboarding@ondo.finance** (rechecked 16 September 2026). Request read-only Ondo Stocks corporate-action and multiplier-history access sufficient to join a complete annual period; primary-market trading access and another asset catalog are not required.

Backpack's [published exchange API](https://docs.backpack.exchange/) offers account-generated trading keys, but contains no documented dividend/corporate-action endpoint in the reviewed version. Ask the Backpack/Trek team for stock corporate-action data access using the draft below. Do not assume an exchange trading key grants the missing event data. The reviewed public xStocks registry/history path needs no key.

Local credential file: `/Users/node/.config/dividendx/issuer-api.env`, outside the preview workspace. It contains blank `ONDO_API_KEY` and `BACKPACK_STOCKS_API_KEY` fields. The Backpack variable is only a project-local placeholder; the credential format and authentication method await their documentation. The directory is owner-only (0700), and the newly created file is owner-readable/writable (0600). Existing files are never overwritten or printed by setup.

Fill values in a local editor; do not paste them into chat. No wallet secrets, trading keys or withdrawal access are needed. This file is reserved for server-side readers and is not yet connected to the demo. Never expose these values through `VITE_*`, public files, fixtures, browser requests or logs. Future reader tooling should load this file explicitly and report only access success/failure.

## Backpack

Two-sentence outreach draft:

> We're building DividendX for Stocklana so holders can separate a calendar year's qualified dividends from stock exposure, and we want Backpack stocks in the first release. Could you connect us with the team for a durable token corporate-actions ledger that supplies official reference-market ex-dates, exact DividendDistribute factors, complete period history, revisions and a finality/completeness signal, including the Micron example?

Request the issuer program/IDL and durable action contract: stable event ID, ordered revision/type/status, exact mint binding, official reference exchange and civil ex-date, record/payment/effective times as distinct fields, exact old/new multiplier for each dividend operation, cancellation/correction semantics, complete-period query or coverage proof, and the authoritative post-period finality signal. Ask for gross/net/tax/fees/reinvestment details when available. Clarify multiplier recomputations during mint/redeem so they cannot become dividend yield, and confirm whether an ordinary public PDA vault may hold and transfer the tokens. Do not request another token registry; public asset discovery is already recorded.

Public observations found a real MU `DividendDistribute` transaction, but the reconstruction has no verified civil ex-date and is not a complete period ledger or issuer finality statement. It supports a single-event factor regression with an explicit synthetic test date. Annual finalization needs ongoing access plus authoritative coverage and revision/finality semantics.

## Ondo

Two-sentence outreach draft:

> We're building DividendX for Stocklana, a shared Solana vault that separates a calendar year's qualified dividends from stock exposure, and we're integrating Ondo's native Solana stock tokens. Could we get read-only access to a complete historical corporate-action period, including official civil ex-dates, event IDs/revisions/types, exact multiplier joins and the signal that the eligible period is complete and final?

Documented endpoints: [shares-multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [asset status](https://docs.ondo.finance/api-reference/status/get-asset-statuses), [registry](https://docs.ondo.finance/api-reference/assets/get-all-contract-addresses-across-networks). They require an API key. Do not paste credentials into chat or commit them; supply them through a local secret environment when implementing the server-side reader.

Request an archival annual join: stable event ID/type/revision/status, exact mint, official reference market and civil ex-date, separate record/payment/effective dates, `updateSharesMultiplier`, exact M0/M1, Solana transaction/activation evidence, cancellation/correction history, full-period pagination/retention and completeness/finality policy. History values alone do not classify events, while current/upcoming status may no longer contain a past event. Also confirm net treatment/reinvestment data, API limits and ordinary PDA transfer support. Direct issuer redemption access is a different permission from moving raw stock tokens. The public registry and mint discovery do not need to be requested again.

## xStocks

No API key is needed for the reviewed public registry/history path. Request the missing authoritative ex-date join for each history row, including reference market/calendar and separate record/payment/effective dates. Clarify how a reader proves it has the complete event set for an issuer/mint/year after maturity, whether `Initial` can ever become final, how late additions/corrections/cancellations are published, and which digest/version policy supports irreversible finalization. Confirm ordinary vault operating requirements. Preserve source versions rather than interpreting `upcoming`, an activation timestamp or a payment date as the ex-date or final entitlement.

## Scope of these requests

Only xStocks, Backpack/Trek and Ondo are active integration targets. Permissioned direct shares and other excluded families have no outreach or engineering work in this sprint. Their earlier research remains archived for reference. For the selected products, ask about ordinary PDA custody and event data; do not seek a special approved-vault arrangement to expand scope.

## Minimum to unlock an annual settlement claim

A trustworthy source must bind **issuer + exact mint + official civil ex-date + classified isolated cash dividend + stable event identity/revision + exact before/after factors**, and must provide the complete eligible-period history plus an accepted finality/completeness rule. The protocol can multiply qualified event ratios without guessing a cash price. Gross/net amounts and reinvestment price make dollar reconciliation possible but must remain absent if not supplied.

The existing KOx and MU factors may be used locally with explicitly synthetic test ex-dates and a disclosed prototype completeness attestation. Label each as one sourced event, not a complete annual payout. Ondo remains without a fixture. Production additionally requires permitted real custody, continuing event access, late-payment handling, revisions and operational finality.
