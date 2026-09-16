# Prior-art review: architecture and expected features

Decision review by Astra, 16 September 2026, before Solana program implementation. Scope: established yield-tokenization designs, Solana-native yield markets, traditional dividend contracts and directly overlapping equity-strip designs. Primary documentation and selected original code were reviewed; no competitor was transaction-tested, no deployment was certified, and this is not a security audit.

## Conclusion

The evidence supports the existing core: **one shared program, isolated issuer/mint/event vaults, small issuer readers, internal accounting units and two transferable claims**. Keep the approved Market / Split / Redeem experience. The useful changes are sharper claim semantics, an explicit failure lifecycle and a stricter program handoff—not a larger wrapper stack, a continuous-yield engine or a custom AMM.

Research is sufficient to choose that architecture and proceed to a bounded program specification. It is not sufficient to enable live issuer collateral. The remaining gates below are specific engineering and issuer-evidence tasks, not a reason to keep surveying protocols indefinitely.

**Material correction:** Pendle already documents STRCx discrete yield. Its ownership rules differ from our whole-event DR; stock dividends are not an unoccupied category. [Pendle documentation](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/DiscreteYield).

Companion reports:

- [Pendle, Spectra and yield-protocol mechanics](prior-art-yield-protocols.md).
- [Solana yield-market precedents and reuse assessment](prior-art-solana-markets.md).
- [Traditional contracts, direct equity competitors and event handling](prior-art-equity-contracts.md).
- [Existing Raydium feasibility decision](claim-amm-feasibility.md).

| Prior art | What we take | Why we are not adopting the whole system |
|---|---|---|
| Pendle | Normalization, paired custody and clear accounting units | Its term-yield and discrete-distribution contracts have different ownership rules; no native Solana core appears in its current deployment list. |
| Spectra / historical APWine | Adapter boundaries, paired exits and executable redemption previews | ERC-4626/EVM dependencies and accrued-yield state are not our collateral or claim model. |
| Exponent | Native Solana series, vault flags and source-level interface precedent | Yield earning uses owner-linked escrow positions; exact stock support, admission and reusable interface/license scope remain unverified. |
| RateX | Distinguishing normalization, markets and risk controls | Synthetic margin and liquidation machinery is outside a fully collateralized event split; public implementation surfaces are incomplete. |
| EXDATE and other stock-strip designs | Event-specific identity and explicit delivered-outcome rules | Conceptual overlap does not establish deployed correctness or compatible Scaled UI settlement. |
| Exchange dividend contracts | Written dates, dividend definitions and exception policy | Cash-settled period exposure is not our stock-paid single-event claim. |

Evidence and precise source limitations are in the companion reports. No new asset enters our catalog because another protocol lists it; the selected KOx/MU fixtures and pending Ondo event retain their existing roles.

## Decisions to carry into the program

| Question | Decision | Why it matters |
|---|---|---|
| Reuse a whole yield protocol or build the event engine? | Implement the bounded native event-allocation engine. Reuse standard token tooling and learn from existing interfaces; adopt an existing engine only after exact stock/event compatibility is demonstrated. | A continuous exchange-rate yield engine does not supply corporate-action classification, issuer access or the right settlement contract automatically. |
| Pendle-style normalization? | Keep a typed issuer/event boundary and internal units. No third transferable wrapper for this version. | Normalization is valuable; another circulating asset adds custody, supply and integration obligations without a present consumer. |
| Continuous yield or one event? | One identified event; equal raw PT/DR issuance, then one frozen allocation. No per-holder streaming or reward checkpoints. | DR ownership carries the entire unredeemed event claim, including after settlement. Transfers need no DividendX-specific accrual hook. |
| What does “principal” mean? | PT is the remaining stock-token allocation after this dividend is separated. Display redeemable stock units and denomination. | Neither PT quantity nor its dollar value is a guaranteed face amount. Equal PT/DR issuance does not mean equal prices. |
| What happens at expiry? | Separate deposit cutoff, expected event time and actual settlement. Unredeemed DR stays redeemable after settlement; no time-based forfeiture. | Pendle YT earns over a holding interval; DividendX DR is a bearer claim on one pool. Copying YT's expiry-to-zero UI would be wrong. |
| Claim standard? | Ordinary transferable SPL PT and DR, isolated per series; distinct from Token-2022 collateral. | Wallet/AMM composability without inheriting collateral extensions. It does not promise that any lending/staking protocol accepts the claims. |
| AMM design? | Retain one general Raydium CPMM test integration. No custom maturity curve, leveraged market or rate oracle. | Event-paid stock claims do not establish a smooth fixed-income curve. Recover LP claims before vault redemption; reserve backing for claims left in the pool. |
| Access and settlement authority? | Holder access has no DividendX allowlist; admitted assets/series and settlement evidence are explicitly curated. Separate the attestation role from custody authority. | Permissionless transfers do not make corporate-action classification trustless or remove issuer controls. |
| Protocol fees and rewards? | No DividendX protocol fee or reward token in the first program version. Network and venue fees remain real costs. | Avoid fee-dependent accounting and incentive systems until the basic claim contract works. Future fee rules require a new reviewed series policy. |

