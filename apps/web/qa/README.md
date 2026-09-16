# Product and rehearsal verification

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

## Execution boundary

These checks validate an in-memory rehearsal with sourced historical events. Accounts, cash, offers and receipts are simulated; refresh/reset clears state. No wallet adapter, deployed vault or onchain transaction is present. Ondo has observed token profiles but no verified event fixture. Current fixtures use exact decimal rational arithmetic, not a demonstrated byte-level match to Token-2022 multiplier encoding.

The program phase must settle event trust/finality and recovery, including arbitrary tiny fragmented claims. Current zero-payout burns are blocked; that guard is not a complete production recovery policy. See `spec/series-accounting.md`, `spec/sdk-interface.md` and `planning/phase-work-orders.md` at the repository root.
