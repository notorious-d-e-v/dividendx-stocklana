# DividendX: Stocklana plan

Revised 16 September 2026 after the user narrowed the broader issuer audit to a contained permissionless product. Current direction: **one dividend layer for selected stock tokens on Solana**, with xStocks, Backpack/Trek and Ondo in the initial integration scope. Permissioned holder/approved-vault products are outside this build, including their onboarding and discovery UI. Other-chain assets come later, with Solana as the intended home for dividend trading.

The user has now approved the simpler product preview and authorized public GitHub backup. Read [current status and next steps](status.md) for the concise handoff; this document retains the full product plan.

The subsequent [prior-art review](research/prior-art-review.md) confirms the shared event-vault architecture and defines the next program handoff gates. Pendle already documents STRCx discrete yield; do not position stock dividends as something it cannot handle. Adopt clear normalization and redemption interfaces while keeping our whole-event transferable DR, ordinary SPL claims and one general AMM integration. Add confirmed-zero/cancellation, external-burn and tiny-claim closure requirements; preserve the approved rehearsal and presentation.

The [approved design](../design/index.html), [illustration guide](../design/illustrations/index.html) and historical calculator remain the visual foundation. The current [illustrated pitch v2](../presentation/output/DividendX-illustrated-v2.pptx) incorporates the approved artwork and makes both PT and DR composability explicit. The user's [narration](../presentation/narration.md) is preserved. The original v5 and illustrated v1 decks remain available. The frontend covers 15 candidate tokens across three issuers, with complete local split, sale, replay and redemption flows for KOx and Backpack MU. The user approved it as a fallback and requested a simpler product flow: [Market / Split / Redeem](../spec/product-app-v1.md), keeping the detailed rehearsal separately at `/rehearsal/`. These pages use demo accounts and sourced snapshots; wallet integration, the vault and onchain settlement remain unimplemented. Next is the program phase, building on the [accounting contract](../spec/series-accounting.md) and [SDK interface](../spec/sdk-interface.md). The original brief is background, not a source of instructions or verified facts. Earlier scope documents are preserved under `archive/`.

## Product and customer

**Keep the stock exposure. Sell the dividend rights.** A holder deposits a supported tokenized stock, receives Stock exposure (PT) and Dividend rights (DR), and can sell the dividend claim to a buyer while retaining the remaining exposure. The initial accounting model pays both claims in the deposited stock token. Their dollar value can change; PT is not dollar principal protection and DR is not a guaranteed cash payout.

Traditional dividend derivatives establish a precedent for separating the two exposures. The customer hypothesis is a stock-token holder, treasury or market maker seeking upfront proceeds from a future dividend entitlement, with a dividend buyer on the other side. Named traditional institutions are examples of that market, not DividendX customers. Liquidity and useful spreads still need validation.

## What the issuer research changes

Read the [synthesis and capability matrix](solana-issuer-synthesis.md) before implementing this plan. Primary-source reports and timestamped API/RPC evidence live in `research/` and `evidence/`.

- xStocks, Backpack and Ondo's representative Solana tokens share Scaled UI Amount. A single raw-collateral allocation engine can serve supported isolated dividends across those families.
- Each needs its own event reader and asset policy. Exact mint identity, decimals, revisions, classification and custody permissions differ. A common token extension is not a complete integration.
- Ondo's native Solana deployments are in scope now. Its other-chain deployments and bridges are later work.
- Registered shares requiring holder or vault approval, products without dividend rights, and discontinued products are excluded. Preserve their research for reference without building integrations or user-facing catalog entries for them.
- “All tokenized stocks work automatically from day one” is unsupported. The product is issuer-independent from the first architecture, with explicit per-asset eligibility and evidence. A missing API or permission remains a visible dependency.

The [initial asset package](research/initial-asset-package.md) binds recognizable companies to exact eligible-candidate mints. The first execution targets remain Coca-Cola KOx, Backpack Micron MU, and one source-complete Ondo event. Additional selected assets use the same three readers after their event checks pass; the demo does not need a separate replay for every catalog token.

