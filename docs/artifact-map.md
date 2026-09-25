# DivX artifact map

Updated 18 September 2026. This map identifies the current review surfaces, source evidence, reproducible outputs and preserved history. The accepted canonical Vercel test site has production-browser devnet, accelerated wallet, guided, simultaneous two-visitor reset/isolation and natural-expiry evidence against the unchanged accepted ELF. This does not establish live issuer integration.

## Start here

- [DivX repository and hosting names](../planning/divx-service-names-2026-09-25.md) — GitHub and Vercel rename, current fallback URL and retained legacy redirects.

- [Canonical DivX domain](../planning/divx-canonical-domain-2026-09-25.md) — new public URL, compatibility period, domain configuration and live verification.

- [DivX rebrand and release](../planning/divx-rebrand-2026-09-25.md) — updated branding, assets, decks, validation and deployment record.

- [Hackathon submission packet](../planning/hackathon-wrap-up-2026-09-20.md), [mainnet readiness](../planning/mainnet-readiness-2026-09-20.md), and [ecosystem outreach](../planning/ecosystem-outreach-2026-09-20.md) — current deadline, draft entry, recording outline, known gaps and prioritized partner prospects; no submission or outreach sent.
- [20 September wallet release](../planning/wallet-release-2026-09-20.md) — approved navigation and wallet publication, checks and rollback identity.
- [Market balances review](../planning/wallet-market-balances-review-2026-09-20.md) — local landing page shows owned stock/PT/DR positions or goes directly to the company catalog; annual claims remain distinct.
- [Stock modal and wallet-flow review](../planning/wallet-stock-modal-review-2026-09-20.md) — local illustration variant, company-color dots, balance-aware funding modal, stable asset switching and split-to-redeem nudge; faucet capacity audit and actual devnet round trip.
- [Wallet and asset-discovery review](../planning/wallet-polish-review-2026-09-20.md) — local header wallet modal, concise Market hero, supported balances and devnet faucet access.

- [20 September local navigation review](../planning/navigation-wallet-review-2026-09-20.md) — guided landing page, focused wallet actions and catalog availability. This pass is not yet published.

- [Guided tour v4](../spec/guided-tour-v4.md) and [local acceptance](../planning/guided-tour-v4-review.md) — three-part learning flow; [actual browser driver](../scripts/hosting/guided-tour-local-review.mjs) and [three-profile execution evidence](../planning/evidence/guided-tour-v4-profiles-2026-09-19.json). Earlier [v3 acceptance](../planning/guided-tour-review.md) is preserved. Published with a matching hosted snapshot in the [v4 release](../planning/guided-tour-v4-release.md).

- [README](../README.md) — run the real local wallet application, preserved previews and their checks.
- [AMM review](../planning/amm-review.md) — finalized public devnet round trip and separate captured-bytecode local proof.
- [Guided demos specification](../spec/guided-demos-v1.md) — separate `/demos/` product and fixed nine-action local execution contract.
- [Test USDC overlay](../spec/guided-usdc-v1.md) and [acceptance review](../planning/usdc-demo-review.md) — v2 quote identity, local funding boundary, browser, RPC and exact-conservation review.
- [Preserved generic-quote acceptance](../planning/guided-demo-review.md) — historical 37-transaction guided proof.
- [Current plan](../planning/plan.md) — current scope, completed work and next implementation phase.
- [Hosting acceptance](../planning/hosting-release-review.md), [aggregate evidence](../planning/evidence/hosted-release-2026-09-18.json), [hosting plan](../planning/hosting-plan.md) and [operations](hosting-operations.md) — accepted real-calendar devnet/accelerated sandbox modes, proof index, quotas and rollback.
- [Hosting foundation review](../planning/hosting-foundation-review.md) — historical native Vercel/Docker execution, persistent 2027 devnet registry and then-remaining release gates.
- [Architecture decision](../planning/adapter-decision.md) and [issuer synthesis](../planning/solana-issuer-synthesis.md) — the selected xStocks, Backpack/Trek and Ondo design, its evidence boundary and unresolved dependencies.
- [Annual product specification](../spec/annual-product.md) — annual Market / Split / Redeem flow at `/`, extending the approved visual design.
- [Detailed rehearsal specification](../spec/frontend-rehearsal.md) — preserved two-account accounting walkthrough at `/rehearsal/`.
- [Program v1](../spec/program-v1.md), [annual accounting](../spec/annual-series-accounting.md), [SDK contract](../spec/annual-series-sdk.md) and [test matrix](../spec/annual-series-tests.md) — current implementation contract. [Acceptance review](../planning/program-review.md) records execution evidence; [toolchain](program-toolchain.md) gives reproduction commands. Older [single-event accounting](../spec/series-accounting.md) and [SDK interface](../spec/sdk-interface.md) describe the preserved rehearsal only.

## Current product and proof material

