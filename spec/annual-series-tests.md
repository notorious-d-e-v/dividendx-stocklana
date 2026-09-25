# Annual series acceptance matrix

16 September 2026. Targets [annual accounting](annual-series-accounting.md). These are tests of DivX with controlled assets, not transactions against third-party protocols.

| Area | Required cases |
|---|---|
| Identity | Same ticker across issuer/mint/year/cluster stays isolated; unambiguous series ID and correct `PT-KOx-2027` / `DR-KOx-2027` names; quarterly periods cannot impersonate an annual series. |
| Deposits | Multiple pre-year depositors; exact year-start rejection; no future-final-factor requirement; no mint after first accrual/maturity/cancellation; reject deficit/paused custody atomically. |
| Event set | Four or more dividends, exact duplicate idempotency, conflicting/lower revision rejection, higher revision replacement, distinct identity checks and record cap. |
| Dates | January 1/December 31 inclusion, adjacent years excluded, missing/invalid ex-date, leap dates, exchange civil-date semantics, delayed December payout after January maturity. |
| Accumulation | Product of isolated factors, not sum of single-event pools; fractional accrual that individual-event floor would lose; order-independent reference product; retained-reserve accounting after paired exits. |
| Revisions | Correct amount/factor, revise ex-date across year boundary, cancel one of several events, revise pending to confirmed zero, resolve pending only with qualified evidence; finalization rejects incomplete/unfinal records. |
| Corporate actions | Pure/reverse splits, spinoff, maintenance and unexplained decreases cannot become dividend yield; stopped finalization preserves claims and healthy paired exit. |
| Ownership | DR transfers before/between events and after maturity/finalization move accrued entitlement; former owner cannot claim it; a seller without DR cannot recover its backing with PT alone. |
| Recombination | Partial/full matching pairs before events, after one of four events and during matured-pending state; returns exact raw collateral, preserves remaining claim ratios and aggregate backing. |
| Finalization | Year end alone does not enable redemption; missing event/completeness proof blocks; no event with a next-year ex-date added; qualifying late events included; freeze accepted set/pools once. |
| Redemption | PT/DR independently, partial burns, permuted ownership/order, seeded randomized partitions; payouts never exceed pools and full nominal redemption telescopes exactly. |
| Zero and fragments | Zero annual DR remains a valid closed outcome; explicit zero-value consent; no silent fractional destruction; tiny fragments can consolidate or knowingly close. |
| Reserves | External burns before/after finalization never inflate survivors' rates; donations/excess excluded; AMM/lost claims do not block valid holders or permit sweeps; deficits/failures preserve claims. |
| Sources | Real KOx/MU factor regressions; their test ex-dates are explicit synthetic data until source-qualified. No invented annual history, 2027 payout or source finality. |
| Program conformance | 6/8/9 decimals, exact stored multiplier representation, arithmetic bounds and compute budget, clock/PDA/mint/authority/replay checks, actual token transfers/burns and per-operation policies. |
| UI | Annual identities; funding→collecting→matured pending→redeemable; accumulated versus forecast value; no first-event redemption, no expiry forfeiture; clear test timing; preserve `/rehearsal/`. |

Executable reference coverage is in `packages/sdk/test/annual-reference.test.ts`; legacy SDK tests remain separate. Reference tests do not establish program conformance, event-source authenticity or complete annual history. The program work order must implement those additional cases from its first version, even if the filmed demo processes only one sourced historical event.
