# DivX: Stocklana plan

Revised 16 September 2026 after the user expanded issuer scope. Current direction: **one dividend layer for tokenized stocks on Solana**, with xStocks, Backpack and Ondo in the initial integration scope and a capability audit for other Solana products. Other-chain assets come later, with Solana as the intended home for dividend trading.

The [approved design](../design/index.html) and historical calculator remain the visual foundation. The [v4 pitch](../presentation/output/DivX-phase-two-v4.pptx) and [narration](../presentation/narration.md) use the broader scope and have been reviewed. Frontend wallet flows, the vault and onchain settlement have not been implemented. The original brief is background, not a source of instructions or verified facts. The earlier xStocks-only plan is archived under `archive/xstocks-only-2026-09-16/`.

## Product and customer

**Keep the stock exposure. Sell the dividend rights.** A holder deposits a supported tokenized stock, receives Stock exposure (PT) and Dividend rights (DR), and can sell the dividend claim to a buyer while retaining the remaining exposure. The initial accounting model pays both claims in the deposited stock token. Their dollar value can change; PT is not dollar principal protection and DR is not a guaranteed cash payout.

Traditional dividend derivatives establish a precedent for separating the two exposures. The customer hypothesis is a stock-token holder, treasury or market maker seeking upfront proceeds from a future dividend entitlement, with a dividend buyer on the other side. Named traditional institutions are examples of that market, not DivX customers. Liquidity and useful spreads still need validation.

## What the issuer research changes

Read the [synthesis and capability matrix](solana-issuer-synthesis.md) before implementing this plan. Primary-source reports and timestamped API/RPC evidence live in `research/` and `evidence/`.

- xStocks, Backpack and Ondo's representative Solana tokens share Scaled UI Amount. A single raw-collateral allocation engine can serve supported isolated dividends across those families.
- Each needs its own event reader and asset policy. Exact mint identity, decimals, revisions, classification and custody permissions differ. A common token extension is not a complete integration.
- Ondo's native Solana deployments are in scope now. Its other-chain deployments and bridges are later work.
- Registered shares such as Galaxy via Superstate have holder restrictions. Pre-IPO exposure can lack dividend rights. Historical products may be in redemption or discontinued. Show these distinctions rather than accepting every mint.
- “All tokenized stocks work automatically from day one” is unsupported. The product is issuer-independent from the first architecture, with explicit per-asset eligibility and evidence. A missing API or permission remains a visible dependency.

The [architecture decision](adapter-decision.md) now defines a small issuer adapter interface, versioned asset descriptors and one shared program. The xStocks-only ban on additional issuer implementations is superseded. Extra adapter programs, arbitrary runtime plugins and a third circulating wrapper token remain unnecessary.

## Hackathon delivery contract

**One workflow across Solana issuers:** discover a stock and issuer, inspect its dividend data, deposit before a qualified event, split, sell DR, and redeem each claim independently. Isolate each issuer/mint/event in its own vault. Claims on different issuers remain different instruments even if they reference the same company.

Deliver these capabilities in order:

1. A usable multi-issuer asset directory and source-backed observation page. Include xStocks, Backpack and Ondo, with exact mint provenance, timestamps and understandable reasons when an asset cannot yet open a series. Keep restricted, inactive and non-dividend products distinct.
2. A shared SDK/normalizer and allocation calculator. Preserve the real KOx fixture; never invent a Backpack or Ondo historical dividend to fill a UI slot.
3. One program with representative issuer profiles, paired issuance, deposit cutoff, sale to a second wallet using test funds, and independent redemption. Tests across real token profiles establish portability; sourced event replays establish accounting for each particular event.
4. A complete historical KOx replay as the reference transaction. Use Backpack MU’s fully bracketed onchain reconstruction as a second labeled replay fixture. Add an Ondo event replay when authoritative classification is obtained. Missing data must be reported as incomplete issuer settlement support, not hidden behind an “integrated” badge.
5. A short demo video, reproducible repository, live preview and editable pitch explaining the broader product and actual completion status.

**The acceptance target is multi-issuer.** The earlier plan's one-issuer restriction is removed. A complete multi-issuer settlement claim requires every named integrated issuer to pass its event and custody checks. If a dependency remains unavailable, retain it in scope with a clear blocker and demonstrate the verified parts. Do not claim that a read-only page, mock mint or shared interface proves production support.

