# DividendX narration

Approximate running time: 3 minutes. Word count: 375.

**1 — DividendX**  
DividendX lets a stock holder keep the stock exposure and sell the dividend rights. We are building a shared dividend market for tokenized stocks on Solana, with xStocks, Backpack and Ondo in the initial integration scope.

**2 — Two sides of one trade**  
Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DividendX brings that choice to tokenized-stock holders: keep the stock exposure and sell the dividend rights.

**3 — One deposit, two claims**  
One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Each pair is backed by its own stock-token collateral and redeems in that token. Its dollar value can change.

**4 — Established markets, familiar behavior**  
Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DividendX connects those two ideas.

**5 — Tokenized stocks bring the collateral onchain**  
Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. Our starting market is dividend-paying stock tokens on Solana, across issuers.

**6 — One workflow across issuers**  
Solana lets assets from different issuers use the same vault design. Each issuer's dividend data feeds common allocation rules. One transaction deposits collateral and creates both claims. We enable each stock after verifying its dividend data and transfer requirements, while keeping each issuer's collateral separate.

**7 — Fractional ownership and auditability**  
Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. Other Solana applications can integrate the same claim interface.

**8 — Coca-Cola, in dollars**  
Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

**9 — Solana issuers first**  
The hackathon target is one complete flow across supported Solana stock tokens: deposit, split, sell the dividend, redeem each side separately. We build for xStocks, Backpack and Ondo now. Other networks come later, including Coinbase on Base and Robinhood Chain, with Solana as our home base for dividend liquidity.
