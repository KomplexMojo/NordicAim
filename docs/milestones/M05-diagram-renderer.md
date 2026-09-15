# M05: Diagram renderer

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M03 | low | M | groups-moa (derived diagram export) |

## Goal
Pure SVG renderers for both templates in `full` (1500×1700) and `cell` (720×720) variants, matching the owner's
example diagrams, plus PNG rasterisation on the phone and a Node sample script.

## Read first
- `docs/spec/rendering-composite.md` §1–§4
- Look at `docs/reference/example-diagram-sighting.png` and `example-diagram-precision.png`

## In scope
`src/lib/render/*` (pure), `rasterize-browser.ts`, `scripts/render-samples.ts`, diagnostics row `diagram-raster`.

## Out of scope
Composite (M13), storing diagrams (M10), UI.

## Files
- `src/lib/render/palette.ts`, `svg.ts` (`el`, `text`, `escapeXml`, `num` = max 2 dp, no trailing zeros), `fonts.ts` (the system font stack constant)
- `src/lib/render/diagram-sighting.ts`, `diagram-precision.ts`, `diagram.ts` (`renderDiagramSvg`), `footer-lines.ts`
  (`sightingFooterLines`, `precisionFooterLines`, `cellCaption`)
- `src/lib/render/rasterize-browser.ts` (`svgToPng`, exported as `browserRenderTools: RenderTools`)
- `scripts/render-samples.ts` + script `"render:samples": "tsx scripts/render-samples.ts"`
- `docs/reference/generated/sample-{sighting,precision}-{full,cell}.png` (committed output)
- `src/lib/diagnostics/checks-browser.ts`: add `diagram-raster`
- `tests/unit/render/*.test.ts`

## Steps
1. SVG helpers; all numeric attributes go through `num()`, so snapshots are stable.
2. Implement §3 (full) and §4 (cell) exactly, with the line builders as separate pure functions.
3. `rasterize-browser.ts` per §2 (object URL path, data URL fallback on `SecurityError`).
4. `scripts/render-samples.ts`: for each `sample-shots-*.json`, run `analyzeTarget`, then render full and cell with
   `captureLocal` `2026-09-05T16:56:03` (precision) or `2026-08-24T19:30:09` (sighting), lighting `daylight`,
   `clickValueMm` null, `holeDiameterMm` 5.6. Rasterise with resvg (`loadSystemFonts: true`) to `docs/reference/generated/`.
5. Diagnostics `diagram-raster`: render the precision fixture's full SVG → `svgToPng` → decode → pass if 1500×1700.

## Tests
- Golden text checks (§3) for both fixtures.
- Structure: precision full has 9 `class="shot"` and 11 `class="results-row"`; sighting full has 7 `shot`; the ellipse has `rotate(-`.
- Snapshots of all four SVGs.
- Position `both` shows the prone/standing legend; single position doesn't. The precision cell has no `ring-label`.
- Every SVG starts with `<svg xmlns="http://www.w3.org/2000/svg"` and has `width`, `height`, and `viewBox`.
- E2E (both projects): diagnostics `diagram-raster` pass.

## Acceptance
```bash
pnpm check
pnpm render:samples
pnpm test:e2e
```
Compare the generated PNGs with the example PNGs (same layout regions). Note differences in Completion notes.

## Pitfalls
- SVG y grows downward: `Y = cy - yMm*s`.
- Escape user text (`escapeXml`).
- No `<foreignObject>`, no external `href`s, no web fonts (these break canvas rasterisation on iOS).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
