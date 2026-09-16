# DividendX: a dividend layer across Solana issuers

Research and architecture review, **16 September 2026**. Start here. This supersedes xStocks-only scope in earlier planning. The approved design is retained; the [v4 pitch](../presentation/output/DividendX-phase-two-v4.pptx) and [narration](../presentation/narration.md) now introduce the broader product.

## Recommendation

Build **one shared dividend market for tokenized stocks on Solana**, with **xStocks, Backpack/Trek and Ondo in the first integration scope**. Their observed Solana tokens use the same Scaled UI Amount primitive, so supported isolated reinvested dividends can use one allocation engine. Add a small issuer-specific reader/asset-policy boundary, not three vault programs or a third circulating wrapper token.

We cannot honestly promise that **every Solana stock token is automatically compatible from day one**. The audit found actual registered shares with holder restrictions, private-company exposure without dividend rights, fee-bearing tokens and discontinued products. The useful promise is one workflow across qualified Solana issuers, with eligibility checked per mint. A wrapper cannot supply missing dividends, event data or custody permission.

This is a material expansion of the intended product, not a declaration that integrations are already built. Current software remains the approved historical calculator/design prototype. No DividendX PDA transfer, PT/DR issuance or program settlement has run.

## Who is on Solana, and what changes for us

| Provider/product family | What we verified | DividendX treatment |
|---|---|---|
| **xStocks / Backed** | Public registry: 837 Solana deployments. All 837 mint accounts existed with nonzero supply and the same eight-decimal Token-2022 extension profile at audit time. Classified public corporate-action history and a verified KOx event. | Initial scope. Reuse existing allocation math, generalize exact-mint configuration and retain issuer controls/finality checks. Catalog size is not eligible dividend coverage. |
| **Backpack / Trek receipts** | 48 `.US` Solana token entries with deposits and withdrawals enabled; all 48 have nonzero supply, six decimals and Scaled UI Amount. Real MU dividend-distribution transaction reconstructed. | Initial scope. Separate reader must distinguish dividend operations from ordinary mint/redeem multiplier updates. Official event/revision semantics still needed for live settlement. |
| **Ondo Stocks** | Native Solana Token-2022 Scaled UI Amount; AAPLon, MSFTon and KOon checked, nine decimals. Official public code lists mints; current API/history requires a key. | Initial scope now, not a later-chain feature. Same pure-dividend allocation math; separate authenticated event reader and retained classification/history join. |
| **Superstate Opening Bell** | Actual company shares: GLXY, EXOD and FWDI circulating; HSDT deployed but zero supply. Official registry plus default-frozen mint accounts and holder onboarding. | Permissioned integration track. Needs approved vault/registered-holder/claim-transfer design and documented dividend delivery. Current scale=1 does not prove dividend reinvestment. |
| **Securitize direct shares** | Official Solana launches for SECZ and CURR; inspected candidate mints are default-frozen. Exact mint provenance still needs direct registry/issuer confirmation. | Permissioned and provisional. Obtain identity, custody approval and distribution contract before any deposit support. |
| **OTCM/ST22** | Issuer filings establish live microcap tokenization. A separately indexed MSPC candidate has a mutable 7% transfer fee; its exact official provenance is not yet confirmed. Offering rights vary. | Separate confirmation and fee/permission/accounting work. No automatic admission based on ticker, protocol branding or a generic Token-2022 claim. |
| **PreStocks** | Live Solana private-company economic exposure. Official terms expressly exclude dividend rights; representative ANTHROPIC token has a 0.5% transfer fee. | Outside the stock-dividend product. A tradable exposure token need not have a dividend to strip. |
| **Republic Mirror Tokens** | Solana contingent-payout notes, with no underlying equity or dividend rights. Restricted transfers; public mint not confirmed. | Different payoff model, outside this dividend MVP. |
| **Remora / Step** | Historical Scaled UI mints persist; a February wind-down is reported/indexed, with no current official event service verified. Direct retrieval of the primary closure post failed. | Treat as historical/unavailable, not a live integration. Recheck issuer operations before reconsidering. |

