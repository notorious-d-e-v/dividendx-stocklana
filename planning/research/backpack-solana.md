# Backpack / Trek tokenized stocks on Solana

Snapshot: **2026-09-16T05:56:09Z**. Read-only public evidence; no transaction was submitted or signed.

## Decision

Backpack/Trek fits the shared `ScaledReinvestmentV1` accounting engine, with a **separate Backpack reader and exact-mint policy**. The live set is materially larger than the earlier MU/SKHY sample: Backpack's [`GET /api/v1/assets`](https://api.backpack.exchange/api/v1/assets) exposed **48** `.US` Solana mints with both deposits and withdrawals enabled at this snapshot. All 48 were finalized, nonzero Token-2022 mints with six decimals and the same extension-name profile. MU supplies a fully bracketed onchain dividend reconstruction. It does not supply the official event/revision or gross-to-net settlement ledger needed for unattended production settlement.

The full inventory and observations are in [backpack-scope-assets-2026-09-16.json](../evidence/backpack-scope-assets-2026-09-16.json); the MU reconstruction, authority-history bracket and exact RPC responses are in [backpack-scope-mu-event-2026-09-16.json](../evidence/backpack-scope-mu-event-2026-09-16.json), [backpack-scope-mu-authority-history-2026-09-16.json](../evidence/backpack-scope-mu-authority-history-2026-09-16.json) and [backpack-scope-mu-raw-transactions-2026-09-16.json](../evidence/backpack-scope-mu-raw-transactions-2026-09-16.json).

## Product and legal boundary

