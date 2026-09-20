# Landing and wallet review — 20 September 2026

Local visual review pass. The separate backend-only catalog release preserves the accepted production frontend.

## Requested experience

- `/` and `/demos/` open Guided Demos. Navigation offers Public Devnet and Guided Demos, with no wallet-sandbox or legacy rehearsal links. The former annual preview is preserved at `/reference/`; older `/sandbox/` and `/rehearsal/` routes remain directly accessible for prior evidence.
- Guided hero: “One stock.” then “Two separate tokens.” An expired guided session starts another guided session on the same route, without requiring cookie or storage clearing.
- Public Devnet keeps Market, Split and Redeem. Market contains the company overview; Split and Redeem show their respective actions without the large repeated overview.
- Verified network status is compact beside the wallet button. The wallet button opens accessible connection choices; temporary-wallet keys remain in memory and disappear on reload.
- User-facing labels use clean tickers and issuer names. Canonical IDs, mint addresses and receipts remain unchanged; a short disclosure explains the network and synthetic balances.

## Catalog boundary

The researched directory contains 15 issuer-specific tokens across six companies, not 15 companies. All are listed in Market; only profiles in the verified runtime manifest can enter transaction controls. All 15 synthetic devnet profiles are now provisioned and verified. The original three-profile local sandbox continues to show the other twelve as unavailable in that runtime. No mainnet issuer address is used as a devnet mint.

[Expansion preflight](devnet-catalog-expansion.md) records an approximately 0.2653 devnet SOL baseline for twelve new profiles, the existing aggregate spending guard, state migration, observation-refresh capacity and unchanged faucet limits. The user explicitly approved provisioning and verifying all 15 on devnet on 20 September. An additive migration preserves the existing three identities, with a separate 0.30 SOL expansion cap and at most 0.12 SOL for a dedicated verification wallet. The visual changes remain local for review.

## Verification

All 76 browser cases pass across the full run and one isolated rerun of a legacy reference test interrupted by a development reload. Root tests pass 95/95; TypeScript and the isolated production build pass. Actual local-runtime screens pass read-only checks at 1440 and 390 pixels: no horizontal overflow, focused action views, two navigation links, and wallet-dialog focus return. A separate browser run loads fresh quotes for all 15 actual devnet profiles and verifies their mint addresses.

The 48 provisioning and 61 holder-proof transactions are independently finalized. Every profile passes mint, split and recombination with conservation. Devnet-runtime tests pass 18/18, hosted-devnet tests 39/39 and the verification harness tests 2/2.

Review the guided landing at [localhost:4174](http://127.0.0.1:4174/) and the 15-profile devnet UI at [localhost:4184/app/](http://127.0.0.1:4184/app/). The latter serves a read-only manifest without a local public-faucet proxy; its quotes and wallet signing target public devnet. Existing 4174/4180/4181 services remain available. The pending visual changes have not been published.

Visual evidence: [landing](../apps/web/qa/navigation-2026-09-20-landing.png), [devnet split](../apps/web/qa/navigation-2026-09-20-devnet-split.png), [mobile redeem](../apps/web/qa/navigation-2026-09-20-devnet-mobile.png).
