# DivX demo fixtures

Frozen rehearsal data for 15 Solana Token-2022 mints across xStocks, Backpack, and Ondo. Every value is a 16 September 2026 evidence snapshot. The catalog is not a permissioned inventory, launch list, custody result, execution result, liquidity claim, or live issuer integration.

## Files

- `catalog.json`: 15 `AssetDescriptor` records, split xStocks 6, Backpack 3, and Ondo 6. `effectiveMultiplier` is the time-effective value at `snapshotAt`.
- `events.json`: exactly two trusted frozen replay records: KOx issuer API evidence and Backpack MU finalized onchain reconstruction.
- `manifest.json`: fixture and primary-evidence hashes plus provenance timestamps.
- `verify.mjs`: checks exact mint identities against the original package, fixture joins, capability flags and hashes. Run `node packages/demo-fixtures/verify.mjs` from the project root.

`AssetDescriptor.id` is `${issuerId}:${mint}`. Event `assetId` joins to that field. All decimal quantities are strings. Every catalog capability deliberately has `custodyTested`, `executionTested`, and `liveEnabled` set to `false`.

The other five xStocks assets have official classified cash-dividend history, but this package does not freeze execution fixtures for them. Backpack NKE and IBM have no reviewed Backpack dividend event. Ondo assets are mechanically observed mints with no authenticated event binding.

## Frozen event values

| Event | Evidence | M0 | M1 | Event time |
|---|---|---:|---:|---|
| `xstocks-kox-2026-09-15` | issuer API, event `75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e`, revision `2`, status `Initial` | `1.0183317967386898` | `1.0225601246249238` | `2026-09-15T00:30:00Z` |
| `backpack-mu-2026-07-23` | finalized onchain reconstruction with no issuer event ID or revision | `1` | `1.000106726714702` | `2026-07-23T20:29:52Z` |

KOx `referencePriceUsd=89.35` is a historical event-implied value derived from the frozen event fields. It is not a live, observed, or executable quote. Backpack MU has no verified net cashflow or execution price, so both USD fields remain `null`. Its catalog snapshot multiplier is `1.0001068649823912`; later supply-maintenance calls caused that drift, so it must never replace the event's exact `m1=1.000106726714702`.

## Digest binding

Each event's `sourceDigest` is SHA-256 over the exact bytes of its cited primary local evidence file:

- KOx: `planning/evidence/real-events-2026-09-16.json` → `c0234122397a57b85e74f8570e45faec75499e2dcf57eb8b84f11513f7486483`
- Backpack MU: `planning/evidence/backpack-scope-mu-event-2026-09-16.json` → `632458919a61aff65c310d23a1e3c2fbf516ad102ad378b8a79adde657189770`

The fixtures perform no network access. Consumers should treat all URLs as provenance only and all records as historical snapshots.
