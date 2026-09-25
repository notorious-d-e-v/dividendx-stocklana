# Real-event refresh for the DivX demo

> Scope update, 16 September 2026: the current multi-issuer plan is [Solana issuer synthesis](solana-issuer-synthesis.md) and [architecture](adapter-decision.md). This file preserves earlier evidence/review; xStocks-only scope or deferral of native Solana Backpack/Ondo is superseded.

**Status:** planning verification only. **Observed:** 2026-09-16 from 03:14:35Z through 03:18:59Z. No transaction, transfer, or funds were used. Timestamped raw responses, request URLs, hashes, and extracted global-history matches are in [real-events-2026-09-16.json](evidence/real-events-2026-09-16.json).

## Verified KOx event

The refreshed xStocks data still matches the prior snapshot:

| Field | Verified value |
|---|---|
| Symbol / Solana mint | `KOx` / `XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ` |
| Event | `75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e`, version `2`, `CashDividend` |
| xStocks effective time | `2026-09-15T00:30:00.000Z` |
| Multiplier | `1.0183317967386898` → `1.0225601246249238` |
| Cashflow fields | gross `$0.53`; net `$0.371`; withholding `0.3` |
| History status | `Initial` |
| Current API multiplier | `1.0225601246249238`; no next scheduled multiplier |

The finalized Solana read at slot `447417969` again reports Token-2022, eight decimals, and the same Scaled UI Amount fields: old multiplier `1.0183317967386898`, new multiplier `1.0225601246249238`, and effective Unix time `1789432200`. The parsed mint retains both scheduled fields after activation, so the UI must choose the active value by timestamp rather than display the old `multiplier` field as current.

### Company dates are different concepts

[Coca-Cola's official July 15 announcement](https://investors.coca-colacompany.com/news-events/press-releases/detail/1165/board-of-directors-of-the-coca-cola-company-elects-new-officer-and-declares-regular-quarterly-dividend) confirms a `$0.53` dividend, a shareholder **record date** at close of business on `2026-09-15`, and a **payment date** of `2026-10-01`. The announcement does not state an ex-dividend date.

The xStocks time `2026-09-15T00:30:00Z` is the issuer's multiplier-effective timestamp. It must not be labeled as Coca-Cola's announcement, ex-dividend, record cutoff, or payment timestamp merely because it falls on the same calendar date as the record date.

No future KOx action was verified. The xStocks upcoming endpoint returned three `Scheduled` version-1 rows for March, June, and September 2026 events that have already taken effect and have newer version-2 history rows. The October 1 company payment belongs to the already-effective September action; it is not a future multiplier event.

## Real split control

Use the issuer's real HONx reverse split instead of a hypothetical split:

| Field | Verified value |
|---|---|
| Symbol / event | `HONx` / `ccb423a2-6045-4d1c-9a94-1f37f0ab8d63`, version `2` |
| Type / ratio | `ReverseSplit` / `2` old units to `1` new unit |
| Effective time | `2026-06-29T15:30:00.000Z` |
| Multiplier | `1.024094713306789` → `0.5120473566533945` |
| Status | `Initial` |

HONx multiplier history independently labels the same timestamp and values with reason `ReverseSplit`. This is a strong rejection control: treating an unclassified multiplier delta as a dividend would produce a negative DR allocation. The event must be isolated by event ID and version because a separate HONx spinoff later that day changed the multiplier again at `23:55Z`; today's HONx multiplier is therefore not the reverse-split post-state. This is an event-level classifier control, not a pure-split full-day history or a supported live series. The following `SpinOff` is also outside the dividend MVP and must be rejected.

The documented global history endpoint returned `732` rows across eight pages. Those version rows included `10` `ForwardSplit`, `1` `ReverseSplit`, and `3` `UnitSplit` rows, alongside `710` cash-dividend rows and other action types. Status counts were `703 Initial`, `16 Corrected`, and `13 Cancelled`. Counts are rows, not unique events: for example, one MNSTx split has both an incomplete version 2 and a corrected version 3.

`Initial` is not a demonstrated terminal-finality status. For a settlement-capable design, select the highest known version per event ID, reject cancelled or incomplete records, and corroborate the event's post-multiplier onchain. The stale upcoming results show why endpoint membership alone is insufficient.

## Bounded, useful demo

The first useful feature can live in the existing Market asset detail view:

1. Show the live read-only KOx identity, Solana mint, current timestamp-selected multiplier, and corporate-action history with event ID, version, status, type, effective time, old/new multipliers, gross/net cashflow, and withholding.
2. Let the user select the verified KOx event and run the scenario calculator. For `100` unscaled KOx units (`10,000,000,000` base units, about `101.8331796739` displayed shares at `M0`), the established fixed-point fixture yields `99.58649592` unscaled KOx units to PT and `0.41350408` unscaled KOx units to DR, conserving the exact raw balance.
3. Run the real HONx reverse-split record through the same classifier and show a deterministic rejection: it is not dividend yield and cannot settle a dividend series.
4. Execute the immutable KOx event against a mock Token-2022 mint on localnet/devnet. Label the replay and balances as simulated.

The live explorer and calculator are useful immediately because they expose real issuer actions, correction/version risk, and the exact economics before any transaction scope exists. The historical replay is not a live event capture, and a successful mock or testnet redemption is not evidence that real KOx transfers, issuer controls, mainnet vault custody, or real-asset redemption work. A live future series remains blocked on a genuinely future event, an event-finality policy, and real transfer testing outside this planning task.

## Source endpoints

- [KOx asset](https://api.xstocks.fi/api/v2/public/assets/KOx)
- [KOx current multiplier](https://api.xstocks.fi/api/v2/public/assets/KOx/multiplier?network=Solana)
- [KOx action history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=KOx&sortBy=createdTimeUtc&sortOrder=asc)
- [KOx upcoming actions](https://api.xstocks.fi/api/v2/public/corporate-actions/upcoming?page=1&pageSize=100&symbol=KOx)
- [HONx action history](https://api.xstocks.fi/api/v2/public/corporate-actions/history?page=1&pageSize=100&symbol=HONx&sortBy=createdTimeUtc&sortOrder=asc)
- [HONx multiplier history](https://api.xstocks.fi/api/v2/public/assets/HONx/multiplier/history?network=Solana)
- [xStocks corporate-action API reference](https://docs.xstocks.fi/apis/openapi/corporate-actions)
- [Solana mainnet RPC](https://api.mainnet-beta.solana.com), method `getAccountInfo`, commitment `finalized`
