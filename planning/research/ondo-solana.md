# Ondo Stocks on Solana: DividendX integration audit

**17 September update:** the user supplied read-only API access, and the registry, status, multiplier-history and dividend-information requests now succeed. The dated keyless findings below remain historical; see the [authenticated access review](ondo-api-access-2026-09-17.md). Historical event joins, ex-dates, revisions and annual finality remain unresolved.

**As of:** 2026-09-16  
**Method:** independent review of Ondo documentation and source, finalized Solana mainnet RPC reads, and existing production transactions. No wallet was connected and no transaction was signed or submitted. Timestamped machine-readable evidence is in [`../evidence/ondo-solana-2026-09-16.json`](../evidence/ondo-solana-2026-09-16.json).

## Verdict

Ondo Stocks are technically compatible with DividendX's **raw-token allocation** design, but only after adding an Ondo event adapter. On Solana they are native Token-2022 mints using `ScaledUiAmount`: a holder's raw balance stays fixed while an issuer-controlled shares multiplier changes the displayed balance and total-return exposure. For a confirmed, pure cash dividend, the xStocks allocation formula can therefore be reused in raw units.

The unsafe gap is event truth, not arithmetic. Ondo's authenticated API is documented to expose current/upcoming corporate-action classifications and multiplier history, but the keyless endpoints returned HTTP 403. The multiplier history contains only values and timestamps; the status response contains an event type and `eventId`, but appears limited to active/upcoming events and documents neither revision/finality semantics nor a historical event ledger. The dividend endpoint reports headline underlying data, not Ondo's net amount or reinvestment price. **A multiplier change or token-market price must never be used to infer that a cash dividend occurred.**

For a two-day MVP, support one allowlisted mint in observation/demo mode or use a fixture only after obtaining a source that classifies and binds the real multiplier transition to a dividend. Do not claim autonomous live Ondo dividend settlement until API access, history retention, and correction policy are validated.

## Evidence levels

- **Documented:** a behavior stated by Ondo, Solana, or the underlying issuer.
- **Observed onchain:** finalized mainnet account or transaction data read during this audit.
- **Transfer demonstrated:** a finalized third-party production transfer exists; DividendX did not make it.
- **Settlement observed:** a finalized production redemption exists; retail eligibility and a DividendX-owned flow were not tested.

These labels should remain in the product and pitch. “Transfer demonstrated” does not establish that every PDA vault implementation is compatible, and “settlement observed” does not mean an arbitrary tokenholder can redeem.

## Legal and operating parties

| Role | Finding |
|---|---|
| Legal issuer and seller | **Ondo Global Markets (BVI) Limited (OGM)**, a BVI bankruptcy-remote SPV. Each token is a Swiss-law structured note/debt instrument. The tokenholder has economic and redemption rights plus a security interest; it does not own the referenced stock or receive shareholder rights. |
| Technology/platform provider | **Ondo Finance, Inc.** is a legally separate technology and service provider engaged by OGM for tokenization and operations. “Ondo Finance” must not be presented as the token issuer. |
| Custody/security verification | Underlying assets are held through US-registered custodial broker-dealers. **Ankura Trust Company** is the verification and security agent and holds a first-priority security interest for tokenholders. |
| Distribution/access | OGM offers and sells directly only after its KYC onboarding. Ondo lists wallets, exchanges, and protocols as ecosystem partners, but that does not make them the issuer or establish a uniform legal “distributor” role. Third-party acquisition, transfer, and redemption eligibility must be evaluated separately. Direct onboarding was documented as institutional-only on the audit date. |