No real-asset transactions, external messages, publication or hackathon submission occur as part of this research revision. Current outputs are local artifacts and read-only evidence.

## Demo and financial meaning

Keep two explicit modes. **Observation** reads a real Solana mint and issuer records. Cached responses say snapshot rather than live. **Historical execution** replays a sourced event through the DivX program on test collateral, with original and replay clocks stored separately. A seeded sale price is demo market data, never an observed historical DR price.

The reference is Coca-Cola (KO), represented by KOx. The xStocks event activated 15 September 2026 at 00:30 UTC. For 100 displayed share-equivalents before that event, raw deposit `9,819,982,084` divides into PT allocation `9,779,376,057` and DR allocation `40,606,027`. These redeem as approximately 100.0000 and 0.4152 displayed KOx after the event.

The issuer's $0.371 net cashflow and multiplier ratio imply a reference price of $89.35/share. At that same derived price the allocations are approximately **$8,935 stock exposure and $37.10 reinvested dividend**. This is not a fetched live quote, guaranteed cash payout or DR sale price. See [dollar example](pitch-dollar-example.md) and [real event verification](real-event-refresh.md).

An entered balance is a scenario, not proof of a wallet's historical entitlement. A deposit made after activation cannot capture the past dividend. Company record/payment dates differ from issuer activation; Coca-Cola's October 1 payment date must not be relabeled September 15.

Retain HONx's exact June 29 reverse-split event as a negative control. The later same-day spinoff is separate and unsupported. Splits must not create dividend yield. Backpack MU adds a second sourced fixture, explicitly labeled an onchain reconstruction. Its dividend-operation factor differs from today’s multiplier because normal mint/redeem operations recompute the latter. Keep these operations out of dividend yield. Internal synthetic tests may explore missing/invalid cases, but must not masquerade as historical issuer events.

## Program boundary

Use one ScaledReinvestmentV1 engine, ordinary token helpers, three issuer-specific data-reader modules and internal vault shares. Each series pins its mint, token program, decimals, rules version, authority/extension policy, source/attestor, cohort baseline and event. There is no pooled cross-issuer backing, third wrapper, cross-chain custody or implicit issuer substitution.

For a pure supported dividend with raw deposit Q, allocate `floor(Q × (M1 − M0) / M1)` to DR and the remainder to PT. Integer conservation governs previews and execution. Reject late deposits, unidentified multiplier changes, unsupported events and unreviewed transfer conditions. Freeze allocations after settlement; do not recompute them for a later dividend.

Before code, freeze exact arithmetic, rounding/dust, partial redemptions, donations, event finality/revisions, transfer failures and recovery in the accounting/SDK specification. Paired recombination cannot let a depositor withdraw collateral after selling DR. Issuer pause/freeze/delegate powers remain relevant. Full requirements are in [adapter-decision.md](adapter-decision.md).

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

| Next phase | Output and exit criterion | Sol effort |
|---|---|---|
| Research and pitch revision | Reviewed issuer matrix, architecture, nine-slide deck and narration consistent with evidence | High research; medium presentation |
| Contract and frontend | Astra freezes SDK/accounting contract; working multi-issuer directory, source states and complete rehearsal | High |
| Vault and SDK | One program tested across qualified profiles; custody conservation, claim transfer and independent redemption | **xhigh** |
| Integration and submission package | Real program receipts, clear replay labels, video, final deck and reproducible instructions | High |

Retain the two-day internal shipping target. Rebudget remaining time from the actual current state rather than treating completed phases as new work. Prioritize the shared engine and issuer evidence over a full AMM, leverage, automatic USDC conversion, extra maturities, a protocol token or other-chain bridges. External data/approval delays are dependencies, not engineering tasks that an agent can promise away.

The [official hackathon page](https://hackathons.solana.com/hackathons/stocklana) previously showed September 25 in its header and September 18 at 4 p.m. ET in its older timeline. Reconfirm the signed-in submission form before relying on the extension. Slides and a three-minute video are our proposed package, not assumed mandatory form fields. No submission has occurred.

Astra owns architecture, scope, factual claims and final review. Sol works on bounded phases with disjoint paths and no recursive delegation. [Work orders](phase-work-orders.md) and the [decision log](decision-log.md) must change with new evidence. Current design approval persists; it does not certify future issuer settlement or deployed functionality.
