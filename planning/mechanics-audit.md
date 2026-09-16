# DividendX mechanics audit

> Historical audit: the isolated-event formulas and two-day scope below describe the earlier rehearsal. New program work follows [annual accounting](../spec/annual-series-accounting.md), which compounds accepted event ratios and rounds the annual allocation once. Preserve this file's source evidence and unsupported-action findings.

> Scope update, 16 September 2026: the current multi-issuer plan is [Solana issuer synthesis](solana-issuer-synthesis.md) and [architecture](adapter-decision.md). This file preserves earlier evidence/review; xStocks-only scope or deferral of native Solana Backpack/Ondo is superseded.

**Status:** planning evidence, not implementation. **Access date:** 2026-09-16. The downloaded research note was treated only as a lead. No transactions were made.

Astra independently repeated the public asset, multiplier, corporate-action and Solana mint reads. The timestamped responses are saved in [ko-reference-snapshot.json](ko-reference-snapshot.json), including a later finalized RPC observation at slot `447408928` consistent with the findings below.

## Verdict

The one-event demo is mechanically feasible if it escrows raw KOx, closes deposits before the event, accepts a trusted corporate-action attestation, and fixes raw PT/DR redemption allocations immediately after that event. The product is not a cash-dividend strip: it partitions a fixed raw xStock balance into (a) a price-return-like principal slice and (b) the issuer-realized, net-of-withholding **reinvested KOx share accretion** for one event.

Use the latest completed KOx dividend as an immutable fixture on a mock Token-2022 mint. Mainnet KOx should be observed read-only. A live future KOx event is not established by this audit.

## Primary-source findings

