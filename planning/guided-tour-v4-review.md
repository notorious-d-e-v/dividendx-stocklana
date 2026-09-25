# Guided tour v4 — acceptance, 19 September 2026

Released at [divx.payai.network/demos/](https://divx.payai.network/demos/), following the [three-chapter specification](../spec/guided-tour-v4.md). The matching [code-only v4 runtime snapshot](evidence/hosted-runtime-snapshot-v4-2026-09-19.json) was published with the site; see the [release review](guided-tour-v4-release.md). Earlier [v3 evidence](guided-tour-review.md) is preserved.

## Result

The disclosure now has two short bullets. The approved hero remains, with a tokenized-stock example; “And back.” is blue. Choosing a company and getting 100 stocks is one action. Split titles and buttons use the chosen company, and normal copy uses USDC without repeated test labels. Detailed synthetic-asset provenance remains in evidence.

Part One splits and recombines 40 then 60 pairs. Part Two splits before the cutoff, records two sample quarterly dividends, then recombines 40 pairs into 40.8 displayed stocks. The remaining 60 pairs carry into Part Three's Raydium flow. No annual cutoff is reopened and the clock never moves backward. DR buyers acquire accrued as well as subsequent annual entitlement.

“What changed” feedback shows the effect of each action. Links lead to wallet balances and back to the next action, without automatic scrolling. Quarterly feedback uses the observed vault amount and multiplier, so users see 101 then 102 stocks backing the same 100 pairs. The public-devnet proof box is removed from the learning flow; future demos remain noninteractive.

## Verification

- [Three-profile native evidence](evidence/guided-tour-v4-profiles-2026-09-19.json): all three decimal profiles complete 15 actions and 40 confirmed transactions. Parent review checks exact balances, chronological timestamps, multiplier bits, LP conservation, four-event finalization and final backing. Final native reruns additionally verify that a new deposit quote is rejected after the cutoff.
- [Actual Chrome journey](evidence/guided-tour-v4-browser-2026-09-19.json): one start plus 15 action requests, each sent once; all 40 signatures independently confirmed by RPC. The observed 40.8 result, reload continuity, scroll-only chapter controls, keyboard access, reduced motion and 1440/390 layouts pass. No unexpected browser errors.
- Root tests: 95 passed. Final browser regression: 64/64 passed with isolated output. Guided runtime: 5/5; gateway: 18/18; broker: 18/18. Typecheck and isolated production build pass. Two final company-name/history copy refinements also pass 11 focused guided browser checks.
- No Solana program or transaction SDK changes. Accepted program ELF remains `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`.

The first regression run had a product-navigation timeout and a missing trace file while separate runners shared their output directory. A fresh full run with isolated output and three workers passed all 64 tests. Existing user-modified artwork and approved QA captures were restored after test-generated screenshots.

Native execution exposed Raydium's LP rounding: the second liquidity addition leaves 12/0/38 raw DR units for the 8/6/9-decimal profiles. The runtime checks exact debits from minted LP and pre-deposit reserves, preserves the holder's remainder, and recombines it later. It does not donate dust merely to make displayed totals round. Runtime evidence writes are serialized to avoid temporary-file collisions.

Reviewed images: [hero](../apps/web/qa/guided-tour-v4-before-1440.png), [split](../apps/web/qa/guided-tour-v4-part-one-1440.png), [dividends desktop](../apps/web/qa/guided-tour-v4-dividend-chapter-1440.png), [dividends mobile](../apps/web/qa/guided-tour-v4-dividend-chapter-390.png), and [completed tour](../apps/web/qa/guided-tour-v4-final-1440.png). Captures precede the final small company-name/history wording refinements; interaction and accounting are unchanged.

## Publication boundary

State, receipts, client, broker and gateway now require schema 4. Snapshot `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq` was built from a new allowlisted code-only context; its [Linux proof](evidence/linux-runtime-v4-2026-09-19-r2.json) and [provider isolation probe](evidence/hosted-provider-probe-v4-2026-09-19.json) pass. Production and preview now select the v4 snapshot; the original v2 artifact remains available for rollback. No live issuer custody, actual dividend feed, mainnet, new venue or public funding is established by this demo.

## Follow-up UI polish

The next user review removes the extra Part One introduction, replaces its explanation with two bullets, and uses clean ticker/issuer display labels while preserving canonical contract IDs. The picker says “your test wallet.” A brief wallet-link wiggle runs after a new completion, preserves focus, stops without looping and respects reduced motion. Buyer copy gives possible trading and hedging motivations. The PT-trading roadmap card is removed.

Withdrawal feedback compares observed USDC against the fixed 10 USDC supplied and explains that a buyer exchanged USDC for DR. In the preserved transaction snapshot, this renders 10.999595 USDC returned, 0.999595 more than supplied, with fewer DR. It does not describe the whole difference as fees or profit. Lower-return and reload cases are covered.

Verification: 95 root tests and all 68 browser tests pass; typecheck, isolated production build and diff checks pass. [Visual review](evidence/guided-tour-v4-polish-visual-2026-09-19.json) renders a preserved transaction snapshot at 1440 and 390 pixels without overflow; these are UI checks, not new transaction execution. Reviewed captures: [core desktop](../apps/web/qa/guided-tour-v4-polish-core-1440.png), [core mobile](../apps/web/qa/guided-tour-v4-polish-core-390.png), [withdrawal desktop](../apps/web/qa/guided-tour-v4-polish-withdrawal-1440.png), [withdrawal mobile](../apps/web/qa/guided-tour-v4-polish-withdrawal-390.png). Existing runtime state, approved captures, user artwork and previous evidence are preserved. No push, deployment or runtime restart occurred.

## Release candidate update

The final local and hosted-mock browser checks verify that starting another tour after completion returns scroll and keyboard focus to Part One. The candidate passes 69 browser tests, 95 root tests, 36 hosted-devnet tests, 18 broker tests, 18 gateway tests and five guided-runtime tests, plus type checking and an isolated production build. The Linux and provider isolation probes pass; the [release review](guided-tour-v4-release.md) records passing production-browser acceptance, including all 40 transactions and the actual restart scroll/focus.
