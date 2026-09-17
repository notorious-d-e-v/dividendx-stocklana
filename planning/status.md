# Current status

Updated 17 September 2026 after acceptance of the actual annual Solana program and transaction SDK for local integration. Deposits still close at year-start.

Public backup: [notorious-d-e-v/dividendx-stocklana](https://github.com/notorious-d-e-v/dividendx-stocklana).

## Current artifacts

| Area | Result |
| --- | --- |
| Brand | Approved design system, illustration guide and both-sides composability artwork, preserved |
| Pitch | Approved [illustrated v2](../presentation/output/DividendX-illustrated-v2.pptx) and [user narration](../presentation/narration.md), preserved; annual wording recorded for the next versioned export |
| Annual contract | [Accounting](../spec/annual-series-accounting.md), [SDK](../spec/annual-series-sdk.md), [acceptance matrix](../spec/annual-series-tests.md) and [product copy](../spec/annual-product.md) |
| Reference | Exact bigint [annual model](../packages/sdk/src/annual-reference.ts): multiple events, revisions/cancellations, cumulative rounding, paired exits and independent final redemption |
| Program | [Anchor program](../programs/dividendx/README.md) with Token-2022 custody, ordinary SPL PT/DR mints, immutable event revisions, staged exact settlement and independent redemption |
| Transaction SDK | [Separate package](../packages/transaction-sdk/README.md) with generated-IDL builders, coherent reads, raw-unit quotes and caller-supplied signing |
| Program contract | [Frozen implementation contract](../spec/program-v1.md), [toolchain](../docs/program-toolchain.md) and [acceptance review](program-review.md) |
| Product | Annual Market / Split / Redeem at `/`, with isolated 2027/2028 series and distinct collecting, year-ended and finalized states |
| Fallback | Original single-event SDK and technical rehearsal at `/rehearsal/`, preserved |
| Evidence | 15 candidate mints across xStocks, Backpack/Trek and Ondo; historical KOx and Backpack MU factors |
| Research | [Annual conventions and fixture gaps](research/annual-dividend-series.md), extending the [prior-art review](research/prior-art-review.md) |

The web preview remains local and simulated. The separate program tests execute actual token custody and PT/DR minting through the compiled SBF program. No public deployment, wallet UI, live issuer reader or AMM pool is claimed. Finality/completeness inputs in controlled tests are not authenticated issuer evidence; the program trusts its configured attestor for classification and complete-period coverage.

## Annual decisions

- Separate issuer/mint/year backing and claim names, such as `PT-KOx-2027` and `DR-KOx-2027`.
- Deposits close at January 1, 00:00 UTC. Official reference-market ex-dates determine which qualified dividends belong to the year.
- The annual allocation compounds isolated dividend ratios and rounds once; corrections replace earlier revisions. Unsupported/unresolved actions block unsafe finalization.
- Year-end stops eligible-event membership. Finalization waits for complete resolved records, including late-paid in-year dividends.
- DR transfers carry the whole accumulated entitlement. Matching PT/DR can recombine before finalization; each side redeems independently afterward without forfeiture.
- External burns and donations do not increase other holders' rights. Zero-output closure needs explicit consent. Quarterly terms remain later.

The preview clearly labels historical factors with synthetic term dates. Neither KOx nor MU currently has a verified ex-date in its fixture, and one event is not a complete annual payout or a future forecast.

## Verification

The program build, generated IDL, **46 Rust tests** (including 16 compiled-SBF integration tests), **22 transaction-SDK tests** and package import passed. Signed local-validator transactions proved deposit, recombination and rollback of prior successful token CPIs after a later instruction failed. Exact artifacts and proof boundaries are in the [acceptance review](program-review.md).

The fixture verifier and all **33 reference/legacy SDK tests**, type checking and the production build also passed. The previous **20 browser tests** and visual review remain the preserved UI baseline; this phase does not change the frontend. See [web QA](../apps/web/qa/README.md).

## Next: wallet and issuer integration

1. **Connect the product at high effort.** Use wallet-signed transactions and actual receipts from the accepted SDK/program, while preserving the local preview as a fallback. A complete annual lifecycle uses explicitly controlled test time; a public test network does not fast-forward its clock for a demo.
2. **Add operational issuer evidence.** Readers join official ex-dates, classification, revisions and complete-period coverage in the background. A shared token profile or historical factor is not a live annual feed.
3. **Prove one AMM round trip.** Target Raydium CPMM on devnet with a specific annual DR and a clearly labeled private test quote token: add liquidity, swap, withdraw liquidity, then redeem eligible recovered claims. Preserve reserves for remaining AMM/lost claims. See [feasibility](research/claim-amm-feasibility.md).
4. **Refresh the submission package.** Export annual pitch wording in a new deck version, synchronize narration with user review, capture only working functionality and verify the actual submission form/deadline.

No redesign, wider issuer audit, custom AMM, bridge or reward token is required for this next phase.

The [roadmap](roadmap.md) records early next-year listings, rolling DR vaults, demand-led quarterly terms and perpetual-product research. None changes the annual settlement primitive or adds scope to the current program.

## Dependencies and operating notes

Every live issuer needs authoritative ex-date joins, complete annual history, revision/finality rules and qualified ordinary vault custody. Ondo additionally needs its classified event sample and API access; Backpack needs a durable ledger beyond the MU reconstruction. [Data requests](issuer-data-requests.md) distinguish those gaps from already public discovery. These dependencies do not block controlled program tests.

Astra owns decisions and acceptance; Sol receives bounded work under [AGENTS.md](../AGENTS.md) and the [work orders](phase-work-orders.md). Verification supersedes plans through the [decision log](decision-log.md). Keep credentials outside the repository and browser bundle. Existing authorization covers public Git backup, not real-fund deployment, outreach or submission.

The GitHub OAuth login lacks `workflow` scope, so [CI remains an inactive template](../docs/ci-setup.md); no remote CI run is claimed. The [artifact map](../docs/artifact-map.md) identifies preserved history and current entry points.
