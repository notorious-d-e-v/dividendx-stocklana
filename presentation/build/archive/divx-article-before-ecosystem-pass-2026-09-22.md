# DivX: One stock, two tokens

Owning a dividend-paying stock gives you exposure to its price and the dividends it pays. You might want to keep the stock exposure while selling the right to a year of dividends. Someone else might want to buy those dividend rights.

DivX makes those two sides separately tradable on Solana.

The trade already exists in traditional finance. Banks use dividend contracts to manage risk from their trading books and structured products. Investors buy dividend exposure when they think the market is pricing future payments too cheaply. [CME describes how that market works](https://www.cmegroup.com/articles/2024/trading-dividend-uncertainty.html), and Eurex reported [more than 21 million dividend contracts traded in 2024](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358).

Crypto has a familiar precedent too. [Pendle separates an asset's principal from its future yield](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/YieldTokenization/PT). DivX applies that idea to annual dividend rights backed by stock tokens in a Solana vault. These markets give us confidence in the use case; our implementation still has to earn that confidence through testing and review.

Tokenized stocks make the timing interesting. The collateral can now sit in an onchain vault, and the claims against it can move between wallets and applications. We're building around selected stock tokens from xStocks, Backpack/Trek and Ondo, with separate backing for each issuer, token and year.

We're starting on Solana because stock-token trading is thriving there. According to [Galaxy Research](https://www.galaxy.com/insights/research/solana-q2-2026-report-tokenized-economy-dex-rwa-stablecoins), Solana's share of tokenized-equity trading reached over 95% during Q2 2026. We want to start where the activity is, give that capital more things to do, and attract more of it to Solana.

The basic mechanism is easy to follow. In a simple example, you deposit 100 stock tokens into a vault and receive:

- **100 PT:** Principal tokens representing the stock exposure after the year's dividend rights are separated.
- **100 DR:** Dividend-right tokens representing the position's qualified dividends for that year.

The deposited stock tokens stay in the vault. PT and DR represent different claims on that backing. You decide whether to keep, transfer or trade each side.

For example, a KOx (Coca Cola by xStocks) 2027 series creates `PT-KOx-2027` and `DR-KOx-2027`. KOx is the xStocks token for Coca-Cola. A holder could keep the PT and sell the DR for USDC, receiving money today in exchange for the year's dividend rights. The buyer receives those rights, including any allocation already accumulated by the DR.

Each year has its own series. Deposits close before the year begins, so new deposits cannot dilute dividends already earned. Matching PT and DR from the same series can be recombined to recover their backing. After the year ends and the dividend records are finalized, each side can redeem independently. Accumulated DR rights remain redeemable even after the year ends.

There is an important detail here: some stock tokens reinvest dividends into more stock exposure. [xStocks documents this approach](https://docs.xstocks.fi/developers/multipliers). DivX's claims redeem in the deposited stock token, so the dividend side's dollar value can move with the stock. Its accounting must also distinguish actual dividends from stock splits and other corporate actions. An increase in a displayed balance is not automatically a dividend.

Once PT and DR exist as separate tokens, both can be used by compatible DeFi applications. Developers on Solana can work with the stock side, the dividend side, or a strategy that combines them.

We have already demonstrated a DR (dividend rights) liquidity flow using Raydium's program with test assets:
- a holder supplies liquidity
- another wallet buys DR with USDC
- the holder withdraws liquidity
- both wallets later redeem their respective claims

Further integrations that are possible include:

- **More markets:** PT or DR pools on venues such as [Meteora](https://docs.meteora.ag/get-started), with potential Jupiter routing once eligible liquid markets exist.
- **Fixed-price sales:** Offer dividend rights for an agreed price through [Streamflow escrow](https://docs.streamflow.finance/en/articles/11514590-create-an-order).
- **Locks and vesting:** Use [Jupiter Lock](https://lock.jup.ag/) to distribute PT or DR on a schedule.
- **Shared treasuries:** Manage either token through a [Squads multisig](https://docs.squads.so/main/getting-started/treasury-management-overview).
- **New strategies:** Build baskets of annual dividend rights, products that roll between years, or a single flow that splits a stock token and sells its DR.

Lending comes later: accepting PT or DR as collateral needs reliable pricing, enough liquidity and rules for liquidation and maturity.

Bringing this onchain means fast settlement, fractional positions and auditable records. Payment and token delivery can happen in the same transaction. Anyone can inspect vault balances and token supply, and other applications can build around the same transferable claims. The underlying issuers' controls and restrictions still apply.

Today, DivX has a working Solana program, a public devnet app and an accelerated guided sandbox. The full tour completes 40 confirmed transactions using synthetic assets and dividend events. Before handling real stock tokens, we need complete issuer dividend records, verified custody and payouts for those assets, independent security review, and production monitoring.

[Try the guided demo](https://divx.payai.network/) to split a stock token, see how dividends change the allocation, and follow both sides through a market and redemption. No wallet or real funds are needed.
