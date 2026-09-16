# Pitch revision v5: selected Solana stock package

Astra brief, 16 September 2026. Refines v4 after the user excluded permissioned products and requested a contained package across three issuers. The previous brief is archived in `planning/archive/broad-solana-scope-2026-09-16/`. Preserve exactly nine editable slides and the approved visual system. Sol owns only `presentation/**`; Astra owns this specification and research.

**Narration update:** The plain-language script in [presentation/narration.md](../presentation/narration.md) supersedes the v5 narration below for the next deck export. It follows the same nine slides, defines dividends, explains the onchain benefits in ordinary language, and keeps the current demo stage explicit. The existing v5 PPTX and its embedded notes remain the archived review version until the next export.

## Message

**DividendX is a permissionless dividend market for selected stock tokens on Solana.** Initial issuer scope is xStocks, Backpack/Trek and Ondo. The candidate package is six companies: Coca-Cola, Apple, Microsoft, Micron, Nike and IBM. Official registries and mint observations identify 15 candidate tokens: all six from xStocks and Ondo, and Micron/Nike/IBM from Backpack. This is a selected integration package, not 15 completed integrations. Permissioned holder/approved-vault products are excluded from engineering and the product catalog.

A shared engine and three issuer readers remain the design. Permissionless means no DividendX holder allowlist or issuer-specific vault onboarding for admitted assets; underlying issuer controls and product restrictions remain. Put this explanation once in notes, not on every slide. Do not promise unrestricted legal access or removal of issuer risk. The asset package report will contain exact mints and evidence. First execution targets: KOx sourced event, Backpack MU onchain reconstruction, one Ondo event when verified. No Ondo historical dividend is source-complete yet.

Keep direct product language, concrete traditional participants, fractional ownership/auditability and the Coca-Cola dollar example. The cover still says prototype/concept plus working historical calculator. Slide 8 still distinguishes the existing calculator from next-stage vault execution. No production vault, issuer partnership, executed trade or completed multi-issuer settlement is implied.

## Narration

### 1 — DividendX

DividendX lets a stock holder keep the stock exposure and sell the dividend rights. We are building a permissionless dividend market for selected stock tokens from xStocks, Backpack and Ondo on Solana.

### 2 — Two sides of one trade

Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DividendX brings that choice to tokenized-stock holders: keep the stock exposure and sell the dividend rights.

### 3 — One deposit, two claims

One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Each pair is backed by its own stock-token collateral and redeems in that token. Its dollar value can change.

### 4 — Established markets, familiar behavior

Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DividendX connects those two ideas.

### 5 — Tokenized stocks bring the collateral onchain

Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. Our starting package includes familiar dividend payers such as Apple, Microsoft and Coca-Cola, represented by stock tokens on Solana.

### 6 — One workflow across issuers

Solana lets stock tokens from different issuers use the same vault design. Each issuer's dividend data feeds common allocation rules. One transaction deposits collateral and creates both claims. Holders use the same deposit, trade and redemption flow, while each issuer's collateral stays separate.

### 7 — Fractional ownership and auditability

Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. Other Solana applications can integrate the same claim interface.

### 8 — Coca-Cola, in dollars

Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

### 9 — Solana issuers first

The hackathon target is one complete flow across supported Solana stock tokens: deposit, split, sell the dividend, redeem each side separately. We start with selected stocks from xStocks, Backpack and Ondo, proving one dividend event per issuer before expanding within the package. Other networks come later, with Solana as our home base for dividend liquidity.

## On-slide changes

**1:** Keep approved dark cover, original mark and headline. Subline: **A dividend market for tokenized stocks on Solana.** Keep current-build labels. Narration introduces the three initial families; no crowded logo strip.

**2:** Preserve traditional bank/Survista evidence and directional trade diagram. Replace xStock-holder wording in notes with tokenized-stock holder. Keep named institutions clearly in the traditional market, not as our customers.

**3:** Change input label from xStock to **Stock token**. Main line: **Each pair of claims has its own locked collateral.** Qualifier: **Redeems in the deposited stock token. Dollar value can change.** Retain editable deposit/vault/PT/DR diagram and scheme proportions. Notes explain issuer/mint/event isolation, reinvested-token settlement and shared Scaled UI allocation. No third wrapper token.

**4:** Preserve reviewed metrics, units, years and composition. Pendle normalization supports our analogy, not a claim that it cannot handle equities or that stocks will necessarily exceed its volume.

