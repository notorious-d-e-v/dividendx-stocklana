# Annual product: Market / Split / Redeem

16 September 2026. Supersedes single-event copy and client assumptions in [product v1](product-app-v1.md). Preserve its approved typography, spacing, company/token hierarchy, illustrations, responsive layout and simple navigation. `/rehearsal/` retains the original historical one-event flow.

## Main product

Choose the company, exact issued stock token and annual year. Show `2027 · Jan–Dec` plus issuer, not an unexplained event ID. Display `PT-KOx-2027` and `DR-KOx-2027` as actual separate claim identities. Other years create separate series and balances. No quarterly or midyear-deposit option in this version.

Split copy:

- **Stock exposure:** “Keep the stock exposure after this year's dividends are separated.”
- **Dividend rights:** “Collect this year's qualified dividends, paid in KOx.”
- **Deposit cutoff:** “Split before January 1. After that, trade existing tokens or combine matching pairs.”
- **Denomination:** “Both tokens redeem in KOx. Their dollar value can change.”

Equal minted token quantities are not equal payout values. Details explain raw versus displayed units and exact identity. Before dividends arrive, do not show a historical one-event allocation as a guaranteed annual forecast. Distinguish accumulated provisional allocation from future estimates and final redeemable amounts.

During the year show “Collecting dividends.” After December 31 show “Year ended · waiting for final dividend records” until finalization. A late payout with an in-year ex-date belongs to the series. Then show “Ready to redeem.” DR remains redeemable without an expiry deadline. No user-facing instruction to run an oracle, attest a journal or replay an event in the production flow.

Allow paired recombination before finalization, including after accrual. Explain “Combine matching PT and DR from the same year to get your stock token back.” Limit to the smaller owned balance. After finalization, redeem each side separately and show stock tokens returned. Zero-value DR closure must be a separate clearly consented action; never disguise it as a positive payout.

Unsupported actions, unresolved corrections and unavailable collateral have distinct status copy. Stale data is not cancellation. A correction can change the provisional total until finalization. Technical source records stay under Details & sources.

## Local annual preview

The root product may use the annual reference model with seeded balances, a replay clock and explicit test attestations. It must say no tokens or transactions are onchain. Optional controls belong in the collapsed preview panel, with distinct actions for starting the year, recording an event, reaching maturity and finalizing the test journal.

The existing KOx/MU source fixtures supply real historical factors but lack verified ex-dates. If mapped into a test term, label “Historical factors · test term dates” and “One sourced dividend example, not a complete annual payout or a 2027 forecast.” Preserve original source dates under details. A second/multiple-event scenario is explicitly synthetic. Never rewrite historical evidence or silently present the test completeness flag as an issuer statement.

The preview demonstrates an annual lifecycle; a sourced one-event replay does not assert complete yearly issuer coverage. Pending assets, including Ondo until evidence qualifies, remain pending. Seeded paid sale must conserve local test cash and DR ownership. Transfer/trade/liquidity capabilities remain disabled until their actual onchain integration exists.

Browser acceptance is in the [annual matrix](annual-series-tests.md). Updating this product does not update the user's narration or regenerate approved slides; annual pitch wording is tracked separately for the next export.
