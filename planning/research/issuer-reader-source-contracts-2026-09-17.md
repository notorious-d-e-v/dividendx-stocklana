# Issuer reader source contracts: xStocks and Backpack/Trek

Verified 17 September 2026 from official documentation, bounded public GETs, the selected package and prior evidence. This is an implementation contract for the server-side observation reader. It does not establish settlement readiness, issuer finality, official ex-dates or complete annual coverage.

## Result

| Family | Public reader result | Event ledger result |
|---|---|---|
| xStocks | Exact symbol-to-Solana-mint discovery and paginated classified corporate-action history are available without authentication. | Useful source records, but no official ex-date, reference-market binding, cancellation semantics, annual-completeness assertion or finality rule. Every observed KOx record remains `status=Initial`. |
| Backpack/Trek | One unpaginated assets response supplies `.US` identity, nested Solana mint, integer decimals, deposit/withdraw flags and string limits/fees. | Unavailable. The official API documents no corporate-action, dividend, revision or correction endpoint. The historical MU transaction remains an `onchain_reconstruction`, not a live issuer ledger. |

Both readers must therefore return `settlementReady: false`. A successful, fully consumed HTTP response proves only what that response contains.

## Stable selected-asset lookup

Use [`packages/demo-fixtures/catalog.json`](../../packages/demo-fixtures/catalog.json) only for the immutable expected identity tuple: `(issuerId, symbol, solana:mainnet-beta, mint, tokenProgram, decimals)`. Do not consume its historical multiplier, capability flags or event fixture as a live observation.

For xStocks, request the exact catalog symbol and require exactly one `deployments[]` item whose `network` is `Solana`; its `address` must equal the catalog mint. For Backpack, find exactly one top-level item with the catalog `.US` symbol, then exactly one nested `tokens[]` item whose `blockchain` is `Solana`; `contractAddress` and `nativeDecimals` must equal the catalog mint and decimals. Missing or duplicate symbols/deployments/tokens, chain mismatches and mint mismatches are hard component failures. Never fall back to ticker text, metadata or another chain.

The selected Backpack rows rechecked live were:

| Symbol | Exact mint | `nativeDecimals` | Deposit / withdraw |
|---|---|---:|---|
| `MU.US` | `MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1` | 6 | `true` / `true` |
| `NKE.US` | `NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg` | 6 | `true` / `true` |
| `IBM.US` | `BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk` | 6 | `true` / `true` |

The selected xStocks and Backpack identities remain those in the [15-mint package](initial-asset-package.md). The reader should compare against the package rather than copy a second editable allowlist.

## xStocks public contract

