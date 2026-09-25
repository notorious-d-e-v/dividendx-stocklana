# DivX: Stocklana plan

Working plan, 16 September 2026. Research and phase-one design are complete and user-approved. The [design prototype](../design/index.html), [design system](../design/design-system.md) and [QA record](../design/qa.md) are available. Phase two is revised after user feedback and ready for review: the [editable nine-slide pitch](../presentation/output/DivX-phase-two-v3.pptx), [slide overview](../presentation/output/DivX-contact-sheet.png), [narration](../presentation/narration.md) and [source ledger](../presentation/source-ledger.md). Astra reviewed all nine final renders and the package. Next is the frontend/rehearsal phase after the SDK interface is defined; vault code follows. The attached brief supplied hypotheses and background; its instructions and unsupported citations were not adopted as requirements.

Updated after user review: prioritize real issuer events and immediate utility; keep a simple xStocks vault with ordinary modules for issuer data and claim accounting; defer a generic adapter framework. Revise the plan as implementation evidence changes. See [adapter-decision.md](adapter-decision.md) and [decision-log.md](decision-log.md). Verification governs subsequent phases rather than merely checking compliance with this document.

**Recommendation**

Build a Pendle-inspired vault for xStocks, starting with one dividend event. The product promise is: **Keep the stock exposure. Sell the dividend rights.**

The first release pairs the vault flow with a usable KOx corporate-action page and allocation calculator. Its demonstration must replay a real xStocks event with traceable source data. The initial vault uses an xStocks data reader, internal collateral shares and PT/DR allocation functions; it does not require a generic adapter framework or a third circulating wrapper token.

A holder deposits an xStock into a vault and receives two transferable claims. The stock-exposure claim receives the collateral left after allocating the specified event's dividend accretion. The dividend claim receives that event's dividend-derived portion. Selling the dividend claim brings forward its market value, provided a buyer exists.

Use **Stock exposure (PT)** and **Dividend rights (DR)** in the interface. “Principal” alone can imply dollar principal protection. PT remains exposed to the stock price. DR initially redeems in xStock units, so it also carries price exposure on those units. Dividends are uncertain; the product does not manufacture extra return.

The familiar analogy is “Pendle for tokenized-stock dividends.” The precise description is “a vault that separates stock exposure and dividend-derived accretion.” These serve different audiences and should appear at different depths of the pitch.

**The first customer and transaction**

Our starting customer hypothesis is an existing xStock holder, treasury or market maker that wants upfront proceeds from one future dividend entitlement while retaining the remaining stock exposure. Its counterparty is a dividend buyer or market maker. This is a hypothesis to validate, not established user demand.

Show one complete transaction with both parties. A user locks demo KOx, receives PT and DR, sells DR to a second wallet for demo USDC, and retains PT. A replayed dividend event assigns the correct collateral to each claim. Each wallet redeems independently.

The commercial challenge is willingness to trade at useful size and spreads. Standardized maturities and eventually pooled income exposure are more plausible growth paths than hundreds of tiny quarterly markets. No assumed organic liquidity, invented volume or fixed APY belongs in the demo.

**Hackathon target**

