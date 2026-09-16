# Issuer data needed for DividendX

16 September 2026. These are drafts and technical requirements, not messages sent. Read-only issuer research is complete enough to choose the architecture; the following access and semantics are still needed for verified issuer settlement.

## Getting access and storing credentials

Ondo's [official API overview](https://docs.ondo.finance/api-reference/overview) directs access requests to **onboarding@ondo.finance** (rechecked 16 September 2026). Request read-only Ondo Stocks data access, multiplier history and a classified historical Solana dividend event; primary-market trading access is not required for this reader.

Backpack's [published exchange API](https://docs.backpack.exchange/) offers account-generated trading keys, but contains no documented dividend/corporate-action endpoint in the reviewed version. Ask the Backpack/Trek team for stock corporate-action data access using the draft below. Do not assume an exchange trading key grants the missing event data. The reviewed public xStocks registry/history path needs no key.

Local credential file: `/Users/node/.config/dividendx/issuer-api.env`, outside the preview workspace. It contains blank `ONDO_API_KEY` and `BACKPACK_STOCKS_API_KEY` fields. The Backpack variable is only a project-local placeholder; the credential format and authentication method await their documentation. The directory is owner-only (0700), and the newly created file is owner-readable/writable (0600). Existing files are never overwritten or printed by setup.

Fill values in a local editor; do not paste them into chat. No wallet secrets, trading keys or withdrawal access are needed. This file is reserved for server-side readers and is not yet connected to the demo. Never expose these values through `VITE_*`, public files, fixtures, browser requests or logs. Future reader tooling should load this file explicitly and report only access success/failure.

## Backpack

Two-sentence outreach draft:

> We're building DividendX for Stocklana so holders can keep stock exposure and sell the dividend rights, and we want Backpack stocks in the first release. Could you connect us with the team for a token corporate-actions API or documented DividendDistribute events, including exact pre/post multipliers, activation times and corrections, plus a confirmed Micron dividend sample?

Request the canonical stock-token registry and issuer program/IDL; stable event ID/revision/type; old/new multiplier at the dividend transaction; source-to-mint binding; eligibility, cutoff and timing; correction/finality policy; and gross/net/tax/fees/reinvestment details when available. Clarify multiplier recomputations during mint/redeem, so these do not become dividend yield. Confirm whether a public PDA vault may hold and transfer the tokens and whether any controls are scheduled to change.

Public observations found a real MU `DividendDistribute` transaction, but a transaction log is not a documented durable event API or issuer confirmation of record-date/finality semantics. A source-backed sample plus the contract above can support a reproducible historical replay. Broader live use needs ongoing access.

## Ondo

Two-sentence outreach draft:

> We're building DividendX for Stocklana, a shared Solana vault that separates stock exposure from dividend rights, and we're integrating Ondo's native Solana stock tokens. Could we get read-only API access and a confirmed KOon dividend example linking the corporate-action event ID/type to multiplier history, activation time and revision/finality rules?

Documented endpoints: [shares-multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [asset status](https://docs.ondo.finance/api-reference/status/get-asset-statuses), [registry](https://docs.ondo.finance/api-reference/assets/get-all-contract-addresses-across-networks). They require an API key. Do not paste credentials into chat or commit them; supply them through a local secret environment when implementing the server-side reader.

Request an archival event join: status event ID/type/start/end/`updateSharesMultiplier`, exact M0/M1, effective Solana timestamp/transaction and correction/finality policy. History values alone do not classify events, while current/upcoming status may no longer contain a past event. Also confirm net treatment/reinvestment data where available, API retention/limits and PDA transfer support. Direct issuer redemption access is a different permission from moving raw stock tokens.

## xStocks

No API key is needed for the reviewed public registry/history path. Clarify whether the `Initial` status on the KOx revision is usable for irreversible settlement, how corrections are published, and which status/version policy should govern future events. Confirm exact supported mint controls and vault operating requirements. Preserve source versions rather than interpreting `upcoming` as authoritative future entitlement.

## Scope of these requests

Only xStocks, Backpack/Trek and Ondo are active integration targets. Permissioned direct shares and other excluded families have no outreach or engineering work in this sprint. Their earlier research remains archived for reference. For the selected products, ask about ordinary PDA custody and event data; do not seek a special approved-vault arrangement to expand scope.

## Minimum to unlock a real-event replay

A trustworthy source must bind **issuer + exact mint + classified isolated cash dividend + event identity/version + exact before/after factors + effective time + accepted finality policy**. The protocol can allocate raw units from that factor pair without guessing a cash price. Gross/net amounts and reinvestment price make dollar reconciliation possible but must remain absent if not supplied.

A local replay can use an explicitly disclosed prototype attestor and a frozen verified source snapshot. Label the execution as test collateral with a replay clock. Production adds permitted real custody, future-event observation, ongoing data access and operational correction handling.
