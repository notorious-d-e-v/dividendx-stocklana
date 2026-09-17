# Annual Solana program v1

17 September 2026. Astra implementation contract for the user-authorized program and transaction-SDK phase. Economics remain [annual accounting](annual-series-accounting.md). This document resolves the program gates; verification may require an explicit documented amendment. The approved web preview, original SDK, fixtures, design and presentation remain unchanged.

## Deliverable and trust boundary

Build an Anchor program, a separate TypeScript transaction SDK and tests executing the compiled SBF program with actual SPL/Token-2022 CPIs. Use controlled collateral and clocks locally. No mainnet transaction, real issuer custody, operational issuer feed, wallet UI or AMM deployment is part of this phase.

Development program ID: `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`. Its disposable deployment key is ignored locally. Never commit private keys. A fresh clone can test this public ID in the SVM or preload it in a local validator without possessing a deployment key. Deploying under another generated address requires a matching rebuilt program declaration/configuration, regenerated IDL and explicit SDK program ID.

Pin compatible dependency versions and commit lockfiles. Initial stack: Anchor 1.2.0; installed Agave CLI/validator 4.1.1 and build-sbf 4.1.0/platform-tools 1.54; Mollusk 0.14.0 for actual SBF/CPI execution. Confirm compatibility rather than assuming a successful native Rust test proves SBF behavior.

Permissionless holder operations coexist with curated collateral and a trusted event attestor. The program verifies the signer, identities, revisions, dates, factors, journal commitment and token state. It cannot prove an offchain dividend ledger is complete. An attestor falsely certifying an incomplete or misclassified journal can misallocate PT/DR. Test attestations must never be presented as live issuer verification.

## Accounts and addresses

Use Anchor's standard account/instruction discriminators and Borsh encoding. Pin explicit field order in the generated IDL and test its SDK encoding against program instruction bytes. Canonical PDA seeds:

| Account | Seeds (UTF-8 literals; integers little-endian) | Purpose |
|---|---|---|
| Config | `config` | Admin and immutable 32-byte deployment domain |
| AssetPolicy | `asset`, issuer ID `[u8;32]`, collateral mint | Approved exact mint, issuer, symbol, decimals, attestor, policy digest, controls fingerprint, admission flag and recent observation |
| Series | `series`, asset policy pubkey, year `u16` | Separate calendar term, custody/claim identities, nominal backing, journal state and final redemption counters |
| PT mint | `pt`, series pubkey | Ordinary SPL mint, collateral decimals, Series mint authority, no freeze authority |
| DR mint | `dr`, series pubkey | Ordinary SPL mint, collateral decimals, Series mint authority, no freeze authority |
| Vault | Canonical Token-2022 ATA of Series/collateral mint | Actual raw custody; no account delegate or alternate close authority |
| EventHead | `event`, series pubkey, stable event ID `[u8;32]` | Stable insertion index and latest revision/hash |
| EventRevision | `revision`, event head pubkey, revision `u64` | Immutable normalized event data, previous revision commitment and evidence digest |
| Accumulator | `accumulator`, series pubkey | Bounded exact numerator/denominator, cursor and sealed journal commitment |

Use fixed-width identities and digests. Hash issuer/event source identifiers with domain-separated, length-delimited UTF-8 encodings in the SDK; do not concatenate arbitrary strings. The same symbol is never an identity. Cluster isolation follows the actual ledger/program deployment; the SDK also binds the configured cluster/genesis domain.

Config initialization requires the current upgrade authority and validates this executable program's canonical upgradeable-loader ProgramData account. A random first caller cannot claim administration. Admin registers collateral and may disable new admission; it has no withdrawal, sweep or arbitrary settlement-pool instruction. The asset attestor approves observations, records/revisions, complete-period attestation and prefinal abort. Users own their SPL accounts. Upgrade authority is a separate, explicitly disclosed power over program code; no immutability claim.