| Finding | Result | Evidence |
|---|---|---|
| Solana raw vs scaled accounting | **Confirmed.** `UIAmount = raw amount × active multiplier`; raw token-account amounts do not change. Applications should calculate and transfer in raw units and convert at the UI edge. | [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount) (undated; accessed 2026-09-16), [integration guide](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide) (undated; accessed 2026-09-16). The guide also warns that conversions use floating point and need not round-trip exactly. |
| Active multiplier selection | **Confirmed and easy to misread.** Before the scheduled timestamp use `multiplier`; at/after it use `newMultiplier`. A parsed mint can continue to expose both fields after activation. | Solana docs above. The KOx RPC read at finalized slot `447407258` exposed old `1.0183317967386898`, new `1.0225601246249238`, effective Unix time `1789432200`; the active value on 2026-09-16 is the new value. |
| xStocks dividends | **Confirmed.** Cash received by the custodian is reinvested in the same stock, net of applicable withholding, and reflected in the multiplier. It is not a separate USDC payment to the token holder. | [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers), marked “last updated 3 weeks ago” when accessed 2026-09-16; [product explanation](https://docs.xstocks.fi/docs/dividends-and-stock-splits), same access date. |
| Splits and reverse splits | **Confirmed.** They also change the same multiplier; forward split increases it and reverse split decreases it. A multiplier delta alone does not identify a dividend. | Same xStocks multiplier guide. |
| Corporate-action API | **Confirmed live, public, and richer than the research note implied.** API v2 exposes history and upcoming endpoints. Records include event ID/version, `caType`, old/new multipliers, gross/net cashflow, withholding, status, and split units where applicable. | [API v2 reference](https://docs.xstocks.fi/apis/openapi) version `2.0.0`, [Corporate Actions schema](https://docs.xstocks.fi/apis/openapi/corporate-actions), and live [KOx history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc), accessed 2026-09-16. |
| KOx availability | **Confirmed suitable for a historical replay.** The official asset API reports a Solana deployment at `XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ`. A direct official Solana RPC read confirmed Token-2022 ownership, eight decimals, Scaled UI Amount, and token symbol/name metadata. | Live [KOx asset record](https://api.xstocks.fi/api/v2/public/assets/KOx), [Solana JSON-RPC endpoint](https://api.mainnet-beta.solana.com) via `getAccountInfo`, accessed 2026-09-16. |
| KOx operational controls | **Confirmed risk.** The mint also has permanent-delegate, pausable, freeze, and mint authorities. A permanent delegate can transfer or burn from any account. A PDA vault does not eliminate issuer control. | RPC read above; [Solana Permanent Delegate](https://solana.com/docs/tokens/extensions/permanent-delegate), undated, accessed 2026-09-16. |

Minimal reproducible live evidence captured on 2026-09-16:

```json
// GET /public/assets/KOx
{"symbol":"KOx","deployments":[{"network":"Solana","address":"XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ"}]}

// GET /public/assets/KOx/multiplier?network=Solana
{"currentMultiplier":1.0225601246249238,"newMultiplier":0,"activationDateTime":0,"reason":null}

// latest node from GET /public/corporate-actions/history?...&symbol=KOx
{"eventId":"75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e","version":2,
 "caType":"CashDividend","effectiveTimeUtc":"2026-09-15T00:30:00.000Z",
 "multiplierOld":"1.0183317967386898","multiplierNew":"1.0225601246249238",
 "grossCashflowUsd":"0.53","netCashflowUsd":"0.371",
 "withholdingTaxRate":"0.3","status":"Initial"}
```

The live [multiplier history endpoint](https://api.xstocks.fi/api/v2/public/assets/KOx/multiplier/history?network=Solana) returned five KOx changes, all labeled `Dividend`, through 2026-09-15. The live [upcoming endpoint](https://api.xstocks.fi/api/v2/public/corporate-actions/upcoming?page=1&pageSize=100&symbol=KOx) unexpectedly returned older `Scheduled` versions of three already-effective 2026 events. Therefore “upcoming” must not by itself authorize settlement; resolve by event ID/version and verify the activated onchain value.

## Correct economic claim and accounting

Let:

- `Q` be raw xStock base units locked at the cutoff;
- `M0` be the active multiplier immediately before the target event;
- `M1` be the active multiplier immediately after it;
- `s` be an attested split factor during the same interval (`1` for the MVP); and
- `d = (M1 / M0) / s` be the dividend-only reinvestment factor.

The post-event raw collateral partition is:

\[
Q_P = Q/d = Q M_0 s/M_1
\]

\[
Q_D = Q-Q_P = Q(1-1/d)
\]

so `Q_P + Q_D = Q`. Existing multiplier history is correctly handled by the ratio; assuming `M0 = 1` is wrong.

For the MVP's pure cash-dividend event (`s = 1`), use fixed-point integer arithmetic and bias rounding dust to PT:

\[
Q_D=\left\lfloor Q(M_1-M_0)/M_1\right\rfloor,\qquad Q_P=Q-Q_D
\]

Do not use JavaScript numbers or onchain floating point for balances or entitlements. The attestor should encode the API's decimal strings at an agreed integer scale; the program should use checked wide-integer multiply/divide.

For the latest KOx fixture, `d ≈ 1.004152210409`. With `Q = 100` unscaled KOx token units (`10,000,000,000` raw base units), the fixed-point formula gives:

- PT receives exactly `9,958,649,592` base units (`99.58649592` KOx);
- DR receives exactly `41,350,408` base units (`0.41350408` KOx);
- conservation is exact at `10,000,000,000` base units. In continuous arithmetic before truncation, the DR slice displays as about `0.4228327886` KO shares, the increase from about `101.8331796739` to `102.2560124625` displayed shares.

A pure 4-for-1 split has `s = 4`, `d = 1`, so `Q_D = 0` and `Q_P = Q`. A reverse split behaves identically economically. Applying `Q(1-M0/M1)` without classifying the event would give a forward split to DR and can produce a negative dividend allocation on a reverse split. Mixed and non-cash events must be rejected in the MVP.

### Claim-token normalization

For one depositor, mint `Q` PT base units and `Q` DR base units for `Q` deposited raw base units. For multiple depositors, allow deposits only while the active multiplier still equals the series snapshot `M0`, and mint each side one-for-one with added raw units. Thus the full supply of each claim is `C = Q`; a claim is a receipt unit for one raw deposit unit, **not one displayed KO share**.

At settlement, freeze `Q_P` and `Q_D` for the entire series. Each claim side redeems pro rata against its fixed pool. Use cumulative redemption accounting and give the final burner that side's residual so complete PT and DR burns return exactly `Q` raw units.

## Limits and contamination

- PT is “price-return-like” only across the targeted event. At settlement it holds the pre-event split-adjusted share count, so its dollar value still moves with KO's market price, including the ex-dividend price move.
- DR is the net reinvested-share increment realized by xStocks. Its value is the raw KOx slice times the market value at redemption. It is not the headline `$0.53`, the API's `$0.371` cash amount, a fixed USD claim, or a prediction of those amounts.
- Once `Q_D` is fixed, a later multiplier update must not increase the **raw** DR allocation. Nevertheless, unredeemed `Q_D` is KOx and therefore continues to receive KO price moves, later dividends, splits, issuer controls, and custody risk. State this as post-settlement xStock ownership. A pure USD dividend requires immediate conversion at the event, which is deferred.
- A maturity-only calculation using `M_maturity/M0` is unsafe: it silently includes every multiplier event before delayed settlement. Target an exact event ID, use that event's old/new values, and freeze allocations after it. For a future fixed-period product, accumulate only eligible classified dividend factors; do not infer them from endpoint multipliers alone.
- Escrow is necessary. Without custody of the raw xStock, the original holder keeps the multiplier benefit while also selling DR, duplicating the economic claim.

## Two-day one-event scope

1. **Real observation:** read the official KOx asset record, the mint's Token-2022 owner/extensions, and the timestamp-selected active multiplier. Display raw balance, scheduled fields, active multiplier, and UI amount separately.
2. **Mock replay:** create a localnet/devnet mock with KOx's eight decimals and Scaled UI Amount. Hard-code the completed event above as a signed fixture. Use one depositor, or multiple deposits only while `M0` is unchanged.
3. **Cutoff:** target the exact event ID; stop issuance before its effective time. xStocks recommends pausing integrations around activation (example: 15 minutes before and after). No early redemption.
4. **Attestation:** accept only `CashDividend`, the highest known event version, non-cancelled status, matching symbol/mint, exact old/new decimal strings, and `M1 > M0`. Cross-check that the timestamp-selected onchain multiplier is `M1` after activation. A scheduled API record is insufficient.
5. **Settlement:** verify vault raw balance `Q` is unchanged, reject any intervening or simultaneous event, compute integer `Q_D` and residual `Q_P`, store both once, then enable burns/redemptions. Never recalculate from a later multiplier.
6. **Demo disclosure:** “DR redeems for the KOx shares created economically by xStocks' net reinvestment for this event. Redeemed KOx remains exposed to KO price and future corporate actions.”

## Minimal feasibility acceptance gate

Proceed beyond a mock only if all of these pass:

- Official asset API address equals the mint read onchain; owner is Token-2022; decimals/extensions and pause state are supported.
- The exact event has a deterministic latest-version/finality policy; corrected/cancelled events cannot settle twice.
- Deposits close before the event and `M0` cannot change within the cohort.
- Event classification comes from an authenticated attestation and independently matches the activated onchain multiplier.
- All arithmetic uses raw integer base units and fixed-point ratios. Tests prove `Q_P + Q_D = Q` for rounding, tiny deposits, maximum deposits, and full redemption.
- Pure dividend succeeds; forward split, reverse split, mixed event, unknown event, multiplier decrease, stale version, timestamp boundary, duplicate processing, and a second event before settlement all abort safely.
- Settlement fixes raw allocations; later multiplier changes cannot alter stored PT/DR raw entitlements.
- UI labels raw receipt units, displayed shares, and settlement assets correctly.
- The issuer's permanent-delegate/freeze/pause powers are accepted as explicit collateral risks.

## Deferred or unproven

- API uptime/SLA, webhook availability, event finality timing, and whether late corrections can arrive after settlement. The docs say a webhook is forthcoming.
- Why the “upcoming” endpoint retained already-effective scheduled versions; production deduplication/version semantics need issuer clarification.
- Handling `StockDividend`, `CashAndStockDividend`, splits combined with cash dividends, mergers, spinoffs, redemptions, rights, and worthless removals.
- Multi-event/fixed-period strips, immediate USDC conversion, price oracle choice, slippage, AMM liquidity, and issuance/redemption against the xStocks primary market.
- Mainnet vault transfer behavior and all Token-2022 extension interactions. The audit made no transfer and proved only read access and metadata state.
- Any live future KOx event. The verified fixture is historical; the demo must not present it as pending.