Sources: [Legal & Regulatory](https://docs.ondo.finance/ondo-stocks/legal-and-regulatory), [Overview](https://docs.ondo.finance/ondo-stocks/overview), [Trust & Transparency](https://docs.ondo.finance/ondo-stocks/trust-and-transparency), all accessed 2026-09-16.

## Official identity and live mint observations

Ondo documents an authenticated [registry](https://docs.ondo.finance/api-reference/assets/get-all-contract-addresses-across-networks) at `GET /v1/assets/all/addresses` and [metadata](https://docs.ondo.finance/api-reference/assets/get-metadata-for-all-supported-assets) at `GET /v1/assets/all/metadata`. These are the intended runtime discovery sources but require an API key. The accessible official repository [`ondoprotocol/gm-solana-simulator`](https://github.com/ondoprotocol/gm-solana-simulator) provides a pinned public registry snapshot: commit [`0688add3…`](https://github.com/ondoprotocol/gm-solana-simulator/blob/0688add3c64aadc7006712989e9ec0592b5b10f8/constants.rs), dated 2026-09-04, declares 443 mainnet mints and the production program.

| Asset | Exact Solana mint | Raw supply at finalized slot `447443889` | Active multiplier |
|---|---|---:|---:|
| AAPLon | `123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo` | `366979368430` | `1.003376073740221` |
| MSFTon | `FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo` | `406764885367` | `1.0057308568927839` |
| KOon | `e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo` | `102023318325` | `1.0238905041551842` |

All three were observed at `2026-09-16T05:33:49Z` with:

- owner/token program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022), 9 decimals;
- `ScaledUiAmount`, metadata pointer, pausable, default-account-state, confidential-transfer-mint, transfer-hook, and token-metadata extensions;
- pause state `false`, default account state `initialized`, and transfer-hook program ID `null`;
- no parsed `TransferFeeConfig`, `PermanentDelegate`, or `NonTransferable` extension;
- live mint/scaled-UI/pause authority `9foMHs…`, and freeze authority `51QVC…`.

The mint authority can alter supply, the scaled-UI authority can alter displayed exposure, the pause authority can stop transfers, and the freeze authority can freeze accounts. These are issuer-control risks that the adapter must monitor. Absence of a permanent delegate and transfer fee is favorable but does not remove those controls.

The official Solana program is `XzTT4XB8m7sLD2xi6snefSasaswsKCxx5Tifjondogm`; Ondo's [source repository](https://github.com/ondoprotocol/global-markets-solana) documents attested mint/redemption, rate limits, pause controls, and Pyth-based price sanity checks.

## Capability matrix

| Capability | Evidence | Integration conclusion |
|---|---|---|
| Exact asset identity | Official authenticated registry documented; pinned official public repo supplies current addresses | Pin `(cluster, mint, token program, rules version)`; refresh only from authenticated Ondo data and review changes. |
| Token accounting | Documented Scaled UI; exact multipliers observed in mint accounts | Store, transfer, escrow, and allocate **raw base units**. UI amounts are presentation and can change globally. |
| Ordinary transfer | Public transfers documented; finalized AAPLon `TransferChecked` observed for `9,979,053` raw units ([tx](https://explorer.solana.com/tx/4oPvfGDTuaJkWx4MynmioJpYYzM1aHBLYkDDrtbavYZfPifRzFgXCGiDbieQQ35ehpVfLot7TMXWhCJ7bVUVHNkx)) | Transfer is demonstrated. Use Token-2022 CPI and checked raw amounts. |
| PDA vault custody | No transfer fee, active hook, non-transferable flag, or permanent delegate observed; mint unpaused | Technically plausible. **Not validated:** no DividendX PDA deposit/withdraw was performed. Create a Token-2022 ATA for the PDA, support required account sizing/extensions, then test on devnet or with an authorized small mainnet flow. Pause/freeze remain blockers. |
| Dividend accrual | Ondo documents net dividends reinvested; Solana display grows through Scaled UI while raw holdings stay fixed | Existing raw-allocation math works for a separately authenticated pure cash dividend. |
| Corporate-action classification | `/v1/status/assets` documents `cash_dividend`, `stock_dividend`, `stock_split`, `merger`, `acquisition`, `spinoff`, `earnings`, and maintenance, with `eventId`, window, and `updateSharesMultiplier` | Treat status as an input, not yet a final ledger. Reject non-cash, mixed, unknown, revised, or unfinalized events. |
| Multiplier history | `/v1/assets/{symbol}/shares-multiplier?range=all` documents exact decimal values and earliest timestamps | Required for `M0/M1`, but not sufficient to classify an event. Keyless access was 403 and revision semantics are undocumented. |
| Dividend facts | [`/v1/assets/{symbol}/dividends`](https://docs.ondo.finance/api-reference/assets/get-dividend-information-for-an-asset) reports ticker, yield, frequency, last cash amount, and payment date | Informational underlying data only. It does not expose Ondo net proceeds, reinvestment price, FX, fees, or the resulting multiplier transition. |
| Prices/oracles | [Latest price](https://docs.ondo.finance/api-reference/assets/get-current-price-for-an-asset) is documented for display, not as an oracle; quotes govern mint/redeem. Program source uses Pyth for quote sanity checks. | Never derive a dividend from market price. There is no documented public dividend/reinvestment oracle; Ondo says an official oracle is in development. |
| Redemption | Atomic attested redemption documented. A finalized `RedeemForUsdc` burned `9,979,053` raw AAPLon and transferred `3,319,366` raw USDC, with `Attestation signature verified` ([tx](https://explorer.solana.com/tx/4DCaeeTK5wKFYhbJXGs3GpKwVavWpHTG1g1YzqaYtVqiaEmTAF4tvxizD3FaSFcfbF97BoH3Ug27qDtUt6GXxf5t)) | Production settlement path observed through an official authorized solver. It does not prove retail or vault eligibility. DividendX should always permit claimants to withdraw raw stock tokens rather than depend on issuer redemption. |
| Solana bridge route | Ondo Stocks are native Solana Token-2022 mints. Ondo's stock bridge documents Ethereum, BNB Chain, and HyperEVM, not Solana. | Do not treat Solana supply as OFT-wrapped EVM supply or promise a stock bridge route to Solana. Chain-specific contracts and presentation rules differ. |

## Dividend accounting

Ondo describes each token as a total-return tracker. A token may represent more than one referenced share because dividends are received by OGM, reduced by applicable withholding, and reinvested. On Solana the raw token amount does **not** rebase. The Token-2022 multiplier changes the UI amount:

```text
displayed_amount(t) = raw_amount / 10^9 × active_multiplier(t)
```

This follows both Ondo's [Overview](https://docs.ondo.finance/ondo-stocks/overview) and [Corporate Actions](https://docs.ondo.finance/ondo-stocks/corporate-actions), and Solana's [`ScaledUiAmount` specification](https://solana.com/docs/tokens/extensions/scaled-ui-amount), which says the stored token amount remains unchanged and warns that floating-point UI conversions need not round-trip exactly.

For raw collateral `Q`, a confirmed cash-dividend transition from exact multiplier `M0` to `M1`, with no split or other action in the interval, the post-event raw units economically attributable to the reinvested dividend are:

```text
Q_D = floor(Q × (M1 - M0) / M1)
Q_P = Q - Q_D
```

The identity is `Q × M1 = Q × M0 + Q × (M1-M0)`. Dividing each component by the new multiplier expresses both claims in the same post-event raw units. Use exact fixed-point decimal arithmetic, define the floor dust beneficiary in the rules, and freeze the allocation once. Later multiplier changes must not retroactively alter this pool.

This is valid only when an independently authenticated record proves a **pure cash dividend** and binds the exact pre/post multiplier pair to the same event. For a split, stock dividend, merger, spin-off, or a multiplier transition spanning multiple actions, quarantine settlement. The generic event factor may include a separately sourced split factor, but the two-day adapter should reject it rather than infer one.

### Gross, net, and tax treatment

Ondo states that US-company dividends received by its BVI issuer are generally withheld at **30%**; US fixed-income ETF distributions may have exempt components, and ADR treatment varies. It reinvests the amount **net of withholding**. Ondo says it withholds no additional tax at redemption, while holders remain responsible for their own taxes. See [Fees & Taxes](https://docs.ondo.finance/ondo-stocks/fees-and-taxes).

DividendX should allocate the economic increment already embedded in `M1/M0`; it should not apply another assumed tax haircut. For disclosure or reconciliation, it still needs issuer data for gross distribution, withholding, expenses, FX where applicable, net reinvested cash, execution price/time, shares acquired, and rounding. Those fields are not documented in the public dividend endpoint.

## Event data contract

The adapter needs the following immutable inputs before settlement:

```text
AssetConfig
  issuer, chain, mint, token_program, decimals
  expected extensions and control authorities
  registry source/version and rules version

Observation
  finalized slot, raw vault balance, raw mint supply
  active multiplier and scheduled multiplier/timestamp
  pause/freeze state, observed_at

CorporateAction
  issuer event_id and revision/finality
  mint/symbol, action_type, ex/effective/record/pay timestamps
  exact M0 and M1, split factor (=1 for cash-only)
  gross amount, withholding, net amount, currency/FX
  reinvestment price/time and rounding, source timestamps

Settlement
  single-use event key, deposit cutoff, authenticated evidence hash
  Q, Q_D, Q_P, rounding/dust result, finalized slot
```

Minimum controls:

1. Ingest authenticated `/v1/status/assets` and the all-history multiplier endpoint with an Ondo API key; archive every response because the status endpoint is not documented as a historical ledger.
2. Match by issuer `eventId`, mint, type, and time window. Require `cash_dividend` and `updateSharesMultiplier=true`.
3. Read the finalized Solana mint and require the expected Token-2022 owner, decimals, extensions, authorities, pause state, and exact active `M1`.
4. Require a stored earlier `M0` from before the event, not a UI-converted float. Use decimal strings/fixed-point integers.
5. Make event settlement idempotent and support an explicit correction/reversal process. Do not let a later API mutation silently change an allocation.

Ondo currently documents a normal dividend trading pause from **7:50 PM to 8:10 PM ET on the day before the ex-date**, while ETF distributions can remain paused longer if the amount is not final. The status API exposes expected `start` and `end` timestamps, but those are operational windows, not proof of entitlement, payment, or final reinvestment. Observe both the status window and the onchain scheduled multiplier timestamp; settle only after the multiplier is active at a finalized slot and the event record is final under a separately agreed issuer contract.

## Exact blockers

- **API credentials:** at `2026-09-16T05:37:14Z`, keyless requests to multiplier history, dividend data, and asset status each returned HTTP 403. Runtime access, limits, SLA, and permitted redistribution are untested.
- **No authoritative historical action ledger was found:** status documents active/upcoming events, while multiplier history carries no action type or event ID. Their durable join and finality/revision rules are undocumented.
- **No public reinvestment breakdown was found:** gross/net dividend, withholding actually applied, FX, execution price/time, shares purchased, and rounding are absent from the documented response schemas.
- **PDA custody is not transaction-tested:** ordinary transfer is demonstrated, and mint configuration is compatible in principle, but no deposit into or withdrawal from a DividendX PDA has been executed.
- **Issuer controls can interrupt custody:** global pause, account freeze, minting, and scaled-UI update authorities remain active.
- **Direct redemption is permissioned:** issuer KYC, geography, wallet screening, signed attestations, risk limits, and liquidity apply. Holding a transferable token does not guarantee direct redemption access.
- **Cross-chain equivalence is not established:** EVM uses a price-style total-return presentation while Solana uses Scaled UI. A symbol alone is not a chain-independent accounting identifier.

## Concrete recent event: evidence and limit

A finalized transaction at `2026-09-15T00:04:04Z` updated KOon's multiplier to `1.0238905041551842` ([tx](https://explorer.solana.com/tx/5QT2nfLE4zZcq5HeiQpckHCF5VKFrhhcfXCFDwuEUdnhWQKC6Z6vV1GL9WnbTjEUFQJByfgd3dAYNLMz1CCBewBc)). Coca-Cola's official [2026 Q2 10-Q](https://investors.coca-colacompany.com/filings-reports/all-sec-filings/content/0001628280-26-050503/ko-20260703.htm) records a $0.53 quarterly dividend with a 2026-09-15 record date and 2026-10-01 payment date. Ondo's KOon page also displayed the $0.53 last underlying dividend.

This is a useful real-world candidate for a demo fixture, but it is **not a validated dividend event**: the onchain multiplier instruction encodes no action type, gross/net amount, reinvestment price, or event revision, and the authenticated Ondo event response was unavailable. The timing and economics being consistent is not proof. Label it “observed KOon multiplier update adjacent to a documented KO dividend,” never “Ondo's settled KO dividend,” unless Ondo supplies the event binding.

## Redemption and availability

Ondo documents a $1 minimum, direct access after eligibility/KYC, instant atomic redemption to USDon, and USDC redemption when swapper liquidity is available. US persons, persons in prohibited jurisdictions, and other ineligible wallets cannot subscribe or redeem directly; OGM can also restrict activity. See [Investing & Redeeming](https://docs.ondo.finance/ondo-stocks/investing-and-redeeming) and [Eligibility](https://docs.ondo.finance/ondo-stocks/eligibility).

DividendX should separate two promises:

- a claimant can receive its raw Ondo token allocation from the vault, subject to token pause/freeze; and
- an eligible party may separately redeem with OGM or trade through a third party.

The protocol should not promise stablecoin settlement merely because it holds the stock token.

## Native Solana versus bridge routes

The audited mints are native Token-2022 assets issued and redeemed through Ondo's Solana program. Ondo's [Token Bridge](https://docs.ondo.finance/tools/ondo-bridge) documents Ondo Stocks bridging among Ethereum, BNB Chain, and HyperEVM using OFT burn/mint mechanics; it does not list Solana for Ondo Stocks. (Ondo's USDY bridge has a different network matrix that includes Solana.) Therefore:

- configure Solana by exact native mint and Token-2022 program;
- do not accept an EVM address, ticker, or bridged wrapper as equivalent collateral;
- maintain chain-local multiplier and corporate-action observations; and
- do not claim that users can bridge these stock tokens into or out of Solana through Ondo's stock bridge.

## Credible two-day MVP boundary

**Can claim:**

- exact allowlisted Ondo Solana mint recognition;
- Token-2022 raw-unit deposit/accounting code, after a local/devnet PDA round trip;
- finalized onchain multiplier monitoring and change detection;
- deterministic, auditable allocation math for a fixture explicitly classified as a pure cash dividend;
- a real KOon multiplier-update case study labeled with its evidentiary limit;
- claimant withdrawal of raw stock-token units, subject to issuer pause/freeze.

**Cannot yet claim:**

- automatic authoritative detection or finality of live Ondo dividends;
- complete live coverage of all 443 repository-listed mints;
- exact gross-to-net tax or reinvestment reconciliation;
- an issuer-grade price, FX, or dividend oracle;
- production-tested DividendX PDA custody;
- guaranteed stablecoin redemption, retail eligibility, or 24/7 liquidity;
- support for splits, stock dividends, mergers, spin-offs, mixed actions, corrections, or cross-chain positions.

The smallest honest architecture is a chain-specific `OndoScaledUiAdapter` behind the same raw-allocation interface as xStocks, disabled for live settlement until the event-data contract above is satisfied.

## Primary sources

All were accessed 2026-09-16 unless an observation timestamp is stated above.

- Ondo: [Overview](https://docs.ondo.finance/ondo-stocks/overview), [Legal & Regulatory](https://docs.ondo.finance/ondo-stocks/legal-and-regulatory), [Trust & Transparency](https://docs.ondo.finance/ondo-stocks/trust-and-transparency), [Corporate Actions](https://docs.ondo.finance/ondo-stocks/corporate-actions), [Token & Quote Pricing](https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing), [Fees & Taxes](https://docs.ondo.finance/ondo-stocks/fees-and-taxes), [Investing & Redeeming](https://docs.ondo.finance/ondo-stocks/investing-and-redeeming), [Eligibility](https://docs.ondo.finance/ondo-stocks/eligibility), [Token Bridge](https://docs.ondo.finance/tools/ondo-bridge).
- Ondo API: [address registry](https://docs.ondo.finance/api-reference/assets/get-all-contract-addresses-across-networks), [metadata](https://docs.ondo.finance/api-reference/assets/get-metadata-for-all-supported-assets), [asset status](https://docs.ondo.finance/api-reference/status/get-asset-statuses), [shares-multiplier history](https://docs.ondo.finance/api-reference/assets/get-shares-multiplier-history-for-an-asset), [dividend information](https://docs.ondo.finance/api-reference/assets/get-dividend-information-for-an-asset), [latest price](https://docs.ondo.finance/api-reference/assets/get-current-price-for-an-asset), [all-asset market data](https://docs.ondo.finance/api-reference/assets/get-market-data-for-all-supported-assets), and [API overview](https://docs.ondo.finance/api-reference/overview).
- Ondo source: [`global-markets-solana`](https://github.com/ondoprotocol/global-markets-solana) and pinned [`gm-solana-simulator` registry](https://github.com/ondoprotocol/gm-solana-simulator/blob/0688add3c64aadc7006712989e9ec0592b5b10f8/constants.rs).
- Solana: [`ScaledUiAmount` extension](https://solana.com/docs/tokens/extensions/scaled-ui-amount).
- Underlying issuer: Coca-Cola [2026 Q2 Form 10-Q](https://investors.coca-colacompany.com/filings-reports/all-sec-filings/content/0001628280-26-050503/ko-20260703.htm).
