# Initial asset package: six companies, 15 Solana mints

Snapshot: **16 September 2026**. This is a bounded candidate integration catalog, not an issuer inventory or launch claim. It excludes permissioned/allowlisted products and excludes Backpack products whose deposit or withdrawal flags are off. The machine-readable evidence is in [`initial-asset-package-2026-09-16.json`](../evidence/initial-asset-package-2026-09-16.json).

## Decision

Use six recognizable dividend-paying companies: **Coca-Cola, Apple, Microsoft, Micron, Nike, and IBM**. All six have live xStocks and Ondo Solana mints. Micron, Nike, and IBM also have live Backpack/Trek mints with deposits and withdrawals enabled. That produces a contained 15-mint catalog.

All 15 passed the same observed mechanical screen: Token-2022, Scaled UI Amount, nonzero supply, initialized default accounts, unpaused mint, null transfer-hook program, and no parsed transfer-fee or non-transferable extension. xStocks uses eight decimals, Backpack/Trek six, and Ondo nine. These are mutable observations, not promises; exact mint, owner, decimals, extension names, authorities, pause/freeze state, hook, fee configuration, and active multiplier must be rechecked before deposit and withdrawal.

Mechanical fit is distinct from dividend replay evidence. xStocks supplies classified cash-dividend records for all six. Backpack supplies a strong onchain reconstruction only for MU. Ondo supplies six mechanically clean tokens but no authenticated event binding. A multiplier above one does not prove a cash dividend.

## Recommended catalog

`M` is the time-effective multiplier at the recorded snapshot. Token-2022 retains both `multiplier` and `newMultiplier`; after `newMultiplierEffectiveTimestamp`, the effective value is `newMultiplier` even though the stored `multiplier` field remains unchanged. The evidence JSON preserves both raw fields, the timestamp, and the computed effective value. A field named `newMultiplier` is not necessarily still pending.

