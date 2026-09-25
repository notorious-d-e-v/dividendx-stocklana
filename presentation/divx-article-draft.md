# DivX: One stock, two tokens

Built for the [Stocklana hackathon](https://hackathons.solana.com/hackathons/stocklana) on [@solana](https://x.com/solana).

<!-- Optional opening video: short walkthrough of the guided demo. See divx-article-publishing-notes.md. -->

Owning a dividend-paying stock gives you exposure to its price and the dividends it pays. You might want to keep the stock exposure while selling the right to a year of dividends. Someone else might want to buy those dividend rights without buying the stock.

DivX makes those two sides separately tradable on Solana.

The trade already exists in traditional finance. Banks use dividend contracts to manage risk from their trading books and structured products. Investors buy dividend exposure when they think the market is pricing future payments too cheaply. [CME describes how that market works](https://www.cmegroup.com/articles/2024/trading-dividend-uncertainty.html), and Eurex reported [more than 21 million dividend contracts traded in 2024](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358).

Crypto has a familiar precedent too. [Pendle separates an asset's principal from its future yield](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/YieldTokenization/PT). DivX applies that idea to annual dividend rights backed by stock tokens in a Solana vault. These markets give us confidence in the use case; our implementation still has to earn that confidence through testing and review.

Tokenized stocks make the timing interesting. The collateral can now sit in an onchain vault, and the claims against it can move between wallets and applications. We're building around selected stock tokens from xStocks ([@xStocksFi](https://x.com/xStocksFi)), Backpack/Trek ([@Backpack](https://x.com/Backpack)) and Ondo Finance ([@OndoFinance](https://x.com/OndoFinance)), with separate backing for each issuer, token and year.

We're starting on Solana because stock-token trading is thriving there. According to [Galaxy Research](https://www.galaxy.com/insights/research/solana-q2-2026-report-tokenized-economy-dex-rwa-stablecoins), Solana's share of tokenized-equity trading reached over 95% during Q2 2026. We want to start where the activity is, give that capital more things to do, and attract more of it to Solana.

<!-- Image: Start where the activity is. -->

The basic mechanism is easy to follow. In a simple example, you deposit 100 stock tokens into a vault and receive:

- **100 PT:** Principal tokens representing the stock exposure after the year's dividend rights are separated.
- **100 DR:** Dividend-right tokens representing the position's qualified dividends for that year.

<!-- Image: 100 stock tokens in the vault, with 100 PT and 100 DR issued against them. -->

The deposited stock tokens stay in the vault. PT and DR represent different claims on that backing. You decide whether to keep, transfer or trade each side.

For example, a KOx 2027 series creates `PT-KOx-2027` and `DR-KOx-2027`. KOx is the xStocks token for Coca-Cola. A holder could keep the PT and sell the DR for USDC, receiving money today in exchange for the year's dividend rights. The buyer receives those rights, including any allocation already accumulated by the DR.

Each year has its own series. Deposits close before the year begins, so new deposits cannot dilute dividends already earned. Matching PT and DR from the same series can be recombined to recover their backing. After the year ends and the dividend records are finalized, each side can redeem independently. Accumulated DR rights remain redeemable even after the year ends.

There is an important detail here: some stock tokens reinvest dividends into more stock exposure. [xStocks documents this approach](https://docs.xstocks.fi/developers/multipliers). DivX's claims redeem in the deposited stock token, so the dividend side's dollar value can move with the stock. Its accounting must also distinguish actual dividends from stock splits and other corporate actions. An increase in a displayed balance is not automatically a dividend.

Once PT and DR exist as separate tokens, both can be used by compatible DeFi applications. Developers on Solana can work with the stock side, the dividend side, or a strategy that combines them.

There is a substantial traditional market to learn from. Alongside its trading figures, [Eurex reported €63 billion in capital value of open dividend-derivative positions before the December 2024 expiry](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358). That measures contract exposure. Building comparable onchain markets would require attracting buyers, sellers and new liquidity; the figure is no forecast for DivX.

The following protocols show how those markets and other uses could develop. Raydium has been demonstrated with test assets; the other examples are proposed integrations, subject to compatibility and market support.

**Meteora could give each side its own liquidity market.** PT/USDC pools would serve stock-exposure traders; DR/USDC pools would serve dividend investors. [Meteora's DLMM](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/index.mdx) lets LPs concentrate capital around selected prices. For illustration, 50,000 DR priced at 2 USDC each, paired with 100,000 USDC, would represent $200,000 in pool assets. That is hypothetical liquidity, not a dividend forecast. More companies and annual series could bring Meteora a new category of markets.

**Raydium already demonstrates the trading flow.** Our sandbox uses Raydium's program to create a DR/USDC pool, add liquidity, let a second wallet buy DR, and withdraw liquidity before both wallets redeem. A separate public-devnet round trip also passes. Both use test assets. Future PT and DR markets could let holders trade either side while LPs collect fees and take inventory risk.

**Jupiter could connect liquidity across venues.** Once eligible PT and DR markets exist on multiple AMMs, [Jupiter's routing](https://github.com/jup-ag/docs/blob/main/swap/index.mdx) could compare available paths and seek the best execution for a trade. A buyer spending USDC on annual Coca-Cola dividend rights would not need to choose the pool manually. Actual execution would depend on available liquidity, fees and slippage.

**Jupiter could also make dividend investing a recurring habit.** Its [recurring and limit-order tools](https://support.jup.ag/) could let an investor buy $100 of a selected annual DR each month, or buy only below a chosen price. These would purchase existing claims after deposits close. A multi-year strategy would explicitly roll into the next year's DR.

**Streamflow could support fixed-price and OTC sales.** A holder could offer a larger block through a [Streamflow escrow order](https://docs.streamflow.finance/en/articles/11514590-create-an-order): for example, 10,000 DR for 20,000 USDC, available to a particular buyer or the public. The agreed price removes dependence on AMM depth. This is an illustrative sale price, not a promised payout. Streamflow also supports vested delivery.

**Jupiter Lock and Streamflow could schedule token delivery.** A treasury could use [Jupiter Lock](https://lock.jup.ag/) or Streamflow vesting to release PT or DR to recipients over time. The schedule would govern when recipients receive the claim tokens. Dividend allocation would still follow DivX's annual rules, and the design would need to account for redemption after maturity.

**Squads could make either token a shared treasury asset.** A team could hold PT and DR in a [Squads multisig](https://docs.squads.so/main/getting-started/treasury-management-overview), requiring several signers to approve a sale, transfer or redemption. Funds and DAOs could manage stock and dividend exposure separately, with a visible approval history.

**Builders could combine these pieces into new strategies.** A vault could hold dividend rights across several companies and roll into new annual series. Another app could combine splitting and selling DR into one flow, or buy the missing claim needed to recombine a position. Both sides are available for builders to use.

**Lending is a later step.** PT or DR could eventually serve as collateral, but a lending protocol would need reliable price feeds, enough exit liquidity, and rules for liquidation and annual maturity. A transferable token provides the starting point; safe borrowing requires that additional work.

Bringing this onchain means fast settlement, fractional positions and auditable records. Payment and token delivery can happen in the same transaction. Anyone can inspect vault balances and token supply, and other applications can build around the same transferable claims. The underlying issuers' controls and restrictions still apply.

Our Stocklana submission includes a working Solana program, a [public devnet app](https://dividendx.payai.network/app/) and an [accelerated guided sandbox](https://dividendx.payai.network/demos/). The full tour completes 40 confirmed transactions using synthetic assets and dividend events. You can inspect the deployed [DivX program on Solscan Devnet](https://solscan.io/account/2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE?cluster=devnet) and the [source code](https://github.com/notorious-d-e-v/dividendx-stocklana). The sandbox's private-chain transactions are separate from public devnet.

The next work is to turn that tested mechanism into a service for real stock tokens. We need complete issuer dividend records, clear handling of corrections and unusual corporate actions, verified custody and payouts, and a reviewed process for bringing issuer data onchain. Independent security review, production monitoring, issuer-term and legal review, and real market liquidity also remain ahead. These are the steps between our hackathon prototype and a mainnet launch.

[Try the guided demo](https://dividendx.payai.network/) to split a stock token, see how dividends change the allocation, and follow both sides through a market and redemption. No wallet or real funds are needed.
