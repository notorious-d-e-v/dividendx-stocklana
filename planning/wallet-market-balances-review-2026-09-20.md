# Market balances review

Local follow-up to the [stock modal review](wallet-stock-modal-review-2026-09-20.md). The user approved the illustration and requested a simpler Market landing page. No release is part of this pass.

## Presentation

- Remove the Market stock/year picker, direct faucet controls and selected annual-series panel. Split and Redeem retain their selectors and focused position views.
- A connected wallet with supported stock, PT or DR holdings sees **Your balances** beneath the hero, followed by the company catalog. Each asset identifies its company, issuer and annual claims; stock-only and claim-only positions remain visible.
- Wallets without supported holdings, including disconnected visitors, see **Explore stock tokens by company** beneath the hero. Balance reads have separate loading/error states; a failed read is never presented as a confirmed zero.
- When multiple annual series share an underlying stock mint, show that stock balance once, with separate PT/DR amounts for each held year. Do not duplicate the apparent underlying balance across years.
- Balance actions retain the selected asset/year when opening Split or Redeem. Existing identity checks, fresh quotes, market funding dialogs and the post-split Redeem prompt remain intact.

## Verification

The local devnet preview was reviewed read-only in the in-app browser: the disconnected Market places the company catalog immediately below the hero, the catalog opens its stock modal, closing returns focus to that card, and Split retains its selection controls. Live editing remounted the development app, clearing its in-memory temporary-wallet connection; no browser reload, faucet request or signing action was performed.

Seeded fixture coverage verifies several assets, stock/PT/DR balances, PT-only and DR-only positions, 2027/2028 separation, exact-year navigation, disconnected/confirmed-zero states and inventory error/retry. The six focused browser checks passed on an isolated local preview at port 4185. An initial run incorrectly reused the 4184 devnet-configured preview for local fixtures; switching the test server resolved that environment mismatch without changing production configuration.

[Desktop](evidence/market-balances-2026-09-20-1440.png) and [mobile](evidence/market-balances-2026-09-20-390.png) fixture captures passed visual review and horizontal-overflow checks. They demonstrate presentation with synthetic seeded data, not new onchain balances. Single-year positions use one row of three balance boxes; multiyear positions show the stock balance once with separate annual claim rows.

Required checks: **95 root tests passed**, type checking and production build passed. The full browser regression suite passed **95/95** cases on the isolated local preview. User artwork and earlier evidence are preserved. No program, SDK, settlement, faucet policy, commit or deployment change is included.
