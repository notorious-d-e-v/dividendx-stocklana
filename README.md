# DivX

DivX separates a tokenized-stock position into annual claims: principal tokens (PT) for the remaining stock exposure and dividend-right tokens (DR) for the year's qualified dividend allocation. For example, `PT-KOx-2027` and `DR-KOx-2027` belong to the Coca-Cola KOx 2027 series. Deposits close when the year starts. Matching PT and DR can recombine before finalization; afterward each side redeems independently, without an expiry or forfeiture deadline.

The repository contains the annual Solana program, transaction SDK, wallet application, guided DeFi demo, compiled-program tests, issuer readers, an isolated Raydium integration and preserved accounting previews. The public test site is [dividendx.payai.network](https://dividendx.payai.network): `/app/` uses real-calendar Solana devnet, `/sandbox/` creates a private accelerated 15-minute network, and `/demos/` creates its own hosted guided session. Localhost keeps the existing disposable runtimes and defaults. The accepted DivX ELF is unchanged across these flows. None of these test flows enables live issuer settlement.

The [three-part guided tour v4](spec/guided-tour-v4.md) is live at [dividendx.payai.network/demos/](https://dividendx.payai.network/demos/) and runs locally at [localhost /demos/](http://127.0.0.1:4174/demos/) with `npm run dev` and `npm run demo:guided`. It combines stock selection and funding, then teaches split/recombine, quarterly dividend accrual, and a Raydium liquidity journey. The [v4 release review](planning/guided-tour-v4-release.md) records the release and verification.

## Current demo

- **Hackathon status:** working synthetic-devnet and accelerated-sandbox prototype; **not ready for real assets or mainnet**. Live issuer-token custody validation, complete dividend-event/finality evidence, the qualified settlement writer, independent security review and production/legal operations remain open. See the [mainnet readiness gates](planning/mainnet-readiness-2026-09-20.md) and [submission packet](planning/hackathon-wrap-up-2026-09-20.md).
- `/app/` is the wallet application: request test collateral, split into PT/DR, transfer either claim, recombine pairs, and redeem independently after annual finalization. On localhost it needs the local runtime below.
- On the public site, `/app/` uses real-calendar devnet, `/sandbox/` provides accelerated synthetic dates and balances in an isolated temporary VM, and `/demos/` runs the three-part v4 guided journey in a separate isolated VM.
- The v4 `/demos/` journey uses two disposable server-managed test wallets for 15 actions and 40 signed local transactions across two split/recombine chapters, quarterly dividend accrual, Raydium liquidity, a DR purchase, four synthetic dividend events and separate DR/PT redemption. It uses a captured Circle devnet USDC mint account with synthetic local balances and listens on port 4181.
- `/` opens Guided Demos. `/reference/` preserves the annual Market / Split / Redeem preview, with separate 2027 and 2028 series, cumulative allocation and distinct year-end/finalization states.
- `/rehearsal/` preserves the original single-event two-account walkthrough.
- The catalog contains 15 observed Solana stock-token candidates across xStocks, Backpack/Trek, and Ondo, with 15 separate synthetic profiles provisioned on devnet. This is a selected scope, not the entire tokenized-stock market or live issuer support.
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

The [GitHub Actions template](docs/ci-workflow.yml) is included but inactive. The current GitHub login has `workflow` scope; the workflow has not been activated or run. See [CI setup](docs/ci-setup.md).

## Run the wallet application

Build the program once with the toolchain below, then start the runtime in another terminal:

```sh
npm run build:transactions
npm --prefix packages/local-runtime ci
npm --prefix packages/local-runtime start
```

Wait for the runtime's ready message, then open [the wallet app](http://127.0.0.1:4174/app/). Create a temporary test wallet and request test SOL/stock. Split before using the collapsed **Network-wide test dates** controls. The clock is shared, so deposit into every desired asset before starting the year. Record four test dividends for the selected asset, end the year, then finalize that asset. Maturity alone does not enable independent redemption.

Keep the runtime terminal open while testing. If the app cannot connect, check that this service is still running; from the project root, `npm --prefix packages/local-runtime start` starts it. **Retry localhost runtime** checks the connection again after the ready message; it cannot launch the service. Restarting the runtime creates an empty test network.

All keys and tokens are disposable. The server uses pinned Surfpool 1.5.0 offline; its native runtime is verified on macOS arm64 and Linux x64, including Vercel Sandbox. Wallet Standard signing is implemented, but installed browser extensions have not been verified. See [runtime setup](packages/local-runtime/README.md), [wallet contract](spec/wallet-integration-v1.md) and [acceptance evidence](planning/wallet-review.md).

On a fresh runtime, `node scripts/protocol/wallet-runtime-smoke.mjs` checks all three assets. Restart it before `node apps/web/qa/wallet-app-review.mjs`, which exercises the actual app with two browser wallets. Both checks consume the annual test lifecycle; restart again for a fresh demonstration.

## Public devnet and hosting

The public test site is [https://dividendx.payai.network](https://dividendx.payai.network). Its existing production-browser evidence records a temporary-wallet devnet grant of exactly 10 TestKOx, a one-unit split and recombination with all three signatures independently finalized; the hosted sandbox completes four synthetic annual events and separate PT/DR redemption with 30 confirmed/finalized signatures and zero final claim supply/vault balance; the original v2 guided sandbox completed nine actions and 36 confirmed transactions using synthetic local Test USDC. Natural hard expiry stops the VM, preserves the expired session identity and returns 410 from its old manifest; operator cleanup later removes the stopped test VM. A simultaneous two-visitor run proves separate runtime/deployment/account identities, isolated clock/balances, reset replacement and stale-path 410 with no unexpected browser errors. See [hosting acceptance](planning/hosting-release-review.md) and the [v4 release review](planning/guided-tour-v4-release.md). Installed extension wallets remain unverified.

Devnet uses the real calendar and synthetic test assets; it has no clock controls. The public wrapper exposes a durable bounded faucet backed by a finite dedicated 1 SOL lifetime endowment. The local devnet runtime's operator HTTP faucet remains disabled. Hosted wallet and guided sessions use separate private 15-minute VMs, temporary identities and same-origin restricted gateways. Current limits are four active reservations, 100 starts per UTC day, six per visitor, 30 per observed IP and a 30-second creation cooldown. The synthetic observation cron runs every six hours and cannot write issuer events or finalize a series. See [hosting operations](docs/hosting-operations.md), [hosting plan](planning/hosting-plan.md) and [devnet service](packages/hosted-devnet/README.md).

## Run the guided DeFi demo

The guided runtime is separate from the wallet runtime: it listens on loopback port **4181**, while `/app/` continues to use port **4180**. Complete the dependency and accepted-ELF setup in the [guided runtime README](packages/guided-runtime/README.md), keep the web app on 4174 running, then start the guided service in another terminal:

```sh
npm run test:guided
npm run demo:guided
```

Open [the guided demo](http://127.0.0.1:4174/demos/). The service creates two disposable in-memory wallets; no extension wallet, caller address, amount, key or remote RPC is accepted. Runtime v4 loads an exact local copy of Circle's six-decimal devnet USDC mint account, `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, then creates synthetic local balances of 10 Test USDC for the provider and 1 for the buyer. These balances are not a public faucet transfer and do not establish dollar value. The flow seeds 24 DR / 4 Test USDC, adds up to 36 DR / 6 Test USDC and buys DR with 1 Test USDC.

Its accelerated local 2027 records four synthetic dividend events. The 15 actions produce 40 confirmed transactions in the controlled local journey. Raydium's locked residual DR remains backed after the Stock holder and Dividend buyer complete their separate exits. See the [v4 review](planning/guided-tour-v4-review.md) and [Test USDC specification](spec/guided-usdc-v1.md).

For a fresh isolated runtime, the package smoke runs all 15 actions. With a fresh local guided session, the v4 browser driver checks the UI, backing and all 40 RPC signatures:

```sh
npm --prefix packages/guided-runtime run smoke
node scripts/hosting/guided-tour-local-review.mjs --output /tmp/dividendx-guided-v4-review.json
```

The earlier v2 acceptance set is the [Test USDC review](planning/usdc-demo-review.md), [real-browser journey](planning/evidence/guided-usdc-browser-2026-09-17.json), [runtime receipt](planning/evidence/guided-usdc-receipt-2026-09-17.json) and [independent chain verification](planning/evidence/guided-usdc-chain-verification-2026-09-17.json). The older verifier accepts v1/v2 receipts only. The preserved [generic-quote review](planning/guided-demo-review.md), [browser journey](planning/evidence/guided-demo-browser-2026-09-17.json) and [chain verification](planning/evidence/guided-demo-chain-verification-2026-09-17.json) record the earlier 37-transaction run and remain historical evidence.

## Read issuer observations

The server-side [issuer readers](packages/issuer-readers/README.md) collect the selected xStocks, Backpack/Trek and Ondo identities and available source records:

```sh
npm run read:issuers -- --year 2026
npm run test:issuers
```

Ondo uses the external `ONDO_API_KEY` credential file described in the reader README. The command prints a summary of identity checks, counts and missing evidence; credentials and authenticated response bodies stay outside Git and the browser. These observations do not authorize annual settlement. The package does not change the running app or test network.

Review an existing private snapshot offline:

```sh
npm run review:issuers -- --year 2026 --snapshot /absolute/private/issuer-observations.json
```

The unsigned dossier checks identities, revisions, candidate dates and current mint evidence while preserving unresolved settlement gates. It never signs or emits transactions. See [qualification acceptance](planning/issuer-qualification-review.md) and the package README for supplemental evidence and private archiving.

The separate [captured-mint conformance suite](spec/issuer-custody-conformance-v1.md) tests ordinary vault custody with the exact public configurations of all 15 selected stock mints:

```sh
npm run verify:issuer-mints
npm run test:issuer-custody
```

This runs locally with synthetic holder balances, events and term timing. It preserves mint bytes and issuer controls, and does not enable live issuer settlement. See [custody acceptance](planning/issuer-custody-review.md) for the 15 passing journeys and [protocol fixtures](tests/protocol/fixtures/README.md) for snapshot provenance.

## Run the Raydium integration

The isolated [AMM package](packages/amm-integration/README.md) pins Raydium SDK v2, validates the exact devnet program/config/fee receiver and DivX ELF, simulates every transaction, and records raw-unit conservation. Install its additional dependencies only when running this integration:

```sh
npm ci --prefix packages/amm-integration
npm run test:amm
npm run amm:preflight -- --manifest /absolute/path/to/manifest.json
npm run amm:local -- --manifest /absolute/path/to/manifest.json --admin-signer /absolute/path/to/admin.json --state-dir /absolute/path/to/repo/.local-tools/amm-local-run --receipt /absolute/path/to/repo/.local-tools/amm-local-run/receipt.json
npm run amm:devnet -- --manifest /absolute/path/to/manifest.json --admin-signer /absolute/path/to/admin.json --state-dir /absolute/path/to/repo/.local-tools/amm-devnet-run --receipt /absolute/path/to/repo/.local-tools/amm-devnet-run/receipt.json
```

Each execution requires a fresh, distinct state directory that is a direct child of the repository's ignored `.local-tools/` directory. The preserved default mock-quote public receipt contains 15 finalized devnet transactions. The earlier isolated-validator receipt contains 14 transactions against captured genuine Raydium devnet bytecode. Both use the historical test quantities: 40 DR / 80 quote for the seed, 60 DR / 120 quote added, and 20 quote spent for `9.07024323` DR. See the [AMM review](planning/amm-review.md) and [public evidence](planning/evidence/amm-devnet-roundtrip-2026-09-17.json). Public chain time leaves the 2027 series open, so the flow ends with paired recombination; independent post-maturity redemption remains a separate local proof.

The separate Circle mode keeps the mock quote as the CLI default and requires the explicit `--quote circle-devnet-usdc` option shown in the [AMM package README](packages/amm-integration/README.md). Its 15 AMM tests pass, and the [public USDC receipt](planning/evidence/amm-usdc-devnet-roundtrip-2026-09-17.json) now records 14 finalized transactions, independently checked in [RPC verification](planning/evidence/amm-usdc-devnet-verification-2026-09-17.json). The run transferred 11 of the supplied 20 test USDC into the two test wallets, leaving 9 in the funding wallet. This public proof remains separate from the local annual walkthrough.

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
| [`packages/guided-runtime/`](packages/guided-runtime/) | Separate two-wallet guided runtime with captured Raydium bytecode and fixed local actions |
| [`packages/hosted-broker/`](packages/hosted-broker/) | Visitor session ledger, quota enforcement and immutable same-origin VM routing |
| [`packages/hosted-gateway/`](packages/hosted-gateway/) | Restricted per-VM wallet/guided gateway with private runtime ports |
| [`packages/hosted-devnet/`](packages/hosted-devnet/) | Durable bounded public test faucet and six-hour synthetic observation refresh |
| [`packages/issuer-readers/`](packages/issuer-readers/) | Server-side observations and offline unsigned qualification review |
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

Next are visitor testing and public-outreach readiness, an installed-wallet check, external answers from qualified issuers, and versioned submission materials. The hosted and public AMM proofs do not turn source observations into settlement attestations: the program still needs trusted event classification, authoritative ex-dates and complete-period coverage for a live issuer. Streamflow sales, Jupiter Lock, shared treasuries, orders, recurring purchases, combined flows and borrowing are noninteractive [future guided demos](planning/research/defi-demo-sequence.md). Each requires its own venue assessment before implementation. PT trading remains on the separate [roadmap](planning/roadmap.md), but its guided card was removed in v4. The offline unsigned review tool is [accepted](planning/issuer-qualification-review.md); the [source follow-up](planning/research/issuer-qualification-followup-2026-09-18.md) records remaining settlement gates. Rolling vaults, quarterly terms and perpetual-product research remain on that roadmap.
