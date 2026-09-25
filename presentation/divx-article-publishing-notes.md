# DivX article publishing notes

22 September 2026. Draft only; no article or social post has been published. The previous user-edited article is preserved in [the archive](build/archive/divx-article-before-ecosystem-pass-2026-09-22.md).

## Suggested media order

1. **Optional opening video:** Immediately after the title and Stocklana byline, before the opening paragraph. Aim for 30–60 seconds showing stock selection, split, dividend allocation and a DR trade. Keep the sandbox label visible. Suggested caption: “A walkthrough of DivX using synthetic assets in the guided sandbox.”
2. **“Start where the activity is” illustration:** After the paragraph beginning “We're starting on Solana…”, before the explanation of depositing 100 stocks. Use [why-solana-v1.jpg](../design/illustrations/social/why-solana-v1.jpg). Caption: “Start where stock-token trading is happening. Source: Galaxy Research, Q2 2026.” Preserve the dated qualifier and source printed on the graphic.
3. **Counted vault illustration:** Immediately after the two bullets describing 100 PT and 100 DR. Use [deposit-split-counts-v2.jpg](../design/illustrations/social/deposit-split-counts-v2.jpg). Caption: “100 stock tokens stay in the vault. The holder receives 100 PT and 100 DR, representing different rights to that backing.” Alt text: “A DivX vault holds 100 stock tokens. Arrows lead to 100 blue principal tokens and 100 amber annual dividend-right tokens.” Equal token counts do not mean equal dollar values.
4. **Alternate vault illustration:** Use [deposit-split-v1.jpg](../design/illustrations/social/deposit-split-v1.jpg) as the article cover or video thumbnail. The two vault graphics explain the same operation, so the recommendation is to use only the counted one inline. If both must appear in the body, put the alternate just before “Once PT and DR exist…” as the transition to composability, rather than beside the counted version.

The Markdown draft contains invisible HTML comments marking the video and two inline images. Replace those markers with the media in the publishing editor. For the blog, upload the assets to its media library rather than using local filesystem paths.

## Tags and links

The article includes linked first mentions of `@solana`, `@xStocksFi`, `@Backpack` and `@OndoFinance`. In X's editor, select the intended account if a native mention is desired; pasted Markdown links may need reformatting. The blog can retain the linked handles. Naming an issuer or protocol does not assert a partnership or endorsement.

- Hackathon name: **Stocklana**. [Official event](https://hackathons.solana.com/hackathons/stocklana).
- [Public devnet app](https://dividendx.payai.network/app/).
- [Accelerated guided demo](https://dividendx.payai.network/demos/).
- [DivX program on Solscan](https://solscan.io/account/2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE?cluster=devnet). The required query is lowercase `cluster=devnet`. Address checked against the repository's accepted devnet evidence.
- [Repository](https://github.com/notorious-d-e-v/dividendx-stocklana).

## Numbers and integration boundaries

- Eurex's 21 million traded contracts and €63 billion capital value of open positions describe different measures in 2024. Neither measures available AMM liquidity. [Eurex release](https://www.eurex.com/ex-en/find/news-center/news/Eurex-dividend-options-received-CFTC-approval-for-trading-in-the-U.S.--4248358).
- The Meteora example is arithmetic, not a demand estimate: 50,000 DR × 2 USDC + 100,000 USDC = 200,000 USDC of marked pool assets, assuming USDC at $1. It is not a claim of $200,000 executable depth at one price or a DR dividend forecast. LP price ranges, inventory and market conditions determine actual execution.
- Streamflow's 10,000 DR / 20,000 USDC order and Jupiter's $100 monthly purchase are illustrative future use cases. No expected return is asserted.
- The Galaxy figure means Solana reached above 95% of tokenized-equity trading during Q2 2026. It is not a current share, quarterly average or claim about all RWA liquidity. [Report](https://www.galaxy.com/insights/research/solana-q2-2026-report-tokenized-economy-dex-rwa-stablecoins).
- Raydium has genuine program transaction evidence with test assets. The guided sandbox uses an isolated chain; the separately verified public-devnet round trip is a different proof. Other named integrations are proposed and subject to token eligibility, liquidity and protocol requirements. Jupiter routing seeks best execution but cannot guarantee it.
- Annual DR stops accruing at the term boundary and remains redeemable for its final allocation. A multi-year DCA or rolling product needs explicit year selection; locking claim tokens does not itself pay or stream issuer dividends.
- The closing roadmap acknowledges the remaining data, custody, settlement, security, operational, legal and liquidity work. [Mainnet readiness](../planning/mainnet-readiness-2026-09-20.md) remains the detailed reference.
