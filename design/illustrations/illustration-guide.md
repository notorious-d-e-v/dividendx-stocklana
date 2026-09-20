# DividendX illustration guide

Version 1, 16 September 2026. This guide extends the approved DividendX design system. It governs illustrations for product explanation, pitch material, onboarding, and editorial communication; it does not redefine product diagrams or interface components.

## Brand idea: Paper instruments, digital ownership

DividendX makes an abstract ownership split tangible. Printed financial matter—certificates, detachable coupons, ledger pages, custody trays—gives the viewer something familiar to hold in mind. Restrained wallets and trading-app windows connect that physical metaphor to digital ownership. Stock exposure is blue; dividend rights are amber; ink and warm paper provide quiet structure.

Four principles keep the system coherent:

1. **Make the entitlement legible.** Each picture should explain one ownership idea before it decorates a layout.
2. **Use tactile objects, sparingly.** Flat fills, slight hand-ink variation, and paper grain inside objects create warmth. The result remains precise financial editorial art, not nostalgia or cartoon clip art.
3. **Let labels carry exact meaning.** Color reinforces named concepts. Illustration never substitutes for exact values, transaction sequence, issuer identity, or status.
4. **Leave room to think.** Bold silhouettes, few objects, and generous negative space survive small placements and sit calmly beside type.

## Choose the right visual form

Ask what the visual must do.

- Does it express a single conceptual metaphor, such as a dividend right separating from stock exposure? Use an **illustration**.
- Does it help someone find, identify, or operate a control at small size? Use a **functional icon** from the product icon system.
- Does it show exact order, values, ratios, labels, accounting, or a transaction path? Build an **editable financial diagram** with native type, lines, and components.

If the answer includes both concept and exact mechanics, separate them: use an illustration as the editorial lead and place the accurate diagram beside or after it. Never ask a raster image to behave like a chart. At 64 px, replace a complex scene such as dividend-claim composability with a functional icon; do not shrink the whole PNG until its meaning disappears.

## Visual recipe

Build compact object groups from sturdy planar shapes. Certificates and ledger sheets use softened rectangles with clipped, perforated, folded, or tabbed edges. Wallets and app windows can be rounder, but should retain a clear paper-instrument relationship. Avoid perfect geometric sterility: a subtly irregular outline or offset ink edge is enough.

At a nominal 320 px optical width, target 2–3 px outer outlines and 1–1.5 px internal rules. These are optical targets for new art, not measurements of existing PNGs. Keep inner detail sparse and never depend on micro-detail for recognition. Use a gentle 5–12° tilt, front or restrained three-quarter perspective, shallow overlaps, and minimal cast shadow. A concept illustration normally has one to three primary objects; a scene may use four. Preserve a visible gap when separation is the idea.

Use crisp, slightly imperfect ink contours; flat fills; and low-contrast paper grain contained within objects. Do not put grain across the full canvas or transparency. Avoid glossy 3D, photorealism, gradients, dramatic perspective, heavy shadow, and plastic-looking highlights.

## Palette and semantic color

Use the shared values in `packages/design-tokens/tokens.css` and `tokens.json`; do not create a parallel palette.

| Role | Token | Value | Illustration use |
|---|---|---:|---|
| Canvas | `--dx-canvas` | `#F6F3EC` | Approved default background |
| Surface | `--dx-surface` | `#FFFEFB` | Paper and light-panel background |
| Ink | `--dx-ink` | `#101820` | Outlines and structural detail |
| Muted ink | `--dx-ink-muted` | `#53606B` | Secondary native captions, rarely raster detail |
| Stock | `--dx-stock` | `#2457F5` | Stock exposure when the object carries that meaning |
| Stock soft | `--dx-stock-soft` | `#E9EEFF` | Supporting blue paper plane |
| Dividend | `--dx-dividend` | `#C46A00` | Dividend right when named in nearby copy |
| Dividend soft | `--dx-dividend-soft` | `#FFF0D2` | Supporting amber paper plane |
| Structure | `--dx-line` | `#D7D2C8` | Native layout rules, not a required raster color |

The original slide anchors use approximate pale colors `#EAF0FF` and `#F8E8D4`. They are legacy characteristics of existing artwork. Do not recolor those originals; use the canonical soft tokens for new work.

