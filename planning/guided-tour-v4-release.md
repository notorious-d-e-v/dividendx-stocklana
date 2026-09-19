# Guided tour v4 release — 19 September 2026

The user approved publication after the final restart-scroll fix. The release preserves the approved three-part tour: split and recombine, observe two sample dividends, then trade dividend rights through Raydium and redeem independently. “Run the journey again” returns focus and scroll to Part One after the replacement runtime is ready, respecting reduced motion.

## Candidate acceptance

- 95 root tests, 69 browser tests, 36 hosted-devnet tests, 18 broker tests, 18 gateway tests and five guided-runtime tests pass. Typecheck and isolated application build pass.
- [Code-only Linux snapshot](evidence/hosted-runtime-snapshot-v4-2026-09-19.json): schema 4, `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq`. All 63 source hashes match the staged build. No visitor state, private signers or credentials were included.
- [Native and wallet checks](evidence/linux-runtime-v4-2026-09-19.json) pass. The parent harness then expected a receipt in smoke stdout and stopped; this was a reporting error. [Corrected three-profile proof](evidence/linux-runtime-v4-2026-09-19-r2.json) reads the complete receipt and passes 40 transactions, four annual events and exact backing for each profile. Both test VMs were cleaned up.
- [Provider acceptance](evidence/hosted-provider-probe-v4-2026-09-19.json) verifies distinct wallet/guided runtimes, schema-4 idle state, cross-visitor denial, restricted RPC and gateway authentication. Both temporary providers and the separate probe ledger were deleted.
- A pre-existing devnet test used the wall clock after a simulated restart. Its fixture now preserves the test clock and expires the outstanding preparation lease before retrying. Production devnet service code is unchanged.
- The final full browser run passes all 69 tests. An earlier run overlapped a build and had two transient browser failures; the isolated final run is the acceptance result.

The pinned program ELF and transaction SDK are unchanged. Synthetic stock/dividend inputs do not establish live issuer settlement.

## Coordinated publication

[PR #1](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/1) merged as `db19e1991bf4a46215a3ed1452c7058196db3ddb`. The exact production build passed in a disposable checkout. Vercel preview passed; production deployment `dpl_DNG5syh8pbQp9GDWhVh1d61qdpB6` (`dividendx-stocklana-7pvpmebjx-payai.vercel.app`) became ready on the canonical domain. Production and preview select the verified schema-4 snapshot.

Known-good rollback target before this release: `dpl_rZ5RHu9389Y9G7yms2ZBbxq12kNM` (`dividendx-stocklana-c54vw3iml-payai.vercel.app`). Previous snapshot: `snap_cwWXbrpD6HwniFIXD0cB8mzWGrwh`. Rollback must restore compatible site/snapshot settings; it does not reverse transactions or delete visitor ledgers. Quotas, origins, cron and public-faucet budgets remain unchanged.


## Production acceptance

[Actual Chrome acceptance](evidence/hosted-guided-v4-production-2026-09-19-r3.json) passes on `https://dividendx.payai.network/demos/`: one setup plus all 15 guided actions, 40 unique confirmed transactions matching state and receipt, the 40.8-stock dividend result, and no horizontal overflow at 1440/390 pixels. Guided RPC remains private; hosted confirmation is checked against runtime receipts, with separate native/Linux execution evidence above.

“Run the journey again” sends exactly one guarded reset, obtains a different session and runtime, returns to idle stock selection, focuses `core-heading`, and scrolls Part One to 24 pixels from the viewport top. It does not fund or advance the new demo automatically. The old path returns 410; two expected stale-path browser records during replacement are distinguished from unexpected errors. No unexpected browser errors occurred. Test sessions retain their normal 15-minute expiry.

[Read-only production checks](evidence/hosted-v4-production-readonly-2026-09-19.json) pass for all four pages, the devnet manifest and both session status routes. Devnet still has three synthetic profiles and no clock control. The existing six-hour cron is unchanged; a bounded post-deployment error query returned no records.

Earlier acceptance attempts remain preserved: the [first](evidence/hosted-guided-v4-production-2026-09-19.json) stopped before browser launch because bundled Chromium was absent; installed Chrome resolved it. The [second](evidence/hosted-guided-v4-production-2026-09-19-r2.json) completed all 15 actions before the driver requested a deliberately unavailable guided RPC route. The driver now compares state and receipts without widening the production API. The final run above passes including restart.
