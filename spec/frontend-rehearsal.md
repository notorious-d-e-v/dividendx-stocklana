# Frontend phase: complete local rehearsal

Preservation note, 16 September 2026: this document describes the detailed rehearsal, now retained at `/rehearsal/`. The user-facing root app follows `product-app-v1.md` after the user's review. The product app uses Market / Split / Redeem and hides simulation controls; the rehearsal remains a separate fallback and accounting demonstration.

16 September 2026. Build a React + TypeScript + Vite app, using the approved design system and existing artwork. This is an existing custom development project, not a Sites project. The local preview should be accessible alongside the preserved design guide. Do not modify existing slides, narration, design assets, evidence or tokens.

## Experience

One concise header: DivX mark, Market / Split / Positions, and demo-account selector (Seller / Buyer). Keep “Demo rehearsal · test balances” visible. A single short explanation says prices/offers and transactions in the rehearsal use test balances, with sourced historical dividend events. Do not ask to connect a real wallet. Refresh/reset behavior should be explained in demo controls.

**Market:** editorial stock directory, grouped by six companies with issuer options, not 15 identical large cards. Search company/ticker and filter issuer. Show company before symbol. Clearly distinguish “Replay available” for KOx and Backpack MU from “Dividend data pending” or “Fixture not prepared” for other candidates. Show snapshot timestamp, source links and why an asset cannot run. Select a company/issuer to inspect its event and calculate before entering the flow. Do not show fake APY, liquidity, current prices or completed integrations.

**Split:** asset/issuer selector, readable event facts, default 100 pre-event stock equivalents, blue PT and amber DR allocations, optional historical KOx dollar context, and optional accounting inspector. Both claim supplies equal deposited raw Q, while their redemption allocations differ; do not label allocation amounts as minted claim quantities. Keep the actual economic allocation ratio in any rail. Missing-event assets display a concrete reason and disabled action. A clear “Start demo split” action uses the SDK's seller account and shows the actual resulting demo position.

**Positions:** two-account rehearsal of deposit/split, DR sale for test USDC, replay of the dividend event, then separate redemption by the current owner of each claim. Show a clear next action at each stage. The buyer pays and receives DR; seller retains PT and receives sale proceeds. Use an editable total offer with defaults of 30 test USDC for KOx and 5 for Backpack MU, explicitly labeled example offers. Permit selling a fraction by percentage or exact claim balance using integer arithmetic and Max. Quotes require a visible review/accept step and rejection option. Separate price paid from projected dividend-token allocation. Replay event closes deposits and then settles the pinned fixture, with original event time visible and replay status clear. Show stock and dividend claims as usable separately, not an app integration badge.

Offer fractional redemption and Max where supported. Both wallets' cash and asset changes must be inspectable, so a reviewer can follow the sale and confirm final payouts. Demo receipts are labeled local records without fake transaction links. Include reset and collapsed demo tools for stale data, paused collateral, rejected event and empty-offer cases. Keep these tools out of the ordinary primary flow. Do not allow zero-payout burns from the UI.

## Visual direction

Read `design/design-system.md`, `design/illustrations/illustration-guide.md` and `agent-brief.md`. Reuse `packages/design-tokens/tokens.css`. Warm canvas, fine dividers, large readable headings, tabular amounts, blue stock / amber dividends, calm editorial layout. Avoid nested cards and dashboard grids. Use the approved stock/coupon illustration once on Split and both-sides artwork in the empty position or contextual composition, at sizes where readable. Use adjacent HTML labels and informative alt text. Preserve image aspect ratios and reduced motion.

## Build and proof

Own only root web scaffolding, root package.json/lockfile, apps/web/** and frontend-specific QA artifacts. SDK and fixtures have separate workers. Use the public contract in sdk-interface.md. Do not implement a duplicate allocation or ledger inside React. Verify actual installed package versions, keep dependencies lean, and pin a lockfile. Do not change the existing localhost:4173 server. Use a new preview port, e.g. 4174.

Provide root scripts for dev, build, typecheck, SDK tests and browser smoke. Tests must cover the real interaction, not only screenshots: catalog/filter, default KOx allocation, pending Ondo, Backpack event factor, full split/sale/settlement/two-owner redemption, fractional sale, rejected quote unchanged balances, stale/paused/rejected states, keyboard access, and no horizontal overflow at 1440/390. Inspect screenshots of Market, Split and Positions at desktop/mobile. Check broken images, console errors and links. Use local Chrome/Playwright if available; install task-local tooling if needed. Return a working preview and a concise README that explains exactly what is simulated and what is sourced.

Next phase replaces this local client with tested program execution and real test-network receipts. It does not change the normal product's wording into a technical inspector.
