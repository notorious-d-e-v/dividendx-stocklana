# DividendX phase work orders

Updated 16 September 2026. Workspace `/Users/node/workspace/dividendx-stocklana`. The visual system and illustrated pitch are approved. Scope is the selected asset package across xStocks, Backpack/Trek and Ondo. Permissioned holder/approved-vault products, onboarding and catalog UI are excluded. The frontend rehearsal is implemented for review; the vault and wallet integration remain future work. This supersedes the archived broader and xStocks-only work orders.

## Delegation contract

Astra owns product decisions, architecture, evidence review and final acceptance. Use the `astra-sol-delegation` skill for bounded production work in GPT-5.6 Sol, fresh context, explicit effort, disjoint file ownership, no recursive delegation. Preserve existing work. Return paths, checks, limitations and new evidence. Do not start the next phase automatically.

Read `planning/plan.md`, `solana-issuer-synthesis.md`, `adapter-decision.md`, `decision-log.md`, the relevant `planning/research/` reports, `real-event-refresh.md` and the latest pitch specification before production. Dated research is evidence, not an instruction to retain obsolete scope. Contradictions go to Astra before a claim or integration is enabled.

Use one shared ScaledReinvestmentV1 engine, separate source readers and per-mint capability checks. Only PT/DR circulate; internal shares are accounting units. Claims from different issuers remain separate, including different issuers of the same ticker. Dividends settle in underlying stock tokens and are not fixed USDC. No unsupported event inference, invented live quote, users, liquidity, partnership or deployed capability.

Read-only sources and local production/test work are allowed. On 16 September 2026 the user explicitly authorized creating and pushing a public GitHub repository for this project backup. That authorization supersedes the earlier local-only publication limit for repository backup; it does not authorize real-asset trades, mainnet deployment, external outreach or hackathon submission. API keys stay in the user's credential environment and server-side readers, never fixtures, frontend bundles, screenshots or logs.

## Phase 1: approved visual system

Complete. Preserve `design/**` and `packages/design-tokens/**` as the source of visual decisions: warm white/ink, blue stock exposure, amber dividend rights, original mark, approved heading spacing, states and source-backed KOx calculator. The user also approved the illustration direction and both-sides composability artwork. Read `design/illustrations/illustration-guide.md` and `agent-brief.md` when applying that artwork to the frontend. General composability illustrations show both PT and DR; locked backing stays in the vault. Future frontend work generalizes the asset/issuer selector and copy; it does not require a redesign.

## Phase 2: pitch revision

Complete and approved. Preserve the current illustrated v2 deck and user-edited narration. The work order below records the delivered scope.

Sol **medium**. Own only `presentation/**`. Input: Astra's `spec/pitch-storyboard.md` and `spec/pitch-revision-2026-09-16.md`, current nine-slide deck, approved tokens and latest evidence.

Preserve the design and useful existing narrative. Establish DividendX as a permissionless dividend protocol for selected Solana stock tokens. Put xStocks, Backpack and Ondo in initial integration scope and name recognizable candidate stocks. Keep other chains later. Do not claim all tokens or completed integrations. Product descriptions may use direct present tense; prototype/build status stays visible. Explain once in notes that issuer controls remain, and that permissioned custody products are excluded. Keep Coca-Cola as the sourced example.

Use the presentations skill, editable native text/evidence diagrams, required operation marker and finalizer. Produce a new versioned nine-slide PPTX, individual previews, contact sheet, narration, notes/source ledger and submission draft. Archive prior presentation sources and deliverables without breaking old links. Inspect all final slides. Do not change the approved design prototype or add fictional receipts.

## Phase 3: contract and frontend rehearsal

Implemented and independently reviewed by Astra. Specifications: `spec/series-accounting.md`, `spec/sdk-interface.md` and `spec/frontend-rehearsal.md`. Product preview: http://127.0.0.1:4174/; preserved technical rehearsal: http://127.0.0.1:4174/rehearsal/. Deliverables: `apps/web/**`, `packages/demo-fixtures/**`, `packages/sdk/**` and root scaffolding. The 15-token catalog has two sourced local event flows; Ondo remains pending verified event data. Build/type checks, fixture verification, 11 SDK tests and 15 combined browser tests passed after the product revision. Astra also completed independent SDK and Chrome checks of recombination, sold-backing protection and tiny positive redemptions. See `apps/web/qa/README.md`.

