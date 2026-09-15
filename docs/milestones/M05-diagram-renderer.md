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
None blocking. A few undocumented visual details were filled in with a reasonable, low-stakes choice
since `rendering-composite.md` §3-§4 doesn't pin them and no test vector constrains them:

- **Centre dot** (§3 item 5, sighting): "centre dot r 0.6 mm" has no stated fill/stroke. Rendered as a
  hollow circle (`stroke: accent`, `fill: none`, width 1) to match the small ring visible at that spot
  in `example-diagram-sighting.png`.
- **Legend icons** (§3 item 4, sighting): "45 mm prone zone" / "115 mm standing zone" text has icon
  x-positions but no icon shape spec. Rendered as simple circles (hollow white / filled dark) rather
  than the reference image's more detailed nested-ring glyph.
- **"both" legend dots** (§3 item 4 / §4): exact spacing/labels for the "prone and standing colour dots
  with labels at x 1200" aren't pinned beyond the x position. Rendered as two dot+label pairs ("Prone",
  "Standing") on one line at y 152, wrapped in `<g class="legend-both">` so its presence is testable.
- **Cell chip without a slot** (§4): `renderDiagramSvg`'s `slotLabel` is optional (only meaningful for
  M14's composite rows). When omitted, the chip reads `<TEMPLATE> · <POSITION>` (slot segment dropped)
  rather than inventing a placeholder slot value.
- **In-target "115 mm"/"45 mm" labels**: resolved by owner decision REV-22 (2026-09-15). The spec now
  places them (§3 item 5, class `zone-label`, full variant only) and they are rendered.
- **Shot marker size**: resolved by REV-22. True-size (5.6 mm) markers overlapped in tight groups and hid
  the `x<k>`/MPI labels, so shots are now fixed display dots (full r 8, cell r 5; ×1.25 for multiplicity).
- **Label contrast**: resolved by REV-23. `x<k>` and "MPI" labels were nearly invisible on the black precision
  disc; they now carry a white outline (`paint-order="stroke"`), via the new `outline` option of `text()`.
- **Label overlap**: resolved by REV-24. Labels are placed by `src/lib/render/label-placement.ts` (spec §3 item 11) so they
  don't sit on shots, the MPI marker or each other; `tests/unit/render/label-placement.test.ts` checks this on all four
  golden diagrams.

None of these affect the data-bearing text (headlines, footer lines, golden-check substrings), which
follow the spec's literal formats exactly and are covered by tests.

## Completion notes
Implemented all files under `src/lib/render/*` (`palette.ts`, `fonts.ts`, `svg.ts`, `diagram-shared.ts`
— an internal helper module factoring out the layout pieces identical between the two templates: page
background, title/subtitle, "both" legend dots, shot circles, group ellipse, MPI marker, footer panel,
and the cell chip/caption band — `diagram-sighting.ts`, `diagram-precision.ts`, `diagram.ts`,
`text-lines.ts`, `rasterize-browser.ts`, `label-placement.ts` (REV-24 collision-avoiding label
placement), `scripts/render-samples.ts` (+ `pnpm render:samples`), the `diagram-raster` diagnostic in
`src/lib/diagnostics/checks-browser.ts` (added to the E2E check-id list in `tests/e2e/smoke.spec.ts`),
and `tests/unit/render/{svg,text-lines,diagram,label-placement}.test.ts`.

Two small config changes were needed and are in scope for this milestone: `tsconfig.app.json` gained
`resolveJsonModule: true` so `checks-browser.ts` can import the precision golden fixture directly via
the already-configured `@fixtures/*` alias (which was otherwise unused anywhere in `src/`), and
`package.json` gained the `render:samples` script. `scripts/render-samples.ts` is intentionally not
added to any tsconfig project's `include` (it isn't referenced by `tsconfig.node.json`'s existing
project-reference graph and doing so risked `tsc -b` project-boundary errors); it's still exercised
directly by `pnpm render:samples`, which the Acceptance section runs.

Commands run (all pass):
- `pnpm typecheck` — clean.
- `pnpm lint` — 0 errors, 4 pre-existing warnings unrelated to this milestone (shadcn `ui/*` fast-refresh
  warnings, one stale `eslint-disable` in `src/lib/cv/opencv.ts`).
- `pnpm test` — 244/244 passed (31 files), including the 4 `tests/unit/render/*.test.ts` files
  (golden text checks, structure counts, the 4 SVG snapshots, and `label-placement.test.ts` for REV-24).
- `pnpm check:privacy` — passed (11 images, including the 4 newly generated sample PNGs — resvg output
  carries no EXIF at all, so no GPS).
- `pnpm render:samples` — wrote `docs/reference/generated/sample-{sighting,precision}-{full,cell}.png`.
- `pnpm test:e2e` — 4/4 passed (mobile-chromium + mobile-webkit), including `diagnostics page runs every
  check` which asserts `diagram-raster` is visible and `data-status="pass"`.

PNG comparison against `docs/reference/example-diagram-{sighting,precision}.png`: layout, target
geometry, ring/zone proportions, RESULTS panel, and footer panel all line up closely (verified visually
side by side). Differences, all deliberate and spec-driven rather than bugs:
- Subtitle and MPI-offset footer line show the real computed values (`Prone · 10 rounds · 2026-09-05
  16:56 · Daylight`, `MPI offset: 14.5 mm L · 18.6 mm D (1.00 / 1.28 MOA)`) instead of the reference
  mockup's descriptive placeholder text ("Sample derived analysis…", "high-right of geometric
  center…") — the spec (§3 items 3 and 10) defines these as numeric/templated fields, not free text.
- Legend icons remain simple circles rather than the reference's nested-ring glyph (Open questions);
  the in-target "115 mm"/"45 mm" labels themselves are now rendered per REV-22.
- Shot markers are fixed-size display dots (not true 5.6 mm hole size) and `x<k>`/MPI labels carry a
  white outline and are placed clear of shots, per REV-22/23/24 — visible as a layout difference from
  the reference mockup's true-size, unoutlined markers.

No deviations from the spec's numeric layout (coordinates, radii, colours, dash patterns, fonts) or
from the exact text formats in §3 items 3/10, §4, and the Steps §3 `targetHeadline` rules — all golden
substrings and the P8-multiplicity-1 headline vector (`71–76 / 100 · X 1`, hand-verified against
`buildPrecisionScore`'s range formula before writing the test) match exactly.
