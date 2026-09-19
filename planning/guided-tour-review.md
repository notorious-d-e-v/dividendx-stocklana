# Guided tour v3 — local acceptance, 19 September 2026

Ready for user review at [localhost /demos/](http://127.0.0.1:4174/demos/). This implements the [two-part specification](../spec/guided-tour-v3.md). No Git push, Vercel deployment, snapshot replacement, public transaction, or issuer writer was performed. The live site retains its accepted v2 demo.

## Result

The new hero introduces one tokenized stock becoming two tokens. Its start button only scrolls. Part One selects an xStocks, Backpack/Trek or Ondo synthetic profile, funds 100 stock units, splits them into PT/DR, then recombines 40 and 60 pairs. Part Two reuses the returned stock for the existing Raydium/Test USDC journey. Completion keeps a historical Part One recap separate from current balances. The future-integration roadmap remains noninteractive.

Motion adds brief entrance and balance-change transitions; reduced-motion settings disable movement. Core balances show only stock/PT/DR. USDC, LP balances and the second wallet appear in Part Two. Receipts remain collapsed. Profile selection fixes the asset for that run; exact token precision follows the program's 8/6/9-decimal profiles.

## Verification

- [Three-profile execution](evidence/guided-tour-profiles-2026-09-19.json): each profile completed 13 steps and 40 confirmed transactions. Setup, funding, split, partial recombination and full recombination have exact checked balances. Final PT supply is zero and Raydium's remaining DR stay backed.
- [Actual Chrome acceptance](evidence/guided-tour-browser-2026-09-19.json): no mocked network traffic; 13 step requests and one setup request, each submitted once; 40 independently checked RPC signature statuses; four synthetic annual dividends and final separate redemption. Hero/continuation are scroll-only, reload preserves core progress, and 1440/390 layouts have no horizontal overflow.
- Root tests: 95 passed. Root typecheck and the production build passed, with build output isolated under `/tmp/dividendx-guided-tour-v3-build-20260919` to preserve existing previews.
- Browser regression suite: 60 passed, followed by the final 8-test guided suite including the added duplicate-submission check; 10 focused hosted-session tests also passed. Runtime tests: 5 passed; gateway: 17; broker: 18.
- The program ELF is unchanged: `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`. No Solana program or transaction SDK changes.

An initial browser run completed its transactions but failed the harness's console classification of Motion's expected reduced-motion notice. Review also found a screenshot helper could match the wrong balance row before UI reconciliation. The helper now checks each named row; a fresh full browser run passed. The initial `/tmp/guided-tour-v3-browser-kox-1789813084869.json` remains preserved. The successful run reports three expected Motion development warnings and zero browser errors. The visible skip link in keyboard-review captures is an intentional focus state.

Reviewed images: [hero](../apps/web/qa/guided-tour-v3-before-1440.png), [split desktop](../apps/web/qa/guided-tour-v3-part-one-1440.png), [split mobile](../apps/web/qa/guided-tour-v3-part-one-390.png), and [completed tour](../apps/web/qa/guided-tour-v3-final-1440.png). Existing approved captures and the user's pre-existing positions image are preserved.

## Publication boundary

This is local-only acceptance. The v3 browser, broker and gateway require a matching v3 code-only runtime snapshot; the live snapshot remains v2. Publish only after user review, with a new reviewed snapshot and hosted acceptance. These synthetic profiles and balances do not establish live issuer custody or qualified dividend settlement.
