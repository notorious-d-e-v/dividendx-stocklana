# Phase-one design QA

Verified 16 September 2026 against `design/index.html`.

After user review, headline line spacing was increased slightly. The preview script passed again and regenerated all three PNGs; the updated opening headline and pitch specimen were visually checked. Copy remains unchanged pending the later simplification pass.

## Render evidence

| View | Viewport | Result |
|---|---:|---|
| Desktop app | 1440 × 1100 | No horizontal overflow; source/evidence and calculator hierarchy inspected |
| Mobile app | 390 × 1600 | No horizontal overflow; header, nav, labels, links, field, and claim amounts wrap cleanly |
| Pitch specimen | 1600 × 900 | True 16:9 render; title, subline, legend, and edge accent remain inside the frame |

Screenshots:

- `design/previews/desktop-app.png`
- `design/previews/mobile-app.png`
- `design/previews/pitch-specimen.png`

The final PNGs were regenerated after copy and mobile-width fixes and visually inspected at native resolution.

## Interaction and arithmetic

`design/render-previews.cjs` loads the actual prototype in Chromium, rejects horizontal overflow, verifies the default display, drives zero/fractional/invalid inputs, checks stale-output clearing, exercises right-arrow tab navigation, and then captures the final views.

| Case | Verified result |
|---|---|
| Default `100` displayed KOx before event | Raw Q `9,819,982,084`; PT `100.0000`; DR `0.4152` |
| Zero | PT `0.0000`; DR `0.0000`; exact reconciliation |
| Fractional `12.34567890` | Raw Q `1,212,343,456`; PT `12.3457`; DR `0.0513` |
| More than 8 decimals | Field becomes invalid and every previous result changes to an em dash |
| Audited raw fixture Q `10,000,000,000` | Raw PT `9,958,649,592`; raw DR `41,350,408`; exact conservation |

The calculator parses decimal input to `BigInt`, converts displayed pre-event units with `floor(amount × 10^8 / M0)`, and applies `DR = floor(Q × (M1 − M0) / M1)` and `PT = Q − DR`. Full-value rounding handles carries before separating whole and fractional display digits.

## Accessibility checks

- Normal text contrast: ink/surface `17.74:1`; muted/surface `6.40:1`; stock ink/stock soft `8.36:1`; dividend ink/dividend soft `7.28:1`.
- White on stock blue is `5.59:1`; dark ink on amber is `4.93:1`.
- Every control has a visible `:focus-visible` ring. Tabs implement Left/Right/Home/End keyboard behavior and roving `tabindex`.
- The amount field exposes `aria-invalid`, error copy uses `role="alert"`, and calculated results update through an `aria-live` region.
- Color is paired with labels, shape, and text. Touch controls are at least 40 px high; primary mobile navigation is 48 px high.

## Boundaries

This is an offline visual prototype. The event is a dated cached snapshot, links open source pages, and no wallet, quote, transaction, receipt, APY, price, fee, inventory, liquidity, or historical holding is fabricated. The Market/Split/Position navigation and calculator work; execution controls are explicitly disabled. The presentation artifact is an HTML specimen only.

## Reproduce

From the project root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/design/index.html`. App-only and slide capture routes are `?capture=app` and `?capture=slide`.

To rerun visual and interaction checks with the bundled runtime:

```sh
/Users/node/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node design/render-previews.cjs
```