**Adjacent/excluded:** WisdomTree's Solana equity funds use a restricted fund model. Superstate USTB/USCC are funds, not stocks. SILO/Alphaledger was only verified as devnet/beta. Dinari's official current chain list placed Solana in future expansion. No native Solana stocks were established for bStocks, Reality or Figure. Coinbase's Base tokens and Robinhood Chain tokens stay in the later-network roadmap. These are bounded research findings, not proof that an unpublished deployment cannot exist.

Detailed primary-source reports: [xStocks](research/xstocks-solana.md), [Backpack](research/backpack-solana.md), [Ondo](research/ondo-solana.md), [wider landscape](research/solana-landscape.md).

## Issuers and venues are different

Jupiter, Raydium, Kamino, wallets and exchange listings are distribution/integration surfaces, not additional stock issuers. Sunrise supplies distribution infrastructure. Backpack is a venue for more than one product family: its Trek stock receipts are different from actual shares distributed through Superstate. For Trek receipts, the legal issuer is Trek Nexus Markets Ltd; for Ondo Stocks it is Ondo Global Markets (BVI) Limited. In a direct-share model, the public company issues the share and the transfer agent manages its registry.

This distinction affects custody, redemption and data provenance. The same company ticker can have multiple issuer-specific collateral pools. A shared market interface does not make KOx and KOon interchangeable, and Backpack brokerage cash-dividend handling cannot be assumed to apply to withdrawn Trek tokens. [Backpack terms and product analysis](research/backpack-solana.md), [Ondo legal/product analysis](research/ondo-solana.md).

## Why one engine still works

For the qualified reinvestment model, the vault holds integer raw token units. A verified isolated dividend increases the issuer multiplier from M0 to M1. Allocate `floor(Q × (M1 − M0) / M1)` raw units to DR and the remaining units to PT. That conserves the deposited collateral and works with different decimal precisions.

The platform needs issuer-specific answers to three separate questions:

1. **May this vault hold and transfer this exact token?** Check provenance, rights, extensions, accounts and issuer requirements.
2. **Which change actually represents this dividend?** Bind a classified event to exact factors and time, excluding splits, corrections and supply-maintenance changes.
3. **What does the holder receive?** This first model returns stock-token units. Broker cash, direct-share distributions and price/NAV appreciation require different contracts.

