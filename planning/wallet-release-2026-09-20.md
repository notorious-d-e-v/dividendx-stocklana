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

Pending deployment and verification. Preserve this release's PR, exact deployment/commit identity and fresh production evidence in the follow-up acceptance record.
