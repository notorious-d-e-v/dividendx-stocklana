# DivX narration

Approximate running time: 3 minutes. Word count: 383.

**1 — DivX**<br>
DivX lets a stock holder keep the stock exposure and sell the dividend rights. We are building a permissionless dividend market for tokenized stocks from Backpack, xStocks, and Ondo on Solana.

**2 — Two sides of one trade**  
Traditional finance already has both sides: banks sell dividend exposure to manage risk from structured products; asset managers such as Survista buy discounted dividend futures. DivX brings that choice to tokenized-stock holders: keep the stock exposure and sell the dividend rights.

**3 — One deposit, two claims**  
One deposit enters a locked vault. The program issues two paired claims: PT for the stock exposure and DR for the dividend-derived share. Each pair is backed by its own stock-token collateral and redeems in that token. Its dollar value can change.

**4 — Established markets, familiar behavior**  
This already exists in TradFi. Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume that year. Investors already trade dividends separately, and crypto users already separate yield. DivX connects those two ideas.

**5 — Tokenized stocks bring the collateral onchain**  
Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz reported 2.92 billion dollars of tokenized-stock value on September 16, 2026. Our starting package includes familiar dividend payers such as Apple, Microsoft and Coca-Cola, represented by stock tokens on Solana.

**6 — One workflow across issuers**  
Solana lets stock tokens from different issuers use the same vault design. Each issuer's dividend data feeds common allocation rules. One transaction deposits collateral and creates both claims. Holders use the same deposit, trade and redemption flow, while each issuer's collateral stays separate.

**7 — Fractional ownership and auditability**  
Dividend claims are divisible, so a holder can sell part of an entitlement and a buyer can take a smaller position. Onchain records let users inspect the vault balance, claims outstanding and redemption history. Other Solana applications can integrate the same claim interface.

**8 — Coca-Cola, in dollars**  
Our example uses Coca-Cola, ticker KO, represented on Solana as KOx. For 100 share-equivalents, the historical event separates about 8,935 dollars of stock exposure from 37 dollars and 10 cents of reinvested dividends, valued at the event-implied share price. The calculator makes that allocation inspectable today; vault execution comes next.

**9 — Solana issuers first**  
The hackathon target is one complete flow across supported Solana stock tokens: deposit, split, sell the dividend, redeem each side separately. We start with selected stocks from xStocks, Backpack and Ondo, proving one dividend event per issuer before expanding within the package. Other networks come later, with Solana as our home base for dividend liquidity.