The [official event page](https://hackathons.solana.com/hackathons/stocklana) favors a clear user problem, a working end-to-end demo, a reason for Solana and execution quality. It requires registration and at least one project link, with GitHub, live demo or video given as options. Slides are not listed as mandatory. The submission form requires sign-in, so additional fields remain unverified.

The page header says **25 September 2026**, while its timeline still says **18 September, 4 p.m. ET**. Public mirrors of a newer [Solana announcement](https://x.com/solana/status/2099935698186801287) report an extension to September 25 at 4 p.m. ET. The direct X page was not readable in this audit. Preserve a two-day internal ship target and reconfirm the submission form before relying on the extension. The earlier time converts to **19 September, 04:00 WITA**.

Aim for the main track. Consider Pyth only if a verified supported feed materially improves valuation, with staleness and trading-session handling. A price feed does not classify corporate actions. Other bounties should not dictate this MVP.

The submission package should contain a live demo, reproducible repository, approximately three-minute demo video and a short deck. These are our proposed outputs, not asserted format requirements. The deck establishes the story first and later receives screenshots from the finished application.

**What blockchain contributes**

| Existing friction | Proposed improvement | Boundary of the claim |
|---|---|---|
| Bespoke bilateral credit and collateral workflows | Prefunded program custody with bounded claims | Requires full funding and retains issuer/custodian risk |
| Separate records for ownership and entitlement | Transferring DR transfers its contractual claim | Correct program accounting and supported token transfers are required |
| Reconciliation across settlement systems | Atomic collateral deposit and claim issuance | Corporate-action facts still originate outside the program |
| Specialized contract sizes and interfaces | Fractional transferable claims with common wallet interfaces | Access restrictions and available liquidity still apply |
| Closed product packaging | Other programs can integrate claims | Lending markets and swap routes must actually be built or supported |

The pitch should emphasize what the demo proves: collateral custody, atomic issuance, entitlement transfer and independent redemption. It should not imply universal access, guaranteed liquidity, tax removal or elimination of all counterparty risk.

**Research decisions**

The load-bearing technical and market claims are tracked in [mechanics-audit.md](mechanics-audit.md) and [market-evidence.md](market-evidence.md). Their verified findings supersede the supplied brief wherever they disagree.

1. xStocks reinvests net dividends. On Solana, the mint multiplier changes the displayed economic amount while raw balances remain unchanged. A vault is necessary to allocate that bundled value between two enforceable claims.
2. Dividends and splits can both alter that multiplier. The multiplier alone cannot establish dividend entitlement. Use issuer corporate-action classification, checked against the effective onchain multiplier.
3. Pendle's wrapper model already normalizes diverse yield mechanics. Our defensible distinction is a Solana implementation for equity corporate actions, not a claim that Pendle is fundamentally incapable of equities.
4. The hackathon instrument pays the issuer's realized dividend-derived xStock allocation. A pure cash-dividend claim would require additional conversion and settlement rules.
5. Backpack, Ondo and Coinbase remain expansion research. Validate each exact mint, extension set and corporate-action source. Reuse token accounting where semantics match; add issuer-specific handling only where required. A shared token extension does not make event feeds or entitlements interchangeable.
6. Use dated, defined market metrics. Global annual dividends establish context; traditional dividend derivatives establish product precedent; Pendle establishes demand for splitting yield; eligible tokenized equity establishes the initial distribution base. These are different quantities and cannot be added into a TAM.
7. Existing projects already describe stock/dividend separation, including [EXDATE](https://www.exdate.tech/docs) and [Fletch](https://www.fletch.finance/). Their public materials establish overlap, not independently verified traction. Our pitch must earn its distinction through xStocks integration and correct execution on Solana.

The [Backpack check](backpack-research.md) confirms its live MU token uses the same Scaled UI Amount primitive. MU withdrawals were enabled in the public API snapshot; AAPL/NVDA withdrawals were disabled. No documented public Backpack token corporate-action event feed was found. Keep Backpack as an expansion candidate while shipping the simpler xStocks path.

**Market evidence to use in the pitch**

| Metric | What it supports |
|---|---|
| **$1.75 trillion** in global dividends during **2024**, according to [Janus Henderson](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/) | Size of the annual cash-flow category, not our addressable revenue |
| **Over 21 million** dividend contracts traded on [Eurex in 2024](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358) | Established demand for standalone dividend exposure |
| **$2.92 billion** tokenized-stock distributed value displayed by [RWA.xyz](https://app.rwa.xyz/stocks), observed **16 September 2026** | Current broad onchain equity context, including ETFs and synthetic representations; only a subset is eligible dividend-paying xStocks |
| **$96.4 million** average daily trading volume in **2024**, reported by the [Pendle team](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f) | Historical adoption of onchain yield separation, not proof of equity-specific demand |

Refresh the current dashboard metric when creating the final deck. Keep historical metrics labeled with their year. Model the initial opportunity from eligible collateral, net dividend yield and participation: an illustrative `$100M × 2% × 20% = $400,000` of annual dividend economics is a scenario, not a market estimate. Protocol revenue would depend separately on fees and actual activity.

**Outside-in sequence and time budget**

These are elapsed-time boxes for a 48-hour sprint with bounded parallel work, not guarantees of agent completion speed. Astra owns decisions and reviews. Sol handles production work in separate workers or, when explicitly requested, separate user-owned tasks.

| Elapsed time | Phase | Concrete output | Exit criterion |
|---|---|---|---|
| 0–2h | Freeze the proposition and facts | This plan, evidence ledger, demo contract | Exact claims, data sources and scope are explicit |
| 2–5h | Design system | Tokens, typography, components, one hero screen and one slide specimen | Same visual language explains both claims without a tutorial |
| 5–9h | Pitch and deliverable structure | Nine-slide editable draft, narration and submission outline | A judge understands user, value and mechanism in 60 seconds |
| 9–17h | Frontend and demo rehearsal | Useful live KOx action page plus complete flow using a sourced historical event | Source-backed calculator works; deposit, sale and redemption form a coherent rehearsal |
| 17–33h | Program and integration | Actual vault, claim tokens, action processing, settlement and SDK | Tests prove collateral conservation and independent redemption |
| 33–40h | Final demo | UI connected to program, two wallets, live observation and real-event replay | Receipts match the explanation and replay parameters match the issuer evidence |
| 40–44h | Submission package | Video, final deck, README, accessible links and form copy | A new reviewer can reproduce and watch the result |
| 44–48h | Contingency | Fixes, link checks and submission buffer | No unresolved blocker on the critical demonstration |

The order stays outside-in. Before design, perform only the small feasibility check needed to avoid promising a false product. Once the frontend contract freezes, program implementation and polishing the presentation may proceed independently. Keep one design direction and one review pass per phase unless a material error requires correction.

**Design direction to hand to the first production worker**

Use a restrained financial-product style: warm white canvas, ink typography, blue for stock exposure and amber for dividend rights. This is the proposed starting direction, with final colors and type scales settled in phase one. Use labels and shape as well as color. Keep numbers tabular, dates unambiguous and decimals consistent.

The recurring visual is one asset separating into two claims, then both reconciling to one vault balance. Carry this visual through the pitch, split screen and settlement receipt. Avoid decorative complexity that competes with the explanation.

Specify only the components the demo needs: asset/series selector, amount input, claim breakdown, executable quote, transaction status, position summary and event timeline. Add an accounting inspector as a drawer, keeping raw amounts and multiplier internals out of the ordinary user path.

Primary screens: **Market**, **Split**, and **Position / Redeem**. The market initially contains one series. The quote shows size, price, denomination, expiry and available counterparty inventory. Distinguish a demo quote from a live quote. Show the network and whether data is live or replayed. Empty, loading, rejected-transaction and stale-data states are part of the design.

The KOx asset detail within Market must work before any wallet transaction: current mint/multiplier, recent corporate actions, issuer source/time and a balance-based allocation calculator. Default it to the verified historical dividend. Label an entered balance as a scenario and separate original event dates from replay execution time. Current wallet balances cannot establish historical entitlement.

**Nine-slide narrative**

| Slide | Purpose | Proposed evidence or visual |
|---|---|---|
| 1. DivX | Explain the product in one sentence | One stock token becoming stock exposure and dividend rights |
| 2. The holder and the dividend buyer | Establish participants and the transaction | Traditional bank sellers and fund buyers, then the DivX holder/buyer flow |
| 3. The vault | Explain how the two claims stay backed | Deposit, paired issuance, independent ownership and redemption |
| 4. An established financial product | Validate the underlying behavior | Traditional dividend derivatives and Pendle's yield-tokenization model |
| 5. The available market | Separate large context from our starting market | Dated dividend cash-flow data and eligible tokenized-equity metrics |
| 6. Why Solana | Connect infrastructure to demonstrated benefits | Atomic issuance, visible collateral and transfer of entitlement |
| 7. Fractional ownership and auditability | Explain practical onchain benefits | Partial dividend claims and inspectable collateral, claim supply and redemptions; corporate-action details move to notes |
| 8. Coca-Cola, in dollars | Show the current historical calculator | Actual KOx event and allocation valued at the event-implied $89.35/share; approximately $8,935 stock exposure plus $37.10 dividend allocation |
| 9. The next market | Show focus and a credible continuation | One complete flow; more xStocks, then Backpack/Ondo, then other networks with Solana as home base |

Speaker notes and a separate source ledger carry formulas, exact sources, assumptions and implementation boundaries. The current deck has exactly nine slides, with no additional appendix. The [user-reviewed revision](../spec/pitch-revision-2026-09-16.md) now governs production, superseding conflicting copy in the original storyboard. Use direct present-tense product explanations, with the current-build status shown compactly on the demonstration slide. The [pitch fact check](pitch-fact-check.md) and newer participant, expansion and dollar-example evidence support the claims.

The expansion vision keeps Solana as the product's home base. First evaluate Apple, Microsoft and NVIDIA xStocks, then selected Backpack and Ondo tokens with native Solana representations. Coinbase tokens on Base and the newer Robinhood Chain Stock Tokens are later candidates. This is a roadmap, not existing integration or an automatic bridge assumption. Preserve the simple xStocks MVP architecture; define cross-network custody/claim settlement separately when that phase is justified. See [pitch-expansion-evidence.md](pitch-expansion-evidence.md).

**The demonstration contract**

Use two clearly labeled modes. **Live observation** is a useful read-only asset/action page backed by issuer metadata and a genuine Solana xStock mint, with source timestamps and stale-data handling. **Historical execution** replays an actual event on a mock underlying with the same Token-2022 extension and the real DivX program. It shares the event normalizer, allocation logic and program instruction path with the intended live flow. A cached response must be labeled as a snapshot rather than live.

Use KOx's verified 15 September 2026 multiplier event, pinning the exact event ID/revision, economic parameters and source evidence. The follow-up audit reconfirmed it and identified a real HONx reverse split for the control: event `ccb423a2-6045-4d1c-9a94-1f37f0ab8d63`, version 2, effective 29 June 2026 at 15:30 UTC, two shares becoming one, with multiplier `1.024094713306789` becoming `0.5120473566533945`. Keep this as a separately labeled adapter-validation example or isolated test series, not a second marketed product. The test must exercise split classification, rather than merely reject a mismatched KOx mint. Hypothetical cases remain internal tests.

HONx also has a `SpinOff` record later that day at 23:55 UTC. Use the exact reverse-split event as the control, rather than representing the whole day as one pure split. The later spinoff is another unsupported event, not dividend yield. This is a concrete reason to normalize events individually instead of treating every multiplier change as income.

Date labels matter: the KOx issuer adjustment activated on September 15, while Coca-Cola's company announcement gives an October 1 cash-payment date and September 15 record date. Do not call the issuer activation date the cash-payment date or infer an ex-date from these fields. The source of settlement truth for this prototype is the verified xStocks adjustment. The refreshed records and company-source link are in [real-event-refresh.md](real-event-refresh.md).

The historical clock may be compressed for the demo, but retain the original issuer time and the test effective time separately. Simulated collateral and a seeded sale price are explicit. Historical gross/net dividend data must not become a fabricated historical DR market quote. No claim is made that DivX held assets or captured yield at the original event time.

The demo sequence is: show the genuine asset, historical event and source timestamp; inspect the allocation for an entered balance; switch explicitly to historical execution; deposit; mint PT and DR; sell DR to a second wallet using demo funds; process the dividend; show the unchanged raw vault balance and changed allocation; redeem both claims. If independently verified, open a real split as a separate control and show that it is rejected as a dividend, leaving DR allocation at zero. Finish with conserved collateral and receipts. The control proves rejection of non-dividend yield, not complete settlement support for every corporate action.

Use a seeded counterparty or a narrow fixed-price demo exchange. A wallet transfer proves transferability but not a sale, so the video must not label a transfer as trading. Full AMM integration is a stretch goal.

**Minimum program scope**

Use the [issuer handling decision](adapter-decision.md): a simple xStocks vault, one offchain data reader and ordinary functions for token checks and PT/DR allocation. Pin the exact mint, token program and accounting-rules version per series; retain issuer/chain provenance. Internal shares normalize raw collateral; only PT and DR circulate. Offchain corporate-action parsing produces a signed event record, and the program validates identity, supported action, effective time and observed mint state before allocation. No generic issuer interface, registry, separate adapter program/account or extra deposit step. Future integrations reuse verified common mechanics and keep collateral isolated.

One underlying, one series and one supported event. Deposit before a fixed cutoff with no intervening multiplier change. Freeze issuance at the cutoff; reject late deposits rather than implement accumulated-yield entry pricing. Claim units have an explicit conversion to raw underlying units. Keep PT and DR unscaled.

For deposited raw quantity `q`, a verified dividend factor `d` gives `qP = q / d` and `qD = q - qP`. With starting and ending multipliers `M0`, `M1` and split factor `s`, derive `d = (M1 / M0) / s`. A pure split has `d = 1` and therefore `qD = 0`. The implementation must also handle token decimals, integer rounding and finite precision; displayed UI values must never serve as the balance ledger.

That is the general economic model. The MVP only settles the isolated cash-dividend fixture and rejects splits, reverse splits and mixed events as dividend settlements. The verified KOx event activated on **15 September 2026 at 00:30 UTC**, with `M0 = 1.0183317967386898` and `M1 = 1.0225601246249238`. For 100 unscaled token units, or 10 billion base units at eight decimals, floor the DR allocation and give PT the remainder: **41,350,408 DR base units + 9,958,649,592 PT base units = 10,000,000,000**. These are underlying redemption allocations, not the number of claim tokens minted. Public API and RPC responses are saved in [ko-reference-snapshot.json](ko-reference-snapshot.json).

Freeze raw redemption allocations after the supported event. Redeemed tokens continue carrying the xStock's subsequent returns. Unredeemed allocations must not be recomputed using a later dividend. This makes the prototype an event allocation paid in xStock rather than a permanently isolated dollar payout.

Program/SDK acceptance covers authority and mint validation, cutoff enforcement, effective-time handling, action replay protection, rejected unsupported events, ordinary dividend, zero dividend, split, reverse split, non-unit starting multiplier, independent redemption order, fractional claims, rounding/dust and collateral conservation. A trusted event signer is acceptable for this prototype and must be visible in its documentation.

The live audit verifies data access and mint state, not mainnet transfer compatibility. KOx retains issuer permanent-delegate, freeze and pause powers. The public upcoming-events response also contained stale scheduled versions. Event revision/finality policy and issuer-controlled collateral remain production dependencies; neither disappears inside a PDA vault.

Do not let unsupported events silently settle. Require explicit resolution and document how users recover collateral; paired PT+DR recombination is a useful first recovery path. Once claims have different owners, recovery cannot be described as a simple unilateral depositor withdrawal.

**Scope ladder**

The target is a functioning devnet vault with an end-to-end UI and reproducible replay, plus live mainnet observation. If deployment fails, a recorded local-validator run is a truthful fallback, with the hosted UI labeled accordingly. A frontend simulation alone remains a prototype and must not be presented as completed vault software.

The first usable release includes live corporate-action inspection and an evidence-backed calculator. A capped live series is a later promotion of the same engine, conditional on actual transfer compatibility, a future supported event and resolved operational/finality rules. Starting after a dividend has activated cannot capture that past dividend. A historical replay is not evidence these live gates passed.

Defer additional issuer implementations (including Backpack), a generic adapter framework, a transferable wrapper token, multiple maturities, leverage, lending integrations, a full AMM, automated USDC conversions, a protocol token and fee optimization. Keep issuer data parsing separate from allocation math using ordinary modules. Protect the vault demonstration, video and submission window before adding these features.

**Orchestration and tools**

Astra writes the phase specification and owns product language, economics, architecture and final review. Sol gets a bounded work order, explicit file ownership, frozen inputs and acceptance criteria. Use Sol high for UI, xhigh for program implementation as specified in the reviewed work order, medium for mechanical presentation production after the storyboard freezes, and high for integration. Workers return artifacts, validation evidence and limitations. They do not recursively delegate.

At each handoff, update [decision-log.md](decision-log.md), this plan and affected specifications or presentation claims with material findings. Preserve dated source snapshots. Distinguish observations from design interpretations and assumptions. Routine evidence-driven revisions remain within the authorized scope; meaningful changes to product economics must receive Astra's review before implementation continues.

Use the available presentation workflow to create editable slides and rendered previews. A new slide-service subscription is unnecessary for the proposed plan. Frontend code and shared design tokens should live in the same project as the SDK, with an adapter boundary allowing deterministic fixtures to be replaced by actual program calls. Select exact dependencies when implementation starts, after inspecting the repository and current official documentation.

The [phase work orders](phase-work-orders.md) are ready to adapt into separate sessions or native Sol calls. This task remains the coordination and evaluation loop. Phase one produced a representative product screen, working historical scenario calculator, reusable tokens and an HTML pitch specimen, reviewed by Astra. The next production step is the nine-slide editable pitch using that visual direction; the HTML specimen is not an editable slide deck.
