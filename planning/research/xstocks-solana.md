# xStocks on Solana: expanded-scope verification

Astra audit, 16 September 2026. Read-only public registry/API and finalized Solana RPC observations. This report extends the existing KOx event audit; no custody transfer or DividendX settlement has been executed.

## Registry and onchain evidence

The documented [asset registry](https://docs.xstocks.fi/apis/openapi/assets) returned 837 unique symbols across nine pages, each containing a Solana deployment. Five rows had `isTradingHalted=true`. Every row's underlying type was null, so the registry cannot establish a stock-versus-ETF count. Registry membership alone proves neither circulating supply, a dividend, nor DividendX eligibility.

The source requests and complete responses are in [xstocks-scope-2026-09-16.json](../evidence/xstocks-scope-2026-09-16.json), captured beginning 05:34:57 UTC. Representative finalized mint reads at slot 447444236 covered KOx, AAPLx, NVDAx, MSFTx, TSLAx, MUx and SKHYx. Each had eight decimals, Token-2022 ownership, Scaled UI Amount, default initialized accounts, inactive pause, a null transfer-hook program and a permanent delegate. The issuer retains freeze and mutable authority controls. These are observed configurations, not guarantees that controls remain unchanged.

A separate [mint inventory](../evidence/xstocks-mint-inventory-2026-09-16.json) records all 837 mints at finalized slots 447444571–447444737. All existed with nonzero supply, eight decimals, the same extension profile, initialized default accounts, no active pause and no active transfer hook at observation time. This is a token-state inventory, not a set of 837 eligible dividend series. Use the successful responses and recorded slots, never silently treat an RPC error or absent account as an eligible asset.

## Dividend accounting

The issuer [multiplier guide](https://docs.xstocks.fi/developers/multipliers) confirms that raw token quantities stay fixed and the displayed share-equivalent amount uses a multiplier. Both dividends and splits change that multiplier. The [corporate-action API](https://docs.xstocks.fi/apis/openapi/corporate-actions) supplies event classification and old/new multipliers. A Solana-only DividendX vault can hold the original token and allocate its raw units; an additional transferable wrapper is unnecessary.

The latest fetched KOx event is still `75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e`, revision 2, `CashDividend`, effective 15 September 2026 at 00:30 UTC. Its old/new factors are `1.0183317967386898` and `1.0225601246249238`; gross cashflow is $0.53 and net is $0.371 per underlying share. Status remains `Initial`, so record freshness is not a resolved issuer finality policy. The effective onchain value matches the event after applying its activation timestamp. Preserve the previously verified 100-share-equivalent example and dollar valuation.

## Integration decision

Use a shared **scaled reinvestment** accounting function and an xStocks-specific event reader. Pin exact mint, decimals, extension/authority policy, event identity/revision, cohort baseline, event time, source evidence and accepted settlement terms. Evaluate current versus pending multipliers by the chain clock. Reject unclassified, mixed or out-of-order events. Do not derive dividend yield from price movements or a global balance delta.

The reader must deduplicate event versions, avoid treating stale `upcoming` records as future entitlements, preserve company dates separately from issuer activation, and stop settlement on contradictory revisions. Raw collateral accounting and integer conservation remain unchanged by issuer scope expansion.

**Evidence level:** official registry and documentation checked; representative mint state and KOx event cross-checked; full registry mint snapshot recorded separately; no DividendX PDA transfer demonstrated; no live or replay vault settlement yet. More xStocks can reuse the mechanism only after asset and event qualification. The TSLAx mint's unchanged multiplier does not create a dividend to sell.