Asset issuer/mint, attestor, economic policy and critical-authority fingerprint are immutable in v1. Policy rotation/recovery is later work. Series copies its policy commitment. Claim mints have no freeze authority and lose mint authority at finalization. Metadata registration for wallet branding is a later integration concern; the SDK derives names such as `PT-KOx-2027` from the pinned symbol/year.

## Supported token profile

Collateral must be the exact registered Token-2022 mint, initialized, with 6, 8 or 9 decimals and ScaledUiAmount. Admit only these understood mint extensions: ScaledUiAmount, MetadataPointer, TokenMetadata, MintCloseAuthority, PermanentDelegate, DefaultAccountState when Initialized, TransferHook with a null program, Pausable when unpaused, and passive ConfidentialTransferMint. The latter is present on observed xStocks; this vault uses ordinary public balances and never enables confidential transfers. Reject transfer fees, interest-bearing, nontransferable, active hooks, default-frozen and unknown extensions. The registered extension set and financially relevant authorities are fingerprinted; mutable display metadata content is not an economic input.

Read ScaledUiAmount's current/pending multiplier using the **chain clock**, including equality at the effective timestamp. Do not perform floating-point arithmetic in the program. Pin scale, mint, freeze, permanent-delegate, pause and hook controls in the critical fingerprint (plus the applicable extension control fields). Presence of those powers is disclosed, not erased by an admission check.

Registration and a signed `refresh_observation` inspect the actual mint and bind current scale, pending scale/time, observed slot, a nonzero coverage/evidence digest and expiry (at most 24 hours after chain time). Deposits/series creation require enabled admission, a fresh observation, the same complete current/new/effective-timestamp scale tuple and critical policy, and no unresolved series journal state. Also recompute the active multiplier using the current chain clock. An unreviewed scale change or newly scheduled change stops deposits until reviewed; activation past the observation's active-factor snapshot also needs refresh. Genuine pre-year changes may be reviewed; do not hardcode the first multiplier forever.

Recombination and settled redemption do not require a fresh feed or enabled admission. They do require ordinary transferable token behavior, unfrozen valid accounts and solvent raw custody. Stale observations cannot freeze healthy exits. Active fee/hook/default-frozen/unknown profiles fail closed; issuer pause/freeze can prevent the CPI. A changed authority alone must not disable an otherwise healthy raw exit, although it blocks new admission/finalization until reviewed. Likewise, a Token-2022-valid multiplier outside this program's accounting range must stop admission/finalization without blocking a raw exit that requires no factor arithmetic. No instruction unfreezes an issuer's accounts or bypasses issuer controls.

Use real Token-2022 ATA initialization so required account extensions are correct. Reject a vault delegate/alternate close authority or wrong owner/mint/program. User source/destination and claim accounts must belong to the signing owner; delegated holder operations are outside v1. Check distinct relevant accounts and canonical program addresses. Transfer/mint/burn failures roll back the entire instruction.

## Exact bounded multiplier arithmetic

Canonical event factors are the **u64 IEEE-754 bit patterns** of the observed Token-2022 multipliers, not rounded display strings. Admit positive finite normal values in `[2^-32, 2^32)`; reject zero, negative, NaN, infinity, subnormal and out-of-range values. A qualified factor has `M1 >= M0`. Decode to a 53-bit significand and power of two by integer bit operations. Record and preserve original source decimals outside the chain commitment for provenance; never claim all decimal-rational fixtures are generally byte-exact chain arithmetic.

For each qualified in-year event multiply the exact rational `N/D` by `M0/M1`. Keep numerator/denominator as unsigned little-endian bounded byte vectors, at most 1024 bytes (8192 bits) each. A `num-bigint` implementation may be used with `default-features=false`, explicit bounds before/after arithmetic, and measured SBF compute/heap tests. Never deserialize an unbounded integer from caller data. No per-event fixed-point or pool rounding.

There are at most 64 event IDs. A factor uses at most 53 significand bits and 63 exponent-shift bits; 64 products need at most 7424 bits, and multiplying by a u64 collateral quantity needs at most 7488. This fits the 8192-bit limit without relying on cancellation/GCD. Verify this bound and extreme cases in tests. Revisions replace records and trigger a fresh ordered accumulation; they do not consume another event slot or multiply twice.

