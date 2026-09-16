# DividendX narration

Approximate running time: 3 minutes. Word count: 373.

**1 — DividendX**  
DividendX is a Solana vault we are building to separate one tokenized stock position into stock exposure and the right to its next dividend-derived xStock units.

**2 — Two sides of one trade**  
Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DividendX brings the same choice to xStock holders: keep the stock exposure and sell the dividend rights.

**3 — One deposit, two claims**  
One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Both claims are backed by the same xStock collateral and redeem in xStock units whose dollar value can change.

**4 — Established markets, familiar behavior**  
Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DividendX connects those two ideas.

**5 — Tokenized stocks bring the collateral onchain**  
Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. We start with dividend-paying xStocks on Solana, then expand to more familiar companies and additional issuers.

**6 — What Solana changes**  
Solana brings collateral and both claims into one shared system. The deposit and paired claims are created together in one transaction. Each owner can transfer and redeem their claim under the same program rules, reducing the separate records and reconciliation needed between counterparties.

**7 — Fractional ownership and auditability**  
Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. The same token standards also make the claims available for other Solana applications to integrate.

**8 — Coca-Cola, in dollars**  
Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

**9 — One event first**  
The hackathon target is one complete flow: deposit, split, sell the dividend, redeem each side separately. Next come Apple, Microsoft and NVIDIA xStocks, then Backpack and Ondo. The longer-term vision reaches Coinbase and Robinhood assets on other networks, with Solana as our home base for dividend liquidity.