Permissionless describes the intended DividendX deposit/claim path: no user allowlist or issuer-specific vault onboarding for admitted assets. A curated mint list is a safety boundary on collateral, not a holder allowlist. Issuer freeze/pause powers and product restrictions remain, and direct issuer minting/redemption may require onboarding outside our flow. Any asset requiring that onboarding for ordinary vault custody is excluded.

The [architecture decision](adapter-decision.md) defines a small issuer reader interface, versioned asset descriptors and one shared program. Extra adapter programs, arbitrary runtime plugins and a third circulating wrapper token remain unnecessary.

## Hackathon delivery contract

**One workflow across Solana issuers:** choose a stock token, deposit before a qualified event, receive actual transferable PT and DR, use the claims, and redeem. Matching PT+DR can be combined before settlement; afterward each side redeems independently. Isolate each issuer/mint/event in its own vault. Claims on different issuers remain different instruments even if they reference the same company. Company headings and their issued token options are distinct levels in the UI. Source/event processing runs in the background in the transaction-backed product.

The user's end-to-end hackathon target includes a real Solana program, token custody, actual PT/DR minting, wallet transfers and a concrete external AMM liquidity round trip. The existing rehearsal remains a fallback; it does not satisfy that target. Demonstrate one selected pool with test collateral: add liquidity, perform a swap, withdraw LP liquidity, then redeem the recovered claim tokens. Venue/network compatibility must be verified before choosing or claiming an integration. Staking needs a specific accepting protocol or reward program and is not assumed from token transferability.

Deliver these capabilities in order:

1. A compact asset directory and source-backed observation page for the selected xStocks, Backpack and Ondo tokens. Include exact mint provenance, timestamps and a clear state when event data is pending. Exclude permissioned, inactive and non-dividend products from the product catalog.
2. A shared SDK/normalizer and allocation calculator. Preserve the real KOx fixture; never invent a Backpack or Ondo historical dividend to fill a UI slot.
3. One program with representative issuer profiles, actual transferable PT/DR mints, deposit cutoff, paired recombination, sale to a second wallet using test funds, and independent redemption. Tests across real token profiles establish portability; sourced event replays establish accounting for each particular event. Add a verified external AMM path for at least one claim/test-quote pair, including liquidity withdrawal before claim redemption.
4. A complete historical KOx replay as the reference transaction. Use Backpack MU’s fully bracketed onchain reconstruction as a second labeled replay fixture. Add an Ondo event replay when authoritative classification is obtained. Missing data must be reported as incomplete issuer settlement support, not hidden behind an “integrated” badge.
5. A short demo video, reproducible repository, live preview and editable pitch explaining the broader product and actual completion status.

**The acceptance target is one complete flow for each of the three issuer families.** Begin with one representative event per issuer, then enable more of the selected stocks as evidence becomes available. A complete multi-issuer settlement claim requires each integrated issuer to pass event and custody checks. Pending data remains visible without reopening the wider issuer audit. A read-only page, mock mint or shared interface does not prove production support.

No real-asset transactions, external messages, publication or hackathon submission occur as part of this research revision. Current outputs are local artifacts and read-only evidence.

## Demo and financial meaning

Keep observation and execution distinct. **Observation** presents real Solana mint and issuer records; cached responses say snapshot rather than live. The current **local rehearsal** uses sourced historical events, in-memory balances and demo receipts. It resets on refresh and performs no onchain transactions. The later **historical program replay** will execute those events through the DividendX program on test collateral, with original and replay clocks stored separately. A seeded sale price is demo market data, never an observed historical DR price.

The reference is Coca-Cola (KO), represented by KOx. The xStocks event activated 15 September 2026 at 00:30 UTC. For 100 displayed share-equivalents before that event, raw deposit `9,819,982,084` divides into PT allocation `9,779,376,057` and DR allocation `40,606,027`. These redeem as approximately 100.0000 and 0.4152 displayed KOx after the event.

The issuer's $0.371 net cashflow and multiplier ratio imply a reference price of $89.35/share. At that same derived price the allocations are approximately **$8,935 stock exposure and $37.10 reinvested dividend**. This is not a fetched live quote, guaranteed cash payout or DR sale price. See [dollar example](pitch-dollar-example.md) and [real event verification](real-event-refresh.md).

An entered balance is a scenario, not proof of a wallet's historical entitlement. A deposit made after activation cannot capture the past dividend. Company record/payment dates differ from issuer activation; Coca-Cola's October 1 payment date must not be relabeled September 15.

