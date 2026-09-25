# Pitch revision: Solana issuer scope

Astra brief, 16 September 2026. Supersedes the earlier xStocks-only revision, archived in `planning/archive/xstocks-only-2026-09-16/`. Preserve exactly nine editable slides and the approved visual system. Sol owns only `presentation/**`; Astra owns this specification and research.

## Message

**DivX is a shared dividend market for tokenized stocks on Solana.** xStocks, Backpack and Ondo belong in the initial integration scope. A shared engine and issuer data readers provide the architecture from day one. Do not claim every Solana stock token is automatically usable or already integrated: permissioned shares, tokens without dividend rights and missing event data are real exceptions.

Keep direct product language, concrete traditional participants, fractional ownership/auditability and the Coca-Cola dollar example. The cover still says prototype/concept plus working historical calculator. Slide 8 still distinguishes the existing calculator from next-stage vault execution. No production vault, issuer partnership, executed trade or completed multi-issuer settlement is implied.

## Narration

### 1 — DivX

DivX lets a stock holder keep the stock exposure and sell the dividend rights. We are building a shared dividend market for tokenized stocks on Solana, with xStocks, Backpack and Ondo in the initial integration scope.

### 2 — Two sides of one trade

Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DivX brings that choice to tokenized-stock holders: keep the stock exposure and sell the dividend rights.

### 3 — One deposit, two claims

One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Each pair is backed by its own stock-token collateral and redeems in that token. Its dollar value can change.

### 4 — Established markets, familiar behavior

Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DivX connects those two ideas.

### 5 — Tokenized stocks bring the collateral onchain

Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. Our starting market is dividend-paying stock tokens on Solana, across issuers.

### 6 — One workflow across issuers

Solana lets assets from different issuers use the same vault design. Each issuer's dividend data feeds common allocation rules. One transaction deposits collateral and creates both claims. We enable each stock after verifying its dividend data and transfer requirements, while keeping each issuer's collateral separate.

### 7 — Fractional ownership and auditability

Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. Other Solana applications can integrate the same claim interface.

### 8 — Coca-Cola, in dollars

Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

### 9 — Solana issuers first

The hackathon target is one complete flow across supported Solana stock tokens: deposit, split, sell the dividend, redeem each side separately. We build for xStocks, Backpack and Ondo now. Other networks come later, including Coinbase on Base and Robinhood Chain, with Solana as our home base for dividend liquidity.

## On-slide changes

**1:** Keep approved dark cover, original mark and headline. Subline: **A dividend market for tokenized stocks on Solana.** Keep current-build labels. Narration introduces the three initial families; no crowded logo strip.

**2:** Preserve traditional bank/Survista evidence and directional trade diagram. Replace xStock-holder wording in notes with tokenized-stock holder. Keep named institutions clearly in the traditional market, not as our customers.

**3:** Change input label from xStock to **Stock token**. Main line: **Each pair of claims has its own locked collateral.** Qualifier: **Redeems in the deposited stock token. Dollar value can change.** Retain editable deposit/vault/PT/DR diagram and scheme proportions. Notes explain issuer/mint/event isolation, reinvested-token settlement and shared Scaled UI allocation. No third wrapper token.

**4:** Preserve reviewed metrics, units, years and composition. Pendle normalization supports our analogy, not a claim that it cannot handle equities or that stocks will necessarily exceed its volume.

**5:** Preserve $1.75T / $2.92B and existing metric scope note. Change starting market to **Dividend-paying stock tokens on Solana**. Short supporting line: **Initial scope: xStocks, Backpack and Ondo**. This is integration scope, not a supported-token inventory or three-partner announcement. $2.92B was independently reconfirmed on RWA.xyz during this revision and remains global, not Solana-only.

**6:** Title **One workflow across issuers**. Preserve the open three-row style using:

- **Multiple issuers** — xStocks, Backpack and Ondo feed one vault design.
- **Atomic issuance** — Deposit collateral and issue both claims together.
- **Separate ownership** — Transfer and redeem each claim under common rules.

Footer: **Each stock needs verified dividend data and transfer compatibility.** Notes: all three observed families use Token-2022 Scaled UI Amount; accounting can be shared, but each issuer's event reader and custody requirements differ. Exact mint/decimals and issuer authority controls remain pinned. A shared engine does not pool collateral, make issuer claims fungible or guarantee liquidity. Superstate and other restricted/no-dividend/fee-bearing products are not automatically enabled. Keep technical details in notes rather than add an appendix.

**7:** Preserve fractional ownership and auditability composition. Adjust final line to **A common claim interface for other Solana applications.** Onchain auditability concerns held collateral and program records, not proof of issuer reserves or audit certification. Claim transferability remains subject to the eligible series rules.

**8:** Preserve real screenshot and the exact existing dollar callout. 100 Coca-Cola share-equivalents, approximately $8,935 stock exposure / 100.0000 KOx and $37.10 dividend allocation / 0.4152 KOx. Visible basis **At the event-implied $89.35/share**. Keep **Working now: historical calculator. Next: vault execution.** KOx is the first reference example, not the only intended issuer. No invented Backpack/Ondo event screenshot.

**9:** Title **Solana issuers first**. Preserve simple main flow: **Deposit → split → sell the dividend → redeem separately**. User explicitly requested this flow, so retain it even if a skill generally discourages decorative arrows.

Roadmap rows:

1. **Initial Solana scope:** xStocks · Backpack · Ondo.
2. **More eligible Solana stocks:** Additional assets after dividend and custody checks.
3. **Other networks later:** Coinbase on Base · Robinhood Chain.

Closing line **Solana as the home base for dividend liquidity.** Label as **Build scope and roadmap**. No “then Backpack/Ondo” or “xStocks only” wording remains. Technical notes distinguish current observation from source-verified replay and future live integration.

## Notes and sources

Use `planning/adapter-decision.md`, `planning/plan.md`, the issuer reports in `planning/research/` (Ondo report may temporarily be at `planning/ondo-solana.md`), existing participant/dollar evidence, and these parent-reviewed primary sources:

- https://docs.xstocks.fi/developers/multipliers
- https://docs.xstocks.fi/apis/openapi/corporate-actions
- https://learn.backpack.exchange/blog/tokenized-micron-mu
- https://docs.ondo.finance/ondo-stocks/corporate-actions
- https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset
- https://github.com/ondoprotocol/global-markets-solana
- https://investor.galaxy.com/ir-resources/tokenized-glxy-shares
- https://app.rwa.xyz/stocks

Retain existing CME/Eurex/Pendle/Janus Henderson/Solana/Coca-Cola and Coinbase/Robinhood sources from v3. Each source supports its actual claim; do not cite the broad homepage as proof of a particular event or API capability. In notes, xStocks has a public event history; Backpack's event ledger remains missing; Ondo's keyed history needs classified event joins. No live production integration is complete for DivX.

## Delivery

Archive v3 sources and artifacts, preserving existing output links. Deliver `DivX-phase-two-v4.pptx`, corresponding v4 contact sheet and current contact-sheet alias, all nine final previews, revised narration/source ledger/submission draft and reproducible authoring source. Use the presentations skill and operation marker, private candidate, distinct final export and finalizer. Inspect every slide; Astra independently reviews the result. Do not alter the design prototype or start later implementation phases.
