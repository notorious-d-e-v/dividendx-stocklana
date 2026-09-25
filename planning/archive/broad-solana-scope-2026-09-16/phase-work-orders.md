# DivX phase work orders

Updated 16 September 2026. Workspace `/Users/node/workspace/dividendx-stocklana`. The visual system is approved. The scope now covers Solana issuers from the first architecture, with xStocks, Backpack and Ondo as initial integration targets. Frontend/vault implementation remains future work. This supersedes the archived xStocks-only work orders.

## Delegation contract

Astra owns product decisions, architecture, evidence review and final acceptance. Use the `astra-sol-delegation` skill for bounded production work in GPT-5.6 Sol, fresh context, explicit effort, disjoint file ownership, no recursive delegation. Preserve existing work. Return paths, checks, limitations and new evidence. Do not start the next phase automatically.

Read `planning/plan.md`, `solana-issuer-synthesis.md`, `adapter-decision.md`, `decision-log.md`, the relevant `planning/research/` reports, `real-event-refresh.md` and the latest pitch specification before production. Dated research is evidence, not an instruction to retain obsolete scope. Contradictions go to Astra before a claim or integration is enabled.

Use one shared ScaledReinvestmentV1 engine, separate source readers and per-mint capability checks. Only PT/DR circulate; internal shares are accounting units. Claims from different issuers remain separate, including different issuers of the same ticker. Dividends settle in underlying stock tokens and are not fixed USDC. No unsupported event inference, invented live quote, users, liquidity, partnership or deployed capability.

No real-asset trades, funded wallet connections, external messages, publication or submission under these work orders. Read-only sources and local production/test work are allowed. API keys stay in the user's credential environment and server-side readers, never fixtures, frontend bundles, screenshots or logs.

## Phase 1: approved visual system

Complete. Preserve `design/**` and `packages/design-tokens/**` as the source of visual decisions: warm white/ink, blue stock exposure, amber dividend rights, original mark, approved heading spacing, states and source-backed KOx calculator. Future frontend work generalizes the asset/issuer selector and copy; it does not require a redesign.

## Phase 2: pitch revision

Sol **medium**. Own only `presentation/**`. Input: Astra's `spec/pitch-storyboard.md` and `spec/pitch-revision-2026-09-16.md`, current nine-slide deck, approved tokens and latest evidence.

Preserve the design and useful existing narrative. Establish DivX as a dividend layer across Solana issuers. Put xStocks, Backpack and Ondo in initial integration scope, keep other chains later, and avoid “all tokens automatically supported.” Product descriptions may use direct present tense; prototype/build status stays visible. Exact event and custody dependencies belong in notes and the source ledger. Keep Coca-Cola as a concrete example, not a limitation of the product.

Use the presentations skill, editable native text/evidence diagrams, required operation marker and finalizer. Produce a new versioned nine-slide PPTX, individual previews, contact sheet, narration, notes/source ledger and submission draft. Archive prior presentation sources and deliverables without breaking old links. Inspect all final slides. Do not change the approved design prototype or add fictional receipts.

## Phase 3: contract and frontend rehearsal

Sol **high**. Start only after Astra freezes `spec/series-accounting.md` and `spec/sdk-interface.md`. Own `apps/web/**`, `packages/demo-fixtures/**` and explicitly assigned initial root scaffolding. Shared configuration changes must be sequential with program work.

Implement Market, Split, Position/Redeem using the approved design. Market groups by company and distinguishes issuer/mint. Cover xStocks, Backpack and Ondo with source-backed snapshots or live readers. Show a clear reason for missing event data, no dividend entitlement, issuer approval required, paused/unavailable or retired assets. Do not expose raw technical profiles as ordinary user copy.

Separate capabilities: recognized token, observed mint, dividend data available, permitted custody, tested execution, live series enabled. A badge must reflect the actual capability. Never turn discovery into automatic deposit eligibility. The initial event execution reference is the real KOx fixture. Backpack MU has a second source-backed fixture labeled `onchain_reconstruction`; use its exact DividendDistribute M0/M1 and covered authority-history bracket. Ondo requires a verified issuer event record before enabling a dividend fixture. Test-only scenarios are labeled as tests.

