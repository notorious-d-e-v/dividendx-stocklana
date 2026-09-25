# Issuer data needed for DivX

16 September 2026. These are drafts and technical requirements, not messages sent. Read-only issuer research is complete enough to choose the architecture; the following access and semantics are still needed for verified issuer settlement.

## Backpack

Two-sentence outreach draft:

> We're building DivX for Stocklana so holders can keep stock exposure and sell the dividend rights, and we want Backpack stocks in the first release. Could you connect us with the team for a token corporate-actions API or documented DividendDistribute events, including exact pre/post multipliers, activation times and corrections, plus a confirmed Micron dividend sample?

Request the canonical stock-token registry and issuer program/IDL; stable event ID/revision/type; old/new multiplier at the dividend transaction; source-to-mint binding; eligibility, cutoff and timing; correction/finality policy; and gross/net/tax/fees/reinvestment details when available. Clarify multiplier recomputations during mint/redeem, so these do not become dividend yield. Confirm whether a public PDA vault may hold and transfer the tokens and whether any controls are scheduled to change.

Public observations found a real MU `DividendDistribute` transaction, but a transaction log is not a documented durable event API or issuer confirmation of record-date/finality semantics. A source-backed sample plus the contract above can support a reproducible historical replay. Broader live use needs ongoing access.

## Ondo

Two-sentence outreach draft:

> We're building DivX for Stocklana, a shared Solana vault that separates stock exposure from dividend rights, and we're integrating Ondo's native Solana stock tokens. Could we get read-only API access and a confirmed KOon dividend example linking the corporate-action event ID/type to multiplier history, activation time and revision/finality rules?

Documented endpoints: [shares-multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [asset status](https://docs.ondo.finance/api-reference/status/get-asset-statuses), [registry](https://docs.ondo.finance/api-reference/assets/get-all-contract-addresses-across-networks). They require an API key. Do not paste credentials into chat or commit them; supply them through a local secret environment when implementing the server-side reader.

Request an archival event join: status event ID/type/start/end/`updateSharesMultiplier`, exact M0/M1, effective Solana timestamp/transaction and correction/finality policy. History values alone do not classify events, while current/upcoming status may no longer contain a past event. Also confirm net treatment/reinvestment data where available, API retention/limits and PDA transfer support. Direct issuer redemption access is a different permission from moving raw stock tokens.

## xStocks

No API key is needed for the reviewed public registry/history path. Clarify whether the `Initial` status on the KOx revision is usable for irreversible settlement, how corrections are published, and which status/version policy should govern future events. Confirm exact supported mint controls and vault operating requirements. Preserve source versions rather than interpreting `upcoming` as authoritative future entitlement.

## Permissioned direct shares

Superstate and Securitize need a separate provider conversation before engineering a live vault: can a PDA/pooled custody arrangement be approved, who is the registered holder, what transfers of derivative claims are permitted, how does the transfer agent deliver dividends, and what API binds each distribution to the eligible holding? Onboarding a user wallet alone does not answer those questions.

OTCM candidates additionally need official mint provenance, current offering rights, fee schedules and any transfer-hook contract. Other-family integrations should only enter the deposit path after these facts are available and the required accounting model has been reviewed.

## Minimum to unlock a real-event replay

A trustworthy source must bind **issuer + exact mint + classified isolated cash dividend + event identity/version + exact before/after factors + effective time + accepted finality policy**. The protocol can allocate raw units from that factor pair without guessing a cash price. Gross/net amounts and reinvestment price make dollar reconciliation possible but must remain absent if not supplied.

A local replay can use an explicitly disclosed prototype attestor and a frozen verified source snapshot. Label the execution as test collateral with a replay clock. Production adds permitted real custody, future-event observation, ongoing data access and operational correction handling.
