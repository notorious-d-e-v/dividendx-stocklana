# Hosting dependency review — 18 September 2026

The release review used `npm audit --omit=dev --json` and inspected the locked packages' call sites. No dependency exploit was run. The accepted program ELF and transaction SDK implementation remain unchanged; dependency pins below are explicit changes.

The direct `bn.js` pins in the AMM and guided packages move from 5.2.2 to 5.2.5. The patch removes the reported arithmetic availability issue; both the 16-test AMM suite and five-test guided suite pass. Lockfile deduplication also removes a duplicate patched bn.js and an already-extraneous optional UTF-8 binding. [Maintainer release](https://github.com/indutny/bn.js/releases/tag/v5.2.3).

The remaining npm totals are dependency-graph findings, including inherited parent-package entries: root 8 (3 moderate, 5 high) after the compatibility pin below, local runtime 9 (6 moderate, 3 high), guided runtime 13 after the bn.js patch (7 moderate, 6 high). This is not a zero-advisory release. The following boundaries inform the test-site decision; they are not a general safety finding for arbitrary uses of these libraries.

| Underlying package | Reviewed use and release restriction |
| --- | --- |
| `bigint-buffer` 1.1.5 | Browser code selects its JavaScript implementation. The hosted Linux build installs with scripts disabled and explicitly verifies that the optional native binding cannot load in root/local/guided resolution contexts. The native advisory therefore does not justify silently enabling native rebuilds. The current host machine has a native root binding; it is excluded from the staged snapshot. SPL account layouts additionally use fixed-width fields. [Advisory](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg). |
| `toml` 3.0.0 | Anchor imports it for filesystem workspace discovery. The deployed application uses a fixed reviewed IDL and explicit program accounts; neither gateway nor API accepts TOML or invokes Anchor workspace discovery. Do not introduce untrusted workspace/TOML parsing without replacing this dependency. |
| `stream-json` 1.9.1 | Jayson includes the package, but the reviewed web3 HTTP client path uses its browser client with ordinary JSON parsing. The gateway is Node core HTTP with bounded JSON bodies and does not expose Jayson's streaming server or filter API. [Advisory](https://github.com/advisories/GHSA-528h-pc64-c93x). |
| `uuid` 8.3.2 | The reviewed Jayson path calls v4 without a caller-provided buffer. The reported affected variants are not used in that request-ID path. [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). |

The new hosted broker has zero reported advisories. The hosted devnet service has six runtime findings (three moderate, three high) after the compatibility pin, all from the same reviewed web3/SPL dependency paths above. Its Vercel build also disables installation scripts and checks that the native bigint-buffer binding is absent in root, transaction SDK, devnet runtime and hosted service resolution contexts. The code-only Linux snapshot passed this check for the root and both sandbox runtimes.

Do not use `npm audit fix --force`: the suggested replacements include obsolete major versions of web3/SPL/Anchor and would invalidate Token-2022 and ABI assumptions. A broader client-stack migration requires its own compatibility review. Runtime source, gateway constraints, network isolation and provider limits remain separate acceptance requirements.

## Vercel Node compatibility pin

The server-function dependency trees pin `rpc-websockets` exactly to 9.3.10. Version 9.3.9 added `uuid:^14.0.0`; that ESM-only UUID release cannot be loaded by the package's CommonJS entry under Vercel's Node require hook. The 9.3.10 maintenance release retains the same `dist/index.cjs` and `dist/index.mjs` exports, removes the UUID dependency, and requires Node 18 or newer. It remains within `@solana/web3.js` 1.98.4's declared `rpc-websockets:^9.0.2` range, so web3/SPL/Anchor and their ABIs are unchanged. npm marks the package deprecated, so this exact pin is a temporary compatibility bridge pending a separately reviewed Solana client migration. [9.3.9 source manifest](https://github.com/elpheria/rpc-websockets/blob/v9.3.9/package.json), [9.3.10 source manifest](https://github.com/elpheria/rpc-websockets/blob/v9.3.10/package.json), [9.3.10 npm metadata](https://www.npmjs.com/package/rpc-websockets/v/9.3.10).

Version 9.3.8 with patched `uuid` 11.1.1 was the compatible fallback: UUID 11.1.1 explicitly maps CommonJS `require` to `dist/cjs/index.js` and fixes GHSA-w5hq-g745-h8pq. Removing that dependency through 9.3.10 is narrower and avoids a second transitive pin. [UUID 11.1.1 source manifest](https://github.com/uuidjs/uuid/blob/v11.1.1/package.json), [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

The override is repeated in the repository root, transaction SDK, devnet runtime and hosted devnet service because each owns an independent lockfile and may be installed as the npm project root. npm only honors overrides from the root package of the current installation. [npm overrides documentation](https://docs.npmjs.com/files/package.json/#overrides).

The accepted code-only sandbox snapshot keeps its own recorded source and lockfile hashes. It was built before the server-function `rpc-websockets` compatibility pin, and its native Node 24 execution passed. The later server-function lockfiles are not identical to that snapshot; its immutable manifest is recorded in [snapshot evidence](evidence/hosted-runtime-snapshot-2026-09-18.json).
