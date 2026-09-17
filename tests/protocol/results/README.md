# Compiled-SBF results

The conformance command is:

```sh
scripts/protocol/toolchain.sh exec cargo test --locked -p dividendx-protocol-tests
```

The suite fails if `target/deploy/dividendx.so` is absent or is not an ELF. It
loads that file through Mollusk 0.14.0 under the upgradeable BPF loader and
installs the packaged SPL Token and Token-2022 executables. It never registers
a native DividendX processor.

Verified on 2026-09-17 with Rust/Cargo 1.94.0, Agave 4.1.1,
`cargo-build-sbf` 4.1.0, Mollusk 0.14.0, and Mollusk's packaged Token and
Token-2022 programs 0.14.0:

- 34 host tests passed: 3 ABI/vector, 15 independent bigint/calendar oracle,
  and 16 compiled-SBF integration tests.
- ELF: 706,504 bytes, SHA-256
  `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`.
- SDK vector fixture: SHA-256
  `673db2036b28c10aebbddd7bbcaabd66ce3cc2e11f1190f9f2dbf12ae2d1a6a8`;
  generated `initialize_config` executed at 9,303 CU.
- Representative annual path: deposit 25,064 CU; begin 13,133 CU; eight
  accumulations 8,828–11,548 CU; final commit 21,209 CU; partial DR/PT
  redemptions 21,318/21,321 CU.
- Maximum 64-event exponent-span path: deposit 25,064 CU; maximum upsert
  36,271 CU; begin 13,132 CU; peak accumulation 50,958 CU; final commit
  72,816 CU. The unreduced numerator and denominator are 3,329 and 7,424
  bits; the bounded quantity product is 7,488 bits.
- Mollusk's configured SBF heap is 32,768 bytes. The maximum path completed
  at that setting. Mollusk 0.14.0 does not expose a peak heap watermark, so
  this result does not claim one.
- The 64-event one-ULP SBF regression produced PT
  18,446,744,073,709,289,472 and DR 262,143; its peak accumulation/final
  commit compute was 46,101 CU. KOx and MU SBF regressions produced DR
  40,606,027 and 10,671, with 18,824 and 18,791 peak CU.
- Deposit inner instructions resolved to Token-2022 once and legacy SPL Token
  twice, proving collateral transfer and both claim mints executed through
  real CPIs.

The suite uses Mollusk's atomic transaction API for setup and rollback checks.
It does not claim signed-bank coverage; the transaction SDK's validator smoke
owns that separate evidence.
