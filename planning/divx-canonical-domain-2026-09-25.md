# DivX canonical domain — 25 September 2026

The canonical URL is [https://divx.payai.network](https://divx.payai.network). Website canonical/OG/Twitter metadata and social-image URLs, documentation, article/narration links, deck text/notes/hyperlinks and their rendered previews now use it. The local devnet review bridge also targets the new host.

The user configured the existing Vercel CNAME. The hostname still needed to be attached to the `payai/dividendx-stocklana` Vercel project; that attachment is now verified with valid DNS and TLS. No DNS record was changed. Production and preview `DIVIDENDX_SITE_ORIGIN` now allow the new canonical origin plus both previously supported origins, `https://dividendx.payai.network` and `https://dividendx-stocklana.vercel.app`.

The old address continues to serve the site. No redirect or decommission is enabled. The [hosting runbook](../docs/hosting-operations.md#retiring-the-legacy-domain-later) records the future permanent redirect/decommission sequence. Visitor cookies and active sandbox sessions are hostname-specific; a visitor switching domains starts a fresh session. Program IDs, onchain programs, runtime snapshot, API contracts, budgets and cron remain unchanged.

Historical captured evidence retains the URLs actually used. The prior deck validation receipts are preserved in `presentation/build/illustrated-v3/finalizer/historical/` and `presentation/build/illustrated-v4/finalizer/historical/`; the new current receipts validate the current domain editions.

## Checks

- 95 core tests, 100 browser tests, three review-bridge tests, typecheck and isolated production build pass.
- Browser-generated PNG changes were restored from pre-run backups; all saved hashes match.
- All 24 PPTX files pass package integrity; no old URL remains in their XML or relationships. Updated v3/v4 renders and finalizer receipts were reviewed.
- Vercel domain verification reports `configured-correctly`, attached, verified, and no conflicts.
- Before the configuration deployment, the new hostname served the site but explicit-origin API GETs returned 403, confirming that adding DNS alone did not authorize application requests.

## Release

Pre-change known-good deployment: `dpl_AwGGWBinsuiHNuuV51sHCEP2AQaQ`, `https://dividendx-stocklana-cb9yw1eqo-payai.vercel.app`.

Publication and new-host live verification will be recorded here. Rolling back to a pre-migration deployment restores its former origin settings and can reject the new hostname; prefer deploying the known-good application source with the three-origin configuration when recovering the new domain.
