# Ondo authenticated API access

17 September 2026. The user supplied a read-only key in the external issuer credential file. Four authenticated GET requests succeeded; the access blocker is resolved. The app and local test runtime were left untouched while the user tests them.

## Observed access

Initial probe: approximately 08:09 UTC. The completed checker repeated all four requests successfully at 08:17 UTC; the changing status feed then contained 90 records. Both observations have separate times and digests in the evidence.

| Endpoint | Result |
|---|---|
| `/v1/assets/all/addresses` | HTTP 200; 458 registry entries. All six selected Solana mints and their nine decimals match the existing catalog. This is identity discovery, not 458 eligible dividend assets. |
| `/v1/status/assets` | HTTP 200; 91 records: seven active, 84 upcoming. No current KOon record. Microsoft has an upcoming cash-dividend pause; that is not a completed dividend. |
| `/v1/assets/KOon/shares-multiplier?range=all` | HTTP 200; six history rows, with decimal strings preserved. These changes alone do not identify dividend events. |
| `/v1/assets/KOon/dividends` | HTTP 200; underlying dividend information, including cash amount and payment date. No official ex-date or isolated token-event/factor join. |

The [sanitized verification record](../evidence/ondo-api-access-2026-09-17.json) includes request times, status codes, body digests, counts and checks against the public mint catalog. Full authenticated responses remain in owner-only files outside the repository. No credential, request header, raw response archive or wallet secret is published. Only GET operations were performed; the key's write permissions were not probed.

## What this unlocks

We can now collect authenticated token identities, multiplier observations and current/upcoming event notices. A server-side reader can preserve these notices prospectively and compare later observations. The checker is an observation tool; it does not classify a historical multiplier change or authorize a settlement.

Ondo documents multiplier history as distinct values with their earliest timestamps, and status records as active/upcoming pauses. The reviewed schemas and responses do not provide a complete historical classified ledger, official ex-date, ordered correction/cancellation history or annual finality attestation. The `type` field describes the pause; cash-dividend classification appears in `reason.message`. A pause's start/end timestamps must not become the official ex-date. Sources: [multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [asset statuses](https://docs.ondo.finance/api-reference/status/get-asset-statuses), [OpenAPI](https://docs.ondo.finance/openapi.json).

Coca-Cola's recent multiplier transition still cannot be joined to a historical Ondo event ID using these responses. Its fixture remains pending. An upcoming Microsoft notice likewise lacks completed factors and annual coverage; it is useful for observation, not current settlement.

## Remaining Ondo request

Ask only for the historical classified event ledger and its contract: stable event IDs/revisions, official civil ex-dates, exact mint/factor joins, cancellations/corrections, complete-period coverage and the finality rule. Another key or asset catalog is no longer needed. No outreach was sent.

The source reader and attestor remain separate: an authenticated HTTP response does not itself establish a final, complete annual journal. The approved test app continues to use explicitly synthetic dividends.

## Reproduction and checks

Run `node scripts/issuers/ondo-readonly.mjs` from the repository root. It loads the external env file explicitly, uses only the four allowlisted GET endpoints by default, refuses redirects, limits request duration/body size, stops on access/rate-limit errors and returns a nonzero exit status for failed observations. `--help` describes the selected-symbol and private-archive options. Raw archival paths inside the repository are rejected. Nothing is scheduled or connected to the browser.

The checker passes 16 fake-network tests, including credential parsing, endpoint constraints, timeout/error handling, secret-reflection refusal and safe output paths. Existing 33 reference/legacy tests, type checking and production build pass. Build output was isolated outside the served directory so the user's active demo was not replaced. No program, SDK, UI, fixture or runtime source changed.
