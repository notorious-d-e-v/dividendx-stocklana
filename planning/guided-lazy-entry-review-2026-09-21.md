# Guided landing without a start gate

The 21 September request makes the existing guided hero and stock selector visible before creating a sandbox. [Entry contract](../spec/guided-lazy-entry.md).

## Release scope

`/` and `/demos/` render the tour immediately. Start guided tour scrolls to Part One while starting the private network; Get 100 starts the same network and continues the selected stock preparation. Private-session status and recovery remain inline beneath the hero. The separate wallet sandbox gate, accepted schema-4 runtime snapshot, public devnet, program and issuer qualification boundaries are unchanged.

Page views and selecting a company consume no sandbox start. A returning ready session resumes. Expired sessions require an explicit new start, and uncertain mutations are reconciled by reads rather than repeated automatically.

## Capacity

The [capacity audit](research/guided-launch-capacity-2026-09-21.md) records the original four simultaneous shared wallet/guided reservations, 100 starts per UTC day, six per visitor, 30 per IP, and 15-minute lifetimes. The user subsequently approved a launch target of 500 starts per UTC day at approximately $50/day. The verified 16-active profile uses separate per-session request meters under the [metering contract](../spec/guided-launch-metering.md). This is a bounded capacity target, not unlimited access or a hard Vercel billing cutoff.

## Verification

Source fixture/reference/issuer checks, type checking and hosted production build pass. The full browser run passed 96 of 97 tests; the remaining local-restart fixture incorrectly reset the runtime revision. After correcting it to match the real runtime's monotonic revisions, all 17 guided browser tests pass. All 19 hosted entry tests pass, including immediate rendering, both entry CTAs, overlapping clicks, startup polling, resume, inline expiry/reset/errors and delayed old-session responses. The 33 broker tests and 39 hosted-devnet tests pass. Independent code review found no release-blocking issue.

- [Real Blob probe](evidence/guided-capacity-meter-2026-09-21.json): 16 ready synthetic sessions, 484 retained records, 617,029-byte ledger, five rounds of 16 concurrent charges. All 80 charges succeeded with exact counters, no global ETag/revision changes and zero CAS conflicts. Charge latency from the local operator machine was p50 1.80s / p95 3.67s. All 17 probe blobs were deleted.
- [Provider startup probe](evidence/guided-capacity-provider-2026-09-21.json): 16 genuine isolated Vercel VMs from the accepted v4 snapshot, created in batches of four. All 16 became ready with distinct runtime IDs and correct idle guided state. Startup p50 10.19s / p95 13.16s. All 16 VMs were stopped and deleted; all 17 probe blobs were deleted. This is readiness and isolation evidence, not sixteen concurrent completed transaction journeys or an unlimited-traffic guarantee.

Production publication and full-journey acceptance remain pending.

## Rollback reference

Before this change the canonical domain served `dpl_7y1StLogJ4USR6RG7NqAgmiRWHm3`, URL `https://dividendx-stocklana-fkpbci99h-payai.vercel.app`, from main `03a23751e3ab271e42107bb1bcc5746067b4629b` (PR #6). The accepted runtime snapshot is `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq` and does not need rebuilding for this frontend change.

Once new metered sessions exist, that old backend is not an immediate rollback target: keep the meter-aware broker when reverting the frontend, or drain and verify expiry of all v1 sessions before a backend rollback. See the metering contract for retained-data compatibility.