At commit, `DR = floor(Q*(D-N)/D)` and `PT = Q-DR`. Redemption uses checked u128 products for `floor((B+b)*P/S)-floor(B*P/S)`; u64 factors fit. `S` is nominal backing at finalization, not current SPL supply. Q decreases only for paired recombination; unsolicited donations and direct holder burns do not change it. After finalization the remaining side pools define obligations. Require actual vault amount >= **all** obligations before a custody-moving operation; no early redeemer preference after a deficit.

The [independent numeric review](../planning/evidence/program-numeric-review-2026-09-17.json) records canonical KOx/MU bit patterns and two 64-event edge cases. It is host arithmetic evidence; compiled-SBF measurements must establish runtime feasibility. [Solana's Scaled UI documentation](https://solana.com/docs/tokens/extensions/scaled-ui-amount) distinguishes raw custody from floating-point display conversion; our exact-bit allocation is a protocol calculation, not a claim that issuer UI conversions round-trip exactly.

## Event and finalization protocol

Use years 2020–2100 and derive January 1 boundaries onchain with tested Gregorian arithmetic. Ex-dates are validated civil `YYYYMMDD` u32 values (`0` means unknown), pinned to the policy's reference market through its digest. Record source payment date and effective time separately. Do not infer ex-date from either. Status codes: `0 pending`, `1 qualified`, `2 confirmed_zero`, `3 cancelled`, `4 unsupported`. Only latest qualified in-year records contribute; cancelled/zero and out-of-year records contribute one. Pending, unknown date, nonfinal and unsupported records remain unresolved.

Event input contains a nonzero stable event ID, positive monotonic revision, ex-date, status, M0/M1 bits, source-final flag, original effective time/payment date, observed slot and nonzero evidence digest. Qualified records carry canonical multiplier bits; all other statuses encode both factor fields as zero. A qualified record with unknown ex-date may be stored but remains unresolved until corrected. Series/asset identity is supplied by verified account relationships, not arbitrary ticker text. Final qualified records cannot claim an effective time or observed slot in the future. Full source taxonomy, duplicate-entitlement detection and cancellation after an applied factor belong to the pinned attestation policy; an event ID alone does not prove unique income.

Store each accepted revision in an immutable PDA and update the head. First insertion assigns the next index `[0,63]`; corrections retain it. An exact duplicate is idempotent. Same-revision differing data and lower revisions reject. Maintain an unresolved count, in-year qualified count, journal version and a history commitment chained over the canonical record bytes and prior commitment. Preserve all revision accounts for audit. No arbitrary journal pruning or account closing.

Finalization is staged to avoid a transaction with 64 event accounts and an unmeasured compute spike:

1. `begin_finalization`: attestor signs complete-period coverage tied to exact journal version/hash and nonzero coverage digest. Require maturity, resolved journal, current policy/observation and healthy custody. Seal the revision set, complete current/new/effective-timestamp scale tuple and active multiplier, set phase Sealing, reset cursor and ratio to one.
2. `accumulate_event`: permissionless keeper supplies the canonical head and its latest immutable revision at the exact cursor. Check relationships/hash/index, multiply only eligible factors, advance once. An account cannot be skipped, repeated or substituted. One event per instruction; callers may batch only within measured limits.
3. `complete_finalization`: permissionless after cursor equals sealed event count. Recheck policy, complete scale tuple, active scale and custody. Use the **current** Q (paired exits remain allowed while sealing), freeze S/PT/DR and the journal commitment, revoke both claim mint authorities, mark Finalized. Zero-Q and zero-dividend terms are valid.
4. `abort_finalization`: attestor only, before commit, with nonzero reason digest. Unlock the journal and reset accumulation so corrections can be accepted and resealed. No pool has been paid. Postfinal amendments/abort are rejected; a later source correction is a settlement dispute, not repricing or clawback.

An observation expiring after a valid seal does not by itself invalidate completion; a changed scale tuple, active scale or critical policy does. The attestor must refresh/review and reseal if necessary. Beginning finalization is a trusted completeness statement, not a guarantee by the blockchain that no dividend was omitted.

## Instruction surface and SDK

| Instruction | Authorized caller / result |
|---|---|
| `initialize_config(domain)` | Verified deployment upgrade authority; establish admin |
| `register_asset(issuer_id, symbol, attestor, policy_digest)` | Admin; snapshot approved mint profile; symbol <=16 UTF-8 bytes |
| `set_asset_admission(enabled)` | Admin; new deposits/series only, never exit gating |
| `refresh_observation(evidence_digest, valid_until)` | Pinned attestor; inspect actual mint and update reviewed observation |
| `create_series(year)` | Any payer with admitted asset; create Series, accumulator, vault and paired ordinary SPL mints |
| `deposit(amount, guard)` | Holder; atomically transfer raw collateral and mint amount PT + amount DR strictly before year start |
| `recombine(amount, guard)` | Current holder of matching tokens; atomically burn both and return amount raw collateral before final commit |
| `upsert_event(input)` | Pinned attestor; immutable revision plus head/journal update while Open |
| `begin_finalization(expected_journal_version, expected_journal_hash, coverage_digest)` | Pinned attestor; seal complete eligible period after maturity |
| `accumulate_event()` | Any keeper; one canonical event at cursor |
| `complete_finalization()` | Any keeper; freeze pools once and revoke mint authorities |
| `abort_finalization(reason_digest)` | Pinned attestor; precommit only |
| `redeem(side, amount, allow_zero, guard)` | Current holder; independent burn and raw collateral transfer after finalization |

`Guard` has expected Series state version, expiry Unix timestamp and minimum raw output. Deposits mint both sides equally, so minimum output applies to each; recombine/redeem use collateral output. All custody amounts are positive u64. Zero-output redemption additionally requires `allow_zero=true`; minimum zero alone is not consent. Increment state version on successful economic/journal/phase changes; exact idempotent replay does not change it. Quotes use raw balances for Max. SPL transfers/direct burns occur outside the vault and need no ownership registry.

The SDK lives in `packages/transaction-sdk/`; do not replace `packages/sdk/` or connect the preview this turn. It exports addresses, validated codecs/types, account fetch/decoding, eligibility/phase/quotes, unsigned instruction/transaction builders and a signer-supplied submit/confirm helper. Administrative/attestor builders are explicit separate functions. Default examples are localhost, never mainnet. Derive claim names, exact effective multiplier bits and lossless raw units; do not use JavaScript Number for u64 amounts. Provide compute-budget helpers for measured finalization steps.

Generated IDL and instruction/account round-trip fixtures bind the SDK to the program. Demonstrate actual SDK-built instructions against the local program runtime, not only encoding tests. Preserve receipts/compute logs without secret keys. A local validator smoke test may exercise signed pre-year deposit/transfer/recombination; controlled-clock SBF tests cover annual maturity without adding a program clock-override instruction.

## Acceptance and release boundary

Implement the [annual test matrix](annual-series-tests.md) from the first program version. In particular execute actual custody/mints/burns for 6/8/9-decimal profiles, four-event accumulation, revised/cancelled events, late-paid December membership, unsupported action stops, both token owners, prefinal paired exit, all staged-finalization failures, independent redemptions, zero consent, external burns, donations and custody deficits. Test January 1 equality, years/issuer/mint isolation, quote guards, source/owner/program relationships, extension changes and Token-2022 pause/freeze rollback. Tests use this owned program and controlled assets only.

Measure compiled-SBF compute for bounded worst-case arithmetic and 64 events; do not claim feasibility from host benchmarks. Compare byte-derived factors with a separate bigint oracle, including KOx/MU fixture regressions and decimal-versus-binary cases. Program tests may advance the harness Clock; the deployed instruction never accepts a caller clock.

The reference's 33 tests and approved web build must continue passing. This phase can prove local program behavior and SDK integration. Live issuer enablement, operational ex-date/completeness feeds, authority governance, audited production recovery, wallet UX, public deployment and the AMM round trip remain separate gates.