xStocks' [multiplier documentation](https://docs.xstocks.fi/developers/multipliers) and Ondo's [corporate-action documentation](https://docs.ondo.finance/ondo-stocks/corporate-actions) establish the shared balance primitive. The conclusion that the formula is reusable is our accounting analysis; it is conditional on the event and token checks above.

The [architecture](adapter-decision.md) specifies an asset manifest, three offchain readers, one onchain series engine and one SDK/UI contract. Each issuer/mint/event gets isolated custody and claim mints. Internal shares provide normalization. Additional wrapper tokens, arbitrary plugin dispatch and cross-chain custody add no necessary value to this sprint.

## Real events for the demo

| Case | Evidence we have | What it supports |
|---|---|---|
| **Coca-Cola KOx** | Public classified event ID/revision; M0 `1.0183317967386898`, M1 `1.0225601246249238`; finalized mint confirmation. | Complete source-backed historical calculator and replay fixture. Current `Initial` event status still needs a live finality policy. |
| **Micron MU, Backpack** | Finalized `DividendDistribute` transaction on July 23, 2026; complete authority-history bracket gives M0=1 and M1=`1.000106726714702`. Backing receipt units increase in the same transaction. | A second real, reproducible **onchain reconstruction** for a labeled test replay. It is not an issuer-published event ledger or proof of gross/net cash reconciliation. |
| **Coca-Cola KOon, Ondo** | Real finalized multiplier update near the documented company dividend; current M1=`1.0238905041551842`. | Observation and a candidate to confirm. No verified issuer event binding yet, so no dividend allocation fixture should be asserted from this change alone. |

The Backpack transaction is [publicly inspectable](https://explorer.solana.com/tx/39vTkahE7rUnFypAkKpaHUxwMyuC1nG4nJ12GEm3y9V1Kqep6ijvcX4isqsNXB63s3vsGNDjfi7uFFgH32Te59R). Its current multiplier, `1.0001068649823912`, differs from the historical event factor because ordinary supply operations recomputed it later. This directly disproves using today's multiplier as a historical dividend amount. Preserve the transaction-level event boundary and provenance. No guessed withholding or reinvestment price belongs in the demo.

Keep Coca-Cola's existing dollar explanation: 100 pre-event share-equivalents produce about $8,935 stock exposure and $37.10 net dividend allocation at the **event-implied** $89.35 reference price. These are not guaranteed cash payouts or a DR sale quote. For MU, show sourced units/factors until a defensible dollar valuation basis is supplied.

## Day-one scope and acceptance

**Build for all eligible Solana issuers from the first architecture. Enable assets only to the level demonstrated.**

- Directory/observation: xStocks, Backpack and Ondo, plus clearly classified restricted/inactive/no-dividend families. Show company, issuer, actual mint, source date and availability.
- Shared accounting: test eight-, six- and nine-decimal profiles through the same engine. Unknown transfer conditions or unexplained multiplier changes block issuance/settlement.
- Event replays: KOx official history and MU's labeled onchain reconstruction are the two evidence-backed candidates. Add Ondo when its event/history join is obtained. Synthetic test cases remain visibly separate.
- Full flow: deposit before cutoff, issue PT/DR, sell DR to a second wallet using test funds, then redeem independently. No xStocks-only logic or hardcoded ticker in the shared engine.
- Live enablement: a separate gate for permitted real custody, a future event, data access, corrections/finality and operating controls. No issuer has passed a DividendX live gate today.

This keeps the multi-issuer ambition concrete while avoiding a false launch claim. If Ondo data or provider approval remains unavailable, the blocker is external and must stay visible; writing an adapter interface is not a substitute for completing that integration.

## What changed in our artifacts

The [master plan](plan.md), [architecture](adapter-decision.md), [phase work orders](phase-work-orders.md), pitch storyboard/revision, source ledger and narration now use the broader Solana scope. The [v4 deck](../presentation/output/DividendX-phase-two-v4.pptx) preserves nine slides, the approved visual language and the Coca-Cola example. It puts xStocks, Backpack and Ondo in initial scope and other networks later.

Earlier scope decisions are archived; historical evidence remains intact with supersession notices. The design system only gains issuer-selection/eligibility guidance. Its visual tokens, HTML prototype and screenshots remain unchanged.

## Immediate next work

Freeze the SDK/accounting interface against these findings, then build the multi-issuer frontend and readers. In parallel, obtain the [issuer data/access answers](issuer-data-requests.md): Backpack's documented program/event and correction contract, Ondo's read-only API access plus a classified historical example, and xStocks' event finality rules. These requests are drafted but have not been sent.

Astra remains responsible for architecture and review. Sol high handles frontend/readers, Sol xhigh handles the vault and accounting tests, and Sol medium handles presentation production. Evidence continues to supersede the plan.

## Verification and limits

Astra independently re-read key Backpack/Ondo/Superstate/PreStocks and provisional candidate mints at finalized slot **447447960**, preserving the [raw response](evidence/issuer-parent-verification-2026-09-16.json). xStocks' full mint scan covers slots **447444571–447444737**. Worker evidence includes Backpack's 48-mint inventory, raw MU transactions and authority history, Ondo's sampled mint/transaction observations and denied keyless API calls, and Superstate's official registry. Astra also independently retrieved and saved the [complete MU authority-history page](evidence/backpack-parent-authority-history-2026-09-16.json), confirming that only the prior scale reset and dividend operation touched the authority within the stated interval. No funded wallet or signed transaction was used.

Search coverage includes named issuers, direct-share platforms, legacy products, private-company exposures, adjacent equity funds and major other-chain families. It cannot certify a complete permanent universe: new mints, permissions and product terms can change. Source-backed per-asset admission is therefore part of the design, not a one-time claim of universal compatibility.
