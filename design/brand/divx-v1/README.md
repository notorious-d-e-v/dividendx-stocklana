# DivX logo set v1

Created 25 September 2026 from the existing DivX design system. The approved second design uses two full, solid shapes with no chipped rectangle or detached shard. The two separated shapes carry the established stock-exposure blue and dividend-rights amber, paired with a heavy, tightly spaced DivX wordmark.

Asset directory: [`apps/web/public/brand/divx/v1/`](../../../apps/web/public/brand/divx/v1/).

## Files

| File | Intended use | Background |
| --- | --- | --- |
| `divx-square.png` | Colosseum project graphic, profile tile, cover | Warm paper, opaque |
| `divx-primary.png` | Website header, presentations, light surfaces | Transparent |
| `divx-dark.png` | Dark covers, presentation title pages | Dark ink, opaque |
| `divx-icon.png` | Avatar or standalone brand mark | Transparent |
| `divx-monochrome.png` | Single-color visual applications on light surfaces | Transparent |

The square and icon exports are 1254 x 1254. Horizontal exports are 2138 x 736. All files are PNG and under 1 MB. The square tile meets Colosseum's displayed 20 MB input limit; its platform may compress the upload further.

## Brand targets

- Stock exposure: cobalt `#2457F5`
- Dividend rights: amber `#C46A00`
- Ink: `#101820`
- Warm canvas: `#F6F3EC`
- Light surface: `#FFFEFB`
- Wordmark spelling: **DivX**

Color values are the generation targets. These AI-generated raster files contain slight color and edge variation; they are not exact-color, editable vector masters. Keep the originals for normal digital uses. Small favicon sizes and exact production vector work require separate optical refinement.

## Use

For the Colosseum Media and code form, upload **divx-square.png**. Use the transparent primary logo on warm or white backgrounds. Use the supplied opaque dark export on dark presentation surfaces. Preserve the aspect ratio and leave at least a quarter of the mark's height as clear space. Do not stretch, add effects, or swap the blue and amber roles.

The icon expresses two separable claims; its relative areas do not encode financial value or allocation ratios.

## Provenance and review

Generated with the built-in `image_gen` tool. The user requested GPT Image 2.5, but this tool exposes neither a model selector nor a backend model ID, so use of that specific model cannot be confirmed. No CLI/API image call was used.

`prompts.json` contains the original prompt, master refinement, and variant prompts. `dark-variant-prompt.txt` contains the correction used for the final opaque dark version. The first transparent reverse variant had rendering defects and is intentionally excluded from this delivered set.

The master, icon, and monochrome files were checked for an alpha channel containing both fully transparent and fully opaque pixels. The square and dark files are opaque RGB. Each final output was visually inspected for wordmark spelling, two-part symbol structure, placement, and major rendering defects. `manifest.json` records dimensions, sizes, repository paths, and checksums.

Brand sources:

- `design/design-system.md`
- `design/illustrations/illustration-guide.md`
- `packages/design-tokens/tokens.json`

The five original PNG files live in `apps/web/public/brand/divx/v1/`. Website branding uses the primary and icon assets. Colosseum upload remains a separate action.
