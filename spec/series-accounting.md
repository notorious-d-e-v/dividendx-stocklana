# Series accounting v1: frontend rehearsal

Frozen by Astra on 16 September 2026 for the frontend phase. This defines a deterministic local rehearsal and the contract to carry into the program phase. It is not a deployed program or production attestation policy.

**Program handoff update, 16 September:** preserve this implemented rehearsal. The [prior-art review](../planning/research/prior-art-review.md) adds requirements that a literal port would miss: unknown future outcomes, authenticated zero/cancelled dividends, full-event entitlement following DR transfers, external SPL burns, explicit zero-output closure, and chain factor conformance. Its handoff gates must be resolved in the separate program contract before implementation. In particular, the zero-dividend rejection and known-at-deposit fixture M1 below are rehearsal behavior, not the intended future live lifecycle.

## Identity and trust

A series holds one issuer, exact mint and classified event. Only paired Stock exposure (PT) and Dividend rights (DR) circulate. Each deposited raw collateral unit creates one raw unit of each claim. Neither claim is a scaled stock balance or a promise of fixed dollars.

Use the 15-mint selected catalog, with exactly two frozen rehearsal events: KOx from the issuer API and Backpack MU from the documented onchain reconstruction. Ondo and other catalog entries remain observation-only until their event fixtures qualify. Preserve original event time, snapshot time and source digests. The local replay clock is explicitly separate from historical time. A historical replay never accepts a real deposit or establishes past entitlement.

The frozen event is the rehearsal's trusted input. KOx's issuer status remains Initial; Backpack has no issuer revision/finality contract. Neither becomes production-final because the rehearsal succeeds. No live series is enabled by this phase.

## Exact amounts

Use BigInt for ledger quantities and integer rational arithmetic for decimal factors. Accept unsigned plain decimal strings only, with at most the collateral mint's decimals for the stock input. Reject signs, exponent notation, nonfinite values, empty input, excess precision and raw amounts above u64. Zero is a valid preview, but not a transaction. Reject positive deposits smaller than one raw unit. Factors are positive plain decimals with at most 18 fractional digits and bounded length. Never convert a ledger quantity through Number.

For stock-equivalent input A, decimals d and frozen pre-event factor M0:

`Q = floor(A * 10^d / M0)`

For a classified isolated cash dividend with M1 >= M0:

`DR_pool = floor(Q * (M1 - M0) / M1)`

`PT_pool = Q - DR_pool`

The formula uses exact rational representations of the recorded decimal strings. UI display rounding is separate from ledger arithmetic. The later program must use the same canonical bounded factor contract and reconcile it with the mint's IEEE-754 storage before deployment; this rehearsal does not assert byte-level Token-2022 conformance.

The stock input describes pre-event equivalents. The result displays allocated collateral at M1, while claim quantities remain unscaled. During the historical rehearsal, wallet collateral uses M0 before activation and M1 after activation, never the catalog's later snapshot multiplier. Claim balances should normally be described as a percentage of the series or redeemable stock equivalents; raw claim units belong in the inspector. Full-balance actions use the exact raw balance, never a rounded display string.

KOx default 100: Q=9,819,982,084; PT=9,779,376,057; DR=40,606,027. Display approximately 100.0000 KOx and 0.4152 KOx after the event. Optional dollar context uses the labeled historical event-implied $89.35 per share. A seeded sale price is a separate test-USDC amount. Backpack has no verified net reinvestment price here, so omit its dollar valuation.

## Lifecycle and custody

States: open, closed, settled, complete, cancelled. Deposit opens a series if its fixture exists and debits the holder's seeded demo collateral, increasing accounted custody Q and both claim balances equally. Further deposits share the same pre-event baseline and are allowed only while open. Reject deposits that leave a zero raw dividend pool, and partial recombinations that would leave positive collateral with a zero dividend pool. Zero-value previews remain valid. The local replay clock starts before the event. Closing deposits advances it to the event and permanently blocks further deposits. Settlement requires a closed series and the exact pinned fixture ID, asset, revision and factors.

An unsupported/reverse-split event, missing source, stale input, changed baseline or contradictory event blocks deposit or settlement as applicable. Never count an unexplained multiplier change as a dividend. Backpack uses the exact DividendDistribute M1, not its later current factor. Paused collateral blocks custody movements. Issuer controls remain visible in the inspector; source snapshots do not establish current custody permission.

Before settlement, burning equal PT and DR units held by the same account returns that many raw collateral units and reduces Q and both supplies. A holder who sold DR cannot withdraw its backing with PT alone. Fully recombining cancels the series. After settlement, recombination is disabled and each side redeems independently.

Settlement freezes Q, both pools and original supply S=Q once. Subsequent factors never recalculate pools. Both claims continue to represent underlying stock tokens whose dollar value changes. Actual vault balance and accounted collateral are distinct; donations never mint claims, increase dividend yield or enter pools. Unexpected deficits block custody operations. Excess collateral stays outside redemption accounting, with production recovery deferred to program review.

## Fractional redemption and rounding

For one side with original pool P, original claim supply S, cumulative burned claims B, and burn amount b:

`payout = floor((B + b) * P / S) - floor(B * P / S)`

Then B increases by b and the side's remaining pool decreases by payout. This cumulative rule telescopes: burning all S pays exactly P without orphaned dust. Each call differs from its exact proportional amount by less than one raw collateral unit. Which call receives a rounding unit can depend on order; do not claim perfect per-holder order independence. Total payout is order independent. Zero-payout burns require an explicit error instead of silently destroying claims; users may combine a larger amount or redeem their full balance if it yields a nonzero payout. The rehearsal rejects zero-dividend settlement. Production needs a reviewed consolidation or explicit zero-value closure path for arbitrarily small fragmented claims; this frontend is not proof that that recovery path exists.

Redemption validates ownership and side balances, burns only the requesting wallet's claims, credits underlying collateral to that wallet, and cannot exceed its side's remaining pool. Complete means both supplies and both pools are zero. Test partial redemption, reversed order and conservation. No early release of the other side's pool.

## Two-account sale

Seed a seller with 1,000 pre-event stock equivalents of each replay asset and a buyer with 1,000 test USDC. Test USDC has six decimals; seller starts with zero. These are local demo balances, not addresses or funded wallets.

A sale quote pins series, seller, buyer, positive DR quantity, positive total test-USDC consideration, current state version and expiry. The SDK stores the quote and accepts its ID, revalidating balances, phase, conditions and version. Execution atomically debits buyer cash and seller DR, credits seller cash and buyer DR, then consumes the quote. A rejection, expired/stale quote or insufficient balance changes neither wallet. This is a sale, not a free transfer. The UI must state that the offer is seeded demo data and distinguish sale proceeds from eventual dividend redemption.

## Recovery and persistence

Stale evidence blocks new deposits and settlement. It does not rewrite a frozen settled allocation. Paused collateral blocks redemption as well as deposit/recombination. Rejected operations leave balances and receipts unchanged. The local SDK returns copies of state so UI edits cannot mutate its ledger. Rehearsal state is in memory; refresh/reset starts over and is disclosed. No wallet extension, signature request, mainnet transaction, API key or external publication belongs in this phase.

Reference for raw transfers and UI conversions: [Solana Scaled UI Amount integration guide](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide), checked 16 September 2026. Existing issuer evidence remains dated and is not refreshed by a frontend action.
