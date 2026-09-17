# DividendX

DividendX separates a tokenized-stock position into annual claims: principal tokens (PT) for the remaining stock exposure and dividend-right tokens (DR) for the year's qualified dividend allocation. For example, `PT-KOx-2027` and `DR-KOx-2027` belong to the Coca-Cola KOx 2027 series. Deposits close when the year starts. Matching PT and DR can recombine before finalization; afterward each side redeems independently, without an expiry or forfeiture deadline.

The repository contains the annual Solana program, transaction SDK, wallet application, compiled-program tests and preserved accounting previews. `/app/` executes real signed transactions in a disposable local SBF sandbox. Live issuer feeds, public deployment and AMM liquidity remain later work.

## Current demo

- `/app/` is the wallet application: request test collateral, split into PT/DR, transfer either claim, recombine pairs, and redeem independently after annual finalization. It needs the local runtime below.
- `/` is the annual Market / Split / Redeem preview, with separate 2027 and 2028 series, cumulative allocation and distinct year-end/finalization states.
- `/rehearsal/` preserves the original single-event two-account walkthrough.
- The catalog contains 15 observed Solana stock-token candidates across xStocks, Backpack/Trek, and Ondo.
- Coca-Cola KOx and Backpack Micron MU supply historical dividend factors. The annual preview maps them to **synthetic term dates**: neither fixture includes a verified ex-date. One example is not a complete annual payout or a future forecast.
- Ondo token profiles are present, but an authoritative dividend event fixture is still pending.
- In the two previews, balances, offers, lifecycle controls and test USDC are simulated and reset on refresh. An optional second dividend is explicitly synthetic.

The wallet app uses locally created 6-, 8- and 9-decimal test tokens, representing the shared accounting profile researched for Backpack/Trek, xStocks and Ondo. These are not issuer assets or complete replicas of their permissions. Its four quarterly dividends are synthetic. Wallet balances come from RPC; restarting the runtime resets the test network. A temporary wallet stays only in browser memory and is lost on reload.

Source links, snapshot dates, event factors, and evidence digests appear in the app inspector. Catalog presence is not a claim of live support, current availability, or deposit eligibility.

## Run locally

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm --prefix packages/transaction-sdk ci
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

## Run the wallet application

Build the program once with the toolchain below, then start the runtime in another terminal:

```sh
npm run build:transactions
npm --prefix packages/local-runtime ci
npm --prefix packages/local-runtime start
```

Wait for the runtime's ready message, then open [the wallet app](http://127.0.0.1:4174/app/). Create a temporary test wallet and request test SOL/stock. Split before using the collapsed **Network-wide test dates** controls. The clock is shared, so deposit into every desired asset before starting the year. Record four test dividends for the selected asset, end the year, then finalize that asset. Maturity alone does not enable independent redemption.

All keys and tokens are disposable. The server uses pinned Surfpool 1.5.0 offline; its native runtime was verified on macOS arm64. Wallet Standard signing is implemented, but installed browser extensions have not been verified. See [runtime setup](packages/local-runtime/README.md), [wallet contract](spec/wallet-integration-v1.md) and [acceptance evidence](planning/wallet-review.md).

On a fresh runtime, `node scripts/protocol/wallet-runtime-smoke.mjs` checks all three assets. Restart it before `node apps/web/qa/wallet-app-review.mjs`, which exercises the actual app with two browser wallets. Both checks consume the annual test lifecycle; restart again for a fresh demonstration.

## Program and transaction SDK

Use the pinned Rust/Agave setup in [program toolchain](docs/program-toolchain.md), then run:

```sh
npm --prefix packages/transaction-sdk ci
npm run build:program
npm run build:idl
npm --prefix packages/transaction-sdk run vectors
npm run test:transactions
npm run test:program
npm --prefix packages/transaction-sdk run smoke:local
```

The SBF suite advances a controlled test clock to cover the annual lifecycle. The signed SDK smoke starts an isolated local validator with disposable keys and test collateral, then removes its ledger. Neither changes the deployed program's clock rules. See [acceptance review](planning/program-review.md), [program contract](spec/program-v1.md) and [transaction SDK](packages/transaction-sdk/README.md).

## Repository map

| Path | Purpose |
| --- | --- |
| [`apps/web/`](apps/web/) | Wallet app, annual preview, preserved rehearsal and browser tests |
| [`packages/sdk/`](packages/sdk/) | Annual reference model and preserved legacy SDK |
| [`programs/dividendx/`](programs/dividendx/) | Annual custody program and generated Anchor IDL |
| [`packages/transaction-sdk/`](packages/transaction-sdk/) | Instruction builders, coherent account reads, quotes and signing helpers |
| [`packages/local-runtime/`](packages/local-runtime/) | Disposable offline SBF network, test faucet and controlled annual lifecycle |
| [`tests/protocol/`](tests/protocol/) | Independent arithmetic oracle and compiled-SBF conformance |
| [`packages/demo-fixtures/`](packages/demo-fixtures/) | Frozen catalog and historical event fixtures |
| [`planning/evidence/`](planning/evidence/) | Dated source snapshots and verification records |
| [`design/`](design/) | Approved visual system and illustrations |
| [`presentation/`](presentation/) | Pitch artifacts, source material, and preserved narration |

Use the [artifact map](docs/artifact-map.md), [current status](planning/status.md) and [plan](planning/plan.md) for the handoff. New work follows [annual accounting](spec/annual-series-accounting.md), the [annual SDK contract](spec/annual-series-sdk.md), [acceptance matrix](spec/annual-series-tests.md) and [annual product specification](spec/annual-product.md). The [work orders](planning/phase-work-orders.md) assign implementation boundaries; the [QA record](apps/web/qa/README.md) records preview checks. Older single-event specifications apply only to the preserved rehearsal.

The checked-in presentation outputs are review artifacts. Rebuilding the decks requires the external Codex artifact runtime used to produce them; the app, SDK, fixtures, and browser suite run from a fresh clone with the setup above.

## Next phase

The [annual research](planning/research/annual-dividend-series.md) extends the [prior-art review](planning/research/prior-art-review.md). Calendar-year periods are our choice; traditional exchange dividend contracts do not all use those exact dates. Membership uses the reference share's official ex-date, including late-paid dividends; maturity stops new eligible dates, while finalization waits for a complete resolved journal. The model replaces corrected events and compounds accepted factors before rounding once. It does not sum separately rounded event payouts.

Next are operational issuer evidence and one verified AMM round trip. The program uses bounded exact multiplier-bit arithmetic and staged settlement; its attestor still supplies trusted event classification and complete-period coverage. Local fixtures do not prove live issuer finality. Rolling vaults, quarterly terms and perpetual-product research remain on the [roadmap](planning/roadmap.md).
