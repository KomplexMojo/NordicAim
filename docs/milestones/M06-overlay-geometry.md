# M06: Capture overlay geometry

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M02 | low | S | take picture(s) · overlay on template |

## Goal
Pure, fully tested math and SVG for the live template overlay and the calibration prior it produces.

## Read first
- `docs/spec/capture-overlay.md` §3, §4
- `docs/spec/data-model.md` §3 (`Calibration`)

## In scope
`src/lib/capture/overlay.ts` (pure, no DOM).

## Out of scope
Camera and React components (M07).

## Files
- `src/lib/capture/overlay.ts`: `overlayCircles`, `coverTransform`, `containTransform`, `cssToFrame`, `frameToCss`, `overlayLayout`,
  `calibrationPriorFromOverlay`, `renderOverlaySvg`
- `tests/unit/capture/overlay.test.ts`

## Steps
1. `overlayCircles` from §3.1 (use template constants).
2. Transforms §3.2; layout §3.3 (`RangeError` outside [0.5, 0.95]).
3. `calibrationPriorFromOverlay`; import `scaleCalibration` from M03 if present (otherwise add it to `src/lib/geometry/transform.ts`
   with the spec signature and tests).
4. `renderOverlaySvg` per §4 with the exact classes.

## Tests
- Every row of §3.4.
- Round trips for both transforms.
- Class counts (precision 1 anchor + 4 ring; sighting 1 anchor + 1 ring + 2 guide; 1 mask; 4 ticks).
- Snapshots at 390×844, fraction 0.85.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- Cover transform for the live view; contain transform for the review image.
- No `window` or `document`.

## Open questions
- §4 gives colors/widths for the halo, anchor/ring/guide lines, and the centre cross, but not for the four
  `overlay-tick` marks. Implemented ticks as `#FFFFFF` stroke, width 2, non-dashed, 12 px long, to visually match
  the anchor circle's white line — not blocking (class name/count/geometry are the only spec-checked properties;
  no downstream milestone reads tick color/width).
- `scaleCalibration` (`src/lib/geometry/transform.ts`) already existed from M03 with its own test in
  `tests/unit/geometry/transform.test.ts` covering the same §3.4 vector, so M06 only imports and reuses it
  (per step 3, "if present") rather than re-adding it; a redundant vector test was also added in
  `tests/unit/capture/overlay.test.ts` against the value produced by `calibrationPriorFromOverlay` itself.

## Completion notes
- Implemented `src/lib/capture/overlay.ts`: `overlayCircles`, `coverTransform`, `containTransform`, `cssToFrame`,
  `frameToCss`, `overlayLayout`, `calibrationPriorFromOverlay`, `renderOverlaySvg` — pure, no DOM/`window`/`document`.
- `scaleCalibration` was already present in `src/lib/geometry/transform.ts` (from M03); reused as-is.
- Added `tests/unit/capture/overlay.test.ts`: every §3.4 row, round trips for both `FitTransform`s, the §4 class
  counts for both templates (anchor/ring/guide/mask/tick/cross/halo), the `RangeError` boundary at 0.5/0.95, and
  two SVG snapshots at 390×844, fraction 0.85 (one per template) under `tests/unit/capture/__snapshots__/`.
- Commands run: `pnpm check` (typecheck + lint + test + privacy) — all green. `pnpm typecheck` clean, `pnpm lint`
  0 errors (4 pre-existing warnings, unrelated to this milestone), `pnpm test` 264/264 passed across 32 files
  (32 = 31 prior + this new one), `pnpm check:privacy` passed (15 images, unchanged by this milestone).
- Deviations from the spec: none identified beyond the tick styling gap noted above.
