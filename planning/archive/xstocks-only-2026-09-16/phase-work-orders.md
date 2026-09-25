# DivX phase work orders

Workspace: `/Users/node/workspace/dividendx-stocklana`. Phase one is complete and user-approved: see `design/design-system.md`, `design/index.html` and `design/qa.md`. Phase two is revised after user feedback and ready for review: see `presentation/output/DivX-phase-two-v3.pptx`, `presentation/narration.md` and `presentation/source-ledger.md`. Astra's review is recorded in `planning/pitch-review.md`. Phases three onward remain production briefs, not completed work.

**How to run a phase**

Keep the coordinator on Astra. Use the `astra-sol-delegation` skill to send the selected bounded work order to `gpt-5.6-sol` in fresh context. Astra settles unresolved product, visual and accounting decisions before dispatch and reviews the result. A separate Astra session can use this prompt:

> Execute phase [NAME] from `/Users/node/workspace/dividendx-stocklana/planning/phase-work-orders.md`. Read the plan and evidence files first. Use the astra-sol-delegation skill. Keep high-level decisions and final review in Astra; delegate production to GPT-5.6 Sol at the specified effort. Complete this phase and its verification, then return artifacts and a concise handoff. Do not start later phases automatically.

Each Sol work order consists of the common contract below and the selected phase. Sol works directly without further delegation. Dependencies must exist before dispatch; do not substitute invented prior approvals or assets.

**Common contract for every Sol worker**

Read `/Users/node/workspace/dividendx-stocklana/planning/plan.md`, `mechanics-audit.md` and `market-evidence.md` in that same planning directory. Follow repository instructions if a repository has since been established. Preserve existing edits. Work only in the paths assigned for this phase. Return paths, validation evidence, limitations and remaining decisions. Be concise.

Also read `adapter-decision.md`, `decision-log.md` and the latest real-event verification in the planning directory. Use the actual KOx dividend event, with pinned provenance, throughout the demo. Implement a simple xStocks vault with a data reader, internal vault shares and separate PT/DR allocation functions. "Adapter" means ordinary code separation only: no generic issuer framework, extra program/account, runtime issuer selection or circulating wrapper token. Backpack and other issuers stay outside the MVP. At handoff, report material contradictory evidence to Astra so the plan, decision log and affected artifacts are updated before the next phase. Verified observations supersede an obsolete assumption in a work order.

DivX is a proposed Solana vault that separates an xStock into stock exposure (PT) and one event's dividend rights (DR). The initial demo uses KOx metadata read from mainnet plus a historical event replay on a mock Token-2022 mint. Custody and transfers use integer raw base units. The dividend right receives net reinvested xStock accretion, not guaranteed USDC. PT is not dollar principal protection. A pure split must never create DR yield. Competition already exists; make no “first/only” claim. Distinguish live data, historical fixtures and simulated quotes. No invented users, APY, liquidity, partnerships or deployed functionality.

Do not connect funded wallets, trade real assets, publish externally or submit the hackathon entry under these work orders. Those actions are outside this planning phase. Read-only public sources and local production work are in scope. Deployment/submission decisions will use the user's authorization at execution time.

**Phase 1: Design system**

Sol effort: **high**. Start after Astra confirms a visual direction and vocabulary. Write only `design/**` and `packages/design-tokens/**`.

Produce a compact system for a credible financial product. Proposed direction: warm white, ink text, blue stock exposure, amber dividend rights, tabular numbers and a recurring one-asset/two-claims visual. Define semantic colors, type, spacing, focus states and data formatting. Show a realistic split screen and one presentation specimen, then document the reusable patterns. Use original branding rather than copying Pendle or an issuer's interface.

Cover amount input, series information, PT/DR breakdown, quote, transaction states, position/redemption and event timeline. Raw/multiplier internals belong in an optional inspector. Use labels as well as color. Include wallet-disconnected, loading, stale-data, empty, error and completed states. Keep underlying displayed share equivalents distinct from raw deposit receipt units.

