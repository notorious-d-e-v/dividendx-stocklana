# Annual program toolchain

Audited 17 September 2026 on Apple Silicon. This is a reproducible local-program setup, not evidence of a deployed DivX program.

## Selected stack

Pin this stack in the program workspace and lockfile:

| Layer | Pin | Reason |
| --- | --- | --- |
| Host Rust | `rustc` / `cargo` 1.94.0 | Installed host compiler for tests and tooling. |
| SBF compiler | `cargo-build-sbf` 4.1.0, platform-tools v1.54, SBF `rustc` 1.89.0-dev | Already installed and cached. Anchor 1.2.0 declares Rust 1.89 as its minimum. |
| Runtime / CLI | Agave 4.1.1 | Installed `solana`, `solana-test-validator`, and runtime matched by Mollusk 0.14.0. |
| Program framework | `anchor-lang = "=1.2.0"`; `anchor-spl = { version = "=1.2.0", default-features = false, features = ["associated_token", "token", "token_2022", "token_2022_extensions"] }` | Current stable Anchor. The selected SPL features cover ordinary SPL PT/DR and Token-2022 custody without unrelated defaults. |
| Bounded arithmetic | `num-bigint = { version = "=0.5.1", default-features = false }` | `no_std`/allocation path avoids the `std` feature's floating-point approximations. The program must still enforce the frozen 8,192-bit and compute bounds. |
| SBF conformance | `mollusk-svm = "=0.14.0"`, `mollusk-svm-programs-token = "=0.14.0"`, `mollusk-svm-programs-token-2022 = "=0.14.0"` | Mollusk 0.14.0 pins Agave execution crates to 4.1.1 and runs compiled ELF through the BPF Loader. Its token crates package executable SPL Token and Token-2022 programs. |
| TypeScript transaction SDK | `@anchor-lang/core@1.2.0`, `@solana/web3.js@1.98.4`, `@solana/spl-token@0.4.14` | Anchor 1.2 renamed its client to `@anchor-lang/core` and still depends on web3.js v1. SPL Token 0.4.14 peers on web3.js `^1.95.5` and exposes legacy SPL plus Token-2022/ScaledUiAmount APIs. Exact pins avoid two incompatible Solana JS type stacks. |
| Node/package manager | Node 24.12.0, npm 11.19.1 | Installed and satisfies Anchor core's Node `>=20.18` requirement. |

Use ordinary SPL Token mints for PT and DR and Token-2022 only for the deposited collateral. The program must validate the exact program ID at every mint, token account, ATA, mint/burn, and transfer CPI boundary.

Keep Agave runtime crates in the host-only test package. Anchor 1.2.0's program-facing Solana crates and Mollusk 0.14.0's Agave runtime crates have different package-version lines; importing Mollusk into the SBF crate can create duplicate public-key/instruction types and unnecessary program weight. The protocol test package should load the program ELF and bridge any generated program ID or instruction data through canonical bytes when Rust types do not unify.

Expose IDL generation as a crate feature instead of enabling it in every SBF build:

```toml
[features]
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

## Availability at phase entry

At the initial audit, the repository had no `Cargo.toml`, `Anchor.toml`, Rust program, Anchor CLI, AVM, or Solana JS dependencies installed. This inventory records the starting state; the program/SDK implementation adds its manifests and dependencies separately. Existing tools were:

| Tool | Path / state |
| --- | --- |
| Agave executables | `~/.local/share/solana/install/active_release/bin` |
| SBF platform tools | `~/.cache/solana/v1.54/platform-tools` (about 1.3 GiB, already complete) |
| Host Rust executables | `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin`; this directory is not currently on `PATH` |
| Rust crate cache | `~/.cargo/registry` (about 75 MiB); lacks Anchor, SPL Token, Mollusk, LiteSVM, `solana-program-test`, and `num-bigint` 0.5.1 |
| Project Node modules | no Anchor/Solana/SPL packages installed |
| npm cache | tarballs exist for web3.js 1.98.4/1.99.0, SPL Token 0.4.14, and several Solana Kit packages; registry metadata and the full dependency closure are not reliably available offline |
| pnpm store | empty |

Network access is therefore required once to resolve and lock the Rust graph, Anchor CLI if used, `@anchor-lang/core`, and the complete Node dependency graph. Do not claim an offline build until both `cargo build-sbf --offline` and the package-manager offline install pass from the committed lockfiles.

No global shell or Rust configuration is needed. The repository wrapper prefers tools already on PATH, then discovers a Rust stable/1.94 installation and the standard Agave location. `DIVIDENDX_HOST_RUST_BIN` and `DIVIDENDX_SOLANA_BIN` support other layouts; the wrapper does not hardcode Apple Silicon for a fresh clone. It supplies the existing paths:

```sh
scripts/protocol/toolchain.sh check
scripts/protocol/toolchain.sh exec cargo --version
scripts/protocol/toolchain.sh exec cargo-build-sbf --version
```

To use the tools directly in the current shell:

```sh
export PATH="$(scripts/protocol/toolchain.sh path):$PATH"
```

Anchor CLI is optional for both the SBF build and IDL generation. The checked-in host example uses Anchor's official `IdlBuilder` API and enables its linting and account resolution:

```sh
npm run build:program
npm run build:idl
```

This generates `programs/dividendx/idl/dividendx.json` from the Rust program; it is not a handwritten interface. The full Anchor CLI install encountered a macOS LLVM LTO linker failure in this environment, so the working repository path does not depend on it. If Anchor workspace orchestration is later needed, install 1.2.0 under the ignored `.local-tools/anchor` root:

```sh
scripts/protocol/toolchain.sh exec cargo install \
  --root .local-tools/anchor \
  --git https://github.com/otter-sec/anchor \
  --tag v1.2.0 \
  --locked anchor-cli
