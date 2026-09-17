# Issuer handling and annual dividend vaults

Decision: 16 September 2026. The user replaces one-event DR with fixed calendar-year series and explicitly chooses deposits closing at the start of the year. This is the current architecture; earlier revisions remain in Git and archived research. It describes intended program behavior, not deployed functionality.

## Decision

Build one dividend layer for selected stock tokens on Solana, initially xStocks, Backpack/Trek and Ondo. Use **one shared ScaledReinvestmentAnnualV1 program**, small issuer readers, internal normalization and isolated custody for each exact issuer/mint/year. Issue only ordinary transferable PT and DR; no third circulating wrapper or arbitrary adapter CPI plugin.

A KOx 2027 deposit issues `PT-KOx-2027` and `DR-KOx-2027`. DR accumulates every qualified ordinary reinvested dividend whose official exchange ex-date is in 2027. Its whole unredeemed entitlement follows the token. Maturity closes the eligible date window; finalization waits for a complete resolved journal, then both claims redeem independently without forfeiture. Quarterly terms are later work.

The authoritative contract is [annual accounting](../spec/annual-series-accounting.md), with [SDK/reference requirements](../spec/annual-series-sdk.md), [test matrix](../spec/annual-series-tests.md) and [product copy](../spec/annual-product.md). The legacy SDK and `/rehearsal/` are preserved single-event examples and must not become the production contract by accident.

## Admission and access

Admission remains per asset, using the [selected package](research/initial-asset-package.md). An official mint, Scaled UI Amount extension or catalog listing does not prove usable event data, ordinary vault custody or redemption. The product admits ordinary secondary-transfer/reinvestment profiles; permissioned holder/approved-vault integrations, products without dividend rights and discontinued products remain excluded.

Permissionless describes holder access to admitted series: no DividendX holder allowlist or issuer-specific vault onboarding. It does not remove issuer controls or establish legal eligibility. If ordinary custody needs issuer approval, exclude the asset. Direct issuer issuance/redemption onboarding is outside this flow. Cross-chain custody and bridging remain later work; native Solana Ondo is in the selected scope.

## Layers

| Layer | Responsibility |
|---|---|
| Asset policy | Official issuer/mint provenance, token program, decimals, dividend rights, reference market/timezone, extensions/authorities, custody policy and evidence status |
| Issuer reader | Source-specific corporate actions, ex-date joins, immutable history, revisions, classification and completeness evidence; keyed access stays server-side |
| Shared token checks | Exact mint, raw custody, effective/pending scale by chain time and per-operation pause/freeze/hook/fee rules |
| Annual series | Exact issuer/mint/year identity, pre-year deposits, paired claims, cumulative eligible events, recombination, maturity, finalization and independent redemption |
| SDK/UI | Same annual identity and raw amount model, state-aware quotes and simple Split / Use / Combine / Redeem actions |

Only readers/attestors classify events; a current mint state cannot explain every historical factor change. The program checks authenticated series/event inputs, identity, time and permitted mint state. The attestor is an explicit trust boundary, not a trustless oracle or custody owner. Claims of complete annual event coverage need evidence beyond a list of records already fetched.

## Qualification implementation boundary

The [unsigned dossier v1](../spec/issuer-qualification-v1.md) consumes saved observations and candidate source evidence. It validates identities, source revisions, company-date links and current raw mint consistency while preserving unresolved gates. V1 is always blocked and unsigned: no inferred finality, approval override, EventInput builder or settlement writer. This lets operator tooling progress while the issuer contract remains unresolved. An issuer response and a separately reviewed attestation policy are needed before adding an approval-capable path.

Ordinary secondary custody is distinct from direct issuer issuance/redemption. Public xStocks documentation supports permissionless secondary transfers; do not invent a requirement for a special approved-vault agreement. Exact asset controls, PDA custody execution and DividendX admission still require their own review.

## Core accounting and lifecycle

Deposits mint equal raw PT/DR quantities strictly before January 1 UTC. No new issuance after the cutoff, including after zero events or corrections. Let remaining accounted raw collateral be Q and R the product of each accepted eligible event's M0/M1. Cumulative DR allocation is `floor(Q × (1 − R))`; PT gets the remainder. Never sum full-deposit single-event allocations or repeatedly round away small dividends.