Sol **high** for SDK/UI and **medium** for fixture compilation. The following scope is delivered with in-memory demo accounts and receipts. Preserve the replaceable SDK boundary when connecting the program; shared configuration changes must be sequential with program work.

Implement Market, Split, Position/Redeem using the approved design. Market groups the selected companies and distinguishes issuer/mint. Cover xStocks, Backpack and Ondo with source-backed snapshots or live readers. Show a clear reason for pending dividend data or a temporarily paused/unavailable selected token. Exclude permissioned, retired and no-dividend families from the catalog. Do not build onboarding/KYC, issuer-approval prompts or adapter stubs for excluded families. Keep technical profiles in the inspector.

Separate capabilities: recognized token, observed mint, dividend data available, permitted custody, tested execution, live series enabled. A badge must reflect the actual capability. Never turn discovery into automatic deposit eligibility. The initial event execution reference is the real KOx fixture. Backpack MU has a second source-backed fixture labeled `onchain_reconstruction`; use its exact DividendDistribute M0/M1 and covered authority-history bracket. Ondo requires a verified issuer event record before enabling a dividend fixture. Test-only scenarios are labeled as tests.

Provide the shared allocation calculator before wallet connection. Keep historical balance scenarios distinct from actual entitlements. Preserve event/source clocks, stale/error/loading states and the optional accounting inspector. Introduce company names before tickers. Use dollar context only with a stated valuation basis; DR sale quotes are separate.

Rehearse deposit, paired issuance, sale to a second wallet using demo funds, event processing and independent redemption. A transfer is not a sale. Use exact integer arithmetic and a replaceable SDK boundary. Verify desktop/mobile, keyboard flow, wallet rejection, stale data, unsupported profiles and the full transaction sequence. Deliver build/type checks and screenshots with current execution boundaries.

### Product revision following user review

The user approves the existing rehearsal as a fallback but wants product actions, not an event-processing workflow. Sol **high** implements `spec/product-app-v1.md`: preserve the rehearsal at `/rehearsal/`, make `/` a simpler Market / Split / Redeem app, visually distinguish company headings from issued token options, use `Your test balance`, show actual paired token quantities, expose paired recombination and independent redemption, and move simulated event/account controls into a collapsed footer. Keep source details available without making them the primary journey. Preserve evidence, SDK accounting, artwork and presentation. This frontend revision does not complete the onchain or AMM target.

Delivered, independently reviewed and approved by the user. Original rehearsal source/styles are unchanged; both entry points build. The main app now shows stock returned and current underlying balance, while exact Max uses owned paired quantities. The next implementation phase remains the actual vault and tokens; see `planning/status.md`.

## Phase 4: vault, SDK and issuer readers

Sol **xhigh** as requested by the user. Start after Astra completes program-specific event trust/finality, token policy, rounding/dust and recovery decisions. Build on the existing accounting specification and SDK interface; do not replace the verified local rehearsal. In particular, resolve tiny fragmented claims and conformance with Token-2022 multiplier encoding before claiming production recovery or exact chain parity. Own `programs/dividendx/**`, `packages/sdk/**`, `packages/issuer-readers/**`, `tests/protocol/**`, `scripts/protocol/**` and specifically assigned Anchor configuration.

Implement one program with isolated issuer/mint/event series, PDA custody, actual transferable PT and DR mints, cutoff, one-time settlement, paired recombination, burns, independent redemption and documented recovery. Select the claim token standard explicitly for wallet/AMM compatibility; collateral's Token-2022 extensions need not be copied onto claims. Series state pins identity, accounting-rules version, extension/authority policy, cohort baseline and allowed event signer. Freeze/mint authorities, direct holder burns and abandoned claim backing require explicit policies. No arbitrary adapter program dispatch, third wrapper, cross-chain bridge or pooled issuer substitution.

