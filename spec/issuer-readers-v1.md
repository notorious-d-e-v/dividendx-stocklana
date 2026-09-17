# Issuer observations v1

17 September 2026. The next implementation slice after the accepted local wallet app. This implements the source-reader layer of [the annual architecture](../planning/adapter-decision.md). It does not change the annual program or turn incomplete observations into settlement attestations.

## Deliverable

A server-side `packages/issuer-readers` package and a one-shot CLI collect the existing 15 selected Solana assets across xStocks, Backpack/Trek and Ondo. The package exposes typed, validated observations with exact asset identity, source provenance, decimal strings, source records and explicit missing evidence. Future ingestion and operator tools can consume the same interface. Keep the app, running local network, existing fixtures and user narration unchanged.

The public CLI output is a compact summary: selected identity checks, observation counts, request status/time/digest, and blockers. Detailed normalized responses can be saved in a new private archive outside the repository. No issuer credentials or raw authenticated bodies enter Git, stdout or the browser. No scheduler, public HTTP service, wallet, signing or automatic program updates are added.

## Identity and provenance

Use the selected identities in `packages/demo-fixtures/catalog.json`; copy only identity fields into a typed catalog if needed and test equality to the source. Scope is six xStocks, three Backpack/Trek and six Ondo assets. The historical fixture's capability flags and multipliers are not live observations.

Bind every observation to issuer, `solana:mainnet-beta`, exact expected mint and symbol. Compare the current official registry's Solana address to the expected mint. Missing, duplicate or contradictory identities fail explicitly; never substitute another issuer or chain. Compare decimals where the source actually supplies them; otherwise record that decimals were not re-observed. A registry match is not a current onchain extension check or custody permission.

Every HTTP observation records its allowlisted endpoint, retrieval time, response status and SHA-256 of the original response bytes. Preserve a source timestamp separately when supplied; retrieval time is not event time or a claim that source content is current. Errors use stable sanitized codes, never raw response text or headers. Record partial results without treating them as complete.

## Source readers

- **xStocks:** fetch each selected asset's registry record and its paginated corporate-action history. Preserve event ID, integer source version, action/status, exact old/new decimal strings, created/effective times and source digest. Retain all observed versions; derive latest heads only when equal ID/version records agree. Conflicting duplicates, invalid numbers, inconsistent pagination, repeated pages, page limits and partial fetches block history completeness. A fully fetched endpoint is not a complete annual ledger or an issuer finality attestation. Preserve unsupported actions. Never reinterpret `Initial`, payment/effective timestamps or absent events as finalized dividends, official ex-dates or cancellations.
- **Backpack/Trek:** fetch the public assets registry once and select only the exact `.US`/Solana entries. Preserve deposit/withdraw flags and supplied decimals. Brokerage listings and prepared/disabled mints do not prove current tokenization access. Return an explicit unavailable corporate-action ledger; do not fabricate events from the historical MU fixture or the present multiplier.
- **Ondo:** reuse the reviewed GET-only transport and external credential loader in `scripts/issuers/ondo-readonly.mjs`. Fetch shared addresses/status once plus each selected symbol's multiplier history and dividend information. Preserve multiplier strings and their change times as observations, and current/upcoming notices as notices. Neither is a normalized dividend event. A source pause, current multiplier, dividend payment date or omitted old status cannot supply an ex-date, cancellation or finality.

Source-specific schemas are validated at runtime. Unknown additional fields may be ignored; missing or malformed required fields produce an explicit failure for that component. Do not silently coerce numeric JSON factors into supposedly exact decimal strings. Unknown economics remain null or unavailable.

## Annual settlement boundary

Reports include `settlementReady: false` and explicit blockers for authoritative event-to-mint/factor binding, official civil ex-dates, revision/cancellation semantics, complete annual coverage/finality and live custody admission, as applicable. No current reviewed endpoint satisfies all of these. No helper in this package builds or submits settlement instructions.

Keep requested calendar year separate from source effective times. Do not discard records based on activation/payment year when the official ex-date is unknown. Empty arrays, HTTP success, fully fetched pages, unchanged multipliers and lack of upcoming notices never establish a zero-dividend year. No estimated or synthetic data may fill these gaps.

## Execution and storage

Use fixed documented HTTPS origins/paths, GET only, explicit deadline and response-size limits, bounded pagination, and no redirects. Keep the Ondo key restricted to its official origin. Stop further requests to an issuer on authentication/rate-limit failures, while allowing other issuers to report their own state. Missing credentials produce an unavailable Ondo result; public readers still work. No automatic retries or fallback to stale fixture data.

Run once on demand, with optional issuer/selected-symbol filters and an explicit year. Archive full normalized snapshots only into exclusive, owner-only files outside the repository; reject credential aliases and unsafe paths. Repeated runs create new snapshots rather than overwriting prior evidence. The default safe summary must not contain raw authenticated notices, economic fields, credentials or response bodies. Preserve existing checker behavior and its tests.

## Acceptance

Tests cover exact registry matching and chain separation; decimals when supplied; malformed schemas; exact decimal preservation; multiple events/revisions; idempotent duplicates and conflicting versions; pagination bounds/inconsistency and partial failure; unknown ex-dates and unsupported actions; empty data not proving zero/coverage; missing credentials, 401/403/429 and bounded transport; safe errors and key reflection; immutable private snapshots and safe summary projection. Use synthetic source-shaped tests rather than committed authenticated responses.

Run the package's type/build/tests, existing Ondo checker tests, root tests/type/build, and a bounded live read across the selected catalog. Commit only a sanitized acceptance report. Any live source failure remains visible and must not be replaced with invented success. Program, IDL, wallet transactions and browser behavior remain unchanged, so SBF or browser replays are unnecessary for this server-only slice.
