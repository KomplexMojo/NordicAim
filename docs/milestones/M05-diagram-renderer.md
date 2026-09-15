# M05: Diagram renderer

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M03 | low | M | generate analysis (diagrams) |

## Goal
Pure SVG renderers that show the **scoring** results for both templates in `full` (1500×1700) and `cell` (720×720) variants,
matching the owner's example diagrams. Also headline and metric text builders for result cards, PNG rasterisation on the phone,
and a Node sample script.

## Read first
- `docs/spec/rendering-composite.md` §1–§4
- Look at `docs/reference/example-diagram-sighting.png` and `example-diagram-precision.png`

## In scope
`src/lib/render/*` (pure), `rasterize-browser.ts`, `scripts/render-samples.ts`, diagnostics row `diagram-raster`.

## Out of scope
The summary image (M14), storing diagrams (M12), UI.

## Files
- `src/lib/render/palette.ts`, `svg.ts` (`el`, `text`, `escapeXml`, `num`), `fonts.ts` (system font stack)
- `src/lib/render/diagram-sighting.ts`, `diagram-precision.ts`, `diagram.ts` (`renderDiagramSvg`)
- `src/lib/render/text-lines.ts` (`sightingFooterLines`, `precisionFooterLines`, `cellCaption`, `targetHeadline`)
- `src/lib/render/rasterize-browser.ts` (`svgToPng`, `browserRenderTools`)
- `scripts/render-samples.ts` + `"render:samples": "tsx scripts/render-samples.ts"`
- `docs/reference/generated/sample-{sighting,precision}-{full,cell}.png` (committed)
- `src/lib/diagnostics/checks-browser.ts`: add `diagram-raster`
- `tests/unit/render/*.test.ts`

## Steps
1. SVG helpers; all numeric attributes go through `num()`.
2. Implement §3 and §4 exactly; the line builders are separate pure functions.
3. `targetHeadline(result)`:
   - precision `72 / 100 · X 1`, or `<pess>–<opt> / <max> · X <x>` when missing > 0
   - sighting `<hits>/<declared> hits @ <45|115> mm`, or `<pessHits>–<optHits>/<declared> hits @ …` when missing > 0
   - both: `Prone <headline> · Standing <headline>`.
4. `rasterize-browser.ts` per §2.
5. `render-samples.ts`: run `analyzeTarget` on each `sample-shots-*.json` → render full and cell (captureLocal from the sidecars,
   lighting `daylight`, holeDiameterMm 5.6) → resvg → `docs/reference/generated/`.
6. Diagnostics `diagram-raster`: precision fixture full SVG → `svgToPng` → decoded 1500×1700 → pass.

## Tests
- Golden text checks (§3).
- Structure: precision full has 9 `shot` and 11 `results-row`; sighting full has 7 `shot`; the ellipse has `rotate(-`.
- Snapshots of the four SVGs; `both` legend present only for `both`; no `ring-label` in the precision cell; SVG root attributes present.
- `targetHeadline`: precision fixture → `72 / 100 · X 1`; sighting fixture (prone) → `9/10 hits @ 45 mm`; precision with P8
  multiplicity 1 → `71–76 / 100 · X 1`.
- E2E: diagnostics `diagram-raster` pass.

## Acceptance
```bash
pnpm check
pnpm render:samples
pnpm test:e2e
```
Compare the generated PNGs with the example PNGs; note differences in Completion notes.

## Pitfalls
- `Y = cy - yMm*s`.
- Escape user text.
- No `<foreignObject>`, external hrefs, or web fonts.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
