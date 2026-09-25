# Linux runtime probe

This slice packages the unchanged accepted DivX ELF, the transaction SDK, and the guided Raydium/Test USDC captures for Node 24 on Linux x86_64 with glibc. It is a feasibility and resource probe for isolated hosted sandboxes. It does not expose a public port, deploy infrastructure or include credentials.

The repository root is deliberately unusable as a Docker build context. `scripts/hosting/stage-linux-runtime.sh` creates a new allowlisted temporary context, checks the accepted ELF and IDL identities before copying, and includes only the sources and pinned npm lockfiles needed to build the two existing runtime flows. The context never copies `.git`, `.local-tools`, host `node_modules`, environment files or keypair-named JSON. The ignored `target/deploy/dividendx.so` is copied explicitly only after its accepted hash is verified. The final image installs dependencies from the locks and creates empty, writable runtime evidence directories; guided private state is owner-only mode `0700`.

```sh
scripts/hosting/stage-linux-runtime.sh
scripts/hosting/build-linux-runtime.sh
DIVIDENDX_SKIP_BUILD=1 scripts/hosting/probe-linux-runtime.sh
```

The image builds with `--platform linux/amd64` from the digest-pinned `node:24.8.0-bookworm-slim` manifest `sha256:cadbfafeb6baf87eaaffa40b3640209c4b7fd38cebde65059d15bc39cd636b85`. Package installation uses the committed npm locks. TypeScript is used only in the build stage; the final image contains built packages and the `@solana/surfpool-linux-x64-gnu` 1.5.0 native package. Each probe runs in a fresh container with no network, no published ports, a 4 GiB memory limit and four CPUs. The wallet probe launches the existing 4180 server internally and runs the existing signed three-asset annual smoke. The guided probe runs the existing complete two-wallet Raydium/Test USDC annual journey. Peak figures are whole-container cgroup memory, so they include Node, Surfpool and the smoke driver.

Linux surfaced two portability bugs that macOS did not: Surfpool allocates unrelated HTTP and WebSocket ports, and separately installed `@solana/web3.js` packages have distinct `PublicKey` constructors. The local manifest now publishes the actual private `wsUrl`; local and guided connections pass it explicitly. Instruction-data keys cross the package boundary through the SDK's canonical constructor, while the smoke verifier normalizes decoded keys through a strict base58 round trip. Public devnet connection behavior is unchanged.

## Artifact identities

| Artifact | SHA-256 |
| --- | --- |
| Accepted DivX ELF, 706,504 bytes | `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070` |
| Transaction SDK IDL | `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4` |
| Captured Raydium CPMM ELF | `87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd` |
| Raydium capture JSON | `1602de476c09c2a96659b0368711ef6a7baca4867325edc5d6237221d90ed11f` |
| Guided Circle devnet USDC capture JSON | `dbb0c9a0caee9c0bdc9eaf6ef99d57761e39bb8b7893ece1067c3edb5aae8dc2` |

## Docker probe result

The final image is `dividendx-runtime-probe@sha256:01ea56c8cd120b61d6beb63138ce8d89380464b37721a2a68e14b4dda257a604`, built as `amd64/linux`. Every artifact and lock hash passed before install and in the final stage. Docker Desktop on the probe host serves a Linux ARM64 VM, so these `linux/amd64` observations execute through emulation and are not production capacity measurements.

| Probe | Result | Elapsed | Memory observation |
| --- | --- | ---: | ---: |
| Native module load | Linux x64, Node 24.8.0, glibc 2.36, Surfpool native 1.5.0 | 44.02 ms | 90,562,560-byte process RSS; cgroup accounting under emulation was lower and is not used for sizing |
| Wallet runtime plus signed annual smoke | Passed; three 6/8/9-decimal assets, split and recombination included | 2,649 ms startup; 6,418 ms journey | 312,803,328-byte idle cgroup; 634,867,712-byte whole-container peak |
| Guided annual journey | Passed; 36 confirmed transactions, finalized phase and backing verified | 5,764 ms journey | 447,680,512-byte whole-container peak |

The wallet and guided runs used fresh containers with `--network none`; their internal random RPC and WebSocket ports stayed private. The measurements are single-session observations, not a concurrency or capacity claim. Native provider measurements and provider build-cache memory must be recorded separately from these clean runtime-container figures.

Pinned installation currently prints npm audit summaries of up to 14 findings (8 moderate and 6 high) in a package install tree. This probe did not mutate locks with `npm audit fix`; dependency review remains separate release work.