| Artifact | Role | Status boundary |
|---|---|---|
| [`apps/web/src/ProductApp.tsx`](../apps/web/src/ProductApp.tsx) | Main local product flow | In-memory preview; no wallet, vault or network transaction |
| [`apps/web/src/wallet/`](../apps/web/src/wallet/) | `/app/` wallet flow | Real local test transactions; temporary browser wallet and Wallet Standard interface |
| [`apps/web/src/demos/`](../apps/web/src/demos/) | `/demos/` guided DeFi flow | Two server-managed test wallets; nine fixed actions and real local receipts using Test USDC v2, with no extension wallet or caller-supplied transaction data |
| [`packages/local-runtime/`](../packages/local-runtime/) | Offline Surfpool test network | Disposable test profiles and synthetic annual journal; no real issuer assets |
| [`packages/devnet-runtime/`](../packages/devnet-runtime/) | Persistent real-calendar devnet registry and operator tools | Synthetic 2027 assets, separate test authorities and read-only manifest; local operator HTTP faucet disabled |
| [`packages/hosted-devnet/`](../packages/hosted-devnet/) | Public devnet wrapper | Durable finite test faucet and six-hour frozen-profile observation refresh; no issuer events, finalization or clock control |
| [`packages/hosted-broker/`](../packages/hosted-broker/) and [`packages/hosted-gateway/`](../packages/hosted-gateway/) | Hosted session control and restricted VM ingress | Accepted immutable cookie-bound 15-minute wallet/guided sessions, durable quotas, same-origin routes, two-visitor reset isolation and natural expiry |
| [`deploy/runtime/`](../deploy/runtime/) and [`scripts/hosting/`](../scripts/hosting/) | Allowlisted Linux packaging, execution probes and opt-in production smoke | Exact accepted artifacts pass Docker/native Vercel; actual production runs never mock manifest, broker or RPC |
| [`packages/guided-runtime/`](../packages/guided-runtime/) | Separate guided runtime on port 4181 | Accepted DivX ELF, captured genuine Raydium devnet binary/config and an exact local copy of the Circle devnet USDC mint account; synthetic 10 + 1 Test USDC funding and accelerated test year |
| [`packages/issuer-readers/`](../packages/issuer-readers/) | Server-side issuer observations | Selected registry identities and available source records; explicit gaps, private snapshots, no settlement writer |
| [`packages/amm-integration/`](../packages/amm-integration/) | Raydium CPMM execution package | Isolated Node CLI; finalized public devnet test flow and captured-bytecode local fallback, not wired into `/app/` |
| [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) | Detailed rehearsal | Local accounting demonstration and fallback |
| [`packages/sdk/src/annual-reference.ts`](../packages/sdk/src/annual-reference.ts) | Multi-event annual accounting and lifecycle reference | Preserved decimal-rational trusted-input model; program arithmetic instead uses exact onchain multiplier bits |
| [`programs/dividendx/`](../programs/dividendx/) | Annual custody and settlement program, generated IDL | Controlled local execution plus exact accepted ELF deployed on devnet; no live issuer admission claim |
| [`packages/transaction-sdk/`](../packages/transaction-sdk/) | Actual instruction builders, snapshots, quotes and signing helpers | Used by `/app/`; caller supplies signers |
| [`tests/protocol/`](../tests/protocol/) | Independent oracle and compiled-SBF conformance | Controlled mints, clocks and attestations; preserves source fixture provenance |
| [`packages/sdk/src/index.ts`](../packages/sdk/src/index.ts) | Preserved single-event rehearsal SDK | Legacy behavior, not the annual program contract |
| [`packages/demo-fixtures/`](../packages/demo-fixtures/) | Frozen catalog, events, digests and verifier | Reproducible historical fixtures; not live availability |
| [`apps/web/qa/README.md`](../apps/web/qa/README.md) | UI review record and reproduction commands | Distinguishes simulated previews, the wallet runtime and the separate guided execution proof |
| [`design/design-system.md`](../design/design-system.md) | Approved product visual language | Design rules, not operational capability |
| [`design/illustrations/illustration-guide.md`](../design/illustrations/illustration-guide.md) | Approved illustration system | Metaphors and communication rules; pictures do not prove integrations |

The illustrations show intended concepts such as separated ownership, issuer-isolated backing and compatibility with wallets or trading apps. They do **not** establish deployed custody, transferable PT/DR mints, live liquidity, issuer approval or onchain settlement. The capability statements in the README, plan, specifications and evidence reports control.

## Pitch and narration

