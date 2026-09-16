# Illustration agent brief

Use this file for future DividendX illustration work. It is a scoped production brief, not an installed skill or project-wide policy.

## Read first

1. `design/illustrations/illustration-guide.md`
2. `design/design-system.md`
3. `packages/design-tokens/tokens.css`
4. `presentation/assets/illustrated-v1/README.md`, `prompts.md`, and `manifest.json`
5. `design/illustrations/assets/manifest.json` and `design/illustrations/prompts/final-prompts-v1.md`
6. Any task-specific prompt or production note

When the generation tool supports visual references, attach the approved anchors `stock-dividend-coupon.png` and `claim-composability.png`. Use them to preserve the “Paper instruments, digital ownership” family while varying the subject and composition; never promise that references guarantee consistency. If an alpha-repair edit bakes a checkerboard, reject it and regenerate from the text brief.

## Immutable constraints

- Use canonical token colors for new work; do not recolor existing anchors.
- Keep Stock exposure blue and Dividend rights amber, and name both in adjacent native copy.
- Use flat fills, slightly imperfect ink outlines, restrained perspective, object-contained grain, and ample transparent space.
- No baked text, logos, numbers, issuer marks, exact flows, or fake UI.
- No performance imagery, dollar/crypto coins, money tropes, characters, audit-like seals, shared custody pools, or implied completed integrations.
- A gap means separable ownership. Fractions do not represent exact allocation. Wallet, ledger, and app objects are conceptual.
- Match composability art to its scope. Before deposit, compatible apps may use the original stock token. After the split, whole-product art shows both Stock exposure (PT) and Dividend rights (DR) independently used by compatible wallets or apps; name narrower DR-only art **Dividend-claim composability**.
- Composability is conceptual, not evidence of implemented integrations. The underlying stock remains locked as backing in the vault; do not imply that it can be freely reused or double pledged, and do not invent lending support or partner logos.
- Output genuine transparent PNG. Do not fake alpha, wrap the bitmap as SVG, or promise editable/generated layers.

## Required output and evidence

Provide the canonical PNG with subject-version filename, exact prompt, intended tier and display size, source references, dimensions, byte size, image mode/channels, SHA-256, and accessibility alt suggestion. Verify non-opaque alpha values; a checkerboard drawn into RGB pixels is not transparency. Inspect the image at intended size on warm canvas, white, and ink; state actual issues rather than assumed compliance. Run `design/illustrations/render-previews.cjs` after the library page is updated and report desktop/mobile overflow, asset load, keyboard, and asset-lab results. Use `qa.md` for human review.
