# M06: Diagram renderer

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M03 | low | M | groups-moa (derived diagram export) |

## Goal
Pure SVG renderers for both templates in `full` (1500×1700) and `cell` (720×720) variants, matching the
owner's example diagrams, plus PNG rasterisation with bundled fonts.

## Read first
- `docs/spec/rendering-composite.md` §1–§4
- Look at `docs/reference/example-diagram-sighting.png` and `example-diagram-precision.png`

## In scope
`src/lib/render/{palette,svg,diagram-sighting,diagram-precision,diagram,rasterize,fonts}.ts`; fonts; sample script.

## Out of scope
Composite (M14), routes that serve diagrams (M11), UI.

## Files
- `src/lib/render/palette.ts`: tokens from §1
- `src/lib/render/svg.ts`: `el(tag, attrs, children?)`, `text(...)`, `escapeXml(s)`, `num(n)` (max 2 dp, no trailing zeros)
- `src/lib/render/diagram-sighting.ts`, `diagram-precision.ts`, `diagram.ts` (`renderDiagramSvg`)
- `src/lib/render/rasterize.ts`: `svgToPng(svg)`; `fonts.ts` resolves font paths from `process.cwd()/assets/fonts`
- `assets/fonts/Inter-Regular.ttf`, `Inter-Bold.ttf`, `OFL.txt`
- `scripts/render-samples.ts` + script `"render:samples": "tsx scripts/render-samples.ts"`
- `docs/reference/generated/sample-{sighting,precision}-{full,cell}.png` (committed output)
- `tests/unit/render/*.test.ts`

## Steps
1. Download Inter (OFL) from the official release (github.com/rsms/inter, latest release zip). Copy the
   static `Inter-Regular.ttf` and `Inter-Bold.ttf` plus the license as `OFL.txt` into `assets/fonts/`.
2. Build the SVG helpers. All attribute numbers go through `num()`, so snapshots are stable.
3. Implement the layouts exactly per §3 (full) and §4 (cell), including text-line builders as separate pure
   functions (`sightingFooterLines(result, input)`, `precisionFooterLines(...)`, `cellCaption(...)`), so M14
   can reuse them.
4. `renderDiagramSvg(input, variant, slotLabel?)` dispatches by template.
5. `svgToPng` per §2.
6. `scripts/render-samples.ts`: for each fixture `sample-shots-*.json`, run `analyzeTarget`, render full and
   cell variants with `captureLocal` `2026-09-05T16:56:03` (precision) or `2026-08-24T19:30:09` (sighting),
   lighting `daylight`, `clickValueMm` null. Write PNGs to `docs/reference/generated/`.

## Tests
- Golden text check from §3 for both fixtures (string `includes`).
- Structure: the precision full SVG has 9 `class="shot"` circles and 11 RESULTS rows; the sighting full SVG
  has 7 shot circles. The ellipse element has `rotate(-` in its transform.
- Snapshot (`toMatchSnapshot`) of all four SVGs.
- `svgToPng` returns a PNG (magic bytes) of 1500×1700 for full and 720×720 for cell (check with sharp metadata).
- `both` position shows the prone/standing legend; single position doesn't.
- Precision cell omits ring labels (no `class="ring-label"`).

## Acceptance
```bash
pnpm check
pnpm render:samples
```
Then open the generated PNGs next to the example PNGs. The layout should be recognisably the same: title,
legend band, target, and results/footer panels in the same places. Note any visible differences under
Completion notes.

## Pitfalls
- SVG y grows downward: `Y = cy - yMm*s`.
- resvg ignores system fonts when `loadSystemFonts: false`, so every text must use `Inter`.
- Escape user text (session names, notes) with `escapeXml`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