- [Illustrated v2 deck](../presentation/output/DivX-illustrated-v2.pptx) — preserved approved pitch artifact; annual wording awaits the next versioned export.
- [Illustrated v2 contact sheet](../presentation/output/DivX-illustrated-contact-sheet-v2.png) — compact visual review surface.
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
- [Authenticated Ondo access](../planning/research/ondo-api-access-2026-09-17.md) — verified read-only endpoints and six matching mint identities; raw responses and credentials stay outside Git, historical settlement gaps remain.
- [Unsigned qualification contract](../spec/issuer-qualification-v1.md), [acceptance](../planning/issuer-qualification-review.md) and [source follow-up](../planning/research/issuer-qualification-followup-2026-09-18.md) — implemented offline review of saved observations, candidate dates and current mint evidence; no signing or approval path.
- [Captured mint custody acceptance](../planning/issuer-custody-review.md), [contract](../spec/issuer-custody-conformance-v1.md) and [snapshot](../tests/protocol/fixtures/issuer-mints-2026-09-18.json) — 15 captured configurations execute through the unchanged compiled program locally; synthetic balances/events, no mainnet custody or settlement admission.
- [Hosted public devnet browser evidence](../planning/evidence/hosted-browser-devnet-2026-09-18-r3.json) and [independent finality](../planning/evidence/hosted-browser-devnet-finalized-2026-09-18.json) — exactly 10 TestKOx funded, one split/recombined and all three signatures finalized.
- [Hosted wallet sandbox evidence](../planning/evidence/hosted-browser-sandbox-2026-09-18-r3.json) — funding, split, four synthetic annual steps and separate PT/DR redemption with 30 confirmed/finalized signatures and zero final vault/claim supply.
- [Hosted guided evidence](../planning/evidence/hosted-browser-guided-2026-09-18.json) — nine fixed actions and 36 confirmed transactions in a private guided VM using synthetic local Test USDC.
- [Hosted guided chain verification](../planning/evidence/hosted-guided-chain-verification-2026-09-18.json) — independent read-only RPC proof of all 36 statuses and exact residual PT/DR/vault/pool/LP state.
- [Natural hosted expiry](../planning/evidence/hosted-session-natural-expiry-2026-09-18.json) — provider stopped without an operator stop, broker retained the same expired session ID and the old manifest returned 410; [operator cleanup](../planning/evidence/hosted-release-acceptance-cleanup-2026-09-18.json) later removed the four stopped owned acceptance VMs and reconciled their ledger records.
- [Hosted two-visitor isolation](../planning/evidence/hosted-browser-isolation-2026-09-18-r3.json) — distinct runtime/deployment/account identities, visitor-A-only clock advance and reset, unchanged visitor-B clock/balances, expected stale-path 410 and no unexpected browser errors.
- [Issuer qualification research](../planning/research/issuer-settlement-qualification-2026-09-17.md) — current priority, sanitized refresh, explicit Microsoft dates and candidate MSFTx joins; no live settlement approval.
- [Future DeFi demos](../planning/research/defi-demo-sequence.md) — deferred Streamflow/Jupiter Lock and other candidates on the guided page.
- [Issuer reader contract](../spec/issuer-readers-v1.md) and [public source schemas](../planning/research/issuer-reader-source-contracts-2026-09-17.md) — typed observation boundaries, exact identity checks, source revisions and incomplete-history handling.
- [AMM feasibility](../planning/research/claim-amm-feasibility.md), [acceptance review](../planning/amm-review.md), [public receipt](../planning/evidence/amm-devnet-roundtrip-2026-09-17.json) and [local captured-bytecode receipt](../packages/amm-integration/evidence/local-captured-raydium-receipt-2026-09-17.json) — exact execution boundaries, identities and residual accounting. The public proof has 15 finalized transactions; the local proof has 14.
- [Test USDC acceptance](../planning/usdc-demo-review.md), [browser journey](../planning/evidence/guided-usdc-browser-2026-09-17.json), [runtime receipt](../planning/evidence/guided-usdc-receipt-2026-09-17.json) and [independent chain verification](../planning/evidence/guided-usdc-chain-verification-2026-09-17.json) — runtime v2 completes nine actions and 36 confirmed local transactions with a captured Circle devnet USDC mint account, synthetic local 10 + 1 Test USDC funding, 4 / 6 / 1 market amounts, four synthetic annual events, separate redemption and exact residual backing. The separate [public Circle-USDC receipt](../planning/evidence/amm-usdc-devnet-roundtrip-2026-09-17.json) has 14 finalized transactions and [independent RPC verification](../planning/evidence/amm-usdc-devnet-verification-2026-09-17.json).
- [Preserved generic-quote acceptance](../planning/guided-demo-review.md), [browser journey](../planning/evidence/guided-demo-browser-2026-09-17.json) and [independent chain verification](../planning/evidence/guided-demo-chain-verification-2026-09-17.json) — historical v1 evidence for the earlier 37-transaction flow. The verifier supports both v1 and v2 receipts, and the AMM CLI retains its original mock quote as the default.
- [Annual dividend research](../planning/research/annual-dividend-series.md) — exchange period/ex-date conventions, revisions and actual fixture gaps.
- [Prior-art decision review](../planning/research/prior-art-review.md) — dated single-event architecture review with reusable lessons; annual specifications supersede its term design.
- [Wallet acceptance](../planning/wallet-review.md) and [three-profile transaction evidence](../planning/evidence/wallet-runtime-smoke-2026-09-17.json) — actual local SBF lifecycle, transfers and redemption; not public consensus or a live issuer feed.
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
