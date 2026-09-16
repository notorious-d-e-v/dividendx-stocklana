# DividendX: a dividend layer across Solana issuers

Research and architecture review, **16 September 2026**, refined after the user requested a contained permissionless package. Start here. The approved design is retained; the [v5 pitch](../presentation/output/DividendX-phase-two-v5.pptx) and [narration](../presentation/narration.md) are ready for review. Earlier broad and xStocks-only scope documents are archived.

## Recommendation

Build **one permissionless annual dividend market for selected stock tokens on Solana**, with **xStocks, Backpack/Trek and Ondo in the first integration scope**. Their observed Solana tokens use the same Scaled UI Amount primitive, so one engine can aggregate source-qualified reinvested dividends across an exact issuer/mint/calendar-year term. Add a small issuer-specific reader/asset-policy boundary, not three vault programs or a third circulating wrapper token.

The initial package contains **six companies and 15 candidate tokens**, selected for the same reinvested-dividend model and ordinary secondary transfer path. Permissioned holder/approved-vault products are outside the build, as are products without dividend rights, fee-bearing profiles and discontinued offerings. No onboarding UI, adapter or expanded catalog is planned for those families.

Permissionless describes intended access to DividendX for admitted assets: no holder allowlist or issuer-specific vault registration. The mint list selects collateral rather than users. Issuer freeze/pause controls and product restrictions remain; direct issuer minting/redemption onboarding is outside our flow. For example, Ondo documents [secondary transferability outside the US, subject to restrictions](https://docs.ondo.finance/ondo-stocks/transferability), and separately requires [KYC for issuer redemption](https://docs.ondo.finance/ondo-stocks/secondary-market-restrictions). Technical compatibility alone is not a determination of legal eligibility.

This is a material expansion of the intended product, not a declaration that integrations are already built. Current software consists of a local annual reference/product and the preserved historical rehearsal. No DividendX PDA transfer, PT/DR mint, wallet transaction or program finalization has run.

## The selected package

| Company | xStocks candidate | Backpack/Trek candidate | Ondo candidate |
|---|---|---|---|
| Coca-Cola | KOx | Excluded: deposits/withdrawals disabled | KOon |
| Apple | AAPLx | Excluded: deposits/withdrawals disabled | AAPLon |
| Microsoft | MSFTx | Excluded: deposits/withdrawals disabled | MSFTon |
| Micron | MUx | MU.US | MUon |
| Nike | NKEx | NKE.US | NKEon |
| IBM | IBMx | IBM.US | IBMon |

These are integration candidates with verified identity and observed compatible mint profiles, not enabled DividendX series. The [asset package and exact mint evidence](research/initial-asset-package.md) define the catalog. For Backpack, `.US` is the asset API identifier, not an assertion that its onchain metadata uses the same ticker.

Prove **one annual-series lifecycle across representative issuer profiles first**. KOx and Backpack Micron MU supply sourced single-event factors, but both lack verified ex-dates and complete-period evidence; map them into test terms only with explicit synthetic dates. Ondo has no qualified event fixture yet. KOon remains the first Ondo data request because it allows a same-company comparison with KOx. More catalog entries do not require more vault engines, but each enabled issuer/mint/year needs its own annual evidence and custody gate.

## Issuer evidence

The wider audit below is retained as the reason for the boundary. Only the first three rows are implementation scope.

| Provider/product family | What we verified | DividendX treatment |
|---|---|---|
| **xStocks / Backed** | Public registry: 837 Solana deployments. All 837 mint accounts existed with nonzero supply and the same eight-decimal Token-2022 extension profile at audit time. Classified public corporate-action history and a sourced KOx factor event, but no verified ex-date join or terminal annual completeness signal. | Initial scope. Generalize exact-mint configuration and require official civil ex-date, full-period revisions and finality before annual settlement. Catalog size is not eligible dividend coverage. |
| **Backpack / Trek receipts** | 48 `.US` Solana token entries with deposits and withdrawals enabled; all 48 have nonzero supply, six decimals and Scaled UI Amount. Real MU dividend-distribution transaction reconstructed. | Initial scope. Separate reader must distinguish dividend operations from ordinary mint/redeem multiplier updates. Official ex-date, complete-period and revision/finality semantics remain missing. |
| **Ondo Stocks** | Native Solana Token-2022 Scaled UI Amount; AAPLon, MSFTon and KOon checked, nine decimals. Official public code lists mints; current API/history requires a key. | Initial scope now, not a later-chain feature. Use the shared annual math only after an authenticated event/ex-date/factor join and complete-period history are available. |
| **Superstate Opening Bell** | Actual company shares: GLXY, EXOD and FWDI circulating; HSDT deployed but zero supply. Official registry plus default-frozen mint accounts and holder onboarding. | Excluded: permissioned holders/custody. No onboarding or integration work in this build. |
| **Securitize direct shares** | Official Solana launches for SECZ and CURR; inspected candidate mints are default-frozen. Exact mint provenance still needs direct registry/issuer confirmation. | Excluded: permissioned and provisional. No integration or access work in this build. |
| **OTCM/ST22** | Issuer filings establish live microcap tokenization. A separately indexed MSPC candidate has a mutable 7% transfer fee; its exact official provenance is not yet confirmed. Offering rights vary. | Excluded: unconfirmed provenance and unsupported fee/permission/accounting model. No integration work in this build. |
| **PreStocks** | Live Solana private-company economic exposure. Official terms expressly exclude dividend rights; representative ANTHROPIC token has a 0.5% transfer fee. | Outside the stock-dividend product. A tradable exposure token need not have a dividend to strip. |
| **Republic Mirror Tokens** | Solana contingent-payout notes, with no underlying equity or dividend rights. Restricted transfers; public mint not confirmed. | Different payoff model, outside this dividend MVP. |
| **Remora / Step** | Historical Scaled UI mints persist; a February wind-down is reported/indexed, with no current official event service verified. Direct retrieval of the primary closure post failed. | Treat as historical/unavailable, not a live integration. Recheck issuer operations before reconsidering. |

**Adjacent/excluded:** WisdomTree's Solana equity funds use a restricted fund model. Superstate USTB/USCC are funds, not stocks. SILO/Alphaledger was only verified as devnet/beta. Dinari's official current chain list placed Solana in future expansion. No native Solana stocks were established for bStocks, Reality or Figure. Coinbase's Base tokens and Robinhood Chain tokens stay in the later-network roadmap. These are bounded research findings, not proof that an unpublished deployment cannot exist.

Detailed primary-source reports: [xStocks](research/xstocks-solana.md), [Backpack](research/backpack-solana.md), [Ondo](research/ondo-solana.md), [wider landscape](research/solana-landscape.md).

## Issuers and venues are different

Jupiter, Raydium, Kamino, wallets and exchange listings are distribution/integration surfaces, not additional stock issuers. Sunrise supplies distribution infrastructure. Backpack is a venue for more than one product family: its Trek stock receipts are different from actual shares distributed through Superstate. For Trek receipts, the legal issuer is Trek Nexus Markets Ltd; for Ondo Stocks it is Ondo Global Markets (BVI) Limited. In a direct-share model, the public company issues the share and the transfer agent manages its registry.

This distinction affects custody, redemption and data provenance. The same company ticker can have multiple issuer-specific collateral pools. A shared market interface does not make KOx and KOon interchangeable, and Backpack brokerage cash-dividend handling cannot be assumed to apply to withdrawn Trek tokens. [Backpack terms and product analysis](research/backpack-solana.md), [Ondo legal/product analysis](research/ondo-solana.md).

## Why one engine still works

For the qualified reinvestment model, the vault holds integer raw token units for one exact issuer/mint/year. Deposits close at January 1 UTC and mint equal raw PT/DR pairs. For every latest accepted qualified event whose official reference-market civil ex-date falls in the year, use its isolated positive factor `M1_i/M0_i`. With accountable raw collateral `Q`, compute `R = product(M0_i/M1_i)`, allocate `floor(Q × (1 − R))` to DR and the remainder to PT. This conserves collateral across multiple dividends and decimal profiles. Summing independently rounded one-event allocations would double-count the shrinking principal base and lose fractional accrual.

The platform needs issuer-specific answers to four separate questions:

1. **May this vault hold and transfer this exact token?** Check provenance, rights, extensions, accounts and issuer requirements.
2. **Which events belong to this year?** Bind each classified event to exact factors plus the official civil ex-date, replace superseded revisions, and exclude splits and supply-maintenance changes from dividend yield.
3. **Is the annual journal complete and final?** Prove eligible-period coverage, late-event handling, revision precedence and finality separately from maturity.
4. **What does the holder receive?** This first model returns stock-token units. Broker cash, direct-share distributions and price/NAV appreciation require different contracts.

xStocks' [multiplier documentation](https://docs.xstocks.fi/developers/multipliers) and Ondo's [corporate-action documentation](https://docs.ondo.finance/ondo-stocks/corporate-actions) establish the shared balance primitive. The conclusion that the formula is reusable is our accounting analysis; it is conditional on the event and token checks above.

The [architecture](adapter-decision.md) specifies an asset manifest, three offchain readers, one annual series engine and one SDK/UI contract. Each issuer/mint/year gets isolated custody and claim mints. Before finalization, matching PT+DR recombine one-for-one; maturity only closes event membership. Journal-complete finalization freezes pools, after which PT and bearer DR redeem independently without forfeiture. Additional wrapper tokens, arbitrary plugin dispatch and cross-chain custody add no necessary value to this sprint.

## Real events for the demo

| Case | Evidence we have | What it supports |
|---|---|---|
| **Coca-Cola KOx** | Public classified event ID/revision; M0 `1.0183317967386898`, M1 `1.0225601246249238`; finalized mint confirmation. The source row has no official ex-date and remains `Initial`. | Source-backed single-event factor regression. Any annual test mapping needs an explicit synthetic ex-date and cannot claim complete yearly payout or finality. |
| **Micron MU, Backpack** | Finalized `DividendDistribute` transaction on July 23, 2026; complete authority-history bracket gives M0=1 and M1=`1.000106726714702`. Backing receipt units increase in the same transaction, but no official ex-date or complete ledger is available. | A real, reproducible **onchain reconstruction** for a labeled single-event factor regression. It is not an issuer-published annual event ledger or proof of gross/net cash reconciliation. |
| **Coca-Cola KOon, Ondo** | Real finalized multiplier update near the documented company dividend; current M1=`1.0238905041551842`. | Observation and a candidate to confirm. No verified issuer event binding yet, so no dividend allocation fixture should be asserted from this change alone. |

The Backpack transaction is [publicly inspectable](https://explorer.solana.com/tx/39vTkahE7rUnFypAkKpaHUxwMyuC1nG4nJ12GEm3y9V1Kqep6ijvcX4isqsNXB63s3vsGNDjfi7uFFgH32Te59R). Its current multiplier, `1.0001068649823912`, differs from the historical event factor because ordinary supply operations recomputed it later. This directly disproves using today's multiplier as a historical dividend amount. Preserve the transaction-level event boundary and provenance. No guessed withholding or reinvestment price belongs in the demo.

Keep Coca-Cola's existing dollar explanation: 100 pre-event share-equivalents produce about $8,935 stock exposure and $37.10 net dividend allocation at the **event-implied** $89.35 reference price. These are not guaranteed cash payouts or a DR sale quote. For MU, show sourced units/factors until a defensible dollar valuation basis is supplied.

## Day-one scope and acceptance

**Build a complete flow across the three selected issuer families. Enable each selected asset only to the level demonstrated.**

- Directory/observation: the selected 15 candidate tokens across xStocks, Backpack and Ondo. Show company, issuer, actual mint, source date and availability. Excluded product families stay in research, outside the catalog.
- Shared accounting: test eight-, six- and nine-decimal profiles through the same annual engine, including multiple events and revisions. Unknown transfer conditions or unexplained multiplier changes block safe finalization.
- Historical regressions: KOx official history and MU's labeled onchain reconstruction supply exact factors only. Their test ex-dates are synthetic until source-qualified. Add Ondo only when its event/ex-date/factor join is obtained.
- Full flow: deposit before January 1, issue annual PT/DR, process qualified events, allow prefinal paired recombination, reach maturity, attest a complete journal, then redeem each side independently. No xStocks-only logic or hardcoded ticker in the shared engine.
- Live enablement: a separate gate for permitted real custody, official ex-date sources, complete-period access, corrections/finality and operating controls. No issuer has passed a DividendX live gate today.

This keeps the multi-issuer ambition concrete while avoiding a false launch claim. If Ondo event data remains unavailable, keep that dependency visible. A token requiring provider approval for ordinary vault custody leaves the package; we do not expand into permissioned integration to accommodate it. Writing an adapter interface does not complete an integration.

## What changed in our artifacts

The [master plan](plan.md), [architecture](adapter-decision.md) and [phase work orders](phase-work-orders.md) now use annual issuer/mint/year series. The approved decks, narration and visual language remain preserved historical product material; this synchronization does not regenerate them. They continue to name the selected six-company package, put xStocks, Backpack and Ondo in initial scope and keep other networks later.

Earlier scope decisions are archived; historical evidence remains intact with supersession notices. The design system only gains issuer-selection/eligibility guidance. Its visual tokens, HTML prototype and screenshots remain unchanged.

## Immediate next work

The annual accounting/reference/product contracts are now the implementation source. Next, freeze the bounded onchain representation and program accounts, then build the annual vault, transaction SDK and three readers. Data dependencies are recorded in [issuer data requests](issuer-data-requests.md): authoritative ex-date joins, complete-period ledgers, revisions and finality/completeness rules. These requests are drafts and have not been sent.

Astra remains responsible for architecture and review. Sol high handles frontend/readers, Sol xhigh handles the vault and accounting tests, and Sol medium handles presentation production. Evidence continues to supersede the plan.

## Verification and limits

Astra independently re-read all **15 selected mints at finalized slot 447462406**, preserving the [raw request and response](evidence/initial-package-parent-verification-2026-09-16.json). Every selected mint matched the expected token program, decimals and observed extension policy, with nonzero supply, initialized default accounts, no active transfer hook or fee, and an unpaused state. This is profile verification, not vault execution.

The wider audit's earlier [parent response](evidence/issuer-parent-verification-2026-09-16.json) covers slot **447447960**, and xStocks' full mint scan covers **447444571–447444737**. Astra also independently saved the [complete MU authority-history page](evidence/backpack-parent-authority-history-2026-09-16.json), confirming the historical dividend bracket. No funded wallet or signed transaction was used.

Search coverage includes named issuers, direct-share platforms, legacy products, private-company exposures, adjacent equity funds and major other-chain families. It cannot certify a complete permanent universe: new mints, permissions and product terms can change. Source-backed per-asset admission is therefore part of the design, not a one-time claim of universal compatibility.
