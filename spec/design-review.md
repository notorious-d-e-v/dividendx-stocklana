# Phase-one design review

> Scope update, 16 September 2026: the current multi-issuer plan is [Solana issuer synthesis](../planning/solana-issuer-synthesis.md) and [architecture](../planning/adapter-decision.md). This file preserves earlier evidence/review; xStocks-only scope or deferral of native Solana Backpack/Ondo is superseded.

16 September 2026. Astra's acceptance criteria for the design system, representative screen and HTML slide specimen. This is a design prototype, not the full application or a deployed vault.

## Product clarity

- The first screen explains that stock exposure and dividend rights can be held separately.
- A visitor can inspect the sourced KOx event and change an allocation scenario without a wallet.
- Stock exposure uses PT as a secondary label; dividend rights use DR. Neither implies fixed dollar principal or guaranteed cash income.
- The entered amount describes a scenario before the historical event. It does not imply that a deposit today captures the past dividend or establish a wallet's historical entitlement.
- Blue identifies stock exposure and amber identifies dividend rights; words remain sufficient without color.

## Evidence and units

- The source is a dated snapshot. A cached response is never labeled live.
- The September 15 issuer activation is distinct from Coca-Cola's October 1 cash-payment date.
- Event ID/version, original effective time, exact mint, raw balances and multipliers are accessible in the inspector rather than dominating the main task.
- Displayed underlying equivalents, claim receipt quantities and raw redemption allocations are distinct concepts. Do not relabel a raw allocation as the number of receipt tokens issued.
- The audited accounting reference has 10,000,000,000 raw base units, with 9,958,649,592 allocated to PT and 41,350,408 to DR. Keep it as a QA case. The main input accepts displayed stock equivalents before the event and converts down to raw units with exact arithmetic, so a user entering 100 KOx is not silently supplying 100 unscaled units.
- For 100 displayed KOx before this event, rounding down to raw collateral gives Q = 9,819,982,084, PT = 9,779,376,057 and DR = 40,606,027 base units. The main result rounds to 100.0000 stock exposure and 0.4152 dividend-derived KOx after the event.
- Quote and transaction states are explicitly illustrative. No fabricated market price, APY, liquidity, receipt or historical wallet balance.

## Visual review

- Judge the desktop and mobile renders, not the quantity of components or tokens produced.
- The composition should belong to this product: one stock position, two entitlements, one clear calculation. Avoid generic hero metrics, decorative dashboards, badges for every label and nested card grids.
- Typography creates hierarchy through deliberate scale, weight, line length and spacing. Keep financial amounts tabular and readable.
- Warm white is a surface choice, not a substitute for identity. Blue/amber meaning and the stock/dividend composition carry the identity.
- The pitch specimen shares typography, colors and product vocabulary with the app while using a simple presentation composition.
- Check normal text contrast, mobile wrapping, keyboard focus, touch target sizes and meaningful control states. Avoid hover-only information.

## Scope and handoff

Required artifacts: reusable CSS/JSON tokens, design-system documentation, browsable style board, desktop/mobile previews, a 16:9 HTML pitch specimen and concise QA notes. A full frontend, editable slide deck, wallet integration and vault program are later phases.

Backpack is an expansion candidate pending usable event data. Generic issuer adapters and an additional wrapper token are outside this phase.

External design references reviewed: [Impeccable](https://impeccable.style/), [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), and [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines). These inform review; no claim is made that a skill guarantees visual quality or that these skills have been installed.

## Astra review findings

The first draft exposed unscaled units through an input labeled KOx and used an oversized dividend segment in the balance bar. It also rounded fractional display digits without carrying into the whole number. Sol corrected the input conversion, bar proportions and rounding. The raw audited fixture remains a separate verification case.

Astra inspected the application in a browser at desktop and 390-pixel mobile widths, and opened the accounting inspector. Its 100-KOx scenario matched the independently calculated raw values above. Header/navigation wrapping and amount legibility were acceptable for this first design direction. Main-flow technical wording was reduced before handoff. The pitch specimen was also inspected; its exported reference should use a 16:9 viewport.

This review establishes a usable visual direction and a historical calculator prototype. It does not verify a wallet integration, executable market, deployed vault or production issuer compatibility.