**5:** Preserve $1.75T / $2.92B and existing metric scope note. Change starting market to **Selected dividend stocks on Solana**. Short supporting line: **Initial scope: xStocks, Backpack and Ondo**. This is integration scope, not a supported-token inventory or three-partner announcement. $2.92B was independently reconfirmed on RWA.xyz during this revision and remains global, not Solana-only.

**6:** Title **One workflow across issuers**. Preserve the open three-row style using:

- **Multiple issuers** — xStocks, Backpack and Ondo feed one vault design.
- **Atomic issuance** — Deposit collateral and issue both claims together.
- **Separate ownership** — Transfer and redeem each claim under common rules.

Footer: **One shared flow. Separate collateral for each issuer.** Notes: all three observed families use Token-2022 Scaled UI Amount; accounting can be shared, but each issuer's event reader and custody requirements differ. Exact mint/decimals and issuer authority controls remain pinned. A shared engine does not pool collateral, make issuer claims fungible or guarantee liquidity. Permissioned holder/approved-vault products and no-dividend/fee-bearing products are outside scope. Permissionless describes DividendX access for admitted tokens, not removal of issuer controls or product restrictions. Exact mint checks, event evidence and execution tests are required before a series opens. Keep technical details in notes rather than add an appendix.

**7:** Preserve fractional ownership and auditability composition. Adjust final line to **A common claim interface for other Solana applications.** Onchain auditability concerns held collateral and program records, not proof of issuer reserves or audit certification. Claim transferability remains subject to the eligible series rules.

**8:** Preserve real screenshot and the exact existing dollar callout. 100 Coca-Cola share-equivalents, approximately $8,935 stock exposure / 100.0000 KOx and $37.10 dividend allocation / 0.4152 KOx. Visible basis **At the event-implied $89.35/share**. Keep **Working now: historical calculator. Next: vault execution.** KOx is the first reference example, not the only intended issuer. No invented Backpack/Ondo event screenshot.

**9:** Title **Solana issuers first**. Preserve simple main flow: **Deposit → split → sell the dividend → redeem separately**. User explicitly requested this flow, so retain it even if a skill generally discourages decorative arrows.

Roadmap rows:

1. **Initial Solana scope:** xStocks · Backpack · Ondo.
2. **Selected stocks:** Coca-Cola, Apple, Microsoft, Micron, Nike and IBM.
3. **Other networks later:** Coinbase on Base · Robinhood Chain.

Closing line **Solana as the home base for dividend liquidity.** Label as **Build scope and roadmap**. No “then Backpack/Ondo” or “xStocks only” wording remains. Technical notes distinguish the 15-token candidate package from source-verified events and future execution. The six companies are not all available from all three issuers. Backpack includes only Micron, Nike and IBM; its prepared Coca-Cola/Apple/Microsoft tokens have deposits and withdrawals disabled. One event per issuer is the first execution target. KOx has a complete source-verified fixture; Backpack MU is a fully bracketed onchain reconstruction; Ondo event binding still needs authenticated source data. All vault execution remains planned. Use the exact mint matrix and primary source links from `planning/research/initial-asset-package.md`.

## Notes and sources

Use `planning/adapter-decision.md`, `planning/plan.md`, the issuer reports in `planning/research/` (Ondo report may temporarily be at `planning/ondo-solana.md`), existing participant/dollar evidence, and these parent-reviewed primary sources:

- https://docs.xstocks.fi/developers/multipliers
- https://docs.xstocks.fi/apis/openapi/corporate-actions
- https://learn.backpack.exchange/blog/tokenized-micron-mu
- https://docs.ondo.finance/ondo-stocks/corporate-actions
- https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset
- https://github.com/ondoprotocol/global-markets-solana
- https://api.backpack.exchange/api/v1/assets
- https://github.com/ondoprotocol/gm-solana-simulator/blob/0688add3c64aadc7006712989e9ec0592b5b10f8/constants.rs
- https://app.rwa.xyz/stocks

Retain existing CME/Eurex/Pendle/Janus Henderson/Solana/Coca-Cola and Coinbase/Robinhood sources from v3. Each source supports its actual claim; do not cite the broad homepage as proof of a particular event or API capability. In notes, xStocks has a public event history; Backpack's event ledger remains missing; Ondo's keyed history needs classified event joins. No live production integration is complete for DividendX.

## Delivery

Archive v4 sources and artifacts, preserving existing output links. Deliver `DividendX-phase-two-v5.pptx`, corresponding v5 contact sheet and current contact-sheet alias, all nine final previews, revised narration/source ledger/submission draft and reproducible authoring source. Use the presentations skill and operation marker, private candidate, distinct final export and finalizer. Inspect every slide; Astra independently reviews the result. Do not alter the design prototype or start later implementation phases.
