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
_(add here)_

## Completion notes
_(fill in when done)_