Include a useful KOx asset detail with actual action history, source links/times and a principal/dividend calculator. Distinguish an entered-balance scenario from verified historical wallet holdings. Use the real event name/date, not an invented dividend. The design should show how the product serves a visitor before a transaction.

Deliver `design/design-system.md`, shared token files, a viewable style board and representative screenshots. At ordinary desktop and mobile widths, verify contrast, wrapping, focus visibility and readable amounts. Astra reviews economics and visual consistency before expanding to the deck or full frontend.

**Phase 2: Presentation production**

Sol effort: **medium**, increasing to high only for a material rendering issue. Start with Astra's frozen nine-slide storyboard and phase-one design system. Write only `presentation/**`.

Use the available presentations skill and its required implementation/rendering workflow. Locate bundled workspace dependencies. Produce an editable nine-slide PPTX, rendered previews, speaker notes with sources, a short narration script and submission-description draft. Render and inspect every slide. Use evidence diagrams/charts that remain editable where appropriate; follow the presentation skill's rules for visual assets.

Story: product, holder/buyer, vault, established precedent, available market, Solana benefits, corporate-action accounting, demonstration, roadmap. One main idea per slide. Use dated statistics from the evidence file and distinguish annual cash flow, TVL and contract volume. Do not state that Pendle cannot support equities or that onchain custody removes issuer control. Show our customer as a hypothesis unless interviews have occurred.

Initially mark the future demo slot as a prototype illustration. Replace it with real screenshots/receipts during final integration. Do not create a fabricated transaction screenshot. Deliver the deck, previews, script and source ledger. Astra reviews factual claims and the opening minute.

Anchor the demonstration in the verified real xStocks event and show what the issuer actually changed. Label the actual program execution as a replay on test assets. A real split control, when verified, is a separate ticker/event. Hypothetical cases stay in internal tests. Present a simple xStocks vault; a generic adapter framework, other issuers and a transferable wrapper are future work, not implemented integrations.

**Phase 3: Frontend and rehearsal**

Sol effort: **high**. Start after the visual system, story and an Astra-defined SDK interface freeze. Write `apps/web/**` and `packages/demo-fixtures/**`; own necessary initial root scaffolding only during this phase. Leave program and SDK implementation to the next worker.

Implement Market, Split, and Position/Redeem views. Use one series and a sourced historical-event fixture implementing the agreed interface. Ship the live KOx asset/action detail and allocation calculator as usable features. Show two demo roles, a sale with demo USDC, an event timeline and independent redemptions. Keep the read-only observer distinct from mock execution, with network/data-mode indicators, timestamps and the optional accounting inspector. Separate historical event time from compressed replay time, and never infer a wallet's past holdings from its current balance.

Carry the reviewed pitch's clarity into the frontend: introduce Coca-Cola before KO/KOx; pair token quantities with dollar context when a price basis is available. The historical reference in `planning/pitch-dollar-example.md` is derived from that event, not a live quote or a DR sale price. Keep those price types distinct. Make partial claim ownership understandable and expose vault collateral, claims outstanding and redemption records once the real program provides them; auditability does not mean an audit certification.

Do not invent live prices or swap routes. A fixture quote must say demo. Keep integer amounts out of JavaScript floating-point balance calculations. Make transaction states resilient to wallet rejection, stale data and loading failures. Simulated behavior should be replaceable by the real SDK without redesigning the UI.

Verify the complete rehearsal in a browser at desktop and mobile widths. Capture screenshots and record known fixture boundaries. Run the build/type checks appropriate to the selected stack. Deliver a working local frontend, fixture manifest, adapter interface and integration handoff. Astra reviews the sequence before the backend build.

**Phase 4: Vault and SDK implementation**

