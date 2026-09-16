# Repository operating rules

- Astra owns architecture, product decisions, factual review, and final acceptance.
- When the `astra-sol-delegation` skill is available, use it for bounded implementation in GPT-5.6 Sol with fresh context, explicit effort, disjoint file ownership, and no recursive delegation.
- Verify claims against current evidence and working code. Plans describe intent; they do not prove implementation.
- Never present a fixture, local receipt, simulated balance, or UI state as a live issuer, wallet, market, or onchain integration.
- Preserve user edits, approved design, artwork, narration, evidence, and the `/rehearsal/` route unless the assigned work explicitly changes them.
- Use credentials only for an authorized integration; never print them, copy them into source, or expose their contents through fixtures, frontend bundles, screenshots, logs, or tests.
- Start with [`docs/artifact-map.md`](docs/artifact-map.md), [`planning/status.md`](planning/status.md), [`planning/plan.md`](planning/plan.md), and [`planning/phase-work-orders.md`](planning/phase-work-orders.md). New work follows [`spec/annual-series-accounting.md`](spec/annual-series-accounting.md), [`spec/annual-series-sdk.md`](spec/annual-series-sdk.md), [`spec/annual-series-tests.md`](spec/annual-series-tests.md) and [`spec/annual-product.md`](spec/annual-product.md). The older accounting/SDK contracts belong to the preserved single-event rehearsal. Use [`apps/web/qa/README.md`](apps/web/qa/README.md) for verification.
- Current boundary: the local product and rehearsal are complete review artifacts; wallet integration, vault/program execution, live issuer readers, and external liquidity remain future phases. Do not start a later phase automatically.
- For ordinary code changes run `npm test`, `npm run typecheck`, and `npm run build`. Run `npm run test:browser` when UI behavior, routing, browser configuration, or fixtures can affect end-to-end flows. Documentation-only changes need link and content checks rather than the code suite.
- User authorization controls the work. These repository rules guide execution within that authorized scope and do not expand or revoke it.
- Keep changes narrow, preserve unrelated work, and report exact checks and remaining limitations.
