# DividendX

DividendX separates a tokenized-stock position into annual claims: principal tokens (PT) for the remaining stock exposure and dividend-right tokens (DR) for the year's qualified dividend allocation. For example, `PT-KOx-2027` and `DR-KOx-2027` belong to the Coca-Cola KOx 2027 series. Deposits close when the year starts. Matching PT and DR can recombine before finalization; afterward each side redeems independently, without an expiry or forfeiture deadline.

The repository contains the annual Solana program, transaction SDK, wallet application, compiled-program tests, issuer readers, an isolated Raydium integration and preserved accounting previews. `/app/` executes real signed transactions in a disposable local SBF sandbox. The same accepted program ELF is deployed on devnet, where the separate Node CLI completed a finalized test-only Raydium CPMM round trip. That public flow is not exposed in the running web app and does not enable live issuer settlement.

## Current demo

- `/app/` is the wallet application: request test collateral, split into PT/DR, transfer either claim, recombine pairs, and redeem independently after annual finalization. It needs the local runtime below.
- `/` is the annual Market / Split / Redeem preview, with separate 2027 and 2028 series, cumulative allocation and distinct year-end/finalization states.
- `/rehearsal/` preserves the original single-event two-account walkthrough.
- The catalog contains 15 observed Solana stock-token candidates across xStocks, Backpack/Trek, and Ondo.
- The isolated AMM CLI deposited 100 units of synthetic test stock into a 2027 series, created a DR/worthless-test-quote Raydium CPMM pool, added liquidity, swapped, withdrew every user-held LP token and recombined the recovered claims on public devnet. All assets are test-only and the seeded ratio is artificial.
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

Keep the runtime terminal open while testing. If the app cannot connect, check that this service is still running; from the project root, `npm --prefix packages/local-runtime start` starts it. **Retry localhost runtime** checks the connection again after the ready message; it cannot launch the service. Restarting the runtime creates an empty test network.

All keys and tokens are disposable. The server uses pinned Surfpool 1.5.0 offline; its native runtime was verified on macOS arm64. Wallet Standard signing is implemented, but installed browser extensions have not been verified. See [runtime setup](packages/local-runtime/README.md), [wallet contract](spec/wallet-integration-v1.md) and [acceptance evidence](planning/wallet-review.md).

On a fresh runtime, `node scripts/protocol/wallet-runtime-smoke.mjs` checks all three assets. Restart it before `node apps/web/qa/wallet-app-review.mjs`, which exercises the actual app with two browser wallets. Both checks consume the annual test lifecycle; restart again for a fresh demonstration.

## Read issuer observations

The server-side [issuer readers](packages/issuer-readers/README.md) collect the selected xStocks, Backpack/Trek and Ondo identities and available source records:

```sh
npm run read:issuers -- --year 2026
npm run test:issuers
```

Ondo uses the external `ONDO_API_KEY` credential file described in the reader README. The command prints a summary of identity checks, counts and missing evidence; credentials and authenticated response bodies stay outside Git and the browser. These observations do not authorize annual settlement. The package does not change the running app or test network.

## Run the Raydium integration

The isolated [AMM package](packages/amm-integration/README.md) pins Raydium SDK v2, validates the exact devnet program/config/fee receiver and DividendX ELF, simulates every transaction, and records raw-unit conservation. Install its additional dependencies only when running this integration:

```sh
npm ci --prefix packages/amm-integration
npm run test:amm
npm run amm:preflight -- --manifest /absolute/path/to/manifest.json
npm run amm:local -- --manifest /absolute/path/to/manifest.json --admin-signer /absolute/path/to/admin.json --state-dir /absolute/path/to/repo/.local-tools/amm-local-run --receipt /absolute/path/to/repo/.local-tools/amm-local-run/receipt.json
npm run amm:devnet -- --manifest /absolute/path/to/manifest.json --admin-signer /absolute/path/to/admin.json --state-dir /absolute/path/to/repo/.local-tools/amm-devnet-run --receipt /absolute/path/to/repo/.local-tools/amm-devnet-run/receipt.json
```

Each execution requires a fresh, distinct state directory that is a direct child of the repository's ignored `.local-tools/` directory. The public receipt contains 15 finalized devnet transactions. The earlier isolated-validator receipt contains 14 transactions against captured genuine Raydium devnet bytecode. Both use the same test quantities: 40 DR / 80 quote for the seed, 60 DR / 120 quote added, and 20 quote spent for `9.07024323` DR. See the [AMM review](planning/amm-review.md) and [public evidence](planning/evidence/amm-devnet-roundtrip-2026-09-17.json). Public chain time leaves the 2027 series open, so the flow ends with paired recombination; independent post-maturity redemption remains a separate local proof.

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
| [`packages/issuer-readers/`](packages/issuer-readers/) | Server-side observations with explicit evidence and qualification gaps |
| [`packages/amm-integration/`](packages/amm-integration/) | Isolated Raydium CPMM preflight and local/public test-only execution CLI |
| [`tests/protocol/`](tests/protocol/) | Independent arithmetic oracle and compiled-SBF conformance |
| [`packages/demo-fixtures/`](packages/demo-fixtures/) | Frozen catalog and historical event fixtures |
| [`planning/evidence/`](planning/evidence/) | Dated source snapshots and verification records |
| [`design/`](design/) | Approved visual system and illustrations |
| [`presentation/`](presentation/) | Pitch artifacts, source material, and preserved narration |

Use the [artifact map](docs/artifact-map.md), [current status](planning/status.md) and [plan](planning/plan.md) for the handoff. New work follows [annual accounting](spec/annual-series-accounting.md), the [annual SDK contract](spec/annual-series-sdk.md), [acceptance matrix](spec/annual-series-tests.md) and [annual product specification](spec/annual-product.md). The [work orders](planning/phase-work-orders.md) assign implementation boundaries; the [QA record](apps/web/qa/README.md) records preview checks. Older single-event specifications apply only to the preserved rehearsal.

The checked-in presentation outputs are review artifacts. Rebuilding the decks requires the external Codex artifact runtime used to produce them; the app, SDK, fixtures, and browser suite run from a fresh clone with the setup above.

## Next phase

Ondo read-only API access is verified. Run `node scripts/issuers/ondo-readonly.mjs` to check its registry, statuses and Coca-Cola history using `ONDO_API_KEY` from the external `/Users/node/.config/dividendx/issuer-api.env` file. The CLI prints only structural observations and digests; it never loads the key into the web app. Use `--help` for an explicit credential path, selected symbols or private raw archiving. Run its offline tests with `node --test scripts/issuers/ondo-readonly.test.mjs`. Historical event joins and annual finality remain unresolved; see [access findings](planning/research/ondo-api-access-2026-09-17.md).

The [annual research](planning/research/annual-dividend-series.md) extends the [prior-art review](planning/research/prior-art-review.md). Calendar-year periods are our choice; traditional exchange dividend contracts do not all use those exact dates. Membership uses the reference share's official ex-date, including late-paid dividends; maturity stops new eligible dates, while finalization waits for a complete resolved journal. The model replaces corrected events and compounds accepted factors before rounding once. It does not sum separately rounded event payouts.

Next are exposing the validated liquidity flow in the wallet app, completing issuer qualification, and refreshing the submission package. The public AMM proof does not turn source observations into settlement attestations: the program still needs trusted event classification, authoritative ex-dates and complete-period coverage for a live issuer. The separate guided walkthrough remains deferred. Rolling vaults, quarterly terms and perpetual-product research remain on the [roadmap](planning/roadmap.md).
