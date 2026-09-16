# Current status

Updated 16 September 2026 after the user changed DividendX to calendar-year dividend series and chose to close deposits at year-start.

Public backup: [notorious-d-e-v/dividendx-stocklana](https://github.com/notorious-d-e-v/dividendx-stocklana).

## Current artifacts

| Area | Result |
| --- | --- |
| Brand | Approved design system, illustration guide and both-sides composability artwork, preserved |
| Pitch | Approved [illustrated v2](../presentation/output/DividendX-illustrated-v2.pptx) and [user narration](../presentation/narration.md), preserved; annual wording recorded for the next versioned export |
| Annual contract | [Accounting](../spec/annual-series-accounting.md), [SDK](../spec/annual-series-sdk.md), [acceptance matrix](../spec/annual-series-tests.md) and [product copy](../spec/annual-product.md) |
| Reference | Exact bigint [annual model](../packages/sdk/src/annual-reference.ts): multiple events, revisions/cancellations, cumulative rounding, paired exits and independent final redemption |
| Product | Annual Market / Split / Redeem at `/`, with isolated 2027/2028 series and distinct collecting, year-ended and finalized states |
| Fallback | Original single-event SDK and technical rehearsal at `/rehearsal/`, preserved |
| Evidence | 15 candidate mints across xStocks, Backpack/Trek and Ondo; historical KOx and Backpack MU factors |
| Research | [Annual conventions and fixture gaps](research/annual-dividend-series.md), extending the [prior-art review](research/prior-art-review.md) |

The annual model and preview are local. No deployed program, actual PT/DR token, wallet transaction, live issuer reader or AMM pool exists. Finality/completeness flags in the reference are controlled test inputs, not authenticated issuer evidence.

## Annual decisions

- Separate issuer/mint/year backing and claim names, such as `PT-KOx-2027` and `DR-KOx-2027`.
- Deposits close at January 1, 00:00 UTC. Official reference-market ex-dates determine which qualified dividends belong to the year.
- The annual allocation compounds isolated dividend ratios and rounds once; corrections replace earlier revisions. Unsupported/unresolved actions block unsafe finalization.
- Year-end stops eligible-event membership. Finalization waits for complete resolved records, including late-paid in-year dividends.
- DR transfers carry the whole accumulated entitlement. Matching PT/DR can recombine before finalization; each side redeems independently afterward without forfeiture.
- External burns and donations do not increase other holders' rights. Zero-output closure needs explicit consent. Quarterly terms remain later.

The preview clearly labels historical factors with synthetic term dates. Neither KOx nor MU currently has a verified ex-date in its fixture, and one event is not a complete annual payout or a future forecast.

## Verification

The fixture verifier and all **33 SDK tests** passed, including 22 annual tests and the unchanged 11 legacy tests. All **20 browser tests**, type checking and the production build passed. Astra independently checked the combined accounting lifecycle, ran the annual Chrome review through both holders' redemptions, and inspected desktop/mobile renders. Markdown links and preservation checks passed. See [web QA](../apps/web/qa/README.md).

## Next: actual program and transferable tokens

1. **Astra finishes the program instruction/account contract.** Pin bounded arithmetic and Token-2022 factor conformance, PDA/account layouts, canonical evidence serialization, authority separation, completeness/finality policy and unsupported-action stop/recovery states. The exact rational reference is the mathematical oracle, not SBF code.
2. **Sol implements at xhigh effort.** Build annual PDA custody, real PT/DR mints, pre-year issuance, revision-aware event records, recombination and post-maturity finalization/redemption. Support the multi-event acceptance matrix from the first version, even if the filmed demo uses one sourced example.
3. **Astra reviews; Sol connects the product at high effort.** Add wallet-signed test-network/local-validator transactions and actual receipts. Readers process event evidence in the background.
4. **Prove one AMM round trip.** Target Raydium CPMM on devnet with a specific annual DR and a clearly labeled private test quote token: add liquidity, swap, withdraw liquidity, then redeem recovered DR and retained PT. Preserve reserves for remaining AMM/lost claims. See [feasibility](research/claim-amm-feasibility.md).
5. **Refresh the submission package.** Export annual pitch wording in a new deck version, synchronize narration with user review, capture only working functionality and verify the actual submission form/deadline.

No redesign, wider issuer audit, custom AMM, bridge or reward token is required for this next phase.

## Dependencies and operating notes

Every live issuer needs authoritative ex-date joins, complete annual history, revision/finality rules and qualified ordinary vault custody. Ondo additionally needs its classified event sample and API access; Backpack needs a durable ledger beyond the MU reconstruction. [Data requests](issuer-data-requests.md) distinguish those gaps from already public discovery. These dependencies do not block controlled program tests.

Astra owns decisions and acceptance; Sol receives bounded work under [AGENTS.md](../AGENTS.md) and the [work orders](phase-work-orders.md). Verification supersedes plans through the [decision log](decision-log.md). Keep credentials outside the repository and browser bundle. Existing authorization covers public Git backup, not real-fund deployment, outreach or submission.

The GitHub OAuth login lacks `workflow` scope, so [CI remains an inactive template](../docs/ci-setup.md); no remote CI run is claimed. The [artifact map](../docs/artifact-map.md) identifies preserved history and current entry points.
