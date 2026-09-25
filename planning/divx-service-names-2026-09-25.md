# DivX repository and hosting names — 25 September 2026

The GitHub repository is [notorious-d-e-v/divx](https://github.com/notorious-d-e-v/divx), and the existing Vercel project is [payai/divx](https://vercel.com/payai/divx). GitHub's repository homepage is [divx.payai.network](https://divx.payai.network). The local Git remote and Vercel project link use the new names; the local directory remains `dividendx-stocklana` to preserve existing workspace paths.

The GitHub repository ID remains `1373047181`; Vercel project ID remains `prj_C8a753TUEFDIWVKPnKlLb60MouaP`. Vercel's Git connection now names `notorious-d-e-v/divx` with `main` as the production branch. Build settings, runtime snapshot, onchain programs, cron schedule and budgets are unchanged.

The canonical site remains [divx.payai.network](https://divx.payai.network). The new fallback address is [divx.vercel.app](https://divx.vercel.app). The old custom hostname redirects permanently with HTTP 308, preserving paths and queries; the original `dividendx-stocklana.vercel.app` fallback remains supported. Production and preview `DIVIDENDX_SITE_ORIGIN` allow exactly these four origins:

- `https://divx.payai.network`
- `https://dividendx.payai.network`
- `https://dividendx-stocklana.vercel.app`
- `https://divx.vercel.app`

Current repository links in presentation sources, article drafts, project status and five PPTX packages use the new repository URL. The PPTX changes affect speaker-note repository links only. Historical release evidence and deployment URLs retain their original identities.

The [package delta checks](evidence/divx-repository-links-2026-09-25.json) record the old and new hashes and prove that every other ZIP entry is byte-identical. Earlier finalizer receipts retain their pre-rename package hashes; they do not validate these notes-modified package bytes. Slide visuals are unchanged.

## Verification

- GitHub's old repository URL returns HTTP 301 directly to `notorious-d-e-v/divx`; the new Git remote resolves successfully.
- Vercel reports the renamed project and corrected Git connection with the original IDs.
- The new fallback hostname is attached and verified. The temporary `divx-stocklana.vercel.app` alias created before the user's naming correction was removed.
- The old custom hostname returns HTTP 308 for `/demos/?rename=divx`, with the exact path and query preserved on the canonical host.

Production deployment and post-publication checks are recorded in the associated pull request.
