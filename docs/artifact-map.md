# DividendX artifact map

Snapshot audited 16 September 2026. This map identifies the current review surfaces, source evidence, reproducible outputs and preserved history. It is a navigation aid, not a claim that the planned protocol has been deployed.

## Start here

- [README](../README.md) — run the local product preview and its checks; it clearly labels the app as an in-memory simulation.
- [Current plan](../planning/plan.md) — current scope, completed work and next implementation phase.
- [Architecture decision](../planning/adapter-decision.md) and [issuer synthesis](../planning/solana-issuer-synthesis.md) — the selected xStocks, Backpack/Trek and Ondo design, its evidence boundary and unresolved dependencies.
- [Annual product specification](../spec/annual-product.md) — annual Market / Split / Redeem flow at `/`, extending the approved visual design.
- [Detailed rehearsal specification](../spec/frontend-rehearsal.md) — preserved two-account accounting walkthrough at `/rehearsal/`.
- [Annual accounting](../spec/annual-series-accounting.md), [SDK contract](../spec/annual-series-sdk.md) and [test matrix](../spec/annual-series-tests.md) — current program-facing contract. Older [single-event accounting](../spec/series-accounting.md) and [SDK interface](../spec/sdk-interface.md) describe the preserved rehearsal only.

## Current product and proof material

| Artifact | Role | Status boundary |
|---|---|---|
| [`apps/web/src/ProductApp.tsx`](../apps/web/src/ProductApp.tsx) | Main local product flow | In-memory preview; no wallet, vault or network transaction |
| [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) | Detailed rehearsal | Local accounting demonstration and fallback |
| [`packages/sdk/src/annual-reference.ts`](../packages/sdk/src/annual-reference.ts) | Multi-event annual accounting and lifecycle reference | Local trusted-input model; bounded program arithmetic and attestation remain to implement |
| [`packages/sdk/src/index.ts`](../packages/sdk/src/index.ts) | Preserved single-event rehearsal SDK | Legacy behavior, not the annual program contract |
| [`packages/demo-fixtures/`](../packages/demo-fixtures/) | Frozen catalog, events, digests and verifier | Reproducible historical fixtures; not live availability |
| [`apps/web/qa/README.md`](../apps/web/qa/README.md) | UI review record and reproduction commands | Browser evidence for the preview only |
| [`design/design-system.md`](../design/design-system.md) | Approved product visual language | Design rules, not operational capability |
| [`design/illustrations/illustration-guide.md`](../design/illustrations/illustration-guide.md) | Approved illustration system | Metaphors and communication rules; pictures do not prove integrations |

The illustrations show intended concepts such as separated ownership, issuer-isolated backing and compatibility with wallets or trading apps. They do **not** establish deployed custody, transferable PT/DR mints, live liquidity, issuer approval or onchain settlement. The capability statements in the README, plan, specifications and evidence reports control.

## Pitch and narration

- [Illustrated v2 deck](../presentation/output/DividendX-illustrated-v2.pptx) — preserved approved pitch artifact; annual wording awaits the next versioned export.
- [Illustrated v2 contact sheet](../presentation/output/DividendX-illustrated-contact-sheet-v2.png) — compact visual review surface.
- [User narration](../presentation/narration.md) — current nine-slide script used by the illustrated v2 deck.
- [Source ledger](../presentation/source-ledger.md) — claim-by-claim sources and qualification notes.
- [Submission description draft](../presentation/submission-description-draft.md) — current long-form submission copy.
- [Storyboard](../spec/pitch-storyboard.md) and [pitch review](../planning/pitch-review.md) — approved story and validation history.
- [Illustrated v2 authoring source](../presentation/build/illustrated-v2/build-deck-illustrated-v2.mjs) — reproducible deck source. Keep this even if generated render directories are excluded.

[`presentation/narration-plain-language.md`](../presentation/narration-plain-language.md) is a closely related 400-word draft, but current planning and storyboard documents designate `presentation/narration.md` as the user narration. Preserve both until that alternate draft is explicitly retired.

## Illustration assets

