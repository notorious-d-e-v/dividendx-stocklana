# Annual dividend series: accounting and program contract

Program implementation detail: [program v1](program-v1.md) now pins canonical IEEE-754 multiplier bits, bounded exact arithmetic, account/authority rules, token policy and staged finalization. The decimal-rational reference below remains an economic oracle; comparisons must first convert inputs to the canonical binary representation when asserting chain parity.

16 September 2026. Astra decision after the user requested calendar-year PT/DR and explicitly chose to close deposits when the year starts. This supersedes the one-event architecture for all new implementation. The [old accounting](series-accounting.md) and `/rehearsal/` remain a preserved single-event demonstration.

The executable [annual reference](../packages/sdk/src/annual-reference.ts) validates the arithmetic and lifecycle below. It is trusted-input local code, not a Solana program, issuer integration or a finalized SBF numerical implementation. The remaining program-specific gates are listed at the end.

## Instrument and identity

One series holds one exact **chain/cluster, issuer, stock mint and calendar year**. Its public names are `PT-KOx-2027` and `DR-KOx-2027`; ticker text is never identity. Different issuers, mints, clusters and years have separate custody and claim mints. Onchain identity must use unambiguous fixed-length/hash seeds and a pinned rules version, not a concatenated ticker. The reference uses a validated JSON tuple.

PT owns the remaining stock-token allocation. DR owns the accumulated allocation from every **qualified** dividend whose official reference-market ex-date falls in the year. A DR transfer moves that whole remaining entitlement, including previously accumulated dividends. There is no holder-time weighting, detached seller accrual, streaming withdrawal, expiry burn or forfeiture.

This is a stock-paid annual strip, not a cash-settled dividend future or dollar principal protection. Dividends reinvested inside the collateral continue to have stock-price exposure. The year limits eligible corporate actions; it does not freeze the market value or later embedded returns of unredeemed stock tokens.

## Calendar and deposit policy

For the 2027 series:

- Deposits stop at `2027-01-01T00:00:00Z`, exclusive. A deposit at that instant fails. Each deposited raw unit mints one raw PT and one raw DR. No new issuance during or after the year, including following a cancellation or correction.
- Qualified **civil ex-dates** are `2027-01-01` through `2027-12-31`, inclusive, using the official reference exchange's date. Pin reference market, calendar/timezone and approved ex-date source in the asset/series policy. Do not convert an ex-date into a different year using the viewer's timezone.
- Maturity is `2028-01-01T00:00:00Z`. No event with a 2028 ex-date enters 2027 DR. A qualifying December 2027 dividend delivered or corrected in 2028 still belongs to 2027 and may delay finalization.
- Maturity closes the eligible date window. **Finalization**, which occurs only at or after maturity with a complete resolved journal, freezes pools and enables independent redemption. They are separate transitions.
- A pending event or unavailable reader cannot silently become a zero dividend. No automatic timeout pays all backing to PT or forfeits DR.

Traditional markets establish the ex-date convention; their annual expiry cycles need not be January–December. Our calendar year is an explicit product choice. Quarterly terms and midyear issuance/equalization are deferred. See [exchange research and evidence limits](../planning/research/annual-dividend-series.md).

## Series and event records

Series terms pin identity, start/maturity, token program and decimals, claim/vault addresses, authority/extension policy, dividend taxonomy, rule version, event attestor, source/finality rules and maximum journal size. The program clock determines time; a user cannot submit a historical clock to reopen deposits. Test replay time is explicitly separate from original source time.

An event is a child of a series, not the series ID. Its record includes stable source/event identity, revision, exact asset identity, official ex-date and evidence, action class/status, original effective/payment dates, observed slot/time, exact factor representation, source digest and acceptance state. Preserve superseded revisions for audit while only the latest accepted revision contributes. Normalization can assign a monotonic local revision sequence to sources with nonnumeric revision identifiers, retaining the original identifier.

