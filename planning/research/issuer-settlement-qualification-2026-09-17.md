# Qualified issuer data and settlement

17 September 2026. This is the next priority after the accepted Raydium/Test USDC flow. Additional DeFi integrations remain [future guided demos](defi-demo-sequence.md). The first evidence pass below makes progress toward a real event dossier; it does not admit collateral, sign an attestation or finalize a series.

## Current source access

A fresh bounded run of the existing server-side readers completed seven successful GETs at 14:52 UTC. The [sanitized refresh](../evidence/issuer-qualification-refresh-2026-09-17.json) preserves times, endpoint digests, identities and counts. Authenticated Ondo response details and credentials remain outside Git and the browser.

| Issuer sample | Observation | Remaining data gap |
|---|---|---|
| xStocks KOx | Registry identity matches; five corporate-action records returned | Official event/ex-date join, revision/finality meaning and complete annual coverage |
| Backpack MU.US | Public listing matches the selected mint and six decimals | Durable classified event ledger; public discovery is not dividend history |
| Ondo KOon | Selected mint matches; six multiplier points, zero current pause notices and latest dividend information | Historical event identity/revision/ex-date joined to factors; current notices and multiplier history are separate sources |

The counts describe returned data, not qualified dividends or complete 2026 history. No reader has become settlement-ready. [xStocks history](https://docs.xstocks.fi/apis/openapi/corporate-actions), [Ondo dividend information](https://docs.ondo.finance/api-reference/assets/get-dividend-information-for-an-asset) and [Ondo statuses](https://docs.ondo.finance/api-reference/status/get-asset-statuses) do not by themselves close those gaps.

## First candidate dossier: Microsoft / MSFTx

Microsoft is already in the selected package and explicitly publishes ex-dividend dates. The public xStocks registry binds `MSFTx`, security ISIN `CH1436219203`, underlying `MSFT` / `US5949181045`, reference market `XNAS` and Solana mint `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX`.

The [candidate evidence](../evidence/msftx-qualification-candidates-2026-09-17.json) preserves public source URLs, retrieval times, hashes, exact issuer decimal strings and the current mint observation. It records three **candidate joins**, inferred from matching security identity, gross amount and chronological sequence. The issuer has not confirmed those event-to-ex-date joins.

| Company ex-date | Company payment date | Gross USD/share | Candidate xStocks event / revision | Issuer effective time (UTC) |
|---|---|---|---|---|
| [19 February 2026](https://news.microsoft.com/source/2025/12/02/microsoft-announces-quarterly-dividend-27/) | 12 March | 0.91 | `7c31ccb0-9a9e-471e-af0b-47921ca5dcd4` / 2 | 12 March, 23:55 |
| [21 May 2026](https://news.microsoft.com/source/2026/03/10/microsoft-announces-quarterly-dividend-28/) | 11 June | 0.91 | `5ed19bd9-5444-49fc-aadd-de45c617faaa` / 2 | 21 May, 00:30 |
| [20 August 2026](https://news.microsoft.com/source/2026/06/10/microsoft-announces-quarterly-dividend-29/) | 10 September | 0.91 | `e06d3eca-7b09-40b6-a904-6bb880e3f205` / 2 | 20 August, 00:30 |

Each issuer record is `CashDividend` with status **`Initial`**, gross USD 0.91 and net USD 0.637. Preserve those facts without interpreting `Initial` as final or promising a cash payout. Claims settle in the underlying stock token. The first candidate's March activation and February ex-date also demonstrate why activation time cannot substitute for entitlement date.

Microsoft has additionally [announced](https://news.microsoft.com/source/2026/09/15/microsoft-announces-quarterly-dividend-increase-7/) USD 0.98 with ex-date **19 November 2026** and payment **10 December 2026**. Both dates are still future as of this report. No matching factor is asserted. The 2026 year is open; five returned history rows, three apparent year-to-date events or completed pagination cannot authorize annual finalization.

A read-only finalized RPC observation at slot **447825157** confirms the exact mint's eight decimals, Token-2022 owner and supported accounting factors. Its active multiplier bits match the conversion of the latest published value, `1.0059033904787456`. This corroborates current state only. It does not establish canonical historical before/after bits for all three events, prove the absence of intervening non-dividend actions, or authorize real custody.

## Settlement gates

| Gate | State after this pass |
|---|---|
| Exact issuer/security/Solana mint identity | Public registry binding observed; current mint corroborated for MSFTx |
| Civil ex-date and reference market | Explicit Microsoft dates and registry market observed; issuer event join still candidate |
| Isolated dividend classification and exact historical factors | Issuer classification/decimal factors observed; historical binary64 transitions still need evidence |
| Corrections, cancellations and finality | `Initial` meaning and revision lifecycle unresolved; no event promoted to final |
| Complete annual coverage | Unresolved and premature for 2026; source pagination is not period completeness |
| Ordinary permissionless vault custody | Not admitted by this work; no special permissioned-vault workaround |

The existing program accepts trusted attestor commitments; it does not independently fetch or prove company announcements or issuer completeness. Updating a source revision is also not equivalent to creating a new entitlement. Preserve unsupported-action rejection and the annual journal's replacement/cancellation rules.

## Next implementation boundary

1. Resolve the concrete [issuer data questions](../issuer-data-requests.md), starting with these MSFTx IDs: authoritative ex-date mapping, `Initial` semantics, revisions/cancellations, and the policy for complete and final annual history. Keep Backpack and Ondo in the same qualification workstream.
2. Establish historical before/after mint evidence and how non-dividend changes are excluded. Preserve original decimal strings separately from canonical onchain bits; never infer them from a cash price or only the current multiplier.
3. Once the evidence contract is clear, add a server-only **unsigned qualification dossier** around the existing readers and transaction SDK. Output `blocked` or `reviewable`, with provenance, missing gates and an explicit attestor decision. Do not auto-sign or auto-admit from HTTP success.
4. Validate wrong mint/year, missing or ambiguous ex-date, revision replacement/cancellation, duplicate entitlement, unsupported actions, factor mismatches, incomplete pagination, missing coverage/finality, stale controls and digest mismatch. Only then exercise qualified event ingestion and staged settlement on a controlled test series.

The unsigned dossier is not implemented in this pass. Annual issuer/mint/year isolation, pre-year deposit closure, multiple qualified events, recombination and independent redemption after finalization remain unchanged. No 2026 late deposits, fabricated annual completeness or real-fund transaction is authorized by this research.

**18 September follow-up:** the [offline dossier is now implemented and accepted](../issuer-qualification-review.md) under a narrower, always-blocked contract with no attestor approval or transaction output. [Further source research](issuer-qualification-followup-2026-09-18.md) strengthens August's configured-pair corroboration while preserving the unresolved issuer-policy and historical-transition gates above.