scripts/protocol/toolchain.sh check
```

This keeps the installation inside the repository's ignored local-tool directory and leaves global profiles untouched.

The program build wrapper pins platform-tools v1.54 and passes Cargo's `--locked` after `--`. This host has the SBF compiler cached but no `rustup` executable; the wrapper selects that compiler directly with `--no-rustup-override`. On another machine it uses the cached compiler, `DIVIDENDX_SBF_RUST_BIN`, or an available rustup installation. If both are absent, it prints the platform-tools install command rather than selecting an incompatible host compiler.

## Required real-program tests

The primary conformance suite should use Mollusk 0.14.0 and load `target/deploy/dividendx.so`; do not register a native Rust processor for DivX. Add the packaged legacy Token and Token-2022 executables, enable inner-instruction tracking, and assert the expected CPI program IDs. This executes the compiled DivX SBF and actual token programs rather than replacing custody or claims with test-side balance arithmetic.

At minimum, initialize a Token-2022 collateral mint with `ScaledUiAmount`, create extension-sized token accounts, and exercise these transactions through the program:

1. `transfer_checked` of raw collateral into a PDA-controlled Token-2022 vault, followed by equal raw minting of ordinary SPL PT and DR.
2. A ScaledUiAmount multiplier update proving UI presentation changes while raw mint supply, vault balance, PT, DR, and later payouts remain raw-unit quantities.
3. Ordinary SPL PT/DR transfer, program-authorized burn, paired recombination, and independent post-finalization redemption through real CPIs.
4. Six-, eight-, and nine-decimal collateral; extension allow/deny cases; wrong token program, mint, decimals, ATA, PDA, signer, and replay failures.
5. The frozen 64-event staged finalization path, exact f64-bit decomposition, 8,192-bit accumulator bound, compute limits, and aggregate redemption conservation.

The conformance suite uses Mollusk's atomic transaction API for grouped execution. A separate signed RPC smoke on `solana-test-validator` 4.1.1 verifies client/IDL wiring, deposit/recombination and rollback after a later instruction fails. The smoke checks the canonical Token-2022 program before creating its ScaledUiAmount mint. If a future validator lacks a required instruction, load a pinned Token-2022 ELF explicitly with `--bpf-program`; never silently fall back to fabricated token accounts.

`solana-program-test` can work after downloading its large Agave dependency graph, but it is not the selected harness: registering `Processor::process` executes a native processor and would weaken the compiled-SBF acceptance signal. LiteSVM can load a compiled `.so` and is viable, but it is redundant here; Mollusk 0.14.0 has the exact installed Agave 4.1.1 match and packaged Token-2022 support. Anchor local-validator tests can work after installing Anchor; use the legacy validator backend where needed rather than treating a framework simulation as the only conformance run.

## Verification commands

From the repository root, with the pinned tools installed:

```sh
scripts/protocol/toolchain.sh check
scripts/protocol/toolchain.sh exec cargo metadata --locked --format-version 1
npm run build:program
file target/deploy/dividendx.so
scripts/protocol/toolchain.sh exec cargo run --locked -p dividendx --example build_idl
scripts/protocol/toolchain.sh exec cargo test --locked -p dividendx -p dividendx-protocol-tests
npm --prefix packages/transaction-sdk ci
npm --prefix packages/transaction-sdk run vectors
npm --prefix packages/transaction-sdk test
npm --prefix packages/transaction-sdk run smoke:local
```

The SBF test should fail if `target/deploy/dividendx.so` is absent, should report nonzero SBF compute consumption, and should assert Token and Token-2022 inner instructions. Keep arithmetic-reference tests separate; passing them does not satisfy program conformance.

## First-party references

- Anchor installation and current versions: <https://www.anchor-lang.com/docs/installation>
- Anchor 1.2.0 Rust dependency pins: <https://raw.githubusercontent.com/otter-sec/anchor/v1.2.0/Cargo.toml>
- Anchor 1.2.0 minimum Rust 1.89 and IDL feature: <https://raw.githubusercontent.com/otter-sec/anchor/v1.2.0/lang/Cargo.toml>
- Anchor SPL token features: <https://raw.githubusercontent.com/otter-sec/anchor/v1.2.0/spl/Cargo.toml>
- Anchor 1.2.0 TypeScript package and web3.js dependency: <https://raw.githubusercontent.com/otter-sec/anchor/v1.2.0/ts/packages/anchor/package.json>
- Anchor local testing and legacy-validator option: <https://www.anchor-lang.com/docs/references/cli>
- Mollusk 0.14.0 exact Agave 4.1.1 graph: <https://raw.githubusercontent.com/anza-xyz/mollusk/0.14.0/Cargo.toml>
- Mollusk ELF/BPF Loader execution contract: <https://raw.githubusercontent.com/anza-xyz/mollusk/0.14.0/harness/src/lib.rs>
- Solana Mollusk Token/Token-2022 testing guide: <https://solana.com/docs/programs/testing/mollusk>
- Token-2022 ScaledUiAmount state and conversion semantics: <https://github.com/solana-program/token-2022/blob/main/interface/src/extension/scaled_ui_amount/mod.rs>
- Solana ScaledUiAmount integration guide: <https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide>
- SPL Token 0.4.14 package and web3.js peer range: <https://raw.githubusercontent.com/solana-program/token-2022/js-legacy@v0.4.14/clients/js-legacy/package.json>
- `num-bigint` 0.5.1 release and feature record: <https://github.com/rust-num/num-bigint/blob/main/RELEASES.md> and <https://docs.rs/crate/num-bigint/0.5.1/features>