Pendle's developer documentation separates normalization, paired issuance and yield accounting. Its YT documentation describes accrual while held and no new yield after maturity; its PT documentation distinguishes the accounting asset from the token paid out. We adopt clear units and paired custody, while keeping DividendX's one-event bearer entitlement. [Yield contracts](https://docs.pendle.finance/pendle-v2-dev/Contracts/YieldTokenization), [YT](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/YieldTokenization/YT), [PT](https://docs.pendle.finance/pendle-v2/ProtocolMechanics/YieldTokenization/PT).

## Features this means users should expect

| First program-backed version | User-visible behavior |
|---|---|
| Identify the exact position | Company, issuer, stock mint, event/series identifier and payout token; different issuers never share collateral implicitly. |
| Preview and split | Stock input, both actual claim quantities, cutoff and transaction minimums. Future dividend estimates are labeled estimates. |
| Hold or transfer either side | Any valid holder can redeem its claim; eligibility is not tied to the original depositor. Transferring DR also transfers its unredeemed event entitlement. |
| Sell through a verified market | Real offer, fees, price impact and minimum received. No guaranteed buyer or fabricated APY. |
| Recombine matching claims | Matching PT+DR return their raw underlying before allocation when custody is available, including after deposits close. Selling DR removes that early-exit capacity until matching DR is reacquired. |
| Redeem independently | After settlement, redeem either side without the other. Show returned stock tokens; make clear that selling them for cash is a separate action. |
| Understand pending/failure states | Distinguish awaiting evidence, confirmed zero outcome, unsupported event and unavailable collateral. Technical evidence remains in details, not a replay workflow users must operate. |
| Inspect backing | Accounted reserves, actual custody, claim identities, accepted settlement and transaction links. External burns/donations must not appear as new yield. |

Keep automatic reinvestment into new series, baskets, leverage, lending collateral, staking rewards, cash conversion, bridges and extra maturities outside this build. General transferability is not an integration claim.

ERC-5095 is an interface precedent for distinguishing underlying identity, conversion estimates, executable previews and maximum redeemable amounts. Its page is marked **Stagnant**, and it is an EVM proposal, not a Solana standard. Borrow those API distinctions without claiming compliance. Quotes should bind the relevant series/state and protect execution with explicit minimum outputs; a preview alone is not a settlement guarantee. [ERC-5095](https://eips.ethereum.org/EIPS/eip-5095).

## Changes required beyond the rehearsal contract

**Do not mechanically port the fixture SDK.** Its historical M1 is known before a demo deposit. A future live dividend is not. Pin identity, baseline, cutoff and event policy before issuance; accept a qualified final outcome later. Indicative payout estimates must not become guaranteed pool sizes or the sole admission test. Use a minimum raw deposit policy and handle an eventual zero or sub-unit dividend explicitly. Preserve the current fixture behavior as a rehearsal version.

**Support an authenticated zero outcome.** For a confirmed cancellation/no dividend consistent with the admitted model, the intended result is PT pool = accounted collateral and DR pool = zero, with explicit zero-value DR closure. Missing data, an unexplained decrease or a missed deadline is not proof of cancellation. Never let the original depositor reclaim separately owned DR backing merely because the reader is unavailable.

**Keep redemptions tied to immutable entitlements.** Ordinary SPL tokens can be burned by their owner or approved delegate without calling DividendX. Thus actual mint supply can fall independently of our redemption counters. Use original accounted entitlements and tracked program actions; never raise survivors' exchange rate by silently dividing by reduced mint supply. For this version, unallocated donations and backing abandoned through external burns remain reserved without an admin sweep. Define their exact ledger treatment in the program contract. [Solana burn semantics](https://solana.com/docs/tokens/basics/burn-tokens).

**Make fractional closure explicit.** Preserve cumulative rounding and conservation. Ordinary redemption must not silently burn a positive claim for zero. Provide an explicitly consented zero-output closure or reviewed consolidation path, with a quote/minimum that cannot be mistaken for positive redemption. Completion cannot require that every AMM-held, lost or externally burned token has followed our happy path. Tiny residual reserves can remain; valid claims must still redeem.

**Bind factors to chain representation.** Token-2022 stores multiplier values as eight-byte `PodF64` values and chooses the active field using its timestamp. Its UI conversion helper performs floating-point formatting/conversion. Our decimal-string rational calculation is deterministic but is not automatically identical to those bytes or helpers. The program specification must select bounded canonical arithmetic, record the exact factor representation and explain any fixture rounding difference. Keep raw transfers as integers and use raw balances for Max. Pin the actual dependency version before implementation. [Token-2022 source, moving reference inspected](https://github.com/solana-program/token-2022/blob/main/interface/src/extension/scaled_ui_amount/mod.rs).

**Freeze accepted allocation, not future economics.** Later dividends or price changes affect the underlying tokens held by both pools but do not rerun the first event's split. Late settlement must identify the intended event factor rather than the current multiplier; any intervening unsupported change follows the exception policy. No high-water multiplier shortcut. No claim that DR permanently isolates cash dividends after its payout.

## Exact handoff gates

These must be resolved in Astra's program contract before assigning the vault implementation. This research defines the requirements; it does not pretend the full instruction/account specification already exists.

| Gate | Required decision or evidence |
|---|---|
| State and time | States/transitions for open, closed, evidence pending, settled positive, confirmed zero, unsupported/failure and full recombination. Exact cutoff comparisons and rules for delayed evidence; no automatic payout from elapsed time alone. |
| Trusted event | Immutable series terms, attestor authority, complete evidence fields, revision acceptance, finality and replay protection. A test fixture signer is explicitly a test attestor. No post-redemption rewrite of accepted pools. |
| Numbers | Pinned multiplier bytes/encoding, bounded integer operations, rounding directions, quote minimums, zero-event and tiny-fragment closure. Distinguish mathematical pool precision from display conversion. |
| Supply and custody | Program mint/burn authority, claim freeze-authority policy, external-burn accounting before/after settlement, donations, custody deficits and no residual sweep. Name the program upgrade authority and its power; a pinned state field does not make upgradeable code immutable. |
| Operation permissions | Independent decisions for stopping new deposits, blocking uncertain settlement and allowing safe exits. Do not let an offchain stale-data flag disable redemption of a healthy, already settled pool. |
| Integration | Valid holder/PDA claim redemption, metadata identifying issuer/mint/event, SDK preview/max/transaction contract, and actual venue/network compatibility. Review licenses before any code reuse. |

The next specification must map each gate to an instruction or documented unsupported state. A future live series additionally needs a credible resolution process for separated owners when evidence stays missing or collateral is impaired; the hackathon can demonstrate explicit blocked states with test collateral without claiming that live recovery is solved.

## Acceptance scenarios added by this review

These are tests of our own program, using controlled test assets and explicit synthetic exceptions, not reproductions against third-party protocols.

- Split, transfer or sell DR, and independently redeem PT and DR from their current owners; transfer DR after settlement and prove the former holder retains no detached claim.
- Recombine all owned pairs before settlement; a wallet missing DR cannot withdraw its backing with PT alone.
- Known positive event, authenticated zero/cancellation and missing evidence remain distinct outcomes.
- Late deposits, wrong event/revision, intervening neutral adjustments, splits and unsupported actions cannot create dividend allocation.
- Another event after settlement does not change frozen raw pools; late evidence never substitutes today's multiplier for the selected event.
- Multiple deposits, partial redemptions, tiny fragments, explicit zero closures, direct external burns and donation balances preserve valid holders' backing.
- Freeze/pause/deficit leaves claim balances unchanged on failed custody operations; re-enabling healthy custody does not alter settled allocations.
- Test current/pending multiplier timing and canonical arithmetic at 6, 8 and 9 decimals; retain KOx, Backpack MU and the HONx reverse-split control.
- A real test AMM can retain claims after LP withdrawal; redeem recovered claims while preserving remaining reserves. Do not require a globally empty series.

## Research sufficiency and limits

The coverage spans the relevant alternatives: normalization wrappers, continuous versus event-specific claims, EVM and native Solana implementations, general versus specialized liquidity, and traditional event-contract terms. There is no reason to add another broad research phase before writing the program contract.

Do not treat a protocol's website, audit list, SDK, program address or shared token extension as proof that its current deployed code supports our exact asset and event. This review found no verified drop-in engine that removes those requirements. The scoped program can proceed with representative test collateral and existing sourced fixtures; actual issuer custody, Ondo's event join, Backpack's durable finality contract and future-event operations remain live-release gates. Preserve approved design and pitch artifacts; update capability claims when working evidence changes.