Sol effort: **xhigh**. Start after Astra freezes `spec/series-accounting.md`, token normalization, supported event types, rounding and SDK interface. Write `programs/dividendx/**`, `packages/sdk/**`, `tests/protocol/**`, `scripts/protocol/**` and necessary Anchor configuration. Root/shared-config edits must be sequential with other workers.

Implement one underlying and one historical-event series with a PDA vault, paired claim issuance, deposit cutoff, trusted event attestation, one-time settlement and independent burn/redemption. Use the agreed token decimals and normalize claim supply to raw deposits. Disallow new deposits if the active multiplier differs from the cohort snapshot or the cutoff has passed. Implement the documented safe recovery/recombination behavior; do not allow the depositor to withdraw collateral after selling DR.

Use the verified KOx event as a fixture on a mock underlying. Implement xStocks token checks and PT/DR allocation as ordinary functions, with issuer API parsing in the offchain reader. Do not build a generic adapter interface, registry or extra deployed layer. Pin the accounting-rules version and exact underlying identity; keep each series' collateral separate. Share normalization and allocation code across observation, preview and execution. Check event identity/version, underlying mint, scheduled effective time and active multiplier. Store fixed raw settlement allocations. Use checked integer arithmetic and deterministic dust handling. Match issuer decimal strings to onchain multiplier representation using the frozen precision rule. Do not settle unknown, mixed or revised events silently. Keep issuer authority risks documented. Treat the trusted event attestation as a trust boundary rather than claiming the multiplier proves classification.

Test ordinary and zero dividends, non-unit M0, tiny/fractional deposits, overflow bounds, timestamp boundaries, late deposits, duplicate processing, wrong authorities/mints, stale versions, unsupported events, redemption ordering and exact conservation. For pure split/reverse split controls, show rejection as a dividend and zero allocated yield, consistent with the frozen spec. Demonstrate deposit, PT/DR separation and both redemptions on a local validator before devnet deployment is considered.

Return build/test output, program/SDK artifacts, seed/reset instructions and remaining limitations. Astra reviews state transitions and financial invariants, rather than accepting tests alone as proof.

**Phase 5: Demo integration and recording**

Sol effort: **high**. Start once the SDK and program pass review. Own `apps/web/**`, `demo/**`, fixture adapters and submission materials during this phase. Program changes require review and renewed relevant tests.

Connect the frontend to the real program. Use two test wallets and mock assets. A seeded fixed-price counterparty is sufficient if the sale moves both DR and demo payment tokens in the expected transaction flow. If only transferability is implemented, call it a transfer and update the narration. Do not imply that a production AMM exists.

Record approximately three minutes: user need; genuine KOx event and usable calculator; explicit switch to historical execution; deposit and paired mint; DR sale; dividend processing; independent redemptions; independently sourced split control if available; future direction. Verify economic parameters against the pinned issuer record. Make every displayed receipt resolve to the claimed network or include reproducible local logs. Reset and replay from a clean state twice without manual balance edits. Confirm stored raw allocations do not change after an additional mock multiplier update. Identify exactly what is live, historical and controlled in the demo; never claim the vault captured the original historical dividend.

Produce the video, a reliable live/replay frontend, final screenshots and updated presentation. If a validator or RPC blocks hosted execution, preserve a recorded local run and label the hosted fallback honestly. Astra reviews the recording as a judge would, without assuming the prior conversation.

**Phase 6: Submission packaging**

Sol effort: **medium** for packaging. Astra owns final factual review and any external action. Write `submission/**` and relevant README sections.

Prepare concise problem/solution text, demo and repository links, stack, open-source acknowledgments, architecture summary, reproducibility instructions, team placeholders and limitations. Inspect the actual submission fields after sign-in is available; do not assume a deck/video duration requirement. Verify every link in a fresh browser context, check the current deadline and prepare a checklist against the visible form.

Deliver a complete, reviewable package. Submission or messages to organizers happen only under explicit user authorization. Record completion evidence if submission is subsequently authorized and performed.
