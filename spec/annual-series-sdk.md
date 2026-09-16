# Annual reference and future transaction SDK

16 September 2026. Canonical economics: [annual accounting](annual-series-accounting.md). Preserve `packages/sdk/src/index.ts` and the [legacy SDK contract](sdk-interface.md) for `/rehearsal/`; they still equate an event with a series.

## Executable reference

`packages/sdk/src/annual-reference.ts` exports `AnnualReferenceModel`, collision-safe `annualSeriesId`, typed identities, events, rational indices, snapshots and errors. It is a local arithmetic model with trusted inputs. Its `collateralRaw` account field counts collateral returned from custody; `deposit` represents an external inflow. A UI session must separately debit its seeded spendable wallet balance. Neither object is an onchain wallet.

`AnnualTermIdentity` binds `chain`, `issuer`, `mint`, `symbol`, `year`. Constructor `new AnnualReferenceModel(term, accountIds)` creates an isolated empty series with UTC year boundaries and named PT/DR. The authoritative onchain equivalent also needs reference market/timezone, token policy, attestor, rules version and addresses.

`AnnualEventRecord` includes stable `id`, monotonic `revision`, chain/issuer/mint, nullable validated `exDate`, `qualified | confirmed_zero | cancelled | pending | unsupported`, exact decimal `m0/m1` and a trusted `finalized` flag. The actual issuer-reader/program record must additionally preserve source digest, action taxonomy, observed slot, original dates, source revision identity and completeness/finality evidence. Missing fields in this reference are not evidence that production can omit them.

| Reference method | Contract |
|---|---|
| `getState()` | Deep snapshot of identity, custody, accounts, journal, supplies and final pools. |
| `currentIndex()` / `previewAllocation()` | Exact rational aggregate and provisional/final raw allocation. Before finalization, not a guaranteed future payout. |
| `deposit(account, raw, nowSeconds)` | Positive raw inflow and paired issuance strictly before year start; check solvency and custody. |
| `recordEvent(record)` | Validate identity/revision; replace or idempotently repeat before finalization. Source authenticity is trusted in this model. |
| `transfer(from, to, side, raw)` | Move the full unredeemed bearer claim, including after finalization. |
| `recombine(account, raw)` | Burn matching PT/DR before finalization; return exact raw collateral and reduce nominal backing. |
| `burn(account, side, raw)` | Model an external SPL burn; preserve corresponding reserve and nominal denominator. |
| `finalize(nowSeconds, ledgerComplete)` | Require maturity, explicit completeness, resolved/final records and solvency; freeze once. The boolean is a test attestation, not a real completeness proof. |
| `previewRedemption(account, side, raw)` / `redeem(account, side, raw, {allowZero?})` | Independent cumulative-rounding redemption; zero-output closure requires consent. |
| `donate(raw)` | Increase actual excess only. |
| `setCustodyBlocked(bool)` / `reportActualCustody(raw)` | Explicit local fault controls; no claim mutation or real authority. |

No clock progression is hidden inside event ingestion. A qualified late delivery may arrive after maturity while the journal is unfinalized. The runtime must use chain time, not a caller-supplied replay clock. The reference supports at most 64 unique event IDs, bounded factor strings and raw u64 quantities; its bigint product precision remains unsuitable as an unreviewed SBF implementation.

## Transaction SDK requirements

Expose term discovery, exact claim/vault identity, deposit eligibility, source completeness, maturity and finalization separately. Provide quotes for split, paired recombination and per-side redemption with raw amounts, expected state/journal version, minimum output and appropriate expiry. Show an indicative annual dividend separately from an executable redemption quote. Never accept a rounded UI string for Max.

Instruction builders must consume signed wallet ownership and verified accounts; no original-depositor entitlement registry. Atomic split includes transfer plus both mints. Atomic redemption includes authorized burn plus collateral transfer. Readers propose/normalize events; only the authorized attestation path updates program records. Mutations fail atomically and signatures/receipts are real only after wallet-backed integration.

UI state should derive `funding`, `collecting`, `matured_pending`, `redeemable` and closed/exception states from time and journal/custody facts. Do not call the first processed dividend “settlement complete.” Keep user actions Split / Use / Combine / Redeem; event ingestion belongs in background processing.

The first annual program implementation must use this multi-event contract. The single-event client is a fallback, not an incremental production starting point that will later receive annual support.
