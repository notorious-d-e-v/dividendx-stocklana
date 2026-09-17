# DeFi demo sequence

17 September 2026. The latest user direction defers all additional DeFi integrations. List them as noninteractive future demos on `/demos/`; prioritize [qualified issuer data and settlement](issuer-settlement-qualification-2026-09-17.md). Earlier plans to build Streamflow or Jupiter next are superseded.

## Completed

The [Test USDC journey](../usdc-demo-review.md) proves the two-wallet DR liquidity, purchase, LP withdrawal, recombination and independent redemption flow on an isolated local chain. It executes genuine programs with synthetic annual events and local funding. The separate public devnet proof ends with paired recombination before the 2027 term. Neither proves live issuer settlement.

## Future guided demos

| Candidate | User story | Qualification before implementation |
|---|---|---|
| Streamflow fixed-price sale | Sell dividend rights at a chosen price | Verify order support for the exact DR mint, quote, expiry, fills and cancellation; execute a round trip |
| Jupiter Lock | Transfer PT or DR through a lock or vesting schedule | Verify program/IDL identity, mint support, recipient claims, cancellation policy and maturity behavior |
| Squads treasury | Manage PT/DR with shared approvals | Verify custody, transaction creation/approval/execution and redemption by the treasury |
| Meteora limit orders | Trade PT/DR at a target price | Qualify the relevant pool, token support, order execution, cancellation and liquidity |
| Jupiter recurring purchases | Buy exposure or dividend rights on a schedule | Check the current product/API custody model, routing, market eligibility and schedule execution |
| Combined split/sale or purchase/recombination | Complete a useful sequence in one flow | Actual route, minimum output, failure handling and accounting; do not assume every step can be atomic |
| Borrow against PT | Borrow while retaining stock exposure | Valuation, reserve admission, oracle, liquidation liquidity and maturity/finalization rules |
| PT trading — lower priority | Trade stock exposure separately | A verified PT market; existing DR evidence does not prove a PT market |

Protocol names identify candidates, not partnerships or delivered integrations. Each flow must pass an actual transaction round trip before becoming playable.

## Jupiter Lock research

Jupiter's [Lock developer documentation](https://developers.jup.ag/docs/lock) describes token vesting, claims, cancellation settings and escrow management. It is a candidate for scheduled token delivery, not evidence of a priced OTC sale. Use [Streamflow's order product](https://docs.streamflow.finance/en/articles/11514590-create-an-order) as the fixed-price sale candidate.

The prior read-only check observed executable devnet program `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn` at slot 499860125 on 17 September 2026, 14:37:51 UTC. That establishes availability, not verified DividendX compatibility or a match between deployed bytecode and an SDK/IDL. The linked original Jupiter Lock GitHub repository returned 404 during research; resolve implementation provenance before using a replacement SDK. No lock transaction was executed.

Locking DR transfers the annual entitlement represented by those tokens. It does not stream underlying dividends as they happen. A recipient first claims unlocked DR, then redeems it through DividendX once that annual series is finalized. A schedule may extend beyond maturity because DR remains redeemable without forfeiture. PT and DR can both be candidates; verify each actual mint and custody path.

## Other references and limits

- [Squads transaction accounts](https://docs.squads.so/main/development/typescript/accounts/transactions): treasury candidate; no DividendX custody execution yet.
- [Meteora limit orders](https://docs.meteora.ag/core-products/dlmm/limit-order): market-specific integration, not automatic support for every new mint.
- [Jupiter Trigger documentation](https://developers.jup.ag/docs/trigger): inspect the selected product's current custody and routing requirements; a recurring-purchase row does not promise a specific API implementation.
- [Kamino asset risk](https://kamino.com/docs/risk/asset-risk): new claim tokens need their own risk assessment. Whole-stock spot price is not a valid substitute for PT or DR value, and a thin AMM alone is not a robust liquidation oracle.

Keep annual issuer/mint/year accounting unchanged. No custom lending program, extra pool, sale, lock or vesting transaction is part of the current work order.
