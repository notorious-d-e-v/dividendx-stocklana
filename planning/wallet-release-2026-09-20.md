# Wallet and navigation release — 20 September 2026

The user approved the [Market balances](wallet-market-balances-review-2026-09-20.md), [stock modal and illustration](wallet-stock-modal-review-2026-09-20.md), [wallet discovery](wallet-polish-review-2026-09-20.md), and [navigation](navigation-wallet-review-2026-09-20.md) passes for PR review, main merge and production publication.

## Release scope

Guided Demos becomes `/`, with `/demos/` retained. Visible navigation contains Public Devnet and Guided Demos; `/sandbox/`, `/reference/` and `/rehearsal/` remain direct-link surfaces. Market shows owned stock/PT/DR balances or the company catalog, with Wallet Standard connection in the header, company-color dots, a brand-guide hero, stock funding dialogs, correctly scoped balances and fresh-quote transaction controls. Split/Redeem remain focused action views, and confirmed splits link to Redeem.

No program, issuer settlement writer, runtime snapshot, faucet/observation budget, authority, mainnet mint or cron cadence change is included. The fifteen-profile backend was already released in [PR #3](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/3). The accepted guided v4 snapshot remains `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq`.

## Before publication

- Known-good production: `https://dividendx-stocklana-a0ir4lh27-payai.vercel.app`, Git commit `6e79a76192258af8530cbe874c02d2c14fa6b6b0`.
- Local acceptance: 95 root tests, 95 browser cases, type check and build pass. The browser suite ran on isolated local port 4185; read-only devnet browser review and desktop/mobile fixture captures passed. The preceding UI pass also proved an actual two-transaction AAPLon split/recombine without a faucet grant.
- Independent source review found no release-blocking navigation/session/wallet integration issue. The existing user-edited `positions-complete-desktop.png` matches its preserved backup and is excluded from this release commit.
- Publication and production acceptance are recorded after the reviewed merge. Local proof alone is not production acceptance.

## Production acceptance

[PR #4](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/4) merged as `35b1fd0124a86be1bc7324d39164c320e9183898`. The passing Vercel preview was followed by ready production deployment `https://dividendx-stocklana-a6b3diz7m-payai.vercel.app`, serving the canonical domain. The exact Vercel build passed in a detached checkout; 39 hosted-devnet, 18 broker, 18 gateway, five guided-runtime and three review-bridge tests passed. Gateway/guided HTTP tests first lacked permission to bind loopback; the permitted reruns passed. Deployment dry-run input excludes credentials, signers, local runtime state, dependencies, evidence and old build output.

- [Canonical read-only checks](evidence/hosted-wallet-release-readonly-2026-09-20.json): `/`, `/demos/`, `/app/`, `/reference/`, `/sandbox/`, `/rehearsal/` and the exact generated hero asset returned 200. Root and `/demos/` serve identical entry HTML. The manifest retains 15 synthetic profiles, the expected devnet runtime and no clock controls. Both session-status GETs work.
- [Actual production guided tour](evidence/hosted-wallet-release-guided-2026-09-20.json): 15 steps and 40 confirmed transaction receipts, with the 40.8-stock partial-exit display and responsive desktop/mobile checks. Restart performs one reset, yields a new idle runtime, focuses Part One and scrolls it to 24px from the top. The prior path returns 410; expected stale-path responses are distinguished from unexpected errors. Guided confirmations come from runtime state/receipts, with the separately accepted Linux execution proof retained.
- [Actual public-devnet wallet](evidence/hosted-wallet-release-devnet-2026-09-20-r2.json): one ten-token grant, its idempotent duplicate check, one-unit split and recombination. Ending balances are 10 stock / 0 PT / 0 DR; three signatures independently passed RPC confirmation checks. At capture, grant and split were finalized and recombination confirmed. Solscan links include `cluster=devnet`; no browser errors or desktop/mobile overflow occurred.
- The [first devnet attempt](evidence/hosted-wallet-release-devnet-2026-09-20.json) confirmed grant and split, then its driver asserted immediately while the correct fresh-quote gate still disabled recombination. It submitted no redeem. The driver now waits boundedly for readiness before its single click; the new run above passes. The first disposable wallet's remaining test claims and the spent test-SOL grant remain in the evidence; no ledger or transaction history was erased.
- The existing cron remains `/api/cron/refresh-observations` at `0 */6 * * *`. A bounded 15-minute production error-log query after release returned no records. No cron invocation or budget increase was performed.

The user-edited QA positions image remains outside these PRs and matches its preserved backup. Program, snapshot, issuer qualification and installed-extension proof boundaries are unchanged. Rollback to the recorded prior deployment affects serving code only; it does not undo signatures, faucet usage, VM sessions or durable quotas.
