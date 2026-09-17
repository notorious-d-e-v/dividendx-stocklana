# Current status

Updated 17 September 2026 after the guided two-wallet Raydium demo was accepted. Deposits still close at year-start.

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
| AMM integration | Isolated [Node CLI](../packages/amm-integration/README.md) with a 15-transaction finalized public devnet Raydium CPMM round trip and a separate 14-transaction captured-bytecode local proof; [acceptance](amm-review.md) |
| Guided demos | `/demos/`: nine actions, two disposable wallets and 37 real local transactions through Raydium and annual redemption; [acceptance](guided-demo-review.md) |
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

The guided slice adds **four runtime tests**, **five browser tests**, a complete **nine-action / 37-transaction browser journey**, and an independent RPC verifier. Exact deployed bytecode, all signatures, four journal records, claim supplies and final custody conservation pass. The remaining 643 DR raw in Raydium retain 25 raw collateral in the vault. Root tests, type checking and the production build pass; see [guided acceptance](guided-demo-review.md).

## Next: review, qualified issuer evidence and submission

1. **Review the completed guided page.** `/demos/` is ready at port 4174 under [guided demos v1](../spec/guided-demos-v1.md). The user can repeat the two-wallet flow with test assets and an accelerated synthetic year. PT trading is the next compact demo candidate; borrowing needs venue, price and liquidation qualification before implementation.
2. **Complete issuer qualification.** Observation readers now work across the selected package. Authoritative ex-date joins, classified event/factor binding, correction/finality rules, full annual coverage and live custody admission still need evidence. Keep these gaps visible; the readers do not produce settlement attestations.
3. **Refresh the submission package.** Capture the working wallet and public test-only AMM proof, synchronize copy with user review, and verify the actual submission form/deadline. Do not revise the approved slides or narration in this documentation sync.

No redesign, wider issuer audit, custom AMM, bridge or reward token is required for this next phase.

The [roadmap](roadmap.md) records early next-year listings, rolling DR vaults, demand-led quarterly terms and perpetual-product research. None changes the annual settlement primitive or adds scope to the current program.

## Dependencies and operating notes

Every live issuer needs authoritative ex-date joins, complete annual history, revision/finality rules and qualified ordinary vault custody. Ondo read-only API access is now [verified](research/ondo-api-access-2026-09-17.md); its historical classified event/factor joins and annual coverage/finality still need evidence. Backpack needs a durable ledger beyond the MU reconstruction. [Data requests](issuer-data-requests.md) distinguish those gaps from already public discovery. These dependencies do not block controlled program tests.

Astra owns decisions and acceptance; Sol receives bounded work under [AGENTS.md](../AGENTS.md) and the [work orders](phase-work-orders.md). Verification supersedes plans through the [decision log](decision-log.md). Keep credentials outside the repository and browser bundle. The completed public work used dedicated devnet SOL and worthless test assets; real assets, mainnet deployment, outreach and submission remain unauthorized.

The GitHub OAuth login lacks `workflow` scope, so [CI remains an inactive template](../docs/ci-setup.md); no remote CI run is claimed. The [artifact map](../docs/artifact-map.md) identifies preserved history and current entry points.
