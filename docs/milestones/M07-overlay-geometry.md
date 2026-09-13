# M07: Capture overlay geometry

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | S | REV-5 capture overlay |

## Goal
Pure, fully tested math and SVG for the live template overlay: viewfinder transforms, overlay layout per
template, calibration prior, and overlay SVG.

## Read first
- `docs/spec/capture-overlay.md` §3, §4
- `docs/spec/data-model.md` §3 (`Calibration`)

## In scope
`src/lib/capture/overlay.ts` (pure, no DOM), `scaleCalibration` re-export check.

## Out of scope
Camera access, React components (M08).

## Files
- `src/lib/capture/overlay.ts`: `overlayCircles`, `coverTransform`, `containTransform`, `cssToFrame`,
  `frameToCss`, `overlayLayout`, `calibrationPriorFromOverlay`, `renderOverlaySvg`
- `tests/unit/capture/overlay.test.ts`

## Steps
1. `overlayCircles` from the §3.1 table (use template constants for diameters where they exist).
2. Transforms §3.2 and layout §3.3. `overlayLayout` throws `RangeError` if the fraction is outside [0.5, 0.95].
3. `calibrationPriorFromOverlay` reuses `coverTransform` and `overlayLayout`.
4. `renderOverlaySvg(layout, template, size)` per §4. Give elements classes (`overlay-mask`,
   `overlay-anchor`, `overlay-ring`, `overlay-guide`, `overlay-cross`, `overlay-tick`) for tests.
5. If M03 already put `scaleCalibration` in `src/lib/geometry/transform.ts`, import it; don't duplicate.

## Tests
- Every row of the §3.4 vector table.
- Round-trip: `cssToFrame(frameToCss(p))` ≈ p for both transforms.
- Fraction 0.5 on a 390×844 container → `outerRadiusCss` 97.5.
- SVG classes go on the *line* elements only; halos use class `overlay-halo`. The precision overlay has
  exactly 1 `overlay-anchor` and 4 `overlay-ring`. The sighting overlay has 1 `overlay-anchor`,
  1 `overlay-ring`, and 2 `overlay-guide`.
- Snapshot both SVGs at 390×844, fraction 0.85.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- `object-fit: cover` crops, so the frame is larger than the visible area. Always use `coverTransform` for
  the live view and `containTransform` for the review screen.
- Keep this file free of `window` or `document`, so it runs in Vitest's node environment.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
