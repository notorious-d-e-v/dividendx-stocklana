# DivX rebrand — 25 September 2026

The product name is DivX. This release updates website wordmarks and copy, metadata, social cards, design specimens and social exports, presentation sources/decks/previews, narration/article drafts, and project documentation. Existing public URLs remain supported.

The Solana program, program ID, compiled ELF, generated IDL, SDK API names, persisted schemas, environment variables, HTTP mutation headers, immutable runtime snapshot, server budgets, and runtime configuration are unchanged. Technical identifiers retain their existing spelling for compatibility. Historical captured transaction/evidence records remain evidence of the runs they describe, not fresh rebrand acceptance.

## Verification

- `npm test`: 95 tests pass.
- `npm run typecheck`: passes.
- `npm run test:browser`: 100/100 pass.
- `npm run build -- --outDir /tmp/divx-web-build`: passes without replacing the user's existing built preview.
- The exact Vercel `scripts/hosting/build-site.sh` build passes in a disposable source copy.
- Vercel deployment dry run excludes credentials, signer files, local tools/ledgers, dependencies and existing build output.
- New 1440×756 social cards are real local DivX UI captures using unchanged production GET responses. No sandbox was created for these captures. Both new versioned paths and old image aliases display DivX.
- Source-backed social images and current design specimens were re-rendered. The 2000×800 article cover was edited with ImageGen; its three 10×10 grids and labels were reviewed. Seven canonical illustrations have no brand text and remain unchanged.
- Existing Markdown links resolve. All 24 PPTX packages pass ZIP integrity and contain zero old display-brand strings. All nine output decks pass structural checks. Current v3/v4 decks have fresh finalizer receipts, new screenshots, slide renders and contact sheets; the latest deck was visually reviewed. Historical receipts are explicitly marked nonvalidating for the new artifacts in `presentation/build/HISTORICAL_VALIDATION.md`.

The browser suite regenerates QA captures, including `apps/web/qa/positions-complete-desktop.png`, which was already uncommitted when this task began. Its previous uncommitted pixels were overwritten by the suite; no pre-test binary backup was available. The current file is the new DivX test capture. Existing in-progress presentation/artwork content is retained in the rebranded versions. Unrelated midyear research remains local.

## Release and rollback

Release PR: [#11](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/11).

Pre-release known-good deployment: `dpl_29kjUNj3JKAPrDRphy662PiST1cE`, `https://dividendx-stocklana-91u69krih-payai.vercel.app`.

Accepted program ELF SHA-256: `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070` (unchanged). Accepted runtime snapshot: `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq` (unchanged).

Production publication and live verification are pending final review.
