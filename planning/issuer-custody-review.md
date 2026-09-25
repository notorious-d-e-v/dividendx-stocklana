# Captured issuer mint custody review

Accepted 18 September 2026 under [custody conformance v1](../spec/issuer-custody-conformance-v1.md). The unchanged DivX program executes the full local custody lifecycle with the captured configurations of all 15 selected stock mints. No extra onchain issuer adapter was needed for these configurations.

## What was verified

Two public read-only RPC requests captured mainnet genesis and all selected mint accounts plus Clock at finalized slot **447920461**. The [snapshot](../tests/protocol/fixtures/issuer-mints-2026-09-18.json) preserves raw bytes, owners, decimals, request provenance and hashes. The Node verifier and independent Rust reader agree on every control fingerprint, extension mask and scale tuple. Astra also independently decoded the raw decimals and scale fields.

| Family | Mints | Decimals | Local lifecycle |
| --- | --- | --- | --- |
| xStocks | KOx, AAPLx, MSFTx, MUx, NKEx, IBMx | 8 | 6/6 passed |
| Backpack/Trek | MU.US, NKE.US, IBM.US | 6 | 3/3 passed |
| Ondo | KOon, AAPLon, MSFTon, MUon, NKEon, IBMon | 9 | 6/6 passed |

Each run creates real extension-sized holder/vault ATAs, deposits raw collateral, issues equal ordinary SPL PT/DR, and recombines part after its observation becomes stale. A controlled journal contains two qualified synthetic dividends, a confirmed-zero record and a cancellation. An advanced local Clock permits staged annual finalization and four independent partial redemptions. Actual Token-2022/SPL CPIs execute; captured mint bytes remain unchanged after every phase. No issuer authority signs.

Per mint, **10,003 synthetic raw units** fund the holder; 9,997 are deposited and 1,331 recombined. The remaining 8,666 split into 5,778 PT backing and 2,888 DR backing. Partial payouts are 1,407 PT, 1,058 DR, 4,371 PT and 1,830 DR raw. All 10,003 return to the holder; vault balance, claim accounts and claim mint supplies end at zero. Claim mint and freeze authorities are absent. These are raw-unit tests, not stock-dollar valuations.

The [execution receipt](evidence/issuer-custody-conformance-2026-09-18.json), [SDK profile report](evidence/issuer-mint-profile-verification-2026-09-18.json) and [parent cross-check](evidence/issuer-custody-parent-review-2026-09-18.json) bind the input hashes, compute and exact accounting. The largest deposit consumes 29,980 compute units; final commit peaks at 23,466 in this test set.

## Reproduction and validation

```sh
npm run verify:issuer-mints
npm run test:issuer-custody
npm run test:program
```

To retain a new result, set `DIVIDENDX_CUSTODY_RECEIPT_OUTPUT` to an absolute unused file path when running `test:issuer-custody`. The writer refuses to overwrite existing evidence. Source capture is a separate, explicit `node scripts/protocol/issuer-mint-snapshot.mjs capture --output /absolute/new-snapshot.json`; tests never use the network.

All **95 root tests** and **47 Rust tests** passed, including 17 compiled-SBF cases and the 15 captured-mint journeys inside the new case. Type checking and an isolated production build passed. The installed toolchain lacks rustfmt; compile and whitespace checks passed. The known wallet bundle-size warning remains; the temporary build was not published. Browser tests were not repeated because web/runtime sources did not change.

Program/SDK source and IDL are unchanged. The tests pin the accepted 706,504-byte ELF SHA-256 `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`. The app, guided demo and both running local chains remain untouched.

## What remains open

This is **offline Mollusk execution with captured mint configurations**. Holder balances, later Clock values, event factors/dates and coverage attestations are synthetic. The harness preserves captured mint supply but does not reconstruct a complete mainnet ledger; it proves neither issuer-backed issuance nor total supply conservation. Packaged token executables are used, not a newly verified clone of the currently deployed mainnet Token-2022 binary.

Issuer freeze, pause, delegate and upgrade powers remain. Live custody admission and actual issuer transfers are unproved; the frozen product catalog and unsigned dossier retain their existing live-status flags. Historical dividend classification, authoritative ex-date/factor joins, corrections/finality and full annual coverage still require a source-backed policy. The [public-source check](research/issuer-public-policy-check-2026-09-18.md) confirms that multiplier history alone cannot provide it.

Our trusted attestor may certify coverage from documented exhaustive sources under a reviewed policy; issuers need not build a bespoke signed annual certificate. The current review tool remains blocked and unsigned. The next external inputs are the precise [issuer-data answers](issuer-data-requests.md), followed by a reviewed attestation/settlement mapping. No mainnet transaction, live deployment or additional DeFi demo was added.
