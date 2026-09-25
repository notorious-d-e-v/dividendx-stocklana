# DivX pitch storyboard

Astra production brief, 16 September 2026. Phase two: exactly nine editable slides, approximately three minutes of narration. User has approved the design system and requested slightly looser heading line spacing; that change is already in design/index.html and design/design-system.md. Simplify the copy for a judge unfamiliar with token accounting.

**Revision:** User review after v2 changes the participant examples, product tense, Solana slides, Coca-Cola valuation and roadmap. Read [pitch-revision-2026-09-16.md](pitch-revision-2026-09-16.md) for the current copy; it supersedes conflicting sections below. The original technical evidence remains useful for notes and Q&A.

## Direction

Use the approved warm-white/ink/blue/amber system and the typographic pitch specimen. Blue means stock exposure; amber means dividend rights. Preserve the approved original mark using the design source, not a new logo. Keep compositions open, flat and intentional. Use large numbers with explicit units and years, native editable evidence diagrams/tables where specified, and the actual prototype screenshot on slide eight. Avoid decorative assets that add no explanation. A full PPTX is required; HTML alone is not the deliverable.

The product is currently a concept plus a working historical calculator/design prototype. The vault, claim tokens, sale and onchain replay are planned. Do not imply deployed functionality, completed trades, organic liquidity, a partnership, guaranteed yield or protected dollar principal. Keep current status visible on the demonstration slide; narrate planned flows as proposed behavior.

## Slide sequence and copy

### 1 — DivX

Headline: **Keep the stock exposure. Sell the dividend rights.**

Subline: A Solana vault for tokenized-stock dividends.

Match the approved dark pitch specimen, with blue stock phrase and amber dividend phrase. Small stage/date label: Stocklana prototype · September 2026. Narration introduces the idea as the product being built, not a launched protocol.

### 2 — Two sides of one trade

Holder: **“I want cash today while keeping my stock exposure.”**

Buyer: **“I want the next dividend.”**

Connecting explanation: The holder sells the dividend claim. The buyer pays its agreed price.

Use a simple two-party composition, with a native editable transaction diagram: dividend right toward buyer, payment toward holder. Explain in notes that proceeds depend on a willing buyer and market price, not an assumed fixed quote. Customer demand remains a hypothesis. Dividend rights settle in reinvested xStock units and therefore retain stock-price exposure.

### 3 — One deposit, two claims

Native editable mechanism diagram: **xStock → vault → Stock exposure (PT) + Dividend rights (DR)**.

PT caption: The collateral remaining after this event’s dividend allocation.

DR caption: This event’s dividend-derived share of the collateral.

One supporting line: Both claims are backed by the same locked xStock balance.

Required short qualifier: Redeems in xStock units; dollar value can change.

The diagram is schematic, not a 50/50 allocation chart. No intermediate wrapper token, generic adapter framework or third claim. Notes clarify that deposit must precede the supported event and that receipt units differ from raw redemption allocations.

### 4 — Established markets, familiar behavior

**21M+** dividend contracts traded on Eurex in **2024**.

**$96.4M** average daily trading volume reported by Pendle for **2024**.

Connecting line: Investors already trade dividends separately. Crypto users already separate yield.

Use an open editorial layout, not repeated dashboard cards. Label contracts and dollars clearly; do not compare these as equivalent quantities. These are precedents, not evidence of demand for DivX. Cite Eurex and Pendle in speaker notes; attribute Pendle’s figure on-slide.

### 5 — Tokenized stocks bring the collateral onchain

**$1.75T** global dividends paid in **2024**.

**$2.92B** tokenized-stock distributed value, observed **16 September 2026**. Astra will reconfirm the dashboard before finalization; preserve the metric definition and replace this number only with reviewed evidence.

Starting market: Dividend-paying xStocks on Solana.

Use two clearly different labeled measures, with a short line that the eligible xStocks market is a subset. No total-addressable-revenue claim or additive TAM. The RWA.xyz aggregate includes ETFs and synthetic representations.