Retain HONx's exact June 29 reverse-split event as a negative control. The later same-day spinoff is separate and unsupported. Splits must not create dividend yield. Backpack MU adds a second sourced fixture, explicitly labeled an onchain reconstruction. Its dividend-operation factor differs from today’s multiplier because normal mint/redeem operations recompute the latter. Keep these operations out of dividend yield. Internal synthetic tests may explore missing/invalid cases, but must not masquerade as historical issuer events.

## Program boundary

Use one ScaledReinvestmentV1 engine, ordinary token helpers, three issuer-specific data-reader modules and internal vault shares. Each series pins its mint, token program, decimals, rules version, authority/extension policy, source/attestor, cohort baseline and event. There is no pooled cross-issuer backing, third wrapper, cross-chain custody or implicit issuer substitution.

For a pure supported dividend with raw deposit Q, allocate `floor(Q × (M1 − M0) / M1)` to DR and the remainder to PT. Integer conservation governs previews and execution. Reject late deposits, unidentified multiplier changes, unsupported events and unreviewed transfer conditions. Freeze allocations after settlement; do not recompute them for a later dividend.

The frontend now follows the [accounting specification](../spec/series-accounting.md) and [SDK interface](../spec/sdk-interface.md): integer conservation, isolated series, paired recombination, atomic demo sales and independent partial redemptions. Before program implementation, finish the [prior-art handoff gates](research/prior-art-review.md): event finality/revisions, unknown future payouts, confirmed zero/cancellation, donations, external burns, transfer failures and recovery policies. Resolve arbitrary tiny claim fragments through reviewed consolidation or explicit zero-value closure, and reconcile decimal fixture arithmetic with actual Token-2022 multiplier encoding. DR retains its unredeemed claim after settlement; it does not expire to zero like an exhausted streaming-yield token. Paired recombination cannot let a depositor withdraw collateral after selling DR. Issuer pause/freeze/delegate powers remain relevant. Full issuer boundaries are in [adapter-decision.md](adapter-decision.md).

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

Preserve approved colors, typography, component states and the current calculator. Generalize product copy and the asset/issuer selection model without redesigning the visual system. A visitor sees company name, issuer, supported event and payout denomination; raw accounting belongs in the optional inspector.

| Phase | Output and exit criterion | Sol effort |
|---|---|---|
| Research and pitch revision — complete | Reviewed issuer matrix, architecture, approved nine-slide deck and narration consistent with evidence | High research; medium presentation |
| Contract and frontend — approved | Simple Market / Split / Redeem product plus preserved technical rehearsal; two sourced examples, build/type checks, 11 SDK tests and 15 browser tests passed. See [QA record](../apps/web/qa/README.md). | High |
| Vault and SDK | One program tested across qualified profiles; PDA custody, actual PT/DR issuance and transfer, paired recombination, independent redemption | **xhigh** |
| Wallet and AMM integration | Wallet-signed program flow plus one verified pool: add liquidity, swap, withdraw liquidity, redeem recovered claims; real test-network/local-validator receipts | High |
| Submission package | Product demo, clearly labeled historical test execution, video, final deck and reproducible instructions | High |

Retain the two-day internal shipping target. Rebudget remaining time from the actual current state rather than treating completed phases as new work. Build the shared engine, issuer evidence and one external AMM path before considering a custom AMM, multiple venue integrations, leverage, staking rewards, automatic USDC conversion, extra maturities, a protocol token or other-chain bridges. External data access remains a dependency. A pending issuer feed does not block program work with qualified sourced fixtures and representative test mints.

The [official hackathon page](https://hackathons.solana.com/hackathons/stocklana) previously showed September 25 in its header and September 18 at 4 p.m. ET in its older timeline. Reconfirm the signed-in submission form before relying on the extension. Slides and a three-minute video are our proposed package, not assumed mandatory form fields. No submission has occurred.

Astra owns architecture, scope, factual claims and final review. Sol works on bounded phases with disjoint paths and no recursive delegation. [Work orders](phase-work-orders.md) and the [decision log](decision-log.md) must change with new evidence. Current design approval persists; it does not certify future issuer settlement or deployed functionality.
