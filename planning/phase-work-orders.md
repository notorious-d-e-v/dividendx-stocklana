# DividendX phase work orders

Updated 16 September 2026. Workspace `/Users/node/workspace/dividendx-stocklana`. The visual system and illustrated pitch are approved. Scope is the selected asset package across xStocks, Backpack/Trek and Ondo. Permissioned holder/approved-vault products, onboarding and catalog UI are excluded. The annual model/product and preserved rehearsal are local references; no DividendX program, wallet integration or claim mint exists. This supersedes the archived broader and xStocks-only work orders.

## Delegation contract

Astra owns product decisions, architecture, evidence review and final acceptance. Use the `astra-sol-delegation` skill for bounded production work in GPT-5.6 Sol, fresh context, explicit effort, disjoint file ownership, no recursive delegation. Preserve existing work. Return paths, checks, limitations and new evidence. Do not start the next phase automatically.

Read `planning/plan.md`, `solana-issuer-synthesis.md`, `adapter-decision.md`, `decision-log.md`, the relevant `planning/research/` reports, `real-event-refresh.md` and the latest pitch specification before production. Dated research is evidence, not an instruction to retain obsolete scope. Contradictions go to Astra before a claim or integration is enabled.

Use one shared ScaledReinvestmentAnnualV1 engine, separate source readers and per-mint capability checks. Every series is an exact cluster/issuer/mint/calendar-year instrument; only PT/DR circulate and internal shares are accounting units. Claims from different issuers, mints or years remain separate. Dividends settle in underlying stock tokens and are not fixed USDC. No unsupported event inference, invented live quote, users, liquidity, partnership or deployed capability.

Read-only sources and local production/test work are allowed. On 16 September 2026 the user explicitly authorized creating and pushing a public GitHub repository for this project backup. That authorization supersedes the earlier local-only publication limit for repository backup; it does not authorize real-asset trades, mainnet deployment, external outreach or hackathon submission. API keys stay in the user's credential environment and server-side readers, never fixtures, frontend bundles, screenshots or logs.

## Phase 1: approved visual system

Complete. Preserve `design/**` and `packages/design-tokens/**` as the source of visual decisions: warm white/ink, blue stock exposure, amber dividend rights, original mark, approved heading spacing, states and source-backed KOx calculator. The user also approved the illustration direction and both-sides composability artwork. Read `design/illustrations/illustration-guide.md` and `agent-brief.md` when applying that artwork to the frontend. General composability illustrations show both PT and DR; locked backing stays in the vault. Future frontend work generalizes the asset/issuer selector and copy; it does not require a redesign.

## Phase 2: pitch revision

Complete and approved. Preserve the current illustrated v2 deck and user-edited narration. The work order below records the delivered scope.

Sol **medium**. Own only `presentation/**`. Input: Astra's `spec/pitch-storyboard.md` and `spec/pitch-revision-2026-09-16.md`, current nine-slide deck, approved tokens and latest evidence.

Preserve the design and useful existing narrative. Establish DividendX as a permissionless dividend protocol for selected Solana stock tokens. Put xStocks, Backpack and Ondo in initial integration scope and name recognizable candidate stocks. Keep other chains later. Do not claim all tokens or completed integrations. Product descriptions may use direct present tense; prototype/build status stays visible. Explain once in notes that issuer controls remain, and that permissioned custody products are excluded. Keep Coca-Cola as the sourced example.

Use the presentations skill, editable native text/evidence diagrams, required operation marker and finalizer. Produce a new versioned nine-slide PPTX, individual previews, contact sheet, narration, notes/source ledger and submission draft. Archive prior presentation sources and deliverables without breaking old links. Inspect all final slides. Do not change the approved design prototype or add fictional receipts.

## Phase 3: contract and frontend rehearsal

The preserved one-event rehearsal remains governed by `spec/series-accounting.md`, `spec/sdk-interface.md` and `spec/frontend-rehearsal.md`. The new local root product follows `spec/annual-product.md`, `spec/annual-series-accounting.md` and `spec/annual-series-sdk.md`. Product preview: http://127.0.0.1:4174/; technical rehearsal: http://127.0.0.1:4174/rehearsal/. The 15-token catalog has two sourced single-event factor examples; neither KOx nor MU has a verified ex-date or complete annual journal, and Ondo has no qualified fixture. All annual term dates used with those factors must be explicit test data.