- [`design/illustrations/assets/`](../design/illustrations/assets/) and its [manifest](../design/illustrations/assets/manifest.json) contain the canonical approved illustration PNGs and checksums.
- [`presentation/assets/illustrated-v1/`](../presentation/assets/illustrated-v1/) contains deck-specific source art, prompts and its manifest.
- [`apps/web/public/assets/`](../apps/web/public/assets/) contains runtime copies required by the web app. These are intentional copies, not disposable build cache. In particular, `stock-dividend-coupon.png` matches the presentation asset and `stock-and-dividend-composability.png` matches the canonical design asset.
- [`design/illustrations/prompts/`](../design/illustrations/prompts/) preserves prompt provenance and baseline hashes; keep it with the canonical art.

## Evidence and research

The evidence directory is archival source material and should remain tracked even though it is large. The largest files are `xstocks-scope-2026-09-16.json` (about 9 MiB), `backpack-2026-09-16.json` (about 3.3 MiB) and `xstocks-mint-inventory-2026-09-16.json` (about 3 MiB).

- [Selected asset package](../planning/research/initial-asset-package.md) and [parent verification](../planning/evidence/initial-package-parent-verification-2026-09-16.json) — exact 15-mint candidate package.
- [KOx event snapshot](../planning/evidence/real-events-2026-09-16.json) — historical factor fixture; verified ex-date and complete annual coverage are missing.
- [Backpack MU event](../planning/evidence/backpack-scope-mu-event-2026-09-16.json), [raw transactions](../planning/evidence/backpack-scope-mu-raw-transactions-2026-09-16.json) and [authority history](../planning/evidence/backpack-scope-mu-authority-history-2026-09-16.json) — sourced onchain reconstruction; not an issuer-published final event ledger.
- [Ondo report](../planning/research/ondo-solana.md) and [Ondo evidence](../planning/evidence/ondo-solana-2026-09-16.json) — research snapshot; no source-complete Ondo event is claimed.
- [AMM feasibility](../planning/research/claim-amm-feasibility.md) — devnet integration decision and remaining prerequisites; no pool or deployed DividendX program is claimed.
- [Annual dividend research](../planning/research/annual-dividend-series.md) — exchange period/ex-date conventions, revisions and actual fixture gaps.
- [Prior-art decision review](../planning/research/prior-art-review.md) — dated single-event architecture review with reusable lessons; annual specifications supersede its term design.
- [Mechanics audit](../planning/mechanics-audit.md) and [market evidence](../planning/market-evidence.md) — accounting and market-claim review.

## Preserved history

- [`planning/archive/`](../planning/archive/) contains superseded xStocks-only and broader-Solana decisions. Keep it for decision provenance; do not use it as current scope.
- [`presentation/build/archive/`](../presentation/build/archive/) contains versioned deck sources, narration, ledgers, validation receipts and intermediate PPTX files. Some are unique production records, so the whole directory must not be ignored.
- Earlier final decks and contact sheets in [`presentation/output/`](../presentation/output/) are intentional review history. The illustrated v2 files above are the current entry points.

Some archived planning documents contain relative links that became invalid when the documents were moved under `planning/archive/`. They are historical context rather than current navigation. Current Markdown links passed the local existence check. The `/src/product-main.tsx` and `/src/rehearsal-main.tsx` paths in the two HTML entry points are valid Vite root imports, not broken filesystem links.

## Backup and ignore guidance

The existing ignore rules correctly cover dependencies, web builds, browser reports, OS metadata and local environment files. For a public backup, retain the current source, specifications, evidence JSON, canonical art, runtime public assets, deck authoring scripts, final decks/contact sheets, validation receipts and both archive trees.

The cleanup added these narrow `.gitignore` patterns for reproducible compiler or presentation working files. Local copies remain present; unique sources and final deliverables stay tracked:

```gitignore
*.tsbuildinfo
presentation/build/rendered/
presentation/build/rendered-v*/
presentation/build/contact-sheet.png
presentation/build/**/finalizer/*.inspect.ndjson
```

If repository size later becomes a concern, the following review images can also be regenerated from checked-in sources and scripts, but exclude them only after confirming a clean-checkout render on the target environment:

```gitignore
design/previews/*.png
design/illustrations/previews/*.png
apps/web/qa/*.png
presentation/output/previews/slide-*.png
presentation/output/illustrated-v1/slide-*.png
presentation/output/illustrated-v2/slide-*.png
presentation/build/illustrated-v2/review-pass-1/*.png
```

Do not broadly ignore `planning/evidence/`, `presentation/output/`, `presentation/build/`, `presentation/assets/`, `design/illustrations/assets/` or `apps/web/public/assets/`. Broad patterns there would omit source evidence, current deliverables, unique archive records or runtime-required art.
