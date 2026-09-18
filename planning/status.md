# Current status

Updated 18 September 2026 after captured-mint custody acceptance and the user's public-hosting decision. Next: a real-calendar devnet app plus an online accelerated sandbox. Live issuer settlement remains incomplete; deposits still close at year-start.

Public backup: [notorious-d-e-v/dividendx-stocklana](https://github.com/notorious-d-e-v/dividendx-stocklana).

## Current artifacts

| Area | Result |
| --- | --- |
| Brand | Approved design system, illustration guide and both-sides composability artwork, preserved |
| Pitch | Approved [illustrated v2](../presentation/output/DividendX-illustrated-v2.pptx) and [user narration](../presentation/narration.md), preserved; annual wording recorded for the next versioned export |
| Annual contract | [Accounting](../spec/annual-series-accounting.md), [SDK](../spec/annual-series-sdk.md), [acceptance matrix](../spec/annual-series-tests.md) and [product copy](../spec/annual-product.md) |
| Reference | Exact bigint [annual model](../packages/sdk/src/annual-reference.ts): multiple events, revisions/cancellations, cumulative rounding, paired exits and independent final redemption |
| Program | [Anchor program](../programs/dividendx/README.md) with Token-2022 custody, ordinary SPL PT/DR mints, immutable event revisions, staged exact settlement and independent redemption; the accepted ELF is deployed unchanged on devnet at `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE` |
| Transaction SDK | [Separate package](../packages/transaction-sdk/README.md) with generated-IDL builders, coherent reads, raw-unit quotes and caller-supplied signing |
| Program contract | [Frozen implementation contract](../spec/program-v1.md), [toolchain](../docs/program-toolchain.md) and [acceptance review](program-review.md) |
| Product | Annual Market / Split / Redeem at `/`, with isolated 2027/2028 series and distinct collecting, year-ended and finalized states |
| Wallet app | `/app/`: actual local wallet signing, custody, PT/DR transfers, recombination and independent redemption; [acceptance](wallet-review.md) |
| Test runtime | Offline Surfpool with three decimal profiles, real compiled program, scoped faucet and four synthetic dividend records per annual series |
| Issuer readers | Typed observations across the selected 15 identities, exact source records, private snapshots and explicit data gaps; [acceptance](issuer-reader-review.md) |
| Issuer qualification | Offline unsigned dossiers check identities, revisions, candidate dates and current mint evidence; every dossier retains unresolved settlement gates; [acceptance](issuer-qualification-review.md) |
| Captured mint custody | Unchanged compiled program passes all 15 actual mint configurations locally with synthetic funding/events; [acceptance](issuer-custody-review.md) |
| AMM integration | Isolated [Node CLI](../packages/amm-integration/README.md) with a 15-transaction finalized public devnet Raydium CPMM round trip and a separate 14-transaction captured-bytecode local proof; [acceptance](amm-review.md) |
| Guided demos | `/demos/`: Test USDC v2, nine actions, two disposable wallets and 36 local transactions through Raydium and annual redemption; [acceptance](usdc-demo-review.md) |
| Fallback | Original single-event SDK and technical rehearsal at `/rehearsal/`, preserved |
| Evidence | 15 candidate mints across xStocks, Backpack/Trek and Ondo; historical KOx and Backpack MU factors |
| Research | [Annual conventions and fixture gaps](research/annual-dividend-series.md), extending the [prior-art review](research/prior-art-review.md) |

The two previews remain simulated. The separate `/app/` wallet application executes actual custody, PT/DR minting, transfers and redemption through the compiled SBF program on an offline local network. The temporary wallet signs in browser memory; installed extension wallets have not been verified. Public devnet now has the exact accepted DividendX ELF and the test-only Raydium pool `2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm`, and that public flow remains an isolated CLI proof. The separate `/demos/` page now executes liquidity, purchase, withdrawal and independent redemption on its own offline chain through port 4181. Core Split/Redeem and the running wallet runtime on port 4180 are preserved. Controlled journal inputs and every AMM asset are synthetic; issuer observations do not produce settlement attestations.

## Annual decisions

- Separate issuer/mint/year backing and claim names, such as `PT-KOx-2027` and `DR-KOx-2027`.
- Deposits close at January 1, 00:00 UTC. Official reference-market ex-dates determine which qualified dividends belong to the year.
- The annual allocation compounds isolated dividend ratios and rounds once; corrections replace earlier revisions. Unsupported/unresolved actions block unsafe finalization.
- Year-end stops eligible-event membership. Finalization waits for complete resolved records, including late-paid in-year dividends.
- DR transfers carry the whole accumulated entitlement. Matching PT/DR can recombine before finalization; each side redeems independently afterward without forfeiture.
- External burns and donations do not increase other holders' rights. Zero-output closure needs explicit consent. Quarterly terms remain later.

The preview clearly labels historical factors with synthetic term dates. Neither KOx nor MU currently has a verified ex-date in its fixture, and one event is not a complete annual payout or a future forecast.

## Verification

The program build, generated IDL, **46 Rust tests** (including 16 compiled-SBF integration tests), **22 transaction-SDK tests** and package import passed. Signed local-validator transactions proved deposit, recombination and rollback of prior successful token CPIs after a later instruction failed. Exact artifacts and proof boundaries are in the [acceptance review](program-review.md).

Current wallet acceptance adds **104 confirmed/finalized receipts** across three decimal profiles and a separate two-wallet browser flow with **33 displayed confirmed receipts**, exact custody conservation and four-event finalization. Sustained/idle RPC reads, explicit zero-output consent, stale-state recovery and disposable-key reload behavior pass. Program/IDL hashes are unchanged.

The fixture verifier and all **33 reference/legacy SDK tests**, **22 transaction-SDK tests**, **27 browser-runner tests**, type checking and the production build pass. Desktop/mobile wallet captures and the exact proof boundaries are in [wallet acceptance](wallet-review.md) and [web QA](../apps/web/qa/README.md).

The server-only reader slice adds **22 reader tests** and **16 reviewed Ondo transport tests** to the root checks. Live reads matched all 15 selected identities and retained 23 xStocks corporate-action records plus 34 Ondo multiplier observations. A bounded Backpack size-limit issue was corrected and retested. Root type/build checks pass; the running demo was not restarted. See [reader acceptance](issuer-reader-review.md).

The AMM package adds **11 tests** plus self-import and package checks. The existing root **71 tests**, type check and production build pass without changing the running web app. Its public receipt records **15 finalized devnet transactions** from slots 499760641–499761026, independently rechecked at finalized slot 499762083. The flow deposited 100 synthetic test-stock units, seeded 40 DR / 80 quote, added 60 DR / 120 quote, spent 20 quote for `907024323` DR raw (`9.07024323`), withdrew all user LP, and recombined `9092975034` raw paired claims (`90.92975034`). Provider LP and LP mint supply are zero; Raydium retains 100 internal LP and 643 DR raw. Final PT supply, DR supply and vault backing each equal `907024966` raw (`9.07024966`). See [AMM acceptance](amm-review.md) and the [public receipt](evidence/amm-devnet-roundtrip-2026-09-17.json).

The current guided slice uses an exact local copy of Circle devnet USDC, with explicit synthetic 10 + 1 USDC balances and 4/6/1 trading amounts. **Five runtime tests**, **34 browser tests**, a **nine-action / 36-transaction browser journey**, independent local RPC verification, root tests and build/type checks pass. Residual 2,876 DR raw retain 111 raw collateral. A separate faucet-funded public run has **14 independently finalized transactions** using the real official devnet USDC mint, with 11 USDC funded and 9 left in the original test wallet. The expanded AMM suite passes **15 tests**. See [Test USDC acceptance](usdc-demo-review.md); older generic-quote evidence remains preserved.

The future-demo update adds eight noninteractive roadmap rows and preserves that journey. A fresh issuer qualification pass records explicit Microsoft ex-dates, three candidate MSFTx joins and a matching current onchain factor; [the report](research/issuer-settlement-qualification-2026-09-17.md) keeps historical evidence, finality, annual coverage and custody gates explicit. Root tests/build/type checks pass; all 34 browser cases pass across the main run and one isolated browser-startup retry. The AMM suite now passes 16 tests after correcting the local-mode mainnet exclusion hash and adding an offline rejection regression. See [QA](../apps/web/qa/README.md).

The offline qualification slice adds **14 tests**, bringing the issuer package to **36** and the current root suite to **85**. Fixture verification, type checking and an isolated production build pass. Independent review of fresh MSFTx/MU.US/KOon observations verified candidate-date handling, August current-mint corroboration, private archives and continued blocking after maturity. No browser, program or transaction-SDK source changed. The running preview and runtimes remain untouched; see [qualification acceptance](issuer-qualification-review.md).

The captured-mint conformance slice passes **all 15 local journeys**, with identical SDK/Rust fingerprints and exact custody conservation. Current checks are **95 root tests**, **47 Rust tests**, type checking and an isolated build. Captured mint supply/authority/scale bytes are unchanged; holder funding and annual records remain synthetic. See [custody acceptance](issuer-custody-review.md).

## Next: public devnet and hosted sandbox

The user chose **real-calendar public devnet plus an online accelerated sandbox**, with no shortened devnet term or time override. The [hosting plan](hosting-plan.md) recommends trying Vercel website + Vercel Sandbox first, with Cloudflare Containers as fallback. This recommendation has not yet been proved by a Linux deployment.

1. **Prove the hosted runtime.** Package the pinned program/SDK/captures for Node 24 on x86_64 glibc Linux. Measure startup and memory, then verify the full guided flow. Each visitor needs a separate disposable network; current singleton runtimes cannot simply be exposed publicly.
2. **Connect the wallet app to public devnet.** Add network configuration, tested extension-wallet signing, persistent test manifests, bounded faucet funding and the existing Raydium flow. Use clearly labeled test collateral. A 2027 series closes deposits on 1 January 2027 and matures on 1 January 2028; public flows currently end with paired recombination.
3. **Host the accelerated experience.** Preserve core Split/Redeem and separate guided demos. Add isolated sessions, controlled RPC, progress, expiry/reset and honest network labels. Visitors can advance their own synthetic year and redeem both sides without affecting anyone else.
4. **Publish and verify.** Check desktop/mobile, clean-browser wallet flows, public receipts, sandbox redemption and failure recovery; address the existing CI scope blocker. The user plans issuer outreach after a usable live site exists.
5. **Continue qualified settlement and submission work.** Resolve the [remaining source semantics](research/issuer-public-policy-check-2026-09-18.md), then specify an automated attestor under a reviewed policy. The [unsigned review tool](issuer-qualification-review.md) stays blocked; year-end alone never authorizes finalization. Refresh versioned submission materials around actual functionality and verify the submission form/deadline.

No redesign, wider issuer audit, custom AMM, bridge or reward token is required for this next phase.

The completed Raydium Test USDC journey stays available at `/demos/`. Its future section lists Streamflow sales, Jupiter Lock vesting/locks, Squads treasuries, Meteora limit orders, Jupiter recurring purchases, combined transactions, borrowing and lower-priority PT trading. All are noninteractive roadmap items; no additional venue integration is implemented. The [roadmap](roadmap.md) also retains early next-year listings, rolling DR vaults, demand-led quarterly terms and perpetual-product research.

## Dependencies and operating notes

Every live issuer needs authoritative ex-date joins, complete annual history, revision/finality rules and qualified ordinary vault custody. Ondo read-only API access is now [verified](research/ondo-api-access-2026-09-17.md); its historical classified event/factor joins and annual coverage/finality still need evidence. Backpack needs a durable ledger beyond the MU reconstruction. [Data requests](issuer-data-requests.md) distinguish those gaps from already public discovery. These dependencies do not block controlled program tests.

Astra owns decisions and acceptance; Sol receives bounded work under [AGENTS.md](../AGENTS.md) and the [work orders](phase-work-orders.md). Verification supersedes plans through the [decision log](decision-log.md). Keep credentials outside the repository and browser bundle. The completed public work used dedicated devnet SOL and worthless test assets; real assets, mainnet deployment, outreach and submission remain unauthorized.

The GitHub OAuth login lacks `workflow` scope, so [CI remains an inactive template](../docs/ci-setup.md); no remote CI run is claimed. The [artifact map](../docs/artifact-map.md) identifies preserved history and current entry points.