Sol **high** for SDK/UI and **medium** for fixture compilation. The following scope is delivered with in-memory demo accounts and receipts. Preserve the replaceable SDK boundary when connecting the program; shared configuration changes must be sequential with program work.

Implement Market, Split, Position/Redeem using the approved design. Market groups the selected companies and distinguishes issuer/mint. Cover xStocks, Backpack and Ondo with source-backed snapshots or live readers. Show a clear reason for pending dividend data or a temporarily paused/unavailable selected token. Exclude permissioned, retired and no-dividend families from the catalog. Do not build onboarding/KYC, issuer-approval prompts or adapter stubs for excluded families. Keep technical profiles in the inspector.

Separate capabilities: recognized token, observed mint, dividend data available, permitted custody, tested execution, live series enabled. A badge must reflect the actual capability. Never turn discovery into automatic deposit eligibility. The initial event execution reference is the real KOx fixture. Backpack MU has a second source-backed fixture labeled `onchain_reconstruction`; use its exact DividendDistribute M0/M1 and covered authority-history bracket. Ondo requires a verified issuer event record before enabling a dividend fixture. Test-only scenarios are labeled as tests.

Provide the annual allocation reference before wallet connection. Keep historical balance scenarios distinct from actual entitlements. Preserve event/source clocks separately from the test-term clock, and show stale/error/loading states and the optional accounting inspector. Introduce company names before tickers. Use dollar context only with a stated valuation basis; DR sale quotes are separate.

Rehearse pre-year deposit, paired issuance, sale to a second wallet using demo funds, multiple event revisions, maturity, journal finalization and independent redemption. A transfer is not a sale. Use exact integer/rational reference arithmetic and a replaceable SDK boundary. Verify desktop/mobile, keyboard flow, stale data, unsupported profiles and the full local sequence. Deliver build/type checks and screenshots with current execution boundaries.

### Product revision following user review

The earlier `spec/product-app-v1.md` revision established the approved Market / Split / Redeem interaction and preserved `/rehearsal/`. The current root contract is now [annual product](../spec/annual-product.md): exact year identities, a January 1 cutoff, funding/collecting/matured-pending/redeemable states, provisional accumulated dividends, prefinal paired recombination and independent postfinal redemption. Keep source details available without making users operate the event pipeline. Preserve evidence, SDK rehearsal, artwork, decks and narration.

The annual product remains a local preview with seeded balances and test attestations. It does not complete the onchain or AMM target. Original rehearsal source and behavior stay available separately; the next implementation phase remains the actual annual vault, transaction SDK and claim mints.

## Phase 4: annual vault, SDK and issuer readers

Sol **xhigh** as requested by the user. Start only after Astra freezes the bounded onchain factor representation, evidence serialization, authority model, compute limits and recovery policy. The controlling documents are [annual accounting](../spec/annual-series-accounting.md), the [annual SDK/reference contract](../spec/annual-series-sdk.md) and [annual acceptance matrix](../spec/annual-series-tests.md). Preserve the legacy SDK and `/rehearsal/`; do not evolve their event-equals-series contract into the program. Own `programs/dividendx/**`, assigned transaction-SDK paths, `packages/issuer-readers/**`, `tests/protocol/**`, `scripts/protocol/**` and specifically assigned Anchor configuration.

Implement one ScaledReinvestmentAnnualV1 program with isolated cluster/issuer/mint/year series, PDA custody and actual transferable PT/DR mints. Deposits mint equal raw pairs only before January 1 UTC; no claim issuance occurs during the year. Event children carry stable identity, monotonic revisions, official reference-market civil ex-date, classification, exact factor data and evidence/finality state. Higher revisions replace rather than compound. Confirmed zero/cancellation contributes factor one; pending, missing-date, unsupported and unexplained records block finalization without destroying claims.

For remaining accountable raw collateral `Q`, maintain the accepted in-year ratio `R = product(M0_i/M1_i)` and allocate DR as `floor(Q × (1 − R))`, with PT receiving the remainder. Do not sum separately rounded event allocations. Before finalization, matching PT+DR recombine one-for-one even after accrual or maturity. Maturity closes ex-date membership but does not enable side redemption. A distinct journal-complete finalization freezes `S=Q` and both pools once; afterward each side redeems independently with cumulative rounding and no time-based forfeiture.