| Surface | What the holder has | What the evidence establishes |
|---|---|---|
| Backpack brokerage entry | A UCC Article 8 security entitlement recorded in a Backpack brokerage account | A symbol in [`GET /api/v1/securities`](https://api.backpack.exchange/api/v1/securities) establishes brokerage availability only. It does not establish a withdrawable Solana token. |
| Trek token in a wallet | A Solana digital trust receipt linked to a per-asset pool | **Trek Nexus Markets Ltd**, a BVI company, is the issuer and bare trustee. Tokenization ends/transfers the brokerage security entitlement. The token evidences a pro-rata pool claim, not title to an identified share. |
| Ordinary-course registered beneficiary | Trek Forge Ltd or its nominee/custodian | The June 10, 2026 Asset Tokenization Terms say Trek Forge remains the registered Tokenholder and sole beneficiary. A wallet holder has blockchain transfer status, but no direct ordinary-course beneficiary/redemption right. |
| Backpack detokenization | Deposit supported tokens to Backpack, burn them, and credit a new brokerage security entitlement | Subject to platform support, KYC/KYT, queues, limits, fees, rounding and issuer conversion calculations. Direct issuer redemption is contingent on a defined platform failure/delisting-style contingency. |
| Sunrise | Distribution and integration interface | [Sunrise's terms](https://sunrise.xyz/terms-of-service) say it is not the issuer, broker, custodian, exchange or redeemer; Trek documents govern. Solana describes Sunrise as the canonical-mint integration route in its [official overview](https://solana.com/ja/news/how-external-assets-start-trading-on-solana-from-day-one). |
| Superstate Opening Bell | A separate issuer/transfer-agent product distributed or traded through Backpack | It is outside this Trek mint set. Backpack's venue relationship does not make Superstate shares Trek receipts; apply the Superstate reader and permission policy separately. |

Primary terms are linked from Backpack's [official legal page](https://support.backpack.exchange/legal/general-legal/user-agreement): *Tokenized Securities Asset Tokenization Terms*, *Terms and Conditions for the Issue, Holding and Redemption of Tokens*, and *Issuer Risk Disclosure Statement*, all updated June 10, 2026. Material consequences:

- Each Approved Asset has a separate bare-trust pool containing the asset and related proceeds/distributions. Recourse is limited to the holder's pro-rata pool; a shortfall is shared pro rata. These receipts are not SIPC-protected brokerage positions or insured deposits.
- For a cash dividend, Asset Tokenization Terms §1.5 says the tokenization party should convert cash to additional units promptly. The terms disclaim liability for delay, failure or an unfavorable conversion price. Cash and acquired units enter the pool. This is reinvestment economics; a brokerage position can instead receive ordinary cash handling.
- §1.8 computes tokenization/detokenization using outstanding tokens, including multiplier/rebase effects, and pool assets/proceeds converted at fair value chosen by the issuer/Backpack, less transaction costs and fees. Results may round down to two–six decimals.
- The public terms do not disclose an event-level withholding, fees, execution price, FX or net-cash ledger. They permit freezes, blacklists, pauses and compliance restrictions; U.S. persons are excluded.

## Current live inventory

Selection rule: `.US` asset, Solana token, `depositEnabled=true`, `withdrawEnabled=true`. This is an operational snapshot, not a permanent catalog. The 48 symbols are:

`BOT MRNA DELL FLY DNUT SPHR SHOP TTWO BULL GPRO SNDK SKHY INTC DRAM MSTR LULU HIMS BABA MGM JNJ LLY RBLX DKNG MU LMT WEN RIVN SNAP SCHH PFE COST FLWS QUBT RDDT HTZ NBIS MRVL UPS BA NKE SPCX DJT IBM AMC BROS GRND HOOD PTN`.

The evidence JSON records each exact mint, display name, raw supply, authority, metadata URI, minimum deposit/withdrawal and withdrawal fee. The official [MU](https://learn.backpack.exchange/blog/tokenized-micron-mu), [SKHY](https://learn.backpack.exchange/blog/sk-hynix-skhy-backpack) and [SPCX](https://learn.backpack.exchange/blog/tokenized-spacex-spcx) pages independently anchor named examples. Admission must use an exact mint allowlist plus current asset flags; ticker or metadata text is insufficient.

The distinction is observable within the same API: AAPL and NVDA remain brokerage securities and have named Solana mint entries, but both token entries returned `depositEnabled=false` and `withdrawEnabled=false`. They are excluded from the 48. A prepared mint or brokerage listing is not active tokenization support.

At finalized slot **447444271**, all 48 accounts were present, had nonzero supply, owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, parsed as `spl-token-2022`, and used six decimals. Every mint exposed:

`metadataPointer`, `permanentDelegate`, `defaultAccountState`, `pausableConfig`, `confidentialTransferMint`, `transferHook`, `scaledUiAmountConfig`, `tokenMetadata`.

Common observed controls were:

- freeze authority, permanent delegate, pause authority, transfer-hook authority and metadata update authority: `2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a`;
- default account state `initialized`; paused `false`; transfer-hook program `null`;
- no transfer-fee extension;
- per-mint mint authority equals that mint's scaled-UI authority; it is not one common address.

Only MU had a non-1 current multiplier: `1.0001068649823912`; the other 47 were `1`. All pending values equaled the active value and used effective timestamp `0`. Solana's [Scaled UI Amount documentation](https://solana.com/docs/tokens/extensions/scaled-ui-amount) confirms that the multiplier changes displayed/economic UI amount while raw token base units remain unchanged. DividendX must conserve raw amounts and use exact decimal/rational arithmetic.

The current null hook and unpaused state are mutable conditions. Before deposit and redemption, pin and recheck exact mint, Token-2022 program, decimals, extension names, relevant authorities, pause/freeze state, hook program and transfer-fee absence. A non-null hook, new fee extension, changed authority profile or paused/frozen account fails closed. The permanent delegate can exercise issuer-level control over token accounts, so seizure/dilution/control risk remains even when DividendX's program owns its token account.

## PDA custody and transfers

Program custody is demonstrated, without claiming every program is accepted. MU's Meteora DLMM pool account `13MEx6gjRadJNUdmToaGSzgeWHLH7FzScUQS9Mc5nYF5` is owned by program `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`. In successful transaction [`4xzJF…KZDDjXw`](https://explorer.solana.com/tx/4xzJFhQFLHEUXF3vW1vufapDh2HFF4AsnvUSXGCBmVey5CAwUgGzpfV8Hu16ZmX2WKZW7untLBrczrd9jKZDDjXw) at slot 447445689, that program-owned account authorized a Token-2022 CPI transfer of **1.141113 MU** from its pool token account. This proves live non-wallet/program authority custody and transfer compatibility for the current MU extension state. Exact PDA seeds were not decoded, and Backpack redemption into a DividendX-owned account was not tested.

## MU dividend reconstruction

Micron's official [Q3 FY2026 release](https://investors.micron.com/news/press-release/2026/Micron-Technology-Inc--Reports-Results-for-the-Third-Quarter-of-Fiscal-2026/default.aspx) reports the underlying event: declared **$0.15/share** June 24, record date July 6, paid July 21, 2026.

The onchain activation is transaction [`39vT…Te59R`](https://explorer.solana.com/tx/39vTkahE7rUnFypAkKpaHUxwMyuC1nG4nJ12GEm3y9V1Kqep6ijvcX4isqsNXB63s3vsGNDjfi7uFFgH32Te59R), slot **434783905**, **2026-07-23T20:29:52Z**:

1. Program `FewRXXTzV2WwigvTQNsVanhEmCM9wzfNvoT1divNtbVH` logged `Instruction: DividendDistribute`.
2. It transferred **0.683203** units of internal underlying-receipt mint `MUwUiQVJKJLvePvu6uL1QGydXVb1Kx8WMkg7VHVvSHa` into backing owner `Fx4YnkhSSexBbQNqHXdHJdsb2zdUo3UD5FFS6mGmCqR6`.
3. Backing moved from `6401.424441` to `6402.107644` shares.
4. It invoked Token-2022 `updateMultiplier` on the public MU mint, authorized by `6XPofT3JgdoZAkUxqAbYZLNbsDvBCkDqrEWeaTiQKRBD`, setting `1.000106726714702`. The exact pool ratio is `6402.107644 / 6401.424441 = 1.000106726714701841…`.

The immediate predecessor is also proven. Querying finalized signatures for MU's scaled-UI authority over the interval found exactly two successful authority-touching transactions. [`2dm9…cJqqqz`](https://explorer.solana.com/tx/2dm9fGhwsVKYdsA3HWvALMoipEZY12qNkj6BpMiASvruNNpSFVBrrp2yWskathjf5Zb7nQFpPymjChkFYecJqqqz), at 18:19:32Z, logged `SupplyRedeemAndTransferExternal` and set the multiplier to exactly `1`. The next authority-touching transaction, 2h10m20s later, was `DividendDistribute`. Thus `M0=1` immediately before this dividend update is established by the covered history; no intervening multiplier update was omitted. Astra independently repeated the query and preserved the full 1,000-entry response in [backpack-parent-authority-history-2026-09-16.json](../evidence/backpack-parent-authority-history-2026-09-16.json).

This is a strong **onchain reconstruction**, not an issuer-published event schema. Backpack publishes the mint; onchain state proves `FewRXX…` controls its scale authority. No official page was found that publishes that program ID, an IDL, correction rules or event-revision semantics.

The current MU multiplier is not this event's `M1`. Later mint and redemption calls recomputed it incrementally to `1.0001068649823912`. The Backpack reader must recognize `DividendDistribute`, capture the scale at that instruction, and exclude ordinary supply mint/redeem updates. A present-day `scale != 1` is neither a dividend classifier nor a historical event record.

The onchain receipt increase does not establish the cash withholding, costs, reinvestment fill price or a formal binding to the company’s cash-payment record. Treat the receipt denomination and that mapping as provider-confirmation items. Do not back-solve a dollar payout using assumed withholding or a nearby market quote. The source supports an onchain operation reconstruction and raw-allocation fixture, not a gross-to-net cash reconciliation.

## Evidence ladder

| Level | Status | Evidence |
|---|---|---|
| Documented | Yes | Official mint pages, assets API flags, June 2026 legal terms, dividend-reinvestment policy and Micron's corporate event. |
| Onchain observed | Yes | All 48 mint accounts/extensions; MU backing transfer, exact scale update and fully bracketed prior multiplier. |
| Transfer demonstrated | Yes, limited | A live MU Meteora program-owned pool transferred the token by CPI. This does not prove DividendX's exact vault implementation or Backpack detokenization. |
| Settlement validated | **No** | No DividendX deposit/redeem, PT/DR allocation, Backpack token-to-brokerage detokenization, official revision feed or net settlement reconciliation has been executed and verified. |

## Required Backpack reader contract

The shared engine can accept Backpack only through a normalized record with these mandatory fields:

```text
asset: issuerId=TrekNexus, product/legal model, exact mint, token program,
       decimals, current deposit/withdraw flags, expected extensions,
       authorities, custody policy, evidence timestamp/slot

event: eventId, revision, status/finality, correction/supersession link,
       action=CashDividendReinvested, chain, exact mint,
       declaration/ex/record/payable dates,
       activation signature/slot/txIndex/instructionIndex,
       M0, M1, splitFactor, backingBefore, sharesAdded, backingAfter,
       gross amount/currency, withholding, fees, FX,
       reinvestment execution price/time/venue,
       source URL/digest, observedAt, attestor/rulesVersion
```

Unknown economic fields remain `null`; they must not be back-solved and presented as issuer facts. A production event needs an official Backpack/partner event feed or signed attestation that supplies stable IDs, revisions, finality and corrections. Public docs currently expose no corporate-action/event endpoint, and no public `FewRXX…` IDL was found. These are the exact blockers for unattended production settlement.

For a bounded prototype, the MU transaction is replayable if labeled `onchain_reconstruction`: verify official mint; scan the scale authority's complete slot bracket; require the exact successful `DividendDistribute` instruction; verify the underlying receipt transfer and `M1 = backingAfter/backingBefore`; reject any intervening scale update; preserve source response hashes. Ordinary `SupplyMint…` and `SupplyRedeem…` scale updates are supply maintenance and must be excluded.

## Credible two-day proof

**Day 1:** implement the Backpack asset reader and versioned manifest from the 48-mint evidence. Validate exact mint/program/decimals, extension fingerprint, current flags, authorities, pause/hook/fee policy and raw-vs-scaled conversion. Add the MU finalized transaction fixture and a decoder that reproduces `M0`, `M1`, backing delta and its complete authority-history bracket while excluding supply updates.

**Day 2:** feed that normalized `onchain_reconstruction` event into the shared `ScaledReinvestmentV1` engine. In a local validator/program test, mirror MU's six decimals and extension policy; prove raw deposit, cutoff, PT/DR allocation, rounding conservation, independent claims and redemption. Show the source signature, slot and evidence label in the UI. Keep live settlement disabled until an official event/revision contract and a real DividendX custody/redemption test satisfy the missing evidence level.

This demonstrates code and accounting compatibility in two days. It does not convert the missing issuer ledger or settlement proof into production readiness.
