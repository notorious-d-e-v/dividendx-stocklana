# DividendX narration

Approximate running time: 3 minutes. Word count: about 410.

**1 — DividendX**  
DividendX is a Solana vault we are building to separate one tokenized stock position into stock exposure and the right to its next dividend-derived xStock units.

**2 — Two sides of one trade**  
A holder could sell a dividend claim for cash while retaining stock exposure. A buyer could take the other side for the next verified dividend allocation. These are hypothetical users, and any sale still needs a willing buyer and an agreed price.

**3 — One deposit, two claims**  
One deposit enters a locked vault. The proposed program issues two paired claims: PT for the stock exposure and DR for this event's dividend-derived share. Both claims reconcile to the same xStock collateral, and both redeem in xStock units whose dollar value can change.

**4 — Established markets, familiar behavior**  
Dividend trading already has precedent. Eurex handled more than 21 million dividend contracts in 2024. Pendle reported 96.4 million dollars of average daily trading volume for onchain yield markets in the same year. Those measures show familiar behavior, not proven demand for DividendX.

**5 — Tokenized stocks bring the collateral onchain**  
The wider category is large, but our starting point stays narrow. Global dividends totaled 1.75 trillion dollars in 2024. RWA.xyz displayed 2.92 billion dollars of distributed tokenized-stock value on September 16, 2026. Dividend-paying xStocks on Solana are only a subset.

**6 — What Solana changes**  
Solana gives the proposed vault a shared state for collateral, paired issuance, ownership, and redemption. That can replace manual reconciliation between the two claims. These transaction flows remain planned, and issuer data still matters.

**7 — A stock split is not a dividend**  
Equity accounting is the core distinction. The KOx event is a verified cash dividend. The exact HONx reverse-split event is rejected, because a multiplier change alone cannot identify dividend yield. DividendX checks the issuer event and the onchain multiplier together.

**8 — A real dividend, already inspectable**  
The working software already lets anyone inspect a real historical KOx dividend and calculate its allocation. For one hundred pre-event displayed KOx, it shows one hundred KOx of stock exposure plus 0.4152 KOx of dividend allocation. This is a historical scenario from a dated snapshot. Vault execution comes next.

**9 — One event first**  
The hackathon target is one complete flow with test assets and this historical event: deposit, split, sell the dividend claim, then redeem each side separately. A future live series comes after that. Keep the stock exposure. Sell the dividend rights.
