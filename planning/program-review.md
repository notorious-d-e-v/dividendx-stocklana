# Annual program acceptance review

17 September 2026. Astra accepted the annual program and transaction SDK for local integration. Baseline: `c6d62d1`. This record separates implementation checks from live issuer enablement; no public deployment or live issuer custody is claimed.

## Review focus

- Actual compiled-SBF token CPIs and SDK-signed local-validator transactions.
- Annual event replacement, cancellation, unknown dates, unsupported actions, late payment and exact cumulative allocation.
- Distinct maturity, sealed accumulation and final settlement; paired exits during sealing; independent final redemption.
- Nominal backing retained across external burns, donations and partial redemption; no sweeps or forfeiture.
- Raw exits remain possible when observations are stale, admission is disabled, authorities change, or valid scale factors exceed the accounting range, provided token transfers and total custody remain healthy.
- Immutable control fingerprints exclude mutable multiplier values and match the SDK byte-for-byte.
- Quotes use coherent account snapshots and owner balances; a resolved journal is not proof of complete coverage.
- Bounded 64-event SBF compute/heap measurements, genuine IDL parity and transaction rollback.

## Baseline preservation

The existing fixture verifier, all 33 reference/legacy SDK tests, web type check and production build passed during this phase. The frontend, historical fixtures, artwork, presentation and user narration remain unchanged. Browser tests are not rerun for this separate program/SDK slice unless integration changes those surfaces.

## Accepted implementation and verification

The program implements pre-year deposits, actual PT/DR minting, immutable event revisions, staged annual settlement, paired recombination and independent final redemption. Exact binary multiplier arithmetic supports up to 64 events, with cumulative pool and redemption rounding. The SDK supplies all 13 instruction builders, coherent RPC reads, raw-unit quotes, lossless decoding and caller-supplied signing.

| Check | Result |
| --- | --- |
| `npm run build:program` | Compiled SBF successfully with the pinned toolchain; no stack-overflow build diagnostic |
| `npm run build:idl` | Genuine Anchor IDL generated from the program using the official build API |
| `npm run test:program` | **46 passed**: 12 program unit, 3 independent ABI/vector, 15 independent arithmetic/calendar oracle and 16 compiled-SBF integration tests |
| `npm run test:transactions` | **22 passed**, plus successful package-name import; all 13 instruction encodings match independent Rust vectors |
| `npm --prefix packages/transaction-sdk run smoke:local` | SDK fetched coherent snapshots and signed successful deposit/recombination transactions against an isolated validator |
| Signed rollback check | A later failing instruction rolled back successful DividendX burns and collateral-transfer CPIs; all observed balances, supplies and series counters were unchanged |
| Preserved application | Fixture verification, **33 reference/legacy SDK tests**, type check and production build passed; no frontend, historical fixture, design, deck or narration changes |

The compiled-SBF suite executes real SPL Token and Token-2022 programs. It covers a multi-event annual journal with four qualified dividends, revisions, cancellations, zero events, unsupported actions, an unresolved late-paid dividend, bearer transfers and complete independent redemption. Additional checks exercise issuer/mint/year isolation, real token extension profiles, authority changes, paused/frozen accounts, external burns, donations, deficits, quote guards and explicit zero-output consent. Historical KOx and MU factors remain separately labeled regressions with synthetic term dates.

The maximum tested 64-event exponent-span path used **50,958 CU** for its largest accumulation and **72,816 CU** for final commit. It completed with a configured **32,768-byte heap**; the runner does not expose a peak heap watermark. See the [compiled-SBF results](../tests/protocol/results/README.md) for exact arithmetic bounds and measurements.

The [signed validator receipt](../packages/transaction-sdk/smoke/results/local-validator-receipt.json) records the local genesis, snapshot slots, signatures, failure index, CPI logs and identical before/after rollback state. Disposable test keys and the validator ledger are excluded from Git. This signed test covers deposit/recombination and transaction atomicity; the full annual lifecycle is covered separately by compiled-SBF tests with controlled time.

## Tested artifact identity

Development program ID: `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`.

| Artifact | SHA-256 |
| --- | --- |
| ELF, 706,504 bytes | `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070` |
| Generated IDL, 42,638 bytes | `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4` |
| Shared SDK/Rust instruction vectors | `673db2036b28c10aebbddd7bbcaabd66ce3cc2e11f1190f9f2dbf12ae2d1a6a8` |

Program and SDK IDL copies are byte-identical, as are the SDK and Rust vector fixtures. SDK tests enforce those identities. Build commands and tool versions are in the [toolchain guide](../docs/program-toolchain.md).

## Remaining deployment boundaries

The event attestor still supplies trusted classification and complete-period coverage. Tests use controlled inputs and synthetic ex-dates with the preserved historical KOx/MU factor regressions. Real issuer feeds, wallet UI, governance/recovery, public deployment and the AMM round trip remain separate work. See [program contract](../spec/program-v1.md) and [roadmap](roadmap.md).
