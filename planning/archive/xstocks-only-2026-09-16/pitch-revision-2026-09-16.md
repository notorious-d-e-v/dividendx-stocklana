# Pitch revision after user review

This brief supersedes conflicting copy in `pitch-storyboard.md`. Keep exactly nine slides and the approved visual system. Parent Astra owns this brief and planning evidence; Sol owns `presentation/**`.

## User direction

Use direct product language instead of repeated “hypothetical” and “proposed” phrasing. Add concrete traditional-market buyers and sellers. Expand the Solana case to include fractional ownership and auditability; replace the corporate-action slide with that explanation. Name Coca-Cola before using KO/KOx and translate its allocation into dollars. End with a simpler hackathon flow and a credible expansion vision across issuers and networks, with Solana as home base.

This is a product pitch, not a deployment announcement. Present-tense descriptions explain how the design works. Retain the compact current-build status on slide 8 and the prototype label on the cover; do not invent users, trades, live vault receipts or partnerships. Move longer implementation qualifications and corporate-action details into notes instead of repeating them in the spoken pitch.

## Approved narration

### 1 — DivX

DivX is a Solana vault we are building to separate one tokenized stock position into stock exposure and the right to its next dividend-derived xStock units.

### 2 — Two sides of one trade

Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DivX brings the same choice to xStock holders: keep the stock exposure and sell the dividend rights.

### 3 — One deposit, two claims

One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Both claims are backed by the same xStock collateral and redeem in xStock units whose dollar value can change.

### 4 — Established markets, familiar behavior

Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DivX connects those two ideas.

### 5 — Tokenized stocks bring the collateral onchain

Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. We start with dividend-paying xStocks on Solana, then expand to more familiar companies and additional issuers.

### 6 — What Solana changes

Solana brings collateral and both claims into one shared system. The deposit and paired claims are created together in one transaction. Each owner can transfer and redeem their claim under the same program rules, reducing the separate records and reconciliation needed between counterparties.

### 7 — Fractional ownership and auditability

Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. The same token standards also make the claims available for other Solana applications to integrate.

### 8 — Coca-Cola, in dollars

Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

### 9 — One event first

The hackathon target is one complete flow: deposit, split, sell the dividend, redeem each side separately. Next come Apple, Microsoft and NVIDIA xStocks, then Backpack and Ondo. The longer-term vision reaches Coinbase and Robinhood assets on other networks, with Solana as our home base for dividend liquidity.

## Slide changes

### 1, 3 and 4

Keep the approved visual compositions. Update speaker narration to the text above. Remove repeated “proposed program” wording. Slide 4's bottom qualification can become **“Established markets for trading dividends and separating yield.”** Keep different units/years clear and factual qualifications in notes. Do not add a prediction that equity dividend volume will exceed Pendle; that is an ambition, not a sourced forecast.

### 2 — Concrete participants

Keep the title and the correct two-way editable transaction diagram. Upper content explains the **traditional dividend market**:

- Sellers: **Bank trading desks** — manage dividend risk from structured products.
- Buyers: **Asset managers and hedge funds** — trade expected dividend payouts. Named asset-manager example: **Survista**.

Keep the lower diagram clearly labeled as the **DivX flow**, with **Stock holder → dividend right → Buyer** and payment in the opposite direction. Stock exposure is retained by the holder. Do not make it look as if the named institutions use DivX or already own PT/DR. The actual claim/payment arrowheads must point correctly; the Artifact Tool `tail` arrowhead worked in the last version.

Notes: bank direction varies by book and tenor; hedge funds can buy or sell. Traditional dividend futures/swaps are generally cash-settled, while this product allocates collateral in xStock units. Use `planning/pitch-tradfi-participants.md` and its CME/Eurex sources. The named Survista example is documented in Eurex's 2025 whitepaper, pages 31–32 (zero-based PDF pages 30–31).

### 5 — Expansion hint

