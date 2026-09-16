# DividendX

DividendX separates a tokenized-stock position into annual claims: principal tokens (PT) for the remaining stock exposure and dividend-right tokens (DR) for the year's qualified dividend allocation. For example, `PT-KOx-2027` and `DR-KOx-2027` belong to the Coca-Cola KOx 2027 series. Deposits close when the year starts. Matching PT and DR can recombine before finalization; afterward each side redeems independently, without an expiry or forfeiture deadline.

The repository currently contains a local React preview, an exact bigint annual accounting reference and the preserved single-event rehearsal SDK. No Solana program, wallet integration, actual PT/DR mints, live issuer reader or AMM pool exists yet.

## Current demo

- `/` is the annual Market / Split / Redeem preview, with separate 2027 and 2028 series, cumulative allocation and distinct year-end/finalization states.
- `/rehearsal/` preserves the original single-event two-account walkthrough.
- The catalog contains 15 observed Solana stock-token candidates across xStocks, Backpack/Trek, and Ondo.
- Coca-Cola KOx and Backpack Micron MU supply historical dividend factors. The annual preview maps them to **synthetic term dates**: neither fixture includes a verified ex-date. One example is not a complete annual payout or a future forecast.
- Ondo token profiles are present, but an authoritative dividend event fixture is still pending.
- Balances, offers, lifecycle controls and test USDC are in memory and reset on refresh. An optional second dividend is explicitly synthetic.

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
| [`apps/web/`](apps/web/) | Annual product preview, preserved rehearsal and browser tests |
| [`packages/sdk/`](packages/sdk/) | Annual reference model and preserved legacy SDK |
| [`packages/demo-fixtures/`](packages/demo-fixtures/) | Frozen catalog and historical event fixtures |
| [`planning/evidence/`](planning/evidence/) | Dated source snapshots and verification records |
| [`design/`](design/) | Approved visual system and illustrations |
| [`presentation/`](presentation/) | Pitch artifacts, source material, and preserved narration |

Use the [artifact map](docs/artifact-map.md), [current status](planning/status.md) and [plan](planning/plan.md) for the handoff. New work follows [annual accounting](spec/annual-series-accounting.md), the [annual SDK contract](spec/annual-series-sdk.md), [acceptance matrix](spec/annual-series-tests.md) and [annual product specification](spec/annual-product.md). The [work orders](planning/phase-work-orders.md) assign implementation boundaries; the [QA record](apps/web/qa/README.md) records preview checks. Older single-event specifications apply only to the preserved rehearsal.

The checked-in presentation outputs are review artifacts. Rebuilding the decks requires the external Codex artifact runtime used to produce them; the app, SDK, fixtures, and browser suite run from a fresh clone with the setup above.

## Next phase

The [annual research](planning/research/annual-dividend-series.md) extends the [prior-art review](planning/research/prior-art-review.md). Calendar-year periods are our choice; traditional exchange dividend contracts do not all use those exact dates. Membership uses the reference share's official ex-date, including late-paid dividends; maturity stops new eligible dates, while finalization waits for a complete resolved journal. The model replaces corrected events and compounds accepted factors before rounding once. It does not sum separately rounded event payouts.

Next is the Solana program and transaction SDK, followed by wallets and one verified AMM round trip. Program work must resolve bounded arithmetic/Token-2022 factor conformance, account and authority design, complete event evidence and finalization/dispute policy. The local reference's caller-supplied finality flags are test inputs, not issuer attestations. Quarterly series remain future work.
