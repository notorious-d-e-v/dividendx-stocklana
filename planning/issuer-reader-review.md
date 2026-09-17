# Issuer observation reader acceptance

17 September 2026. Astra accepted the server-side implementation under [issuer readers v1](../spec/issuer-readers-v1.md). Sol implemented the package at high effort; a separate source review and Astra's live checks resolved schema, identity, partial-history and storage issues before acceptance.

## Delivered

[`packages/issuer-readers`](../packages/issuer-readers/) provides typed readers, runtime schema validation, a one-shot CLI, a safe summary and exclusive private snapshots. It covers the existing 15 selected identities without importing historical fixture capabilities as current facts. Root commands are `npm run read:issuers -- --year 2026` and `npm run test:issuers`.

The xStocks reader preserves exact decimal strings, observed event revisions and latest heads, and cross-checks source identities. It retains explicitly partial histories after a later page fails. The Backpack reader preserves exact nested Solana identity, decimals and operational flags. The Ondo reader reuses the reviewed credential loader and GET transport, keeping multiplier histories, dividend information and current/upcoming notices distinct from qualified events.

No settlement instructions, background schedule or browser integration were added. The annual program, IDL, transaction SDK, fixtures, approved artwork, narration and running demo were preserved.

## Live verification

The [sanitized evidence](evidence/issuer-readers-live-2026-09-17.json) preserves both runs and their separate observation times.

| Reader | Result |
|---|---|
| xStocks | Six exact mint identities matched; 12 successful GETs; 23 corporate-action records retained. Registry responses do not re-observe decimals or token-program ownership. |
| Backpack/Trek | Three exact mints and six-decimal identities matched; deposit/withdraw flags were enabled. The public corporate-action ledger remains unavailable. |
| Ondo | Six exact `solana-900` mint identities and nine decimals matched; 14 successful authenticated GETs; 34 multiplier observations and available notices retained privately. |

The first all-issuer run was 09:08:01–09:08:23 UTC. Its Backpack request correctly failed the original 2 MiB cap: the public registry was 2,151,135 bytes. After adding a separate bounded 8 MiB registry limit and regression coverage, a Backpack-only run succeeded at 09:10:52–09:10:53 UTC. The shared public limit remains 2 MiB and Ondo's reviewed limit remains 10 MiB. Successful xStocks/Ondo requests were not repeated to hide the failed attempt.

Both detailed normalized snapshots are outside Git in a mode-0700 directory with exclusive mode-0600 files. The public report contains identities, counts, request digests, status and blockers; it omits authenticated response bodies, normalized private contents and credentials.

## Checks

- `npm test`: 33 reference/legacy tests, 22 new reader tests and 16 existing Ondo transport tests passed; fixture verification passed.
- Root type checking and production build passed. Web output was written to a separate temporary directory to preserve the user's served build; the existing chunk-size warning remains.
- Reader tests cover exact identities, source joins, decimal preservation, corrections/conflicts, pagination and partial failure, missing/blank credentials, access/rate-limit stops, timeout/size limits, safe summaries and exclusive private archives. A large Backpack registry test covers both accepted and rejected sizes.
- Actual snapshot permissions and all 15 successful registry identity checks were independently asserted. Current documentation links and JSON evidence were checked.

The requested year labels the observation report; it does not assign records to a dividend year. None of these reviewed feeds supplies every required official ex-date, historical event/factor join, revision/finality rule, complete annual coverage assertion and live custody qualification. All reports therefore remain `settlementReady: false`; an empty response does not establish a zero-dividend year. No live issuer admission or onchain settlement is claimed.

## Next

Implement the Raydium test-liquidity path while issuer evidence gaps remain explicit. The [devnet preflight](evidence/amm-devnet-preflight-2026-09-17.json) found Raydium executable and no DividendX deployment. The [annual timing clarification](research/claim-amm-feasibility.md) keeps public paired recombination separate from controlled local post-maturity redemption. The user's guided walkthrough page is deferred in the [roadmap](roadmap.md).
