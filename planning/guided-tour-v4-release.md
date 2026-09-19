# Guided tour v4 release — 19 September 2026

The user approved publication after the final restart-scroll fix. This candidate preserves the approved three-part tour: split and recombine, observe two sample dividends, then trade dividend rights through Raydium and redeem independently. “Run the journey again” returns focus and scroll to Part One after the replacement runtime is ready, respecting reduced motion.

## Candidate acceptance

- 95 root tests, 69 browser tests, 36 hosted-devnet tests, 18 broker tests, 18 gateway tests and five guided-runtime tests pass. Typecheck and isolated application build pass.
- [Code-only Linux snapshot](evidence/hosted-runtime-snapshot-v4-2026-09-19.json): schema 4, `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq`. All 63 source hashes match the staged build. No visitor state, private signers or credentials were included.
- [Native and wallet checks](evidence/linux-runtime-v4-2026-09-19.json) pass. The parent harness then expected a receipt in smoke stdout and stopped; this was a reporting error. [Corrected three-profile proof](evidence/linux-runtime-v4-2026-09-19-r2.json) reads the complete receipt and passes 40 transactions, four annual events and exact backing for each profile. Both test VMs were cleaned up.
- [Provider acceptance](evidence/hosted-provider-probe-v4-2026-09-19.json) verifies distinct wallet/guided runtimes, schema-4 idle state, cross-visitor denial, restricted RPC and gateway authentication. Both temporary providers and the separate probe ledger were deleted.
- A pre-existing devnet test used the wall clock after a simulated restart. Its fixture now preserves the test clock and expires the outstanding preparation lease before retrying. Production devnet service code is unchanged.
- The final full browser run passes all 69 tests. An earlier run overlapped a build and had two transient browser failures; the isolated final run is the acceptance result.

The pinned program ELF and transaction SDK are unchanged. Synthetic stock/dividend inputs do not establish live issuer settlement.

## Coordinated publication

The reviewed schema-4 site and matching snapshot must ship together. Update the production and preview snapshot setting before merging the release PR; existing deployments retain their prior environment. Verify the Git-triggered production deployment on the canonical domain with the opt-in hosted browser smoke, including actual restart behavior. Record those results in a follow-up acceptance entry.

Known-good rollback target before this release: `dpl_rZ5RHu9389Y9G7yms2ZBbxq12kNM` (`dividendx-stocklana-c54vw3iml-payai.vercel.app`). Previous snapshot: `snap_cwWXbrpD6HwniFIXD0cB8mzWGrwh`. Rollback must restore compatible site/snapshot settings; it does not reverse transactions or delete visitor ledgers. Quotas, origins, cron and public-faucet budgets remain unchanged.
