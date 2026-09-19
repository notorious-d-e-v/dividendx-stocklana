# Guided tour v4 — three chapters, local review

This revision follows the user's review of [v3](guided-tour-v3.md). Preserve that evidence and the approved design. Run locally until the user approves publication; do not push, deploy, or replace the hosted runtime snapshot.

## Experience

The hero keeps “One tokenized stock. Two separate tokens.” The disclosure uses short bullets: no real funds are involved, and the demo simulates quarterly dividends while fast-forwarding the year. Normal copy uses the selected company name and USDC. Evidence retains exact synthetic mint identities and funding provenance. The hero button only scrolls.

1. **Split and recombine.** Choose Coca-Cola, Micron or IBM and get 100 tokenized stocks in one action. Split into 100 PT and 100 DR, recombine 40 pairs, then the remaining 60. “And back.” uses the hero blue.
2. **See dividends accrue.** Split the returned 100 before the annual cutoff. Record two sample quarterly dividends, moving the stock display multiplier from 1 to 1.01 to 1.02. PT and DR counts stay unchanged. Recombine 40 pairs: the same 40 raw stock units now display as approximately 40.8 stocks. Keep the other 60 pairs for the next chapter. These sample rates are not a company forecast.
3. **Use dividend rights in DeFi.** Supply the remaining DR to Raydium: 24 DR + 4 USDC initially, then up to 36 DR + 6 USDC. Preserve any tiny DR remainder caused by Raydium LP rounding; recombine it with recovered DR later. A second wallet buys DR with 1 USDC. Withdraw the holder's liquidity and recombine recovered matching claims. Record the remaining two quarterly events and finalize the year; buyer DR and holder PT redeem independently. Purchased DR includes the term's accrued entitlement as well as subsequent qualified dividends. Locked pool residue remains backed.

Each chapter keeps relevant balances near the action and provides a clear way to inspect wallet changes and continue. Avoid forced scrolling after every transaction. Preserve keyboard access, reduced motion, mobile layout, the restart action and noninteractive future-demo list. Remove the public-devnet verification box from the learning flow; detailed proof belongs in evidence.

## Accounting and state

Keep one 2027 issuer/mint/year series and one monotonically advancing clock. All deposits happen before January 1. Carry existing PT/DR into the liquidity chapter; do not reopen deposits, rewind time or silently replace the series. Dividend recombination returns underlying raw collateral whose displayed amount includes the multiplier. Stock already outside the vault also follows later multiplier changes.

Schema version 4 applies to state, receipts, client, broker and gateway. `/start` creates and funds the selected profile with one user request and observed transactions, then offers `core-split`. The 15 subsequent steps are:

`core-split`, `core-recombine-partial`, `core-recombine-rest`, `dividend-split`, `dividend-quarter-one`, `dividend-quarter-two`, `dividend-recombine`, `create-pool`, `add-liquidity`, `buy-dr`, `remove-liquidity`, `recombine`, `settle-year`, `redeem-buyer`, `redeem-provider`.

Keep exact revision/session checks, reconciliation without automatic mutation replay, and coherent observed balances. Preserve 8/6/9 stock and claim decimals. No program, SDK, issuer qualification, venue or public-funding changes are required.

## Acceptance

Verify actual compiled-program execution for all three profiles, exact core and dividend recombination, chronological four-event settlement, and final backing. Run the full browser regression suite and one unmocked Chrome journey with independent RPC confirmation, desktop/mobile captures, one request per action and reload continuity. Preserve previous evidence and user-modified images.

A future release needs a matching v4 runtime snapshot and coordinated frontend/gateway/broker publication. The current public v2 snapshot remains unchanged.

## Follow-up copy and feedback review

Keep the same execution contract. Remove the extra Part One introduction and present the PT/DR explanation as two bullets. Use KOx, MU and IBMon, with xStocks, Backpack/Trek and Ondo, as display labels; preserve canonical synthetic identities in the contract and evidence. The picker refers to “your test wallet.”

Briefly nudge “See wallet changes” after each completed action, without continuous animation, focus loss or movement under reduced-motion settings. Add a possible dividend buyer example and highlight the observed USDC returned on withdrawal relative to the fixed 10 USDC contribution. Additional USDC includes proceeds from exchanging DR, so it must not all be described as profit or fee income. Remove the lower-priority PT-trading card from this page; no new integration is introduced.

The buyer illustration follows the established uses of dividend derivatives for dividend exposure and hedging, described by [Eurex](https://www.eurex.com/ex-en/markets/did). It is a possible use case, not evidence that a fund uses DividendX or that its share-settled DR perfectly hedge a cash obligation.
