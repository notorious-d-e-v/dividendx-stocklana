# DivX rebrand — 25 September 2026

The product name is DivX. The canonical public URL is now [divx.payai.network](https://divx.payai.network); the release evidence below preserves the hostnames actually tested before the domain migration. This release updates website wordmarks and copy, metadata, social cards, design specimens and social exports, presentation sources/decks/previews, narration/article drafts, and project documentation. Existing public URLs remain supported.

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

Production `dpl_Fu4onS1bqESSoWPfyyYj4dsTbea4` (`https://dividendx-stocklana-nrrvpo3ch-payai.vercel.app`) is Ready, published from reviewed commit `0cefe88`. The initial direct upload failed before deployment; the archive upload succeeded.

[Canonical-site verification](evidence/divx-brand-production-2026-09-25.json) and [Vercel-address verification](evidence/divx-brand-vercel-2026-09-25.json) pass all six page routes, metadata/cards, service GETs and 1440/390 layout checks with no browser errors. The [live guided journey](evidence/divx-guided-production-2026-09-25.json) passes all 15 actions, 40 confirmed transactions, both redemptions and explicit restart; no transaction was retried. No production error logs were found in the bounded post-release check. The single existing six-hour cron remains unchanged. The [release identity record](evidence/divx-release-2026-09-25.json) binds this evidence to the deployed source.

Final case-insensitive PPTX audit passes 24/24 after correcting uppercase captions in older editions. Independent Vision OCR of all 53 output PNG/JPG files finds no old display-brand text; only existing hostname URLs remain. The [cover edit prompt and provenance](../design/illustrations/social/deposit-split-counts-v2-cover-5x2.prompt.md) records the built-in ImageGen change; the [final cover](../design/illustrations/social/deposit-split-counts-v2-cover-5x2.jpg) remains 2000×800.

PR #11 merged as `48cd8173edb381fdd8687d93f5e895dba40db953`. The matching Git deployment `dpl_2oYpVJcvgAVNeP4TkDybmwn4gfeG` (`https://dividendx-stocklana-ixw5hmw3s-payai.vercel.app`) reached Ready. Both public addresses return DivX, and the served social-card bytes match the reviewed local files. The two additional internal Vercel aliases retain their existing Vercel authentication redirects. Application source is identical to the fully exercised candidate; the subsequent commits record evidence and finish documentation branding.