Blue and amber are semantic only when the surrounding copy names Stock exposure (PT) and Dividend rights (DR). A blue wallet may be a compositional choice and does not encode a balance. Green and red belong to UI status outside the art. Illustration alone cannot establish accessible contrast; test the final composition and provide labels.

## Scale tiers

- **Spot, 64–128 px:** one object, bold silhouette, minimal or no texture, at most one internal cue. Suitable for an editorial empty state or section marker.
- **Concept, 240–420 px:** one to three objects, one metaphor, visible separation, restrained texture. This is the default tier.
- **Scene, 420–640 px:** up to four primary objects, one clear focal object, more negative space and careful overlap. Use for composability or custody relationships.

Each asset should have one intended tier. If it cannot be understood at the placement size without a caption, simplify or choose another visual form.

## Metaphor dictionary

Treat these as semantic contracts.

- **Certificate:** stock exposure. It may suggest a claim, but never a specific issuer unless native copy names one.
- **Detachable coupon:** one event’s Dividend rights entitlement. It is not guaranteed cash or a recurring income stream.
- **Annual claim slip:** a separated amber paper instrument can represent a fixed-term DR when nearby native copy explicitly says “annual dividend rights” or names the selected year. Do not draw a fixed number of coupons as a promise of future payments. The [wallet hero study v2](prompts/stock-dividend-separation-v2.md) uses this annual meaning; older event artwork retains its original context.
- **Disconnected gap:** separable ownership. It must not imply withdrawal, failure, or a broken transaction.
- **Custody tray:** collateral identity and separation. Multiple issuer or mint trays remain visibly distinct; never merge them into a shared pool.
- **Fractions:** divisibility or participation at smaller size, not a numerical allocation. Exact proportions belong in a native diagram.
- **Wallet, ledger, or app window:** a conceptual touchpoint. Its appearance does not claim an integration is complete.
- **Decorative seal:** printed-matter character. It is not an audit badge, verification mark, or certification.

### Composability rule

Match the subject to the scope of the claim. Before deposit, a compatible app may use the original stock token. After DividendX splits the position, Stock exposure (PT) and Dividend rights (DR) are separate claims that can each be used by compatible wallets and trading apps. Whole-product composability artwork must show both PT and DR independently; narrower DR-only artwork must be named **Dividend-claim composability**.

These are conceptual relationships, not claims that a pictured integration is implemented. The underlying stock remains locked as backing in the vault: the claims can move or connect independently, while the backing is not freely reused or double pledged. Do not add partner logos or invent lending support.

The incidental leaf on the existing `claim-composability.png` is not a brand logo. Do not repeat it as a seedling motif; repeated growth imagery can imply guaranteed appreciation.

Avoid dollar coins, crypto coins, rockets, upward performance charts, piggy banks, money rain, characters or mascots. Do not use a bank vault or safe: it can imply insured custody. Avoid checkmark seals and official-looking crests.

## Composition, backgrounds, and layouts

Warm canvas is the approved default. White is acceptable inside product surfaces. Maintain clear space around the illustrated group of roughly 12% of its optical width; increase it when type sits nearby. Keep important forms away from the outer 8% so crops remain safe. Align the visual mass to the adjacent headline rather than mechanically centering a transparent square.

Dark ink backgrounds are a contrast proof, not the default. Transparent pixels do not guarantee visible edges: pale paper, amber, and ink outlines can disappear or muddy. Test the actual asset. If any boundary is unclear, place it on a warm or white light panel instead of adding a glow.

Do not bake words, logos, numbers, issuer marks, or exact values into raster art. Use native, editable labels and captions. Thin connectors may suggest a conceptual relationship. Arrows imply direction or transaction; when direction must be accurate, draw the connector natively and keep it editable.

## Usage

| Context | Recommended use | Restraint |
|---|---|---|
| Pitch deck | Concept or scene beside a short claim | Two illustrations across nine slides is a useful pacing example, not a fixed law |
| Frontend onboarding | One concept image followed by native explanation | Do not imply wallet, custody, or trading support that is unavailable |
| Explanation page | Illustration introduces the model; editable diagram handles mechanics | Never encode ratios in illustrated object size |
| Empty state | Small spot only when it clarifies the absence | Prefer status component and text for pending, failed, or rejected transactions |
| Editorial/social | One strong metaphor with native headline | Preserve naming and avoid performance cues |