| Status | Allocation and lifecycle |
|---|---|
| Qualified ordinary cash dividend, reinvested | Apply its isolated, source-qualified positive or unit ratio. It may be accepted provisionally during the year; independent redemption remains unavailable. |
| Confirmed zero or cancelled | Contribution is one (no dividend allocation). This resolves that event, not the entire year. Other qualified dividends continue accumulating. |
| Pending, missing ex-date or unresolved revision | Preserve claims and paired exit; block finalization. Do not label the displayed provisional total as final. |
| Unsupported or unexplained action | Quarantine; block finalization until an approved classification/recovery resolves it. No dividend allocation from the unexplained movement. |
| Classified outside the year | No contribution to this DR. Retain evidence where needed to explain the mint history. |

Initial qualification is **ordinary cash dividends reinvested in the deposited stock token, net of issuer deductions**. Special/extraordinary, non-cash, elective distributions, spinoffs, mergers, pure splits/reverse splits and unexplained supply-maintenance changes do not enter the dividend product. Handling an unsupported action means preserving custody/claims and blocking an unsafe settlement; it does not mean supporting its economics. A later neutral-action transformation needs its own reviewed rule. No high-water or latest-multiplier shortcut.

## Multi-event allocation

Let `Q` be accounted raw collateral still backing nominal paired entitlements, after any paired recombination. Direct holder burns and unsolicited donations do not change `Q`. For each latest accepted, qualified in-year event, let its **isolated dividend factor** be `g_i = M1_i / M0_i >= 1`.

Maintain the exact reference principal-retention ratio:

```
R = product(M0_i / M1_i) = 1 / product(g_i)
DR_pool = floor(Q × (1 − R))
PT_pool = Q − DR_pool
```

An empty, cancelled-only or confirmed-zero journal has `R = 1`, `PT_pool = Q`, `DR_pool = 0`. Mixed qualified and cancelled events use only qualified contributions. The reference reduces rational numerator/denominator by GCD and caps the journal at 64 distinct event IDs. This is an exact mathematical oracle, not an instruction to use unbounded arithmetic onchain.

**Do not add `allocate(Q, M0_i, M1_i)` for every event.** Later dividends release collateral from the remaining principal backing, not repeatedly from the original full position. Do not round each event's dividend to a whole raw unit and then sum; fractional contributions must accumulate before final pool rounding. Interim pool displays are provisional calculations from the current complete ratio, not disbursed reserves.

Example with synthetic integer-friendly factors: deposit `Q=1,000,000`; event factors `1→1.1` and `1.1→1.21` give `R=100/121`, `DR_pool=173,553`, `PT_pool=826,447`. Adding two independently rounded allocations on the full original deposit would incorrectly allocate `181,818` to DR. These numbers are test math, not Coca-Cola dividend history.

When intervening movements are all admitted dividends, the product telescopes to the first/last factor. In general it does **not**: excluded dividends, splits, corrections and maintenance cannot be silently included. An attestor must establish isolated nonoverlapping contributions and coverage of intervening mint changes. Overlapping event IDs for the same underlying entitlement must be rejected by source normalization/policy; distinct strings alone are not proof of distinct income.

The DR reserve's own embedded later returns stay with that reserve. Do not issue a second raw allocation for those same returns. Events outside the year create no new 2027 allocation, although any stock tokens still held retain their later economics. This differs from a fixed cash dividend sum and must remain explicit in product descriptions.

## Recombination during the term

Before finalization, a holder can burn `b` matching PT and DR of the same series and receive exactly `b` raw collateral, including after one or more dividends have accrued or while the matured series awaits evidence. Reduce `Q` and both nominal entitlements by `b`, then recompute provisional pools using the same `R`. Fractional rounding can move less than one raw unit between the retained provisional pools; do not separately round and sum each historical withdrawal.

This exit retires both past accumulated rights and future term rights for those units. A holder who sold DR must reacquire matching DR; PT alone cannot withdraw its backing. Current-owner balances govern, not original-depositor history. Custody impairment may block physical exits, but source staleness alone must not block a healthy paired exit.

After finalization, each side redeems independently. A UI may combine two independent redemption instructions for convenience, but it cannot bypass side accounting or return an assumed one-for-one bundle. No one-sided early withdrawals are enabled in this version.

## Corrections and finalization