Provide the shared allocation calculator before wallet connection. Keep historical balance scenarios distinct from actual entitlements. Preserve event/source clocks, stale/error/loading states and the optional accounting inspector. Introduce company names before tickers. Use dollar context only with a stated valuation basis; DR sale quotes are separate.

Rehearse deposit, paired issuance, sale to a second wallet using demo funds, event processing and independent redemption. A transfer is not a sale. Use exact integer arithmetic and a replaceable SDK boundary. Verify desktop/mobile, keyboard flow, wallet rejection, stale data, unsupported profiles and the full transaction sequence. Deliver build/type checks and screenshots with current execution boundaries.

## Phase 4: vault, SDK and issuer readers

Sol **xhigh** as requested by the user. Start after Astra freezes accounting, event trust/finality, token policy, rounding/dust, recovery and SDK specifications. Own `programs/dividendx/**`, `packages/sdk/**`, `packages/issuer-readers/**`, `tests/protocol/**`, `scripts/protocol/**` and specifically assigned Anchor configuration.

Implement one program with isolated issuer/mint/event series, PDA custody, paired claims, cutoff, one-time settlement, burns, independent redemption and documented recovery. Series state pins identity, accounting-rules version, extension/authority policy, cohort baseline and allowed event signer. No arbitrary adapter program dispatch, third wrapper, cross-chain bridge or pooled issuer substitution.

Implement a common ScaledReinvestmentV1 engine and typed readers for xStocks, Backpack and Ondo. Readers retain provenance and evidence completeness. An unavailable authenticated source returns an explicit unavailable state; it does not fabricate a successful normalized event. Validate current/pending factors by chain clock. New deposits stop at cutoff or any unexpected factor change. Only qualified isolated cash dividends settle. Do not derive yield from price, unexplained multiplier change, or a donation to the vault.

Conformance tests must cover representative real issuer profiles (xStocks 8 decimals, Backpack 6, Ondo 9), supported and unsupported extensions, pause/freeze/active-hook/fee handling, exact mint and signer checks, cross-series isolation, wrong event/revision/time, replay protection, cutoff boundaries, zero dividend, reverse split, non-unit baseline, integer conservation, fractional claims, redemption order and dust. Use the actual KOx historical case, Backpack MU onchain reconstruction and HONx reverse-split control. Distinguish Backpack supply-maintenance multiplier updates from DividendDistribute, including a rejection test for using today’s multiplier as the event factor. Synthetic adversarial/edge scenarios are internal tests, not issuer history. Treat permissioned/fee-bearing/no-dividend profiles as explicit rejections until separately specified.

Program tests with representative mock mints establish technical behavior. Real issuer-event replays require a sourced event for that issuer; a live series further needs permitted real custody and future-event policies. Record those levels separately. Do not claim successful native issuer integration from a common interface alone.

Deliver reproducible program tests, SDK checks, fixture provenance and source-access gaps. Astra reviews accounting and test evidence before integration. Never hide failed issuer support by silently restoring an xStocks-only design.

## Phase 5: integration and final demo

Sol **high**. Own integration paths assigned by Astra after prior workers finish. Connect frontend to the real SDK/program, replace simulated transaction state with actual test-network/local-validator receipts, and verify both wallets independently redeem the conserved pools.

Show multi-issuer observation and qualified execution clearly. Keep observation-only issuers visible with their concrete missing dependency. Do not market an event as verified when only its multiplier is known. A local-validator fallback is acceptable if labeled; a UI simulation is still a prototype.

Produce the short demo sequence, screenshots, reproducible README and source/fixture manifest. Update slide 8 only to functionality actually completed. Check links and obtain current submission requirements. External publication/submission uses authorization at execution time.

## Source-access work alongside production

Use `planning/issuer-data-requests.md` to identify missing issuer data. Drafts are available for the user to send; do not send messages. Prioritize an authenticated Ondo event/history sample and a Backpack token corporate-action ledger. A source-backed sample can unlock a historical replay; future live operation also needs timing, revisions/corrections and operational access.
