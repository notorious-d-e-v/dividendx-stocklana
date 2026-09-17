# Issuer qualification follow-up

18 September 2026 (Asia/Makassar). UTC source retrievals occurred on 17 September. This extends the [first qualification pass](issuer-settlement-qualification-2026-09-17.md) and informs the [unsigned dossier contract](../../spec/issuer-qualification-v1.md). It does not authorize live settlement.

## Timing must remain source-specific

A fresh [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers) retrieval explicitly describes activation at 00:30 UTC on the day following the ex-date. The API's MSFTx candidate records instead show May 21 and August 20 at 00:30 UTC, while Microsoft's explicit ex-dates are May 21 and August 20. The March record activates on its candidate payment date, weeks after the February ex-date. This unresolved difference prevents a generic timestamp-to-ex-date conversion. Keep company ex-date, issuer effective time and chain scheduling time distinct; obtain the issuer's event-specific mapping.

The guide also recommends a pause around multiplier activation. The existing program already pins current/pending/effective multiplier state for admission and finalization; this documentation does not justify silently treating a scheduled change as a qualified dividend.

## Factor corroboration and the remaining history gap

The [official multiplier history](https://api.xstocks.fi/api/v2/public/assets/MSFTx/multiplier/history?network=Solana) supplies five rows. Three 2026 rows match the corporate-action records by binary64 conversion and effective time, but carry different IDs and no explicit join field. Unlike the corporate-action endpoint's decimal strings, this endpoint encodes factors as JSON numbers. The long March M0 string and its shorter displayed number round to the same binary64 value; that is a numeric correspondence, not recovered historical chain evidence.

Astra independently decoded the preserved finalized mint and Clock bytes and verified their hashes. August's stored current/pending pair is `4607203054701097332 → 4607209005307177709`, with activation Unix time `1787185800`. Both factors and the time match the August API record. This strengthens that candidate's chain corroboration without proving its corporate-event/ex-date join or a complete history. March and May still have only derived factor encodings. See the [compact factor evidence](../evidence/msftx-factor-corroboration-2026-09-18.json).

A bounded search made 36 read-only RPC calls and returned 1,000 scale-authority signatures, covering only roughly nine recent hours. No MSFTx mint match appeared in the account-key lists returned for 21 blocks near corporate-record creation times. That limited search does not prove a transaction was absent or that address-table coverage was complete. Do not use API creation time as an onchain-publication timestamp.

The official API schema lists `Initial`, `Corrected`, `Cancelled` and `Scheduled`; it does not explain the reviewed statuses' finality or the full replacement/cancellation lifecycle. All three 2026 records remain version-2 `Initial`. Source versions are preserved without inventing an accepted program revision mapping. Captured multiplier-history/API-schema bodies are hashed; because their capture lacked HTTP timestamps, the evidence labels filesystem times as `localRecordedAt`.

## Ordinary custody is distinct from issuer issuance

The [issuer's operating description](https://docs.xstocks.fi/docs/how-xstocks-work) separates onboarded primary issuance/redemption from ordinary secondary transfers through wallets and DeFi. Its [FAQ](https://docs.xstocks.fi/docs/frequently-asked-questions) confirms ordinary token transfers and net reinvestment. This supports the intended secondary-custody model; do not invent a requirement for a special issuer-approved vault or expand scope into permissioned onboarding.

Asset admission still needs exact mint/authority/extension review, functioning ordinary PDA custody and the complete event policy. Neither public documentation nor a current mint snapshot proves those execution and policy checks. Direct redemption with the issuer is separate from redeeming PT/DR for tokens already held by DividendX.

The [source provenance record](../evidence/issuer-qualification-doc-sources-2026-09-18.json) contains retrieval times and hashes for four public pages; full HTML stays outside Git. The [fresh three-issuer reader summary](../evidence/issuer-qualification-refresh-2026-09-18.json) again matches MSFTx, Backpack MU.US and Ondo KOon. The latter two still supply no classified historical event ledger through the reviewed endpoints.

## Implementable now

An offline dossier can validate observation structure, candidate joins, revision selection, exact identities and current raw mint evidence. It can flag missing or contradictory evidence without resolving issuer semantics. V1 therefore always remains blocked and unsigned; it has no policy override, EventInput builder or transaction writer. Source facts and missing settlement decisions are reviewable together without pretending that completeness or finality has been proved.

The live settlement dependencies remain an authoritative event/ex-date/factor join, historical transition evidence, ordinary-dividend classification, revision/cancellation/finality rules, complete annual coverage after maturity and asset admission. No number of consistent year-to-date rows can finalize the still-open 2026 term.