Before finalization, a higher authorized revision **replaces** the prior contribution. Recompute `R` from the latest accepted journal; never multiply the corrected event twice. An exact duplicate is idempotent; same-revision conflicting content, lower revisions and wrong identity fail atomically. A correction may change payout, classification, ex-date/year membership or cancellation status. Retain its evidence and affected operation history. A cancelled provisional dividend can reduce DR's displayed accumulated allocation; no side has yet withdrawn it.

A cancellation after an applied issuer factor requires evidence explaining the correction/reversal and its actual economic effect. A bare `Cancelled` label cannot make an unexplained multiplier movement safe. The local reference trusts supplied classification; source readers and program admission must enforce the stronger evidence contract.

Finalization requires:

1. Chain time at/after maturity and no previous finalization.
2. Authorized attestation of the **complete eligible event set**, source/history coverage and accepted revision-set digest; not merely “all events currently in our array.”
3. All relevant records resolved under the pinned finality policy, including late-delivered in-year dividends, cancellations and any unexplained actions. A future feed saying `Initial` or “latest” is insufficient by itself.
4. Valid custody, supported mint state and conserved accounted obligations.

Snapshot `S=Q`, `P_PT`, `P_DR`, accepted journal digest and finalization slot once. No later event or revision changes those pools. A post-finalization correction is a reported settlement dispute, not an automatic clawback, silent ignored success or repricing of remaining holders. No production recovery/insurance is implied; an issuer's revision/finality and dispute policy is a live-release requirement. The prototype explicitly rejects post-finalization amendments and preserves existing claims.

## Redemption, rounding and reserves

After finalization, a valid holder burns either side to receive that side's stock-token allocation. Let original pool be `P`, original nominal denominator `S`, prior program-redeemed claims `B`, and current burn `b`:

```
payout = floor((B + b) × P / S) − floor(B × P / S)
```

This telescopes across partial redemptions. If all nominal claims redeem through the program, total payout equals the full pool. Rounding allocation among calls can vary by less than one raw unit; aggregate conservation is required. Never infer a guarantee that every tiny fragment independently pays a positive raw unit. Zero-output burns require explicit consent, including a confirmed-zero annual DR. Ordinary redemption must not silently discard a positive fractional entitlement.

Ordinary SPL owners can burn claims outside DividendX. Track program redemptions separately; external burns reduce circulating supply, **not** `S` or another holder's exchange rate. Their abandoned backing remains reserved with no sweep. Likewise, AMM-held/lost claims can remain outstanding indefinitely without blocking other valid redemptions. “Complete” cannot require an empty global vault as a condition for exits.

Maintain actual custody separately from accounted obligations and donations. Donations never mint claims or raise dividend yield. No treasury sweep, minting against accidental excess or early-redeemer preference after a deficit. Custody-moving instructions reject insufficient collateral atomically. Transfers of ordinary claims remain possible even while collateral is unavailable; the UI must disclose the status.

## Program boundary and acceptance

One shared ScaledReinvestmentAnnualV1 engine serves selected xStocks, Backpack/Trek and Ondo profiles with source-specific readers. Use ordinary SPL claim mints and isolated Token-2022 custody; no third wrapper, cross-issuer substitution, custom AMM, leverage, streaming payouts or protocol fee in this version. Future quarterly periods require a new explicit term policy, not user-defined dates slipped into an annual ID.

The program design must include separate annual Series, event/revision records, authorized event updates and a post-maturity finalization instruction. Depositing, applying an event, reaching maturity and finalizing are distinct operations. Wallets do not run this pipeline manually; readers/keepers perform evidence processing in the background.

Before Sol's program handoff, Astra must pin bounded factor encoding and arithmetic/overflow/compute limits, reconcile Token-2022 multiplier bytes with fixture decimals, define PDA/account layouts and canonical evidence serialization, distinguish administrator/attestor/custody/upgrade powers, define neutral-action and impairment stop states, and specify the finality/completeness trust contract. Supporting 64 event records does not establish a 64-event single-instruction compute budget; chunking or staged finalization must lock a consistent journal revision.

The [annual SDK/reference contract](annual-series-sdk.md), [annual test matrix](annual-series-tests.md) and [annual product contract](annual-product.md) control new implementation. Existing sourced KOx/MU factors can demonstrate one historical event inside an explicitly synthetic term clock. They do not prove a complete annual issuer dividend history, a verified ex-date or any 2027 forecast.