Before finalization, matching PT+DR return the same raw quantity, including after accrual or during a year-end evidence delay. Retire both claims, reduce Q and recompute provisional pools. A seller missing DR cannot withdraw with PT alone. No independent interim payouts in this version.

Higher authorized revisions replace previous contributions before finalization. Confirmed zero/cancellation removes that event's contribution; missing data does not. Unsupported splits, spinoffs, mergers, non-cash/special distributions, unexplained maintenance or negative deltas stop finalization without destroying claims. A late December dividend paid in January still belongs to the old year. A next-year ex-date does not.

Finalization is separate from maturity. It freezes the accepted journal and raw pools once after all relevant events are resolved. Redeem PT and DR independently with cumulative rounding; neither has a time-based forfeiture. Later corrections cannot retroactively rewrite redeemed pools. A live dispute/finality policy remains a release requirement.

The trusted attestor owns the complete-period assertion. It may derive coverage from a documented exhaustive issuer ledger and reconciled evidence under a versioned cutoff/dispute policy; a bespoke issuer-signed annual certificate is optional. This does not let an operator approve unknown history or infer completeness from elapsed time. The current unsigned review tool has no such approval path.

Ordinary SPL external burns do not reduce the original nominal redemption denominator or raise other holders' payout rates. Abandoned backing, donations and AMM-held claims retain their reserves; no admin sweep. Pause/freeze or deficits can block physical custody; source staleness alone must not prevent a healthy settled redemption or paired exit. Zero-output claim closure requires explicit consent.

Both allocations are paid in the stock token. They retain stock-price and later embedded-return exposure while unredeemed. PT is not dollar protection; DR is not a cash guarantee. Ex-date membership defines the annual dividend allocation, not perpetual isolation of the resulting stock tokens from later returns.

## Issuer-specific boundaries

The three selected families share Scaled UI Amount, but source semantics and custody profiles differ. Keep their evidence and readers separate:

- [xStocks](research/xstocks-solana.md): corporate-action classification and exact revision remain necessary. KOx's source record is Initial, not automatically final.
- [Backpack/Trek](research/backpack-solana.md): MU's frozen DividendDistribute ratio differs from later maintenance-adjusted multipliers. The reconstruction does not supply a durable annual event/finality ledger.
- [Ondo](research/ondo-solana.md): native Solana profiles are in scope, but classified historical dividend and factor binding remain pending.

The preserved KOx/MU fixtures lack explicit verified ex-dates. Use their real factors inside clearly labeled test-term examples until a qualified ex-date join exists; do not relabel activation or payment as ex-date. Annual history completeness is a new requirement beyond the prior one-event evidence. See [annual research](research/annual-dividend-series.md).

Mint checks continue to require ordinary transfers, no active transfer hook, no transfer fee and usable custody accounts. Permanent delegates, pauses/freezes and changed authorities remain explicit issuer risks. Unsupported extension or permission requirements fail according to operation-specific policy rather than a generic assumption of transferability.

## Prior art and implementation scope

Pendle/Spectra support normalization and paired exits; Exponent provides relevant Solana interfaces and source patterns. Pendle already documents stock-related discrete yield. Calendar annual aggregation follows traditional ex-date conventions but differs from Eurex's December-Friday periods and cash settlement. Our transferable annual DR carries all accumulated rights without holding-time forfeiture. See [prior-art review](research/prior-art-review.md) and [annual update](research/annual-dividend-series.md).

Keep ordinary SPL claims and the selected Raydium CPMM test route. An annual series can share one claim market across its events, but every year/issuer/mint remains distinct. General transferability does not create liquidity or prove lending/staking acceptance. Withdraw LP to recover claims before vault redemption; keep backing for claims left in the venue.

The first program version must support multiple events, revisions, zero/cancellation, quarantined actions and annual finalization, even if the filmed demo uses one sourced historical event. Representative mock mints prove code behavior, not actual issuer custody. Live activation still requires qualified annual data, permitted custody, future-event/finality operations and the bounded numerical/authority specification. No extra wrapper, custom AMM, leverage, reward token, automatic cash conversion or cross-chain bridge is added by this change.