### 6 — What Solana changes

Use three simple evidence-led rows:

- **Locked collateral:** the vault holds the assets backing both claims.
- **Atomic issuance:** one deposit creates the paired claims together.
- **Separate ownership:** each holder can transfer and redeem their claim under the program’s rules.

Supporting line: Shared program state replaces manual reconciliation of these claims.

Small boundary: Issuer and corporate-action data dependencies remain.

These describe the proposed implementation, not a completed program. Notes distinguish the demonstrated calculator from planned transaction flows and avoid universal access, eliminated counterparty risk or guaranteed secondary liquidity.

### 7 — A stock split is not a dividend

Native editable comparison:

| Issuer event | DivX treatment |
|---|---|
| KOx cash dividend | Allocate the verified dividend-derived KOx to DR |
| HONx reverse split | Reject as a dividend; allocate no dividend yield |

Supporting line: Check the issuer event and the onchain multiplier together.

Pendle distinction: Pendle provides the yield-splitting model. Equities need corporate-action rules.

Notes: xStocks dividends and splits share a multiplier; Scaled UI Amount leaves raw balances fixed. Pendle can normalize rebasing assets and is not inherently incapable of equities. Our hackathon contribution is a Solana vault plus correct event accounting. The HONx control is its exact June 29 reverse-split event, not the full day: a spinoff followed later and is unsupported. The issuer event classification is a trusted attestation, not a fact derived solely onchain.

### 8 — A real dividend, already inspectable

Use the actual current prototype screenshot. It must remain visibly a historical scenario with a dated source snapshot.

Supporting result: **100 KOx before the event → 100.0000 KOx stock exposure + 0.4152 KOx dividend allocation.**

Event: KOx issuer adjustment · 15 September 2026.

Required visible status: **Working now: historical calculator. Next: vault execution.**

The main screenshot may be cropped to the useful calculation while retaining its historical label. Do not fabricate a transaction receipt or imply the vault held assets at the original event. Company cash-payment date October 1 is not the issuer adjustment date. Results are rounded displayed equivalents; exact integer values and source event ID belong in speaker notes.

### 9 — One event first

Hackathon target: **Deposit → split → sell the dividend claim → redeem separately.**

Build one complete flow with test assets and a real historical event.

Next: a future live series, then additional stocks and issuers.

Backpack is a candidate once its corporate-action data is verified; no partnership or supported integration claim. Keep this roadmap focused. End on the product promise and the near-term deliverable, not invented traction or fundraising.

## Speaker notes and source ledger

Each slide has concise speaker notes. All external figures and issuer facts require direct source URLs and observation/publication dates in the notes. Keep deck narration around 380–450 words, without reading every label. Put longer qualifications in the notes, except those explicitly required on-slide above. Do not append a tenth slide; place source details in notes and a separate markdown ledger.

Use planning/market-evidence.md, planning/real-event-refresh.md, planning/adapter-decision.md, planning/backpack-research.md and the original saved JSON evidence. The latest reviewed plan governs scope if older research copy says a generic corporate-action adapter is being built.

Exact 100-displayed-KOx case: raw Q=9,819,982,084; PT=9,779,376,057; DR=40,606,027. Before multiplier 1.0183317967386898, after multiplier 1.0225601246249238, decimals 8. Source event 75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e v2. The working calculator performs this allocation; no onchain claim issuance exists yet.

## Deliverables and acceptance

- Exactly nine slides in an editable PowerPoint file, exported and finalized under the presentations skill.
- Rendered slide previews and a contact sheet. Astra reviews every slide, text fit, stage claims and source notes.
- A concise narration script, source ledger and submission-description draft in presentation/.
- Preserve working authoring source and finalization reports in presentation/build/, separate from final output.
- Record real limitations; never label a fallback HTML preview as the PowerPoint deliverable.

Parent owns spec/ and planning/. Sol owns presentation/ for this phase and may read design assets. No wallet actions, public publishing, hackathon submission or modification of the approved design system.
