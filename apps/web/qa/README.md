# Product and rehearsal verification

## Future guided demos — 17 September 2026

The noninteractive roadmap section now lists Streamflow sales, Jupiter Lock, Squads treasuries, Meteora limit orders, Jupiter recurring purchases, combined flows, borrowing and lower-priority PT trading. Qualified issuer data and settlement take priority over implementing those integrations. The accepted nine-action Raydium/Test USDC journey is unchanged.

Verification: fixture checks and 71 root tests, TypeScript and production build pass. The browser suite passed 33 checks initially; one test timed out while creating Chrome's context, then passed in isolation with one worker. No application assertion failed. Independent read-only Chrome inspection found eight roadmap rows, zero controls, no page errors and no horizontal overflow at 390, 768, 940, 1024 and 1440 pixels. Astra reviewed [desktop](guided-future-roadmap-1440.png) and [mobile](guided-future-roadmap-390.png) captures. Existing app/runtime processes and demonstration state were preserved.

Issuer research also exposed a typo in the local-mode mainnet exclusion hash. Corrected it in the AMM guard constants and guided verifier; the exact devnet allowlist was already correct. An offline regression rejects canonical mainnet before account reads. The AMM suite passes 16/16, including its TypeScript build, and verifier syntax checks pass. No new onchain flow was run for these changes.

## Guided DeFi demo — 17 September 2026