| Company | Issuer symbol | Exact Solana mint | d / M | Event evidence and decision |
|---|---|---|---|---|
| Coca-Cola | `KOx` | `XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ` | 8 / `1.0225601246249238` | **First execution target.** Official xStocks event `75c0…f9e`, v2, classifies a cash dividend and binds `1.0183317967386898 → 1.0225601246249238`, gross $0.53, net $0.371. Status is still `Initial`, so production finality remains a contract question. |
| Coca-Cola | `KOon` | `e6G4pfFcrdKxJuZ4YXixRFfMbpMvgXG2Mjcus71ondo` | 9 / `1.0238905041551842` | Mechanical fit only. The observed update near Coca-Cola's dividend is not an authenticated Ondo dividend event. |
| Apple | `AAPLx` | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | 8 / `1.0032690125398187` | Official classified xStocks cash-dividend history; good later replay fixture. |
| Apple | `AAPLon` | `123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo` | 9 / `1.003376073740221` | Mechanical fit only; no reviewed authenticated Ondo event binding. |
| Microsoft | `MSFTx` | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` | 8 / `1.0059033904787456` | Official classified xStocks cash-dividend history; good later replay fixture. |
| Microsoft | `MSFTon` | `FRmH6iRkMr33DLG6zVLR7EM4LojBFAuq6NtFzG6ondo` | 9 / `1.0057308568927839` | Mechanical fit only; no reviewed authenticated Ondo event binding. |
| Micron | `MUx` | `XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav` | 8 / `1.0004015986353854` | Official classified xStocks cash-dividend history. |
| Micron | `MU.US` | `MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1` | 6 / `1.0001068649823912` | **Second execution target.** Fully bracketed onchain `DividendDistribute` reconstruction, but no issuer event ID/revision or correction rules. Current `M` differs from the dividend transaction's exact `M1=1.000106726714702` because later supply-maintenance calls recomputed it. The missing net ledger limits dollar reconciliation, not deterministic raw allocation from a trusted classified `M0/M1`. |
| Micron | `MUon` | `Fz9edBpaURPPzpKVRR1A8PENYDEgHqwx5D5th28ondo` | 9 / `1.0011212375258447` | Mechanical fit only; `M>1` is not event classification. |
| Nike | `NKEx` | `XsGYpMvKbVt6ViHqRd7cF3s746dAMFBQWcC49hB9VVP` | 8 / `1.007347670251` | Official classified xStocks cash-dividend history. |
| Nike | `NKE.US` | `NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg` | 6 / `1` | Live and mechanically clean; no Backpack dividend event reviewed. |
| Nike | `NKEon` | `g646pcdG2Rt5DH9WZzL7VVnVDWCCMTTrnktwE74ondo` | 9 / `1.0265770663565548` | Mechanical fit only; `M>1` is not event classification. |
| IBM | `IBMx` | `XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr` | 8 / `1.0204029187943977` | Official classified xStocks cash-dividend history. |
| IBM | `IBM.US` | `BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk` | 6 / `1` | Live and mechanically clean; no Backpack dividend event reviewed. |
| IBM | `IBMon` | `C8bZkgSxXkyT1RgxByp2teJ24hgimPLoyEYoNa9ondo` | 9 / `1.0227923764446276` | Mechanical fit only; `M>1` is not event classification. |

The issuer-scope snapshots used finalized slots `447444271–447461422`. A later [single finalized RPC cross-check of all 15 exact mints](../evidence/initial-package-parent-verification-2026-09-16.json) at slot `447462406` preserves the raw request and response and reconfirms the profile. The [xStocks registry and mint inventory](../evidence/xstocks-scope-2026-09-16.json), [Backpack 48-asset snapshot](../evidence/backpack-scope-assets-2026-09-16.json), and [Ondo evidence](../evidence/ondo-solana-2026-09-16.json) preserve the issuer-level inputs. The six Ondo identities come from the pinned official [443-mint registry at commit `0688add3…`](https://github.com/ondoprotocol/gm-solana-simulator/blob/0688add3c64aadc7006712989e9ec0592b5b10f8/constants.rs); the package JSON records the six exact registry rows.

## Evidence grades

| Grade | Result |
|---|---|
| Recognized dividend payer | **Yes, all six.** First-party company records confirm current/recent regular cash dividends: [Coca-Cola](https://investors.coca-colacompany.com/news-events/press-releases/detail/1152/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-approves-64th-consecutive-annual-dividend-increase), [Apple](https://investor.apple.com/dividend-history/), [Microsoft](https://news.microsoft.com/source/2026/06/10/microsoft-announces-quarterly-dividend-29/), [Micron](https://investors.micron.com/financials/quarterly-results/), [Nike](https://investors.nike.com/investors/news-events-and-reports/investor-news/investor-news-details/2026/NIKE-Inc--Declares-0-41-Quarterly-Dividend-bbe05eb31/default.aspx), and [IBM](https://www.ibm.com/investor/governance/ibm-cash-dividends). |
| Issued/live secondary token | **Yes, all 15.** Exact registry identity, live account, and nonzero supply were observed; all six xStocks rows had `isTradingHalted=false`, and the three Backpack rows had deposits and withdrawals enabled. These checks do not prove usable liquidity. |
| Compatible mint configuration | **Yes at snapshot, all 15.** Mutable issuer controls remain, including freeze/pause/mint/scale authorities and xStocks/Backpack permanent delegates. |
| Classified historical event | **xStocks: yes for all six. Backpack: MU reconstruction only. Ondo: none.** xStocks records are issuer-classified but still expose `status=Initial`; Backpack MU is a chain reconstruction rather than an official event feed; KOon's update lacks the Ondo API event binding. |
| Custody execution | **Not by DividendX.** A separate Backpack MU program-owned pool transferred by CPI, and Ondo AAPLon has an ordinary transfer plus authorized-solver redemption. Neither validates this vault or generalizes to every mint. |

The underlying company's dividend declaration proves that the company paid or declared a dividend. It does not prove that an issuer replayed that event into its token. The token's multiplier proves its current display factor. It does not classify why the factor changed. Both facts are required before allocation.

## What must be enabled

1. **Exact-mint manifest and fail-closed checks.** Admit only these 15 `(issuer, cluster, mint, token program)` tuples. Recheck decimals, required extensions, controls, current deposit/withdraw flags where applicable, pause/freeze, hook program, transfer fee, active/pending multiplier, and finalized slot before custody movements.
2. **xStocks event reader.** Archive official event responses, deduplicate by event ID and version, evaluate pending multiplier activation using chain time, and halt on corrections, mixed actions, gaps, or contradictory versions. KOx is the first replay fixture. `status=Initial` needs an explicit accepted-finality rule before unattended settlement.
3. **Backpack reader.** Decode `DividendDistribute`, prove a complete authority-history bracket, bind backing before/addition/after to `M1`, and exclude `SupplyMint…` and `SupplyRedeem…` scale changes. MU can be replayed as `onchain_reconstruction`; production still needs stable issuer event identity, revision/finality, and correction rules. Gross, net, tax, FX, and execution details are optional for raw allocation but needed for dollar reconciliation and disclosure.
4. **Ondo event contract.** Obtain authorized access to `/v1/status/assets` and all-history shares-multiplier data, plus durable event ID, type, revision, finality, correction rules, exact `M0/M1`, and event time. Select the first Ondo execution asset only after a pure cash-dividend event is bound to those values. Gross-to-net and reinvestment-price fields are optional for raw allocation and required only for dollar reconciliation/disclosure. KOon remains a case study, not proof.
5. **Vault round trip.** Execute and archive a Token-2022 deposit and withdrawal through the exact DividendX PDA implementation before claiming custody support. Raw base units remain the conserved collateral; scaled UI values are presentation/economic exposure.

Issuer KYC for primary subscription or redemption is separate from secondary token custody. The observed mints have no active transfer hook or default-frozen requirement, so the token mechanics do not show a wallet allowlist gate. Issuers still retain controls, and direct mint/redemption can require KYC, geography checks, wallet screening, attestations, limits, or platform support. The product should promise withdrawal of raw stock tokens subject to token controls, not guaranteed issuer redemption.

## Excluded and bench products

Backpack exposes prepared Solana entries for `KO.US` (`KkAj…Jb3`), `AAPL.US` (`AAPL…LnB8`), and `MSFT.US` (`MSFT…cRJM`), but all had both deposits and withdrawals disabled. They are excluded rather than presented as near-term coverage.

After KOx and Backpack MU, the bench stays inside the same six companies: the other five xStocks fixtures, Backpack NKE/IBM after an event reader exists, and all six Ondo mints after an authenticated event binding is available. No additional underlying is needed for the initial package.

## Source boundary

Issuer APIs, official repositories, finalized public Solana RPC, and first-party company dividend pages were accessed on **16 September 2026**. No credentials, trades, transfers, signatures, or messages were used. This package does not establish legal availability in any jurisdiction, current liquidity, issuer redemption eligibility, or a completed DividendX settlement.
