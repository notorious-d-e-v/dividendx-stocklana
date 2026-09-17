# Issuer qualification review

Accepted 18 September 2026 under [unsigned dossier v1](../spec/issuer-qualification-v1.md). Sol implemented the server-only review package; Astra reviewed the code, checked real saved inputs and verified the results independently. This completes offline consistency review, not live issuer qualification or annual settlement.

## Delivered

The [issuer package](../packages/issuer-readers/README.md) now reviews saved observations across the selected xStocks, Backpack/Trek and Ondo identities. It checks catalog identity, source provenance, current event revisions, candidate company dates, factor encodings and raw current-mint evidence. Missing, conflicting and unsupported evidence stays visible. API decimal conversions remain distinct from historical onchain factors; company announcements remain candidate joins until issuer mapping is established.

Every dossier remains `blocked`, with `settlementReady: false` and `signable: false`. The command has no network requests, credential loading, approval override, EventInput builder or transaction writer. Detailed output is optional and private; stdout contains only allowlisted identities, counts, codes, timestamps and digests.

```sh
npm run review:issuers -- --year 2026 --snapshot /absolute/private/issuer-observations.json
```

Use an absolute `--supplement` path to include the preserved [public MSFTx candidates](evidence/msftx-qualification-candidates-2026-09-17.json). Add an absolute, owner-only `--archive-dir` outside the repository to retain a new detailed dossier. Existing evidence is never overwritten.

## Source acceptance

A fresh seven-request read matched MSFTx, Backpack MU.US and Ondo KOon. Its private snapshot and the public supplement produced five MSFTx current event heads, three candidate in-year ex-dates and two preserved unknown dates. The fourth Microsoft announcement, for November, remains unlinked; no issuer factor was invented. Backpack and Ondo retain their missing classified-event-ledger blockers.

Astra independently checked the raw mint/Clock bytes and hashes. August's stored MSFTx factor pair and activation time match the issuer record. This is configured-state corroboration, not proof of the historical update transaction or an authoritative ex-date join. March and May historical transitions remain unresolved. The [source follow-up](research/issuer-qualification-followup-2026-09-18.md) records the timing discrepancy, separate multiplier-history IDs and bounded RPC-search limitations.

Both the supplemented and observation-only reviews stayed blocked. A deterministic review after year-end removed only the maturity blocker; annual completeness, finality and custody remained unresolved. Detailed output permissions were independently checked as directory 0700 / file 0600. See the [safe summary](evidence/issuer-qualification-review-2026-09-18.json) and [parent verification](evidence/issuer-qualification-parent-review-2026-09-18.json); authenticated economics and credentials remain outside Git.

## Validation and limits

All **85 root tests** passed: 33 reference/legacy, 36 issuer-reader tests (including 14 qualification cases), and 16 Ondo transport tests. Fixture verification, type checking and an isolated production build passed. The focused 36-test package suite/build passed again after the final partial-history diagnostic correction; the root CLI help also passed.

No web, program or transaction-SDK source changed, so browser/SBF journeys were not repeated. The existing preview and both local runtimes remain untouched. The isolated build exposed duplicate physical wallet dependencies already present before this slice and a larger boot chunk; that bundle was not published. Remote CI remains inactive pending the previously documented GitHub workflow scope.

Next: resolve authoritative event/date/factor joins, historical transitions, correction/finality and complete-period policy, and verify ordinary vault custody. Only then introduce a reviewed attestor decision and settlement mapping. The still-open 2026 term cannot be finalized.
