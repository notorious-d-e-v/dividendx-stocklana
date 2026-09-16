# DividendX narration: plain-language draft

Approximate running time: 3 minutes. Draft for voice review.

**1 — DividendX**  
A dividend is a payment a company makes to shareholders. DividendX lets a tokenized-stock holder keep the stock price exposure and sell the right to one dividend. We are building it on Solana for selected tokens from Backpack, xStocks, and Ondo.

**2 — Two sides of one trade**  
This trade already has sellers and buyers. Bank trading desks sell dividend exposure to manage payments linked to products they issued. Asset managers buy dividend futures when they think the price is low. Survista is one documented example. DividendX brings that choice onchain.

**3 — One deposit, two claims**  
A holder deposits a stock token in a shared smart-contract vault. The vault creates two tradable claims. PT tracks stock exposure after the dividend is separated. DR represents the dividend. The holder keeps PT and can sell DR. Both redeem in the stock token, so their dollar value changes with its price. DR is not guaranteed cash, and a sold dividend cannot be claimed twice.

**4 — Established markets, familiar behavior**  
This already exists in TradFi. Eurex handled more than 21 million dividend contracts in 2024. Crypto users also trade yield separately. Pendle reported about 96 million dollars in average daily volume that year. DividendX brings both ideas to tokenized stocks.

**5 — Tokenized stocks bring the assets onchain**  
Companies paid 1.75 trillion dollars in global dividends in 2024. Tokenized stocks bring familiar names like Apple, Microsoft, and Coca-Cola onchain. RWA.xyz reported 2.92 billion dollars of tokenized-stock value worldwide on September 16, 2026. Our starting package selects six companies across Backpack, xStocks, and Ondo.

**6 — One workflow across issuers**  
DividendX uses the same flow across those issuers: deposit, split, trade, and redeem. It is designed so the buyer gets the claim and the seller gets paid in one Solana transaction. That supports fast onchain settlement. Each issuer and stock keeps separate collateral, records, and checks.

**7 — Small positions, public records**  
Dividend claims can be divided into small pieces. A holder can sell part of a dividend, and a buyer can take a smaller position. Public records can show the tokens in the vault, open claims, and past redemptions. Other Solana wallets and apps can use the same claims.

**8 — Coca-Cola, in dollars**  
Our calculator uses a historical Coca-Cola event for KOx. For 100 share-equivalents, it shows about 8,935 dollars of stock exposure and 37 dollars and 10 cents of dividend allocation at the same event-implied price of 89 dollars and 35 cents per share. Both are KOx units, not guaranteed cash or live prices. The calculator works today. Vault execution comes next.

**9 — Solana issuers first**  
The target is one complete flow: deposit a supported stock token, split it, sell the dividend claim, and redeem each side separately. We start with selected stocks from Backpack, xStocks, and Ondo, then prove one sourced event for each issuer. Other chains come later. Solana stays the home base.

## What changed

The draft defines dividends early, replaces technical terms with spoken language, and makes the seller, buyer, settlement, fractional-position, public-record, and app-integration benefits concrete. It keeps the current-stage boundary: the historical calculator works now, while vault execution remains the next step.
