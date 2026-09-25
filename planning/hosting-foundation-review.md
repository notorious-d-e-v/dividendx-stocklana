# Hosting foundation review — 18 September 2026

The accepted annual program runs on Vercel's native Linux runtime, and the persistent real-calendar devnet registry is created. This accepts the hosting foundation, not a public website release. Visitor sessions, a restricted RPC gateway, durable faucet quotas and release verification remain next.

## Native cloud execution

Vercel project `dividendx-stocklana` was created under the existing `payai` scope. The probe used a credential-free, allowlisted source context, locked npm dependencies, Node 24 on native Linux x64/glibc 2.34, two vCPUs and 4 GiB RAM. The final acceptance sandbox had outbound networking disabled and no public ports. The temporary sandboxes and build snapshot were removed after saving evidence.

| Flow | Result | Measurement |
| --- | --- | --- |
| Wallet annual flow | 104 confirmed/finalized receipts across 6/8/9-decimal profiles; custody, transfers, recombination and independent final redemption | 1,269 ms runtime startup; 5,802 ms journey; 479,817,728-byte idle and 725,577,728-byte peak cgroup memory |
| Guided Raydium/Test USDC flow | 36 transactions; all nine actions, finalized annual allocation and exact remaining backing | 4,051 ms journey; 558,735,360-byte peak cgroup memory |

Evidence: [wallet measurements](evidence/vercel-linux-wallet-probe-2026-09-18.json), [104 wallet receipts](evidence/vercel-linux-wallet-transactions-2026-09-18.json), [guided measurements](evidence/vercel-linux-guided-probe-2026-09-18.json), [guided transaction receipt](evidence/vercel-linux-guided-transactions-2026-09-18.json).

These are isolated synthetic networks running the actual accepted bytecode. They are not public-devnet receipts or live issuer dividends. Cgroup measurements include the probe processes and filesystem/build-cache effects; startup excludes provider provisioning. They do not establish concurrent visitor capacity. The separate [Docker probe](../docs/linux-runtime-probe.md) also passes with outbound networking disabled, but its x64-on-ARM timings are not native capacity measurements.

The DivX ELF remains `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`; the transaction IDL remains `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4`. No program or transaction-SDK source changed.

## Persistent public devnet

[Devnet runtime v1](../spec/devnet-runtime-v1.md) and its [operator README](../packages/devnet-runtime/README.md) implement explicit genesis, executable ELF, upgrade authority, Config admin and deployment-domain checks. The [public registry](../packages/devnet-runtime/manifest.devnet.json) contains separate 2027 `TestKOx`, `TestMU` and `TestIBMon` series. These are synthetic issuer profiles, not the issuers' actual stock tokens.

Deposits close on 1 January 2027; maturity is 1 January 2028. Public time cannot be advanced. Maturity alone still does not finalize a journal or enable independent redemption.

Thirteen bootstrap transactions and the four-transaction CLI holder proof were independently checked at finalized commitment. One TestKOx split into equal PT/DR and recombined with exact raw-balance conservation. See [bootstrap verification](evidence/devnet-2027-bootstrap-2026-09-18.json) and [holder receipt](evidence/devnet-2027-kox-holder-2026-09-18.json).

The dedicated admin paid 106,328,520 lamports for bootstrap, including initial separate-authority funding. Recorded QA reserves of [20,000,000](evidence/devnet-browser-qa-reserve-2026-09-18.json) and [10,000,000](evidence/devnet-browser-qa-reserve-v2-2026-09-18.json) lamports, plus their two 5,000-lamport fees, bring total admin spend to 136,338,520 lamports, below the 150,000,000-lamport ceiling. All funds are devnet SOL.

Bootstrap persists signed bytes and their signature before sending; ambiguous retries reuse those bytes or stop. A real interrupted run resumed without repeating its confirmed authority-funding or mint-creation steps. Mint/faucet and test-observation authorities are separate from the program admin. Private signers/state remain in the ignored owner-only directory; only manifests and public receipts are committed.

The HTTP service is read-only: `GET /manifest`, disabled `POST /faucet`, and no `/advance`. Operator funding is capped per invocation at 10 test tokens and a 0.006 SOL holder balance. This is not an anonymous public quota system. Synthetic mint-profile observations last 12 hours by default, at most 24 hours; their explicit refresher never publishes dividend events. Automatic refresh and bounded public funding are release work.

## Browser and portability findings

The app supports explicit build-time local/devnet configuration, pins public devnet identities independently of the manifest, requests `solana:devnet` signatures, exposes devnet Explorer links and omits time controls. Local defaults are preserved.

Verification found and corrected:

- Surfpool's Linux HTTP and WebSocket ports need not be consecutive. Connections now use the actual `wsUrl`, validated as local-only in the frontend.
- Separately installed Solana libraries produce different `PublicKey` constructors. Local runtime instruction data and smoke checks now normalize this boundary. The production web bundle explicitly deduplicates `@solana/web3.js`.
- A failed native startup previously kept retrying WebSocket connections. It now exits promptly.
- Public RPC can return HTTP 429. Devnet requests now share a two-request scheduler and bounded 429/503 retries under one 15-second deadline, preserving caller cancellation and identical request bytes.
- Browser transaction assertions need real confirmation time. The opt-in [browser smoke harness](../scripts/protocol/devnet-browser-smoke.mjs) uses a static production build, 60-second assertions, progressive public receipts and one funding attempt. Development hot reloads cannot change the app during this proof.

The static production app completed a real devnet split and recombination through a browser-created temporary wallet: 10 TestKOx returned, zero PT/DR remaining and no browser errors. The [browser receipt](evidence/devnet-browser-acceptance-2026-09-18.json) and [independent finalized verification](evidence/devnet-browser-finalized-2026-09-18.json) record all three funding/holder transactions and exact balances. The harness supplied the actual public registry at the same-origin manifest route; every RPC request and transaction used public devnet. This verifies the production app, not a deployed HTTP service or an installed wallet extension.

Earlier browser attempts remain recorded as failures, not successful proofs. A browser-created disposable key is lost when that test browser closes; any unredeemed synthetic claims from failed attempts remain backed and are not swept.

## Release boundary

The source checks pass: 95 root tests, 15 devnet-runtime tests, five guided-runtime tests, type checking, isolated production builds and 44 browser regression cases. Actual production-browser devnet acceptance also passes as described above. Installed wallet extensions are not yet verified.

Next work:

1. Build the same-origin session broker and restricted RPC gateway. Each visitor/flow needs its own disposable chain, opaque session binding, creation limits, progress, expiry and explicit reset.
2. Persist global/per-wallet faucet quotas before enabling HTTP funding. Schedule only synthetic profile-observation refresh with the separate test attestor; never put admin or issuer keys in the web bundle or sandbox.
3. Use a release RPC configuration appropriate for multiple visitors. Browser backoff handles transient failures, but does not turn the shared public RPC into a capacity guarantee.
4. Verify two simultaneous visitor sessions, installed-wallet signing, desktop/mobile production flows, refresh/expiry recovery and rollback. Review pinned dependency findings and the existing GitHub workflow-scope blocker.
5. Publish the site after those checks; issuer outreach remains the user's next action afterward. Qualified issuer event history/finality and automated settlement remain separate work.

The Vercel CLI can start a new execution session from a snapshot after a prior one expires. The application must treat a stopped/expired session as expired; it must not silently resume a visitor against a recreated chain. Build snapshots must contain reviewed code only, with fresh runtime identities and keys on every new visitor session.
