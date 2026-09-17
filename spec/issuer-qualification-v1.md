# Unsigned issuer qualification dossier v1

18 September 2026. Astra contract for the next server-only slice. Use existing issuer observations and public MSFTx candidate evidence to make the remaining settlement gaps inspectable and reproducible. No new trading demo, program/IDL change, signing, issuer admission or transaction submission.

## Purpose and trust boundary

A dossier separates four things: observed issuer records, candidate company-event matches, current onchain corroboration, and unresolved settlement decisions. It is a review artifact, not an attestation. `settlementReady` and `signable` are always false in v1. Its state is `blocked`; there is deliberately no policy override that turns supplied booleans or HTTP success into approval. A later reviewed issuer policy can introduce an explicit attestor decision without changing annual accounting.

This narrows the earlier proposed `blocked | reviewable` interface: current sources do not establish the semantics needed for an approval-capable tool. We can implement collection, consistency checks and field-gap reporting now, without inventing those semantics.

## Inputs and scope

Add a module and offline CLI to `packages/issuer-readers`. Consume a saved `dividendx-issuer-observations-v1` report from the existing reader, an explicit requested year and optionally one existing `dividendx-public-qualification-research-v1` supplemental artifact. The initial supplemental artifact is `planning/evidence/msftx-qualification-candidates-2026-09-17.json`. Keep the original report and its `settlementReady: false` unchanged. Support all selected assets; only xStocks currently exposes event revisions. Backpack and Ondo retain their own missing-event-ledger notices rather than having events synthesized from multiplier points or current pauses.

Runtime-validate unknown JSON. Match every selected identity against the frozen 15-asset catalog, including issuer, chain, symbol, mint, decimals and token program. Reject mismatched requested years, duplicate selected assets, mismatched issuer grouping/identity, malformed components and any attempt to assert readiness. Bound file size (8 MiB), assets (15), source records (10,000) and supplemental sources/announcements/joins (100 each). Use stable sanitized errors, never raw input or JSON parser messages.

The supplement binds exact issuer/mint/symbol and registry ISIN/underlying identity. Match each candidate link to an observed event ID and exact source version and to one company announcement. Validate civil dates strictly (including leap years), source URL shape (HTTPS, no credentials), SHA-256 shape, retrieval timestamps and company identity. Missing, ambiguous, stale-revision or conflicting joins remain explicit blockers. Reusing one company announcement for two different current event IDs is a duplicate-entitlement blocker. Unsupported/mismatched supplements must not silently disappear.

Candidate annotations are researcher assertions backed by source references. Loading their recorded hash does not re-download or independently authenticate a document, and a successful consistency check never upgrades a candidate join to an authoritative issuer join.

## Event review

Recompute current heads from all observed xStocks revisions; never trust a saved `latestObservedHeads` array. Identical semantic ID/version duplicates are idempotent, conflicting duplicates block, and higher versions replace earlier ones. Preserve prior revisions in the dossier. Source versions can start at zero; do not invent a positive program revision mapping. Unknown status/action strings, cancellations and correction labels remain unresolved until a versioned issuer policy explains them.

For every current head report:

- Exact source identity/version/digest, source action/status and original effective/created timestamps.
- Candidate company ex-date and payment date separately, with `in_year | outside_year | unknown` membership based only on the civil ex-date. Unknown ex-dates must not be filtered by activation year. Future ex-dates remain visible; they do not establish an occurred event.
- Exact original M0/M1 decimal strings and, when supported, binary64 **candidate encodings** using the existing SDK arithmetic. Label these as derived from API decimals, never observed historical mint bits. Reject zero/negative/nonfinite/subnormal/out-of-domain factors; a falling factor cannot be treated as an ordinary reinvested dividend.
- Missing EventInput evidence: authoritative classification/join, historical before/after bits, source finality, observed slot and normalized revision mapping as applicable. No EventInput, instruction or signed payload is emitted.

A candidate match to a known out-of-year announcement is evidence to review, not permission to discard an unresolved issuer record. `CashDividend` alone does not prove the approved ordinary-dividend taxonomy. Never resolve `Initial`, cancellation, confirmed-zero or unsupported actions by guessing. Track effective times independently from ex-dates. A completed page query, empty history or all current records being consistent is never complete annual coverage.

## Current mint evidence

If the supplemental artifact contains a current mint observation, independently check the pinned mainnet genesis, finalized commitment, context slot, exact mint/Token-2022 owner, SHA-256 of raw mint and Clock bytes, and Clock identity. Decode the raw mint and Clock through the existing SDK/token helpers, recompute profile/factors and compare any claimed latest-factor match. A wrong hash/profile/identity is a blocker; do not trust precomputed booleans. This is current state only and cannot fill historical-factor or custody-admission gates. Preserve retrieval time; a supplied `now` and maximum observation age allow deterministic stale/future-time checks. Default maximum age is 24 hours for review, not a production finality policy.

## Outputs and storage

Detailed dossier: schema/version, requested year, exact selected assets, observation/supplement file digests (distinct from source response digests), observation times, event/revision reviews, current-mint consistency, per-event/per-asset blockers, and annual/custody/policy blockers. Maturity is January 1 UTC after the requested year. Before then add `term_not_matured`; after then still require complete annual coverage, resolved finality and custody. No zero-year inference, allocation quote or automatic writer.

CLI: `review --year YYYY --snapshot /private/report.json [--supplement /path/to/public-evidence.json] [--archive-dir /private/review-dir]`. It does not fetch, schedule, open a wallet or read an API key. CLI stdout is an allowlisted compact summary: catalog identity, counts, stable codes, timestamps/digests and readiness false. Do not expose authenticated Ondo economics, arbitrary source text, URLs with queries or file contents. Expected qualification blockers are a successful review (exit 0); malformed input/I/O errors are exit 1.

Detailed dossiers use a new exclusive owner-only file in a private directory outside the repository, reusing existing directory safety checks. Do not overwrite evidence. Reject credential-file aliases (including the known Ondo env path), symlinks for inputs, nonregular/oversized input files and public output paths. Digest the actual bytes read. No detailed artifact is printed on error or stored by default. Provide usage and proof boundaries in the package README.

## Acceptance

Tests cover catalog/year/group identity, malformed files, candidate dates including leap boundaries and wrong-year membership, missing/ambiguous links, outdated linked revisions, duplicate entitlement, replacement and same-version conflicts, invalid/falling factors, unsupported/cancelled/Initial records, zero-version preservation, empty/partial history, maturity without completeness, stale/future observations, tampered mint/Clock bytes or claims, summary secret-reflection resistance and private exclusive archives. Successful current-mint checks must still leave historical/finality/custody blockers.

Run package and root tests/type/build. Independently generate a real MSFTx dossier from the existing reader and public candidate artifact, plus an observation-only mixed-issuer review. All must remain blocked with precise missing evidence. Preserve the running preview and both local chains; browser/SBF replays are unnecessary because no product or program behavior changes.