Select the claim token standard explicitly for wallet/AMM compatibility; collateral extensions need not be copied onto claims. Specify claim/vault authorities, direct external burns, abandoned reserves and donations with no sweep, zero-output consent, custody deficits and operation-specific pause/exit rules. No arbitrary adapter program dispatch, third wrapper, cross-chain bridge, protocol fee, rewards token or pooled issuer substitution.

Implement typed readers for xStocks, Backpack and Ondo that retain source provenance, official ex-date joins, full eligible-period coverage, revision history and finality/completeness evidence. An unavailable source returns unavailable; it never fabricates a resolved journal. Chain time controls cutoff and maturity. Reader processing may continue after maturity for an in-year late payout. No current multiplier, payment date, activation time, price change or vault donation substitutes for classified event evidence.

Program conformance must implement the full [annual matrix](../spec/annual-series-tests.md): issuer/mint/year/cluster isolation; January 1 and civil ex-date boundaries; four-event multiplicative accumulation; fractional accrual; revisions across the year boundary; pending/zero/cancelled/unsupported cases; prefinal recombination; bearer transfers; journal-complete finalization; cumulative partial redemption; external burns, reserves, donations, deficits and arithmetic/compute bounds. Also cover 6/8/9 decimals, exact multiplier bytes, PDA/mint/signer/replay checks and supported/unsupported extension policies.

Use KOx and MU only as single-event factor regressions with explicit synthetic ex-dates in a test term. Neither proves complete annual coverage or issuer finality. HONx remains a reverse-split negative control. Ondo stays without a dividend fixture until an authenticated event/ex-date/factor join exists. Representative mock mints prove program behavior, not actual issuer custody. Record program conformance, historical factor regression and live issuer enablement as separate levels.

Deliver reproducible program tests, transaction-SDK checks, fixture provenance and source-access gaps. Astra reviews the accounting and evidence before integration. Never hide failed annual coverage behind one sourced event or silently restore an xStocks-only design.

## Phase 5: integration and final demo

Sol **high**. Own integration paths assigned by Astra after prior workers finish. Connect the annual product to the real SDK/program and wallet, replace simulated state with actual test-network/local-validator receipts, and verify pre-year issuance, wallet transfers, prefinal paired recombination, matured-pending status, finalization and independent redemption. Source readers/attestation run in the background; users see funding/collecting/matured-pending/redeemable states rather than operating a replay pipeline. Retain the local rehearsal separately.

The user requests one actual external AMM integration in the hackathon. The bounded target is Raydium CPMM on devnet with ordinary SPL claim mints, subject to live program/config checks. See `planning/research/claim-amm-feasibility.md`. Demonstrate a DR / private test-USD quote-token pool: create/seed, add liquidity, swap, withdraw liquidity, and redeem the recovered DR while the holder can redeem retained PT separately. Label the quote mint as worthless test currency, never canonical USDC. Seed at a disclosed demo price; equal PT/DR issuance does not justify a 1:1 market price. Keep LP ownership distinct from vault claims; the vault does not redeem an LP position directly. Raydium's locked LP share and fee inventory can retain claims after the provider exits, so the acceptance condition is correct redemption of recovered wallet claims and preserved backing for all remaining claims, not an empty global series. Do not sweep that backing. Prefer one complete venue over shallow Raydium/Meteora buttons. No invented pool, liquidity, live quote or staking yield. A local-validator venue deployment is a labeled fallback if public test-network infrastructure is unavailable; mainnet funds/deployment are not authorized by the UI review.

Show multi-issuer observation and qualified execution clearly. Keep observation-only issuers visible with their concrete missing dependency. Do not market an event as verified when only its multiplier is known. A local-validator fallback is acceptable if labeled; a UI simulation is still a prototype.

Produce the short demo sequence, screenshots, reproducible README and source/fixture manifest. Update slide 8 only to functionality actually completed. Check links and obtain current submission requirements. External publication/submission uses authorization at execution time.

## Source-access work alongside production

Use `planning/issuer-data-requests.md` to identify missing issuer data. Drafts are available for the user to send; do not send messages. Prioritize official civil ex-date joins, complete eligible-period ledgers, revisions and finality/completeness rules for each selected source. A single event can unlock a factor regression, but only complete period evidence can support annual finalization.