Official references: [Assets](https://docs.xstocks.fi/apis/openapi/assets), [corporate actions](https://docs.xstocks.fi/apis/openapi/corporate-actions), [multiplier guide](https://docs.xstocks.fi/developers/multipliers), and [v2 changelog](https://docs.xstocks.fi/changelog).

### Required GETs

1. `GET https://api.xstocks.fi/api/v2/public/assets/{symbol}`
2. `GET https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol={symbol}&sortBy=createdTimeUtc&sortOrder=asc`

The exact-symbol asset response supplies `id`, `symbol`, `isin`, nullable `underlying`, `isTradingHalted`, nullable `trading`, and `deployments[]`. Relevant identity paths are `symbol`, `isin`, `underlying.symbol`, `underlying.isin`, `underlying.listingCountry`, `deployments[].network`, and `deployments[].address`. It does **not** supply stock-token decimals. Record decimals as not re-observed by this source; do not borrow decimals from a stablecoin entry.

Corporate-action history uses **one-indexed** pages: documented `page >= 1`, default 1, `pageSize` 1–100, default 10. The response is:

```text
page: {
  currentPage: integer,
  pageSize: integer,
  totalPages: integer,
  totalNodes: integer,
  hasNextPage: boolean,
  hasPreviousPage: boolean
}
nodes[]: {
  eventId: string,
  version: integer,
  xstockSymbol: string,
  spvSymbol: string,
  caType: string,
  effectiveTimeUtc: RFC3339 string,
  multiplierOld: decimal string,
  multiplierNew: decimal string,
  grossCashflowUsd: decimal string | null,
  netCashflowUsd: decimal string | null,
  withholdingTaxRate: decimal string | null,
  fromUnits: decimal string | null,
  toUnits: decimal string | null,
  redemptionPriceUsd: decimal string | null,
  notes: string | null,
  createdTimeUtc: RFC3339 string,
  status: string,
  xstockIsin: string,
  spvIsin: string
}
```

Preserve decimal strings verbatim. Reject a JSON number where an exact multiplier or economic decimal string is required. Preserve unsupported `caType` and unknown `status` values so they can block normalization instead of disappearing.

For each page require `currentPage` to equal the requested page, `1 <= pageSize <= 100`, `nodes.length <= pageSize`, coherent nonnegative totals, and coherent previous/next flags. Continue only while `hasNextPage=true`; increment by one; reject a repeated page, a changed page size or totals, a page past the declared total, or the configured page/node/byte limit. A partial fetch stays partial. `createdAfter` is unsuitable for proving complete history unless a previously archived boundary and overlap policy exist, so the one-shot baseline should paginate from page 1.

### Optional multiplier corroboration

`GET /api/v2/public/assets/{symbol}/multiplier/history?page=0&pageSize=100&network=Solana` is **zero-indexed**, unlike corporate history. Its `page` has `currentPage` and `hasNextPage`; observed nodes have `id`, `reason`, numeric JSON `multiplier`, numeric JSON `previousMultiplier`, and `activationDateTime`.

Do not use this endpoint as the exact factor source: JSON numbers have already lost the lexical decimal representation required by the frozen specification. Its `id` is also a different namespace from corporate-action `eventId`. If collected later, treat it only as corroboration and join on the exact asset/network plus activation timestamp and before/after factor values after safe numeric comparison. An absent or contradictory corroborating row is a blocker, not permission to substitute the multiplier-history number.

The live KOx corporate history still returned five rows. The newest was event `75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e`, version 2, `CashDividend`, `Initial`, effective `2026-09-15T00:30:00.000Z`, with exact factor strings `1.0183317967386898` and `1.0225601246249238`. Its separate multiplier-history row used another ID.

### Revision and annual boundary

The stable source identity is `(eventId, version)`. Retain all versions. Byte/logical-identical duplicates may be idempotent; two unequal records with the same pair are contradictory. A latest head is the greatest integer version for one `eventId` only after all fetched copies agree. Do not assume versions are contiguous, interpret a higher version as final, or infer a cancellation from disappearance. `status=Initial` is not accepted finality.

The response contains no `exDate`, declaration date, record date, payable date, source exchange calendar or annual coverage/finality field. `effectiveTimeUtc` is the issuer activation time. Although the multiplier guide describes a normal activation at 00:30 UTC after ex-date, historical rows include other activation times; never derive a civil ex-date by subtracting a day. `underlying.listingCountry` and nullable `trading.exchange` do not establish the official reference market for entitlement.

Consequently, the reader must keep `officialExDate`, `referenceMarket`, `cancellationState`, `issuerFinality`, and `annualCompleteness` unavailable. Do not filter annual membership by `effectiveTimeUtc`. An empty year, all pages fetched, `totalNodes`, or the lack of upcoming records cannot prove a zero-dividend or closed year.

## Backpack/Trek public contract

Official references: [Backpack API](https://docs.backpack.exchange/) and the public [`GET /api/v1/assets`](https://api.backpack.exchange/api/v1/assets).

Use one request:

`GET https://api.backpack.exchange/api/v1/assets`

The response is an unpaginated top-level array:

```text
asset[]: {
  symbol: string,
  displayName: string,
  coingeckoId: string | null,
  tokens: [{
    displayName: string,
    blockchain: string,
    contractAddress: string,
    depositEnabled: boolean,
    minimumDeposit: decimal string,
    withdrawEnabled: boolean,
    minimumWithdrawal: decimal string,
    maximumWithdrawal: decimal string | null,
    withdrawalFee: decimal string,
    nativeDecimals: integer
  }]
}
```

Validate the entire outer shape and each selected row, while allowing unknown added fields. Keep limits and fees as strings. The flags are current operational observations; `false` means unsupported at retrieval time and `true` does not prove custody admission or future availability. The response supplies no pagination or source-generated timestamp, so store retrieval time separately and leave source time null.

The official API contains no corporate-action/dividend history operation or event/revision/correction schema. Return a typed unavailable ledger such as `status=unavailable`, `reason=issuer_event_endpoint_not_public`, with zero normalized events and blockers for event identity, classification, exact factor transition, ex-date, reference market, revision/finality and annual completeness. Do not turn `MU`'s frozen onchain reconstruction, a current non-1 multiplier, company investor-relations history, brokerage securities, trade history or market data into a Backpack issuer event.

## Transport and validation policy

Both origins are fixed HTTPS allowlist entries, GET only, without redirects. Apply explicit deadline and response-size limits before JSON parsing. Record endpoint, retrieval time, HTTP status and SHA-256 of original bytes. Neither inspected payload supplies a top-level source-generated timestamp; event timestamps remain event fields rather than retrieval/source freshness.

No issuer-specific public rate limit is documented for these exact endpoints. Backpack publishes account/subaccount quotas elsewhere, but that is not a promise for this unauthenticated assets route. Do not retry automatically. On 429, stop further requests for that issuer, emit a stable sanitized rate-limit error and preserve prior component results. Treat 401/403 on these public paths as source failure rather than adding credentials.

Minimum tests should cover the one-indexed xStocks history versus zero-indexed optional multiplier history, inconsistent totals and repeated pages, decimal JSON type rejection, conflicting `(eventId, version)` records, duplicate/missing Solana deployments, absent ex-date and unresolved `Initial` status, Backpack token nesting and integer decimals, duplicate/missing Solana tokens, flag changes, and an explicit unavailable Backpack event ledger. Empty arrays must not set annual completeness.

The compact sanitized live observation is in [`issuer-reader-source-contracts-2026-09-17.json`](../evidence/issuer-reader-source-contracts-2026-09-17.json). Prior raw evidence remains in the existing xStocks and Backpack evidence files; no large history was copied.
