# DividendX: Stocklana plan

18 September hosting update: the canonical public test site is accepted at [dividendx-stocklana.vercel.app](https://dividendx-stocklana.vercel.app), with real-calendar devnet and separate private accelerated wallet/guided sandboxes. There is no shortened devnet term or public time override. Production-browser devnet grant/split/recombine, full four-event sandbox redemption, the nine-action guided journey, two-visitor reset/isolation and natural hard expiry pass against the unchanged core ELF. Visitor testing, installed-wallet acceptance, issuer outreach readiness and versioned submission materials are next; qualified issuer settlement remains a separate gate.

17 September implementation update: the annual program, transaction SDK, real local wallet flow, server-side issuer observations and isolated Raydium CPMM integration are accepted; see [program verification](program-review.md), [wallet acceptance](wallet-review.md), [reader acceptance](issuer-reader-review.md), [AMM acceptance](amm-review.md) and [guided demo acceptance](guided-demo-review.md). The exact accepted program ELF is deployed on devnet and the Node CLI completed a finalized public test-only round trip. The readers still provide observations rather than live settlement evidence, while `/demos/` now executes the complete two-wallet liquidity and redemption journey on a separate local chain. [Program v1](../spec/program-v1.md) resolves the account, authority, bounded arithmetic and staged-finalization contract. The separate guided walkthrough page and later financial products are recorded in the [roadmap](roadmap.md).

The [Test USDC update](usdc-demo-review.md) adds a separate faucet-funded public round trip with 14 finalized transactions and a local 36-transaction annual walkthrough. Both use the official devnet mint identity; local balances are explicitly synthetic. Earlier generic-quote receipts below remain historical proof.

Revised 16 September 2026 after the user narrowed the broader issuer audit to a contained permissionless product. Current direction: **one dividend layer for selected stock tokens on Solana**, with xStocks, Backpack/Trek and Ondo in the initial integration scope. Permissioned holder/approved-vault products are outside this build, including their onboarding and discovery UI. Other-chain assets come later, with Solana as the intended home for dividend trading.

The user has now approved the simpler product preview and authorized public GitHub backup. Read [current status and next steps](status.md) for the concise handoff; this document retains the full product plan.

The [annual architecture](adapter-decision.md) now supersedes the earlier event-vault implementation target: each exact issuer/mint/calendar-year series accumulates all qualified in-year dividends in one transferable bearer DR. Pendle already documents STRCx discrete yield; do not position stock dividends as something it cannot handle. Keep ordinary SPL claims and one general AMM integration, with explicit revision, confirmed-zero/cancellation, external-burn and tiny-claim rules. Preserve the approved single-event rehearsal, decks and narration as historical product material.

The [approved design](../design/index.html), [illustration guide](../design/illustrations/index.html) and historical calculator remain the visual foundation. The current [illustrated pitch v2](../presentation/output/DividendX-illustrated-v2.pptx) incorporates the approved artwork and makes both PT and DR composability explicit. The user's [narration](../presentation/narration.md) is preserved. The original v5 and illustrated v1 decks remain available. The root product demonstrates the [annual Market / Split / Redeem contract](../spec/annual-product.md) with the local [annual arithmetic reference](../spec/annual-series-sdk.md); `/rehearsal/` preserves the earlier sourced KOx/MU single-event flows. Both earlier web surfaces are local simulations. The separate `/app/` [wallet application](wallet-review.md) uses the actual program and transaction SDK for local token custody, issuance, transfers, four-event annual finalization and redemption. The isolated [AMM package](../packages/amm-integration/README.md) now proves public devnet liquidity separately. The separate `/demos/` page now proves 36 local signed transactions with a captured Circle devnet USDC mint through liquidity, purchase, withdrawal and independent annual redemption; live issuer enablement remains later. Program work follows [program v1](../spec/program-v1.md), [annual accounting](../spec/annual-series-accounting.md) and its [acceptance matrix](../spec/annual-series-tests.md), while the old accounting and SDK contracts remain rehearsal-only.

## Product and customer

**Keep the stock exposure. Sell the dividend rights.** Before the calendar year starts, a holder deposits a supported tokenized stock and receives annual Stock exposure (PT) and Dividend rights (DR). DR carries every qualified dividend whose official reference-market civil ex-date falls in that year. Both claims pay in the deposited stock token. Their dollar value can change; PT is not dollar principal protection and DR is not a guaranteed cash payout.

Traditional dividend derivatives establish a precedent for separating the two exposures. The customer hypothesis is a stock-token holder, treasury or market maker seeking upfront proceeds from a future dividend entitlement, with a dividend buyer on the other side. Named traditional institutions are examples of that market, not DividendX customers. Liquidity and useful spreads still need validation.

## What the issuer research changes

Read the [synthesis and capability matrix](solana-issuer-synthesis.md) before implementing this plan. Primary-source reports and timestamped API/RPC evidence live in `research/` and `evidence/`.

- xStocks, Backpack and Ondo's representative Solana tokens share Scaled UI Amount. A single raw-collateral annual engine can aggregate source-qualified dividend factors across those families.
- Each needs its own event reader and asset policy. Exact mint identity, decimals, revisions, classification and custody permissions differ. A common token extension is not a complete integration.
- Ondo's native Solana deployments are in scope now. Its other-chain deployments and bridges are later work.
- Registered shares requiring holder or vault approval, products without dividend rights, and discontinued products are excluded. Preserve their research for reference without building integrations or user-facing catalog entries for them.
- “All tokenized stocks work automatically from day one” is unsupported. The product is issuer-independent from the first architecture, with explicit per-asset eligibility and evidence. A missing API or permission remains a visible dependency.

The [initial asset package](research/initial-asset-package.md) binds recognizable companies to exact eligible-candidate mints. KOx and Backpack Micron MU provide sourced single-event factors for arithmetic regression, but neither fixture has a verified ex-date or proves a complete annual journal. Any test-term mapping must supply an explicit synthetic ex-date. Ondo has no qualified fixture yet. Additional selected assets use the same three readers only after their ex-date, period-completeness, revision/finality and custody checks pass.

Permissionless describes the intended DividendX deposit/claim path: no user allowlist or issuer-specific vault onboarding for admitted assets. A curated mint list is a safety boundary on collateral, not a holder allowlist. Issuer freeze/pause powers and product restrictions remain, and direct issuer minting/redemption may require onboarding outside our flow. Any asset requiring that onboarding for ordinary vault custody is excluded.

The [architecture decision](adapter-decision.md) defines a small issuer reader interface, versioned asset descriptors and one shared program. Extra adapter programs, arbitrary runtime plugins and a third circulating wrapper token remain unnecessary.

## Hackathon delivery contract

**One workflow across Solana issuers:** choose an exact stock token and calendar year, deposit before January 1, receive transferable annual PT and DR, use the claims, and redeem after the journal is finalized. Isolate every issuer/mint/year in its own custody and claim mints. Matching PT+DR can recombine before finalization, including after accrual or maturity; afterward each side redeems independently without forfeiture. Company headings and issued token options remain distinct. Source/event processing runs in the background.

The user's end-to-end hackathon target includes a real Solana program, token custody, actual PT/DR minting, wallet transfers and a concrete external AMM liquidity round trip. The program and wallet flow are proven locally, while the accepted ELF and liquidity round trip are now proven separately on public devnet through the isolated CLI. The public 2027 flow uses test collateral and ends with paired recombination because chain time cannot reach annual maturity during the run. Independent post-maturity redemption remains a separate local proof. Staking needs a specific accepting protocol or reward program and is not assumed from token transferability.

The finalized devnet run used pool `2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm` and 15 transactions. It deposited 100 synthetic test-stock units, seeded 40 DR / 80 worthless test quote, added 60 DR / 120 quote, spent 20 quote for `9.07024323` DR, withdrew all user-held LP, and recombined `90.92975034` paired claims. Raydium retains its required 100 internal LP and 643 DR raw; final PT supply, DR supply and vault backing are each `9.07024966`. These quantities prove test execution and conservation, not a market price, dollar backing or issuer-qualified settlement.

Deliver these capabilities in order:

1. A compact asset directory and source-backed observation page for the selected xStocks, Backpack and Ondo tokens. Include exact mint provenance, timestamps and a clear state when event data is pending. Exclude permissioned, inactive and non-dividend products from the product catalog.
2. The local annual reference and normalizer: exact issuer/mint/year identity, January 1 cutoff, official civil ex-date membership, revision replacement and multiplicative factor aggregation. Preserve real KOx/MU factors, but map them only with explicit test dates and never call either a complete annual payout.
3. One annual program with representative issuer profiles, actual transferable PT/DR mints, pre-year deposits, multi-event journal updates, paired recombination, maturity, journal-complete finalization and independent redemption. Tests across real token profiles establish portability; controlled multi-event scenarios establish annual accounting. Add a verified external AMM path for at least one claim/test-quote pair, including liquidity withdrawal before claim redemption.
4. Historical factor regressions for KOx and Backpack MU, clearly labeled as one sourced event inside a test term. Add an Ondo fixture only when authoritative classification, ex-date and factor binding are obtained. A complete issuer integration additionally requires the full period ledger, revisions and finality evidence.
5. A short demo video, reproducible repository, live preview and editable pitch explaining the broader product and actual completion status.

**The acceptance target is one complete annual-series flow across representative profiles.** A complete issuer settlement claim requires exact custody checks plus authoritative civil ex-dates, the complete eligible-period ledger, revisions and finality. One historical factor can validate arithmetic but cannot establish annual coverage. Pending data remains visible without reopening the wider issuer audit. A read-only page, mock mint or shared interface does not prove production support.

This revision produces local artifacts, the authorized public Git backup and public devnet transactions using dedicated test SOL and worthless test assets. It does not execute real-asset or mainnet transactions, send outreach or submit to the hackathon.

## Demo and financial meaning

Keep observation and execution distinct. **Observation** presents real Solana mint and issuer records; cached responses say snapshot rather than live. The current **local rehearsal** uses sourced historical events, in-memory balances and demo receipts. It resets on refresh and performs no onchain transactions. The later **historical program replay** will execute those events through the DividendX program on test collateral, with original and replay clocks stored separately. A seeded sale price is demo market data, never an observed historical DR price.

The preserved single-event reference is Coca-Cola (KO), represented by KOx. The xStocks event activated 15 September 2026 at 00:30 UTC. For 100 displayed share-equivalents before that event, raw deposit `9,819,982,084` divides into PT allocation `9,779,376,057` and DR allocation `40,606,027`. These redeem as approximately 100.0000 and 0.4152 displayed KOx after the event. This fixture has no verified ex-date and is not a complete annual payout; an annual test must assign and disclose a synthetic civil ex-date.

The issuer's $0.371 net cashflow and multiplier ratio imply a reference price of $89.35/share. At that same derived price the allocations are approximately **$8,935 stock exposure and $37.10 reinvested dividend**. This is not a fetched live quote, guaranteed cash payout or DR sale price. See [dollar example](pitch-dollar-example.md) and [real event verification](real-event-refresh.md).

An entered balance is a scenario, not proof of a wallet's historical entitlement. A deposit made after activation cannot capture the past dividend. Company record/payment dates differ from issuer activation; Coca-Cola's October 1 payment date must not be relabeled September 15.

Retain HONx's exact June 29 reverse-split event as a negative control. The later same-day spinoff is separate and unsupported. Splits must not create dividend yield. Backpack MU adds a second sourced fixture, explicitly labeled an onchain reconstruction. Its dividend-operation factor differs from today’s multiplier because normal mint/redeem operations recompute the latter. Keep these operations out of dividend yield. Internal synthetic tests may explore missing/invalid cases, but must not masquerade as historical issuer events.

## Program boundary

Use one ScaledReinvestmentAnnualV1 engine, ordinary token helpers, three issuer-specific readers and internal accounting shares. Each series pins exact issuer/mint/year, cluster, token program/decimals, reference market/calendar, rules version, authority/extension policy, attestor and journal policy. Deposits close at January 1 UTC, as chosen by the user; no claims mint during the term. There is no pooled cross-issuer backing, third wrapper, cross-chain custody or implicit issuer substitution.

For remaining accountable raw collateral `Q`, compute `R = product(M0_i/M1_i)` over the latest accepted qualified events whose official civil ex-date is in the year. Allocate `floor(Q × (1 − R))` to DR and the remainder to PT. Do not sum independently rounded one-event allocations. Maturity closes membership; a complete, resolved and final attestation freezes pools later. Missing, pending, unsupported or unexplained records block finalization rather than becoming zero.

Before finalization, matching PT+DR returns the same raw collateral and reduces `Q`; no side redeems alone. After finalization, PT and DR redeem independently with cumulative rounding, and bearer DR retains all unredeemed accumulated entitlement without expiry. The [annual accounting](../spec/annual-series-accounting.md), [SDK/reference contract](../spec/annual-series-sdk.md) and [annual tests](../spec/annual-series-tests.md) govern the build. The annual model/UI remain reference surfaces; the accepted program ELF is deployed on devnet, but only with test assets and no qualified issuer journal. Full issuer boundaries are in [adapter-decision.md](adapter-decision.md).

## What Solana contributes

| Benefit | Concrete design |
|---|---|
| Composability across issuers | Common custody/claim interface with issuer-specific evidence and permissions |
| Atomic issuance | Deposit and paired PT/DR creation succeed together |
| Fractional ownership | Holders can sell part of a claim; buyers can take smaller positions |
| Auditability | Inspect vault balances, claim supply and redemption history |
| Shared settlement | Claims and collateral interact through common Solana programs |

These do not remove issuer risk, create dividends for non-paying stocks, establish offchain reserve accuracy, guarantee universal access or supply buyers. The shared market is a product and integration goal, not proof of fungible claims or existing liquidity.

## Evidence for the pitch

| Dated metric | Meaning |
|---|---|
| $1.75T global dividends in 2024 | Annual cash-flow context, [Janus Henderson](https://www.janushenderson.com/en-dk/advisor/press-releases/global-dividends-jumped-to-a-record-1-75-trillion-in-2024/) |
| More than 21M Eurex dividend contracts in 2024 | Established standalone dividend trading, [Eurex](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358) |
| $96.4M Pendle average daily trading volume in 2024 | First-party historical evidence for onchain yield separation, [Pendle](https://medium.com/pendle/pendle-2025-zenith-cf1a91e6e23f) |
| $2.92B tokenized-stock distributed value on 16 September 2026 | Global stocks/ETFs/synthetics context, reconfirmed [RWA.xyz](https://app.rwa.xyz/stocks); not the eligible Solana dividend market |

Do not add these different measures into a TAM. No unsupported volume forecast or “first/only” claim. Pendle's wrapper already normalizes different yield-bearing assets; our specific work is Solana issuer/event handling and enforceable dividend allocation. Existing overlapping products are recorded in [market-evidence.md](market-evidence.md).

## Outside-in execution

Preserve approved colors, typography, component states, artwork, narration and the legacy calculator. A visitor sees company, issuer, annual term, funding/collecting/matured-pending/redeemable state and payout denomination; raw accounting and event journal belong in optional details.

| Phase | Output and exit criterion | Sol effort |
|---|---|---|
| Research and pitch revision — complete | Reviewed issuer matrix, architecture, approved nine-slide deck and narration consistent with evidence | High research; medium presentation |
| Contract and frontend — local reference | Annual Market / Split / Redeem preview plus preserved technical rehearsal; local arithmetic/lifecycle tests only, with no wallet or program | High |
| Annual vault and SDK | One issuer/mint/year program tested across qualified profiles; PDA custody, event journal, actual PT/DR issuance and transfer, prefinal recombination, finalization and independent redemption | **xhigh** |
| Wallet integration — local complete | Real `/app/` signing, three-profile SBF runtime, two-holder transfers/redemption and independent confirmed receipt evidence | High |
| Issuer readers — observation complete | Operational source observations with explicit qualification gaps; no settlement writer | High |
| AMM integration — test proof complete | Finalized public devnet create/add/swap/withdraw/recombine flow plus separate captured-bytecode local receipt | High |
| Guided DeFi demos — accepted; expansion deferred | Preserve the completed Raydium Test USDC journey at `/demos/`; display additional integrations only as future, noninteractive entries | Medium for roadmap copy |
| Public app and hosting — accepted | Canonical Vercel site, durable bounded devnet faucet, six-hour synthetic observation refresh, restricted per-session gateways and 15-minute wallet/guided VMs; production devnet, both full journeys, two-visitor isolation/reset and natural expiry pass | High |
| Issuer qualification and settlement — evidence dependent | Offline unsigned review is accepted; resolve event/ex-date/factor joins, custody and revision/coverage policy before any settlement writer | High |
| Captured issuer custody — local proof complete | All 15 mint configurations pass the unchanged program with synthetic balances/events; live custody and event qualification remain separate | High |
| Submission package | Product demo, clearly labeled historical test execution, video, final deck and reproducible instructions | High |

Rebudget remaining time from the actual current state. Prioritize live visitor testing, an installed-wallet check, external qualified-issuer answers and versioned submission materials. Qualified issuer data and settlement still take precedence over any additional trading demo. Preserve the accepted guided flow and list Streamflow, Jupiter Lock and the other [future demos](research/defi-demo-sequence.md) without implementing them. Resume evidence work from [qualification acceptance](issuer-qualification-review.md) and the [source follow-up](research/issuer-qualification-followup-2026-09-18.md), then refresh the submission package around verified behavior. External evidence remains a dependency; a successful API response does not authorize finalization.

The [official hackathon page](https://hackathons.solana.com/hackathons/stocklana), rechecked 18 September, still shows September 25 in its header and September 18 at 4 p.m. ET in its timeline. Reconfirm the signed-in submission form before relying on the extension. The public instructions require at least one GitHub, live-demo or video link; slides and a three-minute video are our proposed package, not assumed mandatory fields. No submission has occurred.

Astra owns architecture, scope, factual claims and final review. Sol works on bounded phases with disjoint paths and no recursive delegation. [Work orders](phase-work-orders.md) and the [decision log](decision-log.md) must change with new evidence. Current design approval persists; it does not certify future issuer settlement or deployed functionality.