## Motion

Motion is optional decoration. Use one-shot fade and 4–8 px translate over 200–320 ms when an illustration enters. A coupon may settle apart from its certificate once; related objects may fade in with a short stagger. Respect `prefers-reduced-motion`, do not autoplay a loop, and never animate a fake transaction, filling balance, rising chart, or progress indicator. Any financial state change belongs to the interface and its data.

## Production and delivery

Name canonical files by subject and version: `stock-dividend-coupon-v1.png`, `issuer-separated-custody-v1.png`. Keep a stable subject slug; increment the version only for a meaningful visual revision. The canonical generated deliverable is a true transparent PNG with no baked checkerboard. Existing PNGs are raster, not editable vectors.

Proposed delivery budgets are 80–180 KB for a spot and no more than 350 KB for a scene after derivative compression. The current source PNGs may exceed these budgets. Preserve the canonical PNG and create WebP or AVIF derivatives for production; record dimensions and checksums. Do not wrap a bitmap in SVG or auto-trace grain. Future layered motion requires deliberately redrawn manual vector art with purposeful layers; generated rasters do not promise separable animation layers.

## Accessibility and captions

Write alt text for the idea the image contributes, not every decorative mark. Example: “Blue stock certificate with a small amber dividend coupon detached by a narrow gap.” For the DR-only scene: “Amber dividend coupon connected conceptually to a wallet, public ledger, and trading app.” For whole-product composability: “Blue stock certificate and amber dividend coupon independently connected to a wallet and trading app.” If adjacent text already explains the same idea, use `alt=""` and let the caption carry the meaning. Keep labels, exact flows, and values as native text. Do not claim an illustration meets contrast requirements from palette values alone; verify it in context.

## Prompt system and generation workflow

Start every generation request with the master style brief:

> Original DividendX financial editorial illustration in the “Paper instruments, digital ownership” system. Tactile printed matter and restrained digital objects; crisp slightly imperfect ink outlines; flat fills; low-contrast paper grain inside objects only; gentle front or three-quarter perspective; ample negative space. Canonical ink, cobalt, amber, warm paper, soft blue and soft amber palette. No readable text, logos, numbers, performance imagery, coins, characters, glossy 3D, gradients, or photorealism. Genuine transparent background.

Then provide: intended audience; one metaphor; concept to communicate; implications the art must avoid; scale tier and display size; background; primary objects; semantic colors; and the exact reference assets attached. State that token colors are targets that raster generation may only approximate.

When the topic is the whole DividendX product, explicitly request both PT and DR as independent app-facing assets after the split. Name any narrower DR-only request accordingly. Keep the locked backing in the vault and prohibit double-pledge, invented lending, partner marks, and claims of live integration.

Use this task block after the master brief:

```text
Audience / placement:
Metaphor and single concept:
Primary objects (maximum by tier):
Stock / dividend color roles:
Forbidden implications for this subject:
Tier, optical width and safe area:
Backgrounds to test:
Exact reference attachments and what to borrow:
Output: transparent PNG, subject-version filename
```

Use this workflow:

1. Inspect the current guide and asset library. If the generation tool supports visual references, attach both approved anchors and state exactly what to borrow. A reference helps consistency but does not guarantee it.
2. Vary the subject and composition while preserving the vocabulary. Do not ask the model to reproduce an anchor.
3. Inspect image mode and channels, then alpha, crop, silhouette, palette, unintended symbols, semantic implications, and readability at intended size. A pictured checkerboard in RGB is not transparency; confirm the file contains non-opaque alpha values. If background-removal edits keep baking the checkerboard, reject them and regenerate from the text brief.
4. Test on warm canvas, white, and ink. Prefer a light panel when dark contrast is weak.
5. Record the prompt, file path, size, checksum, status, and review notes. Generation can support consistency, but cannot guarantee it.

Use [the local reference page](index.html) for visual inspection, downloads, and placement checks. The compact [agent brief](agent-brief.md), [QA checklist](qa.md), [final extension prompts](prompts/final-prompts-v1.md), [both-sides composability prompt](prompts/stock-and-dividend-composability-v1.md), and [asset manifest](assets/manifest.json) translate this guide into repeatable production steps.
