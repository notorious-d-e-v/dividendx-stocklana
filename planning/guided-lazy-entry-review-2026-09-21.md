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

PR #7 deployed main `b57e3f153d25b6e84a1ac2d1f8a7e14a46574f75` to production deployment `dpl_GajR2cJtL8HseEHvoRHNcVLryaSY`. Immediate root rendering and direct IBM preparation were observed on the canonical domain. Full-journey acceptance remains pending: the first Chrome run reached LP withdrawal, then a transient private Blob GET HTTP 5xx interrupted recombination. No failed mutation was automatically replayed. An earlier driver attempt could not launch its missing bundled browser; the actual run used installed Chrome.

The follow-up fixes retry only transient Blob reads once within the existing ten-second deadline, leaving writes untouched. They also expose “Check sandbox status” for uncertain starts even when the previous session is failed/expired, before offering another reset. All 38 hosted/guided browser checks, 34 broker checks, root tests, type checking and hosted build pass. [PR #8](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/8) published those fixes as `fc45dc86a1c6c5bda9c169d3b321b7b3b85fba9e`, deployment `dpl_B1xS5ECV6mdeuVeXhL6wtvpLVxV3`.

That deployment's next acceptance run exposed a separate [foreground-action timing race](evidence/guided-launch-action-race-2026-09-21.json): polling could display the next enabled button before the previous foreground request released its lock. The click was ignored and no transaction was submitted. Controls now remain disabled through that request; the browser driver waits for enabled state and still clicks only once. A deterministic delayed-read regression passes, alongside all 39 hosted/guided browser checks, type checking and the hosted production build.

## Production acceptance

[PR #9](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/9) published the final action-readiness correction as `b63f44e63fbd4192df170f83abcd3fac8d00b140`. Canonical production deployment `dpl_AmB5uFVMdfB84us8dsgniqJSp21g` (`https://dividendx-stocklana-dxfb2n9iu-payai.vercel.app`) is Ready. The [complete live browser evidence](evidence/hosted-guided-launch-accepted-2026-09-21.json) passes all 15 guided actions and 40 confirmed transactions, dividend allocation display of 40.8 stocks, both independent final redemptions, accounting/receipt checks and desktop/mobile overflow checks. No browser errors occurred. Completed-tour restart issued exactly one reset, returned focus to Part One, created a distinct idle runtime and made the old endpoint return 410.

Separate in-app-browser inspection of the canonical root confirmed immediate hero/stock selection, with no full-screen gate. Clicking Get 100 tokenized Micron directly from an expired session started a replacement inline and displayed 100 Micron stocks, zero PT/DR and nine setup transaction records, ready to split. Earlier direct IBM preparation and read-only reload also preserved the selected stock and balance. These are actual isolated synthetic-chain actions, not live issuer custody.

The 16-VM probe resources and temporary credential file were cleaned up. Production acceptance sessions retain the normal 15-minute expiry. Limits remain 16 simultaneous shared wallet/guided reservations, 500 starts per UTC day, six starts per visitor cookie and 30 per IP; resets count as starts. Capacity is bounded and admission can still be refused during a burst or after a daily quota. Approximately $50/day remains a target rather than an enforced Vercel spending ceiling.

## Rollback reference

Before this change the canonical domain served `dpl_7y1StLogJ4USR6RG7NqAgmiRWHm3`, URL `https://dividendx-stocklana-fkpbci99h-payai.vercel.app`, from main `03a23751e3ab271e42107bb1bcc5746067b4629b` (PR #6). The accepted runtime snapshot is `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq` and does not need rebuilding for this frontend change.

Once new metered sessions exist, that old backend is not an immediate rollback target: keep the meter-aware broker when reverting the frontend, or drain and verify expiry of all v1 sessions before a backend rollback. See the metering contract for retained-data compatibility.
