# DividendX design system

Phase-one visual system, 16 September 2026. It describes a design prototype rather than a deployed vault or live market.

## Design idea

The identity comes from one stock position separating into two legible entitlements. Stock exposure is blue and dividend rights are amber; both are always named, so color is reinforcement rather than the only cue. The paired diamond mark uses the same split without borrowing an issuer or competitor logo.

The interface is editorial and amount-led. Large type establishes the asset and scenario; fine rules align facts; a single vertical divider separates source evidence from the calculation. Avoid nested dashboard cards, ornamental gradients, excessive pills, generic hero metrics, and equal-weight diagrams that imply the two allocations have equal economic size.

## Foundation

- **Canvas:** warm white `#F6F3EC`; product surface `#FFFEFB`.
- **Ink:** `#101820`; secondary text `#53606B`; dividers `#D7D2C8`.
- **Stock exposure:** blue `#2457F5`, with `#1639A6` for text on pale blue.
- **Dividend rights:** amber `#C46A00`, with `#7A4000` for text on pale amber.
- **Status:** green for completed/reconciled, red for rejected, brown for stale. Status copy and icons accompany color.
- **Type:** system sans for offline reliability. Display tracking is tight; headline line spacing is slightly relaxed following user review: 0.93 for the opening headline and pitch, 0.97 for the type specimen, 1.0 for asset/flow titles, and 1.04 for section headings. Body copy stays at 1.5 line height. Use tabular lining numbers for every amount and monospace only for IDs and raw accounting.
- **Spacing:** a 4 px base with 8, 12, 16, 24, 32, 48, and 64 px steps. Prefer whitespace and rules over containers.
- **Corners:** 8 px for fields, 14 px for controls, 24 px for major surfaces, and full pills only for compact navigation or status actions.
- **Focus:** 3 px violet `#6B4EFF` with 3 px offset. Every interactive control must retain a visible keyboard focus indicator.

Reusable values are in [`tokens.css`](../packages/design-tokens/tokens.css) and [`tokens.json`](../packages/design-tokens/tokens.json).

## Product vocabulary

Use **Stock exposure (PT)** and **Dividend rights (DR)**. PT is exposed to stock price risk and must not be shortened to “principal” in normal copy. For supported reinvestment series, DR pays the event’s dividend-derived stock-token units, not fixed cash. Each PT/DR pair is backed by its own issuer/mint collateral. The existing KOx screen remains the approved reference example; the broader product uses the same design across eligible issuers.

Use **issuer activation** for the xStocks multiplier-effective time. Keep the company cash-payment date separate. A historical calculator entry is a **scenario**, never a record of wallet holdings or proof that a past dividend was captured.

## Amount and evidence rules

The normal input is a stock-equivalent KOx amount before the event. The interface converts it to raw collateral with exact integer/rational arithmetic, applies the isolated-event formula, then displays both allocations as KOx equivalents after the event. Display rounding never becomes the ledger.

The primary view shows the two named outcomes and “Allocation reconciles exactly.” The accounting inspector holds raw base units, token decimals, exact multipliers, mint, event ID, and revision. Raw PT/DR allocations are redemption allocations, not claim-token receipt quantities.

The default `100` KOx-equivalent scenario resolves to:

| Concept | Value |
|---|---:|
| Raw collateral represented | `9,819,982,084` |
| Raw PT redemption allocation | `9,779,376,057` |
| Raw DR redemption allocation | `40,606,027` |
| Stock exposure after event | `100.0000 KOx` |
| Dividend rights after event | `0.4152 KOx` |

The narrow blue/amber allocation rail uses the actual isolated-event ratio. Do not enlarge the amber segment for decoration. Independent typographic rows keep the smaller dividend right readable.

## Component patterns

- **Product header:** original DividendX mark, three working tabs, snapshot/network status, and an explicitly disabled wallet control.
- **Snapshot ribbon:** states observation date and cached status before any asset data.
- **Asset/event heading:** asset first, precise action second. Keep event type and activation visible without exposing raw IDs.
- **Verified facts:** one-dimensional ruled list for activation, dividend per share, payout asset, and separate company payment date.
- **Scenario calculator:** amount field, true-ratio allocation rail, PT/DR rows, reconciliation state, and optional inspector.
- **Event timeline:** original dates only; distinguish issuer activation from company cash-payment date.
- **Split view:** a concise mechanism explanation. The plus sign means the claims reconcile to one collateral position; it does not imply equal size.
- **Position view:** honest disconnected empty state until wallet integration exists.
- **State gallery:** disconnected, loading, stale, empty quote, rejected event, and completed calculation. Market prices, APY, fees, inventory, receipts, or wallet history remain absent until genuine data exists.

## Responsive behavior

Desktop uses a source-evidence column and a calculation column separated by one rule. At mobile widths they stack in that order. Navigation moves to a full-width second row; asset copy, source links, labels, and amounts wrap without horizontal scrolling. The inspector remains collapsed by default.

## Pitch specimen

The 16:9 specimen uses the same mark, ink field, blue stock phrase, and amber dividend phrase as the product. The slide is typographic and makes no claims about performance, price, liquidity, or deployed functionality. Capture it at a true 16:9 viewport such as 1600 × 900.

## Multi-issuer application, 16 September 2026

The visual system remains approved. In the full frontend, group the [selected stock package](../planning/research/initial-asset-package.md) by company and distinguish issuer and exact token. Include xStocks, Backpack/Trek and Ondo. Exclude permissioned, retired and no-dividend products from the catalog; no holder onboarding or issuer-approval UI is planned. Give a plain reason when a selected stock awaits verified dividend data or is temporarily unavailable. Keep deposits disabled until its series qualifies. Use the same PT/DR colors and flow across issuers, preserving each series' collateral identity and denomination. Recognition, observation and fixture tests do not imply live integration. See [current architecture](../planning/adapter-decision.md).

Related guide: [Illustrations — Paper instruments, digital ownership](illustrations/illustration-guide.md).