Preserve the four reviewed metrics across slides 4–5. Keep the existing starting-market line; add a short expansion hint such as **“More companies, more issuers”** or **“Coca-Cola first. More dividend-paying stocks next.”** This must not crowd the layout. Move the long “not additive TAM” sentence into notes; retain a concise on-slide scope note that the RWA.xyz total includes stocks/ETFs and synthetic representations. No invented growth estimate.

### 6 — Settlement

Retain the three open rows: locked collateral, atomic issuance, separate ownership. Shorten the bottom ribbon to **“One program coordinates both claims.”** Remove the repeated proposed-implementation banner. The prototype label and slide-8 status already establish build stage. Notes retain issuer/event-data and operating dependencies.

### 7 — Replace the corporate-action slide

Title: **Fractional ownership and auditability**.

Use two open columns or an equally restrained native composition:

- **Fractional ownership** — Buy or sell part of a dividend claim.
- **Auditability** — Inspect collateral, claims outstanding and redemptions onchain.

Supporting line: **Built on shared token standards that other Solana apps can integrate.**

Do not imply public token-account data proves offchain custody reserves or guarantees correct code. Keep that distinction in notes. The old KOx/HONx classification comparison moves into notes/source ledger for technical Q&A, not a tenth slide. Use official Solana sources for fractional precision, accounts and atomic transactions:

- https://solana.com/docs/tokens
- https://solana.com/docs/core/accounts
- https://solana.com/docs/core/transactions
- https://solana.com/docs/rpc/http/gettokensupply

### 8 — Coca-Cola and dollars

Title: **Coca-Cola, in dollars** (or a similarly direct title naming Coca-Cola).

Keep the actual screenshot, historical/snapshot indicators and current-build status. Never paint fictional dollar values into the existing screenshot. In the native editable callout alongside it show:

- **100 Coca-Cola share-equivalents** (KOx).
- **≈ $8,935** stock exposure; secondary **100.0000 KOx**.
- **≈ $37.10** dividend allocation; secondary **0.4152 KOx**.
- Visible valuation basis: **At the event-implied $89.35/share**.
- Event: **15 September 2026**.
- **Working now: historical calculator. Next: vault execution.**

Use `planning/pitch-dollar-example.md`. The $89.35 is derived from the issuer's net cashflow and multiplier ratio, not a fetched execution or current market price. The $37.10 is the net reinvestment reference value, not a guaranteed cash payout or a quoted sale price. Notes must preserve the formula, inputs, source URL and raw integer allocations. Both claims still redeem in xStock units.

### 9 — Simple flow, clear expansion

Main target: **Deposit → split → sell the dividend → redeem separately**.

Use restrained text rows for the roadmap, no fabricated partner logos:

1. **More xStocks:** Apple · Microsoft · NVIDIA.
2. **More Solana issuers:** Backpack · Ondo.
3. **Across networks:** Coinbase on Base · Robinhood Chain stock tokens.

Conclude: **Solana as the home base for dividend liquidity.** Label expansion as **Roadmap** or **Next**, so no current integration is implied. Shorten other slide text to preserve space. The historical test-asset execution context belongs in notes, not repeated spoken qualifiers.

Use `planning/pitch-expansion-evidence.md`. Robinhood's new wallet-held Stock Tokens differ from legacy nontransferable Classic tokens. Coinbase is on Base. Ondo and selected Backpack tokens have native Solana representations; neither that fact nor a shared token standard proves an automatic bridge route. Cross-chain custody, settlement and messaging remain future design work. The MVP architecture remains the simple xStocks vault; this revision does not authorize cross-chain implementation or a generic issuer framework.

## Output

Update narration, all slide speaker notes, source ledger and submission-description draft consistently. Preserve the previous deck under build/archive and deliver a new versioned PPTX, final PNG previews and contact sheet. Render and inspect every changed slide, then scan the entire deck. Follow the presentations skill and finalizer. Parent Astra will inspect the final deck itself. No frontend edits or external publication in this phase.