Actual guided page: [http://127.0.0.1:4174/demos/](http://127.0.0.1:4174/demos/). It uses a separate runtime on loopback port **4181**; the preserved `/app/` wallet runtime remains on 4180. Start the web app and `npm run demo:guided`, then prepare the two disposable server-managed test wallets. No extension wallet is required.

The Test USDC v2 journey completes nine user actions and **36 confirmed local transactions**: split 100 test stock into PT/DR, seed 40 DR / 4 Test USDC, add 60 DR / 6 Test USDC, buy DR with 1 Test USDC, withdraw all user-held LP, recombine recovered paired claims, advance an accelerated test year through four synthetic dividend events, redeem buyer DR and independently redeem provider PT. The removed transaction is the old private quote-mint creation.

The runtime executes the accepted DividendX ELF and captured genuine Raydium devnet binary/config on its own offline Surfpool. It loads an exact local copy of Circle's six-decimal devnet USDC mint account, `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, then creates synthetic local balances of 10 Test USDC for the provider and 1 for the buyer. This is not a public faucet transfer or proof of dollar value. The four dividend events are synthetic, and Raydium's locked residual DR remains backed.

The package runtime checks and 36-transaction smoke pass. The combined browser suite passes **34/34**: seven guided cases plus the preserved 27 cases. Guided coverage includes v1 runtime rejection, pinned Test USDC identity and amounts, guarded actions, stale/partial failure receipts, session reload, unavailable-runtime recovery, keyboard access and mobile overflow. Root fixture/reference checks pass 71/71 with TypeScript and the production build; the AMM package's 15 tests also pass.

Run a fresh package smoke independently, or use the real browser driver against a fresh server session and then verify the completed chain state:

```sh
npm run test:guided
npm --prefix packages/guided-runtime run smoke
npm run demo:guided
# In another terminal with Vite available on 4174 or isolated QA port 4184:
DIVIDENDX_REVIEW_URL=http://127.0.0.1:4174 node apps/web/qa/guided-demo-review.mjs
node scripts/protocol/guided-runtime-verify.mjs --output planning/evidence/guided-usdc-chain-verification-2026-09-17.json
```

The [Test USDC specification](../../../spec/guided-usdc-v1.md) and [acceptance review](../../../planning/usdc-demo-review.md) record the v2 proof boundary. The [browser record](../../../planning/evidence/guided-usdc-browser-2026-09-17.json), [runtime receipt](../../../planning/evidence/guided-usdc-receipt-2026-09-17.json) and [chain verification](../../../planning/evidence/guided-usdc-chain-verification-2026-09-17.json) preserve the browser checkpoints, captured mint metadata, synthetic funding disclosure, every confirmed signature and exact residual conservation. Review captures use `guided-usdc-*.png` names.

The verifier accepts both v1 and v2 receipts. The preserved [generic-quote review](../../../planning/guided-demo-review.md), [browser record](../../../planning/evidence/guided-demo-browser-2026-09-17.json) and [chain verification](../../../planning/evidence/guided-demo-chain-verification-2026-09-17.json) remain the historical 37-transaction proof; the AMM CLI also keeps the old mock quote as its default.

The guided proof is local and test-only. The public Circle-USDC run completed 14 finalized transactions, including checked transfers of 11 test USDC from the funded wallet; see [independent verification](../../../planning/evidence/amm-usdc-devnet-verification-2026-09-17.json). Follow the [AMM package reproduction command](../../../packages/amm-integration/README.md) with `--quote circle-devnet-usdc`; local signatures are not explorer-linked. PT trading and borrowing remain planned rows until a venue assessment covers admission, pricing/oracles, maturity and liquidation.

## Wallet application — 17 September 2026

Actual transaction app: [http://127.0.0.1:4174/app/](http://127.0.0.1:4174/app/). Start Vite and the [local runtime](../../../packages/local-runtime/README.md) first. The original preview/rehearsal below remain preserved.

The full browser runner passes **27/27** checks: the existing 20 plus seven wallet/error/utility cases. Type checks, production build, fixture verification, 33 reference/legacy tests and 22 transaction-SDK tests pass. Mocked wallet cases cover connection rejection/disconnect, identity/account mismatch, partial faucet response handling, confirmation levels, bounded transport and exact binary formatting. They are not proof of custody.

On a fresh runtime, run the independent actual browser acceptance:

```sh
node apps/web/qa/wallet-app-review.mjs
```

It signs through two memory-only browser wallets, executes split, partial recombination, both claim transfers, four test dividends, maturity/finalization and independent redemption. It independently checks RPC balances, zero claim supplies, an empty vault and all 33 displayed signatures as confirmed/finalized. It also verifies explicit zero-output consent, stale/read-timeout recovery, key loss on reload, keyboard entry and no overflow at 390/768/1024/1440 px. No normal-flow console/page errors occurred. The deliberate stalled RPC is an explicitly expected error condition.

Evidence: [browser receipts and balances](../../../planning/evidence/wallet-browser-review-2026-09-17.json), [three-profile RPC acceptance](../../../planning/evidence/wallet-runtime-smoke-2026-09-17.json) and [review boundaries](../../../planning/wallet-review.md).

The production bundle also passes [wallet-production-review.mjs](wallet-production-review.mjs), a read-only Chrome check of real runtime discovery, temporary wallet creation and all three asset snapshots. After `npm run build`, stop the development server and run `npm exec vite preview -- --config apps/web/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort`, then `node apps/web/qa/wallet-production-review.mjs` in another terminal. No requests are mocked. Stop preview before running the ordinary browser suite, which expects Vite's development server.

Astra reviewed [Market desktop](wallet-market-1440.png), [Market mobile](wallet-market-390.png), [Split desktop](wallet-split-1440.png), [Split mobile](wallet-split-390.png), [Redeem desktop](wallet-redeem-1440.png) and [Redeem mobile](wallet-redeem-390.png). These show disposable local test assets. Installed extension wallets, live issuer feeds and AMM execution are unverified.

Each runtime driver consumes the annual lifecycle. Restart the runtime between drivers and once more before a new user demonstration. Reloading a browser discards its temporary key, while restarting the runtime discards the entire local ledger.

Reviewed 16 September 2026. Product preview: http://127.0.0.1:4174/. Preserved rehearsal: http://127.0.0.1:4174/rehearsal/.

## Product revision

- Separate production entry points preserve the original rehearsal source and styles byte-for-byte. The new root app uses Market / Split / Redeem, company headings above issued tokens, Your test balance, actual PT/DR quantities and collapsed simulation controls.
- Combined Chrome suite passes 15/15 (eight product checks plus seven preserved rehearsal checks). Production build and type checks pass for both pages. SDK checks remain 11/11 with fixture verification; SDK source and accounting are unchanged.
- Astra independently verifies MU split and partial/full recombination in Chrome, plus a KOx deposit of 0.00001 whose positive DR payout is smaller than six display decimals. The payout stays enabled and redeems; completion succeeds. Company hierarchy, hidden simulation controls, independent rehearsal state, and absence of page errors are checked. Completion has no overflow at 1440, 1024, 768 and 390 pixels.
- Astra independently verifies both SDK fixtures with a half-DR sale, recombination limited to retained pairs, rejection of withdrawal against sold backing, and full remaining-owner redemption with raw conservation.
- Screenshots: `product-market-1440.png`, `product-market-390.png`, `product-split-1440.png`, `product-split-390.png`, `product-redeem-1440.png`, `product-redeem-390.png`. Astra visually reviews the company hierarchy, desktop split and mobile redemption. The slight heading line-spacing increase is preserved.
- Reset/series/account changes clear stale messages. Transfer, trade and liquidity are labeled unavailable until onchain tokens and venue integration exist. The technical rehearsal, SDK, narration and illustrated v2 retain their prior hashes.

## Original rehearsal results

- Production build and TypeScript checks pass (`npm run build`).
- Fixture verification passes: 15 exact token identities, decimals and observed multipliers; two event joins; source hashes; issuer counts 6/3/6; no live execution flags (`node packages/demo-fixtures/verify.mjs`).
- SDK tests pass, 11/11 (`npm --prefix packages/sdk test`).
- Chrome browser tests pass, 7/7 (`npm run test:browser`): transaction flow, rejection/retry, fractional ownership, pending sources, simulated errors, keyboard use, desktop/mobile layout, assets and console checks.
- Astra independently runs both sourced events through deposit, rejected and accepted fractional sale, settlement, partial PT and separate-owner DR redemptions. Raw collateral and cash are conserved; all claim pools finish empty.
- Astra independently completes the Backpack MU flow in Chrome, including sale to Buyer and both redemptions (`node apps/web/qa/astra-review.mjs`). No page errors or overflow at 1440px and 390px. Screenshots: `astra-mu-complete-1440.png`, `astra-mu-complete-390.png`.
- Astra reviews Market, Split and Positions at desktop/mobile sizes. Illustrated v2 and the user-edited narration retain their pre-phase hashes.

## Legacy rehearsal execution boundary

These checks validate an in-memory rehearsal with sourced historical events. Accounts, cash, offers and receipts are simulated; refresh/reset clears state. No wallet adapter, deployed vault or onchain transaction is present. Ondo has observed token profiles but no verified event fixture. Current fixtures use exact decimal rational arithmetic, not a demonstrated byte-level match to Token-2022 multiplier encoding.

The program phase must settle event trust/finality and recovery, including arbitrary tiny fragmented claims. Current zero-payout burns are blocked; that guard is not a complete production recovery policy. See `spec/series-accounting.md`, `spec/sdk-interface.md` and `planning/phase-work-orders.md` at the repository root.

## Annual-series product note

The root product now presents fixed calendar series such as `PT-KOx-2027` and `DR-KOx-2027`. Deposits occur before 1 January; a controlled in-memory clock then shows collecting dividends, year ended while awaiting finalization, and ready to redeem as distinct states. Maturity freezes event membership without expiring DR. Paired recombination remains available until finalization; afterward PT and DR redeem independently.

The KOx and MU examples reuse their frozen historical factors with synthetic test-term dates. The UI retains the original source effective or activation time and states that neither fixture contains a verified ex-date. It also states: “One sourced dividend example, not a complete annual payout or a 2027 forecast.” The optional second dividend is visibly test-only. No actual 2027 dividend or complete issuer calendar is claimed.

The final combined Chrome suite passes 20/20: 13 annual product checks and seven preserved rehearsal checks. TypeScript and the production build pass. Product coverage includes exact 2027/2028 identities, the pre-year cutoff, replay without early redemption, year-end without finalization, post-event recombination, reuse of returned stock in a later-year deposit without double counting, a paid 40% DR transfer with conserved test USDC, no-forfeiture redemption, explicit consent for zero-value DR closure, series isolation, pending Ondo, keyboard access and desktop/mobile overflow. Independent review repeats the paid transfer through both final redemptions and checks the rehearsal remains empty.

Updated review images are `product-market-1440.png`, `product-market-390.png`, `product-split-1440.png`, `product-split-390.png`, `product-redeem-1440.png` and `product-redeem-390.png`. They preserve the approved visual system and artwork while adding only annual term, lifecycle and evidence labels.

This remains a local reference. The root product imports the annual accounting module directly because the legacy SDK entry point is intentionally unchanged. There is still no wallet, program, issuer finality service, complete annual event journal, live PT/DR mint or venue integration.

Astra acceptance: independently reran the 33-test SDK suite and the annual Chrome review, inspected the final desktop/mobile layouts, and checked a combined transfer → paired exit → replacement cancellation → late finalization → independent-redemption scenario for exact raw conservation. Git preservation checks confirm the original fixture evidence, legacy SDK/rehearsal, design assets, decks and user narration are unchanged.