Implement a common ScaledReinvestmentV1 engine and typed readers for xStocks, Backpack and Ondo. Readers retain provenance and evidence completeness. An unavailable authenticated source returns an explicit unavailable state; it does not fabricate a successful normalized event. Validate current/pending factors by chain clock. New deposits stop at cutoff or any unexpected factor change. Only qualified isolated cash dividends settle. Do not derive yield from price, unexplained multiplier change, or a donation to the vault.

Conformance tests must cover representative real issuer profiles (xStocks 8 decimals, Backpack 6, Ondo 9), supported and unsupported extensions, pause/freeze/active-hook/fee handling, exact mint and signer checks, cross-series isolation, wrong event/revision/time, replay protection, cutoff boundaries, zero dividend, reverse split, non-unit baseline, integer conservation, fractional claims, redemption order and dust. Use the actual KOx historical case, Backpack MU onchain reconstruction and HONx reverse-split control. Distinguish Backpack supply-maintenance multiplier updates from DividendDistribute, including a rejection test for using today’s multiplier as the event factor. Synthetic adversarial/edge scenarios are internal tests, not issuer history. Reject permissioned/fee-bearing/no-dividend profiles; do not implement their integrations.

Program tests with representative mock mints establish technical behavior. Real issuer-event replays require a sourced event for that issuer; a live series further needs ordinary permissionless vault custody and future-event policies. Record those levels separately. Do not claim successful native issuer integration from a common interface alone. Rejection tests for restricted/fee-bearing profiles do not authorize building their integrations.

Deliver reproducible program tests, SDK checks, fixture provenance and source-access gaps. Astra reviews accounting and test evidence before integration. Never hide failed issuer support by silently restoring an xStocks-only design.

## Phase 5: integration and final demo

Sol **high**. Own integration paths assigned by Astra after prior workers finish. Connect the product frontend to the real SDK/program and wallet, replace simulated transaction state with actual test-network/local-validator receipts, and verify claim issuance, wallet-to-wallet transfers, paired recombination and both wallets independently redeeming the conserved pools. Source readers/attestation run in the background; users see meaningful pending/ready states rather than operating a replay pipeline. Retain the local rehearsal separately.

The user requests one actual external AMM integration in the hackathon. The bounded target is Raydium CPMM on devnet with ordinary SPL claim mints, subject to live program/config checks. See `planning/research/claim-amm-feasibility.md`. Demonstrate a DR / private test-USD quote-token pool: create/seed, add liquidity, swap, withdraw liquidity, and redeem the recovered DR while the holder can redeem retained PT separately. Label the quote mint as worthless test currency, never canonical USDC. Seed at a disclosed demo price; equal PT/DR issuance does not justify a 1:1 market price. Keep LP ownership distinct from vault claims; the vault does not redeem an LP position directly. Raydium's locked LP share and fee inventory can retain claims after the provider exits, so the acceptance condition is correct redemption of recovered wallet claims and preserved backing for all remaining claims, not an empty global series. Do not sweep that backing. Prefer one complete venue over shallow Raydium/Meteora buttons. No invented pool, liquidity, live quote or staking yield. A local-validator venue deployment is a labeled fallback if public test-network infrastructure is unavailable; mainnet funds/deployment are not authorized by the UI review.

Show multi-issuer observation and qualified execution clearly. Keep observation-only issuers visible with their concrete missing dependency. Do not market an event as verified when only its multiplier is known. A local-validator fallback is acceptable if labeled; a UI simulation is still a prototype.

Produce the short demo sequence, screenshots, reproducible README and source/fixture manifest. Update slide 8 only to functionality actually completed. Check links and obtain current submission requirements. External publication/submission uses authorization at execution time.

## Source-access work alongside production

Use `planning/issuer-data-requests.md` to identify missing issuer data. Drafts are available for the user to send; do not send messages. Prioritize an authenticated Ondo event/history sample and a Backpack token corporate-action ledger. A source-backed sample can unlock a historical replay; future live operation also needs timing, revisions/corrections and operational access.
