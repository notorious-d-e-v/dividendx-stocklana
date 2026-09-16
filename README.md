# DividendX

DividendX is a product prototype for separating a tokenized-stock position into two claims: principal tokens (PT) for the stock exposure and dividend-right tokens (DR) for the dividend allocation. Matching PT and DR can be recombined before settlement; after a simulated payout, each claim can be redeemed independently.

The repository currently contains a local React preview and an exact bigint accounting SDK. It does **not** connect a wallet, request signatures, custody tokens, call a live issuer API, or submit onchain transactions.

## Current demo

- `/` is the main Market / Split / Redeem product preview.
- `/rehearsal/` preserves the detailed two-account sale, rejection, settlement, and redemption walkthrough.
- The catalog contains 15 observed Solana stock-token candidates across xStocks, Backpack/Trek, and Ondo.
- Two source-backed historical event fixtures are runnable: Coca-Cola KOx and Backpack Micron MU.
- Ondo token profiles are present, but an authoritative dividend event fixture is still pending.
- Balances, offers, receipts, settlement controls, and test USDC are in memory and reset on refresh.

Source links, snapshot dates, event factors, and evidence digests appear in the app inspector. Catalog presence is not a claim of live support, current availability, or deposit eligibility.

## Run locally

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4174](http://127.0.0.1:4174). Install Playwright's Chromium once before running browser tests:

```sh
npx playwright install chromium
npm test
npm run typecheck
npm run build
npm run test:browser
```

Browser tests use Playwright's bundled Chromium by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to test a specific Chromium-compatible executable. On macOS, the test configuration also detects the standard Google Chrome installation.

The [GitHub Actions template](docs/ci-workflow.yml) is included but inactive: the publishing login needs GitHub's `workflow` scope before it can install workflows. See [CI setup](docs/ci-setup.md).

## Repository map

| Path | Purpose |
| --- | --- |
| [`apps/web/`](apps/web/) | Product preview, preserved rehearsal, and 15 browser tests |
| [`packages/sdk/`](packages/sdk/) | Integer accounting and lifecycle model |
| [`packages/demo-fixtures/`](packages/demo-fixtures/) | Frozen catalog and historical event fixtures |
| [`planning/evidence/`](planning/evidence/) | Dated source snapshots and verification records |
| [`design/`](design/) | Approved visual system and illustrations |
| [`presentation/`](presentation/) | Pitch artifacts, source material, and preserved narration |

Use the [artifact map](docs/artifact-map.md) to find the main outputs and the [current status](planning/status.md) for a concise completion record. The [current plan](planning/plan.md) records scope and direction. Implementation boundaries live in the [phase work orders](planning/phase-work-orders.md); the current product behavior is specified in [product-app-v1](spec/product-app-v1.md), while [series accounting](spec/series-accounting.md) and the [SDK interface](spec/sdk-interface.md) define the next program-facing contract. See the [QA record](apps/web/qa/README.md) for verified flows and limitations.

The checked-in presentation outputs are review artifacts. Rebuilding the decks requires the external Codex artifact runtime used to produce them; the app, SDK, fixtures, and browser suite run from a fresh clone with the setup above.

## Next phase

The next implementation phase is the actual Solana program: vault custody, transferable PT/DR tokens, wallet-backed transactions, event trust and finality rules, recovery policy, and a verified external liquidity path. Until those pieces exist and pass their own evidence checks, this repository remains a source-backed interactive preview rather than a live protocol.
