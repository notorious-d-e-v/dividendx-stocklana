# Illustration QA

Run this review on every canonical asset and again in its final layout.

## Human and agent checklist

- [ ] One concept reads before decorative detail.
- [ ] Scale tier is named; silhouette remains legible at intended width.
- [ ] No more than three primary objects for a concept or four for a scene.
- [ ] Stock exposure and Dividend rights use blue/amber only with native labels nearby.
- [ ] Gap, custody, fractions, wallet, ledger, and app metaphors match their semantic contracts.
- [ ] Whole-product composability shows PT and DR independently; narrower DR-only art is named Dividend-claim composability.
- [ ] Composability is framed as conceptual compatibility, with no invented integration, lending, partner, free-reuse, or double-pledge claim.
- [ ] No baked text, numbers, logos, issuer marks, exact arrows, or misleading ratios.
- [ ] No money/performance tropes, characters, audit badges, insured-custody cues, or repeated seedling motif.
- [ ] Palette visually follows shared tokens; any raster approximation is recorded.
- [ ] Outlines, contained grain, perspective, crop, and clear space match the guide.
- [ ] File channels were inspected: alpha is genuine (RGBA or equivalent with non-opaque pixels); a pictured checkerboard is ordinary RGB and fails. No white halo or clipped object.
- [ ] Warm, white, and ink backgrounds were checked; weak dark contrast uses a light panel.
- [ ] Alt text or decorative `alt=""` is chosen from page context.
- [ ] Filename, prompt, dimensions, bytes, checksum, status, and review notes are recorded.
- [ ] Production derivatives meet proposed budget or document why they do not.

## Paired negative examples

**Use:** detached coupon with a visible narrow gap. **Avoid:** torn paper drifting away like a failed withdrawal.

**Use:** distinct labeled custody trays. **Avoid:** one pooled container implying shared collateral.

**Use:** a few unequal pieces to suggest divisibility. **Avoid:** slices whose areas appear to encode exact allocation.

**Use:** conceptual wallet, ledger, and app silhouettes. **Avoid:** realistic product screens or connector arrows that imply live integration.

**Use:** PT and DR independently connected to neutral app-facing objects for a whole-product claim. **Avoid:** showing only DR while calling it general composability, or implying the locked stock backing is reused.

**Use:** warm paper and a restrained decorative seal. **Avoid:** a checkmark crest that reads as audit certification.

**Use:** a light panel when ink-background edges disappear. **Avoid:** glow, drop shadow, or an assumption that transparency creates contrast.

## Current implementation check — 16 September 2026

The previous implementation run passed with all four then-current assets decoded, no horizontal overflow at 1440 px or 390 px, working asset/background/width controls, responsive requested-versus-rendered width reporting, and verified keyboard order. Desktop hero, mobile hero, system, construction, full library, and a 480 px ink-background lab capture were inspected in `design/illustrations/previews/`; no clipping or layout defect remained. Run `node design/illustrations/render-previews.cjs` again after adding or changing an asset and record the current result below.

The extension manifest records genuine RGBA with alpha extrema 0–255 for both earlier studies. The canonical custody PNG (1,017,870 bytes) and fractional PNG (687,242 bytes) exceed the proposed production derivative budgets; no compressed delivery derivatives are claimed. The custody study’s certificate borders are too intricate for a compact derivative and must be simplified if one is produced. On ink, the DR-only composability scene remains readable at 480 px, but its thin connectors need a light panel at smaller placements.

The 16 September 2026 composability extension run passed with all five assets decoded, no horizontal overflow at 1440 px or 390 px, working asset/background/width controls, responsive requested-versus-rendered width reporting, and verified keyboard order. The new full-width entry was inspected at desktop and mobile widths, and its warm-background lab state was inspected at 480 px. The canonical both-sides PNG is genuine RGBA at 1448 × 1086 and 981,235 bytes, so it exceeds the proposed 350 KB scene derivative budget; no compressed derivative is claimed. Its thin connectors favor the approved warm or white light background over ink.
