# M06: Capture overlay geometry

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | S | REV-5 capture overlay |

## Goal
Pure, fully tested math and SVG for the live template overlay and the optional tilt indicator.

## Read first
- `docs/spec/capture-overlay.md` §3, §4, §7
- `docs/spec/data-model.md` §3 (`Calibration`)

## In scope
`src/lib/capture/overlay.ts`, `src/lib/capture/tilt.ts` (pure, no DOM).

## Out of scope
Camera access and React components (M07).

## Files
- `src/lib/capture/overlay.ts`: `overlayCircles`, `coverTransform`, `containTransform`, `cssToFrame`, `frameToCss`,
  `overlayLayout`, `calibrationPriorFromOverlay`, `renderOverlaySvg`
- `src/lib/capture/tilt.ts`: `tiltDeg`, `tiltLevel`
- `tests/unit/capture/overlay.test.ts`, `tests/unit/capture/tilt.test.ts`

## Steps
1. `overlayCircles` from the §3.1 table (use template constants where they exist).
2. Transforms (§3.2) and layout (§3.3). `overlayLayout` throws `RangeError` outside [0.5, 0.95].
3. `calibrationPriorFromOverlay` reuses `coverTransform` and `overlayLayout`; import `scaleCalibration`, don't duplicate it.
4. `renderOverlaySvg` per §4 with the exact classes.
5. `tilt.ts` per §7.

## Tests
- Every row of the §3.4 table.
- Round trip `cssToFrame(frameToCss(p)) ≈ p` for both transforms.
- SVG class counts: precision 1 `overlay-anchor` and 4 `overlay-ring`; sighting 1 `overlay-anchor`, 1 `overlay-ring`,
  2 `overlay-guide`; 1 `overlay-mask`; 4 `overlay-tick`.
- Snapshots of both SVGs at 390×844, fraction 0.85.
- Tilt vectors from §7.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- `object-fit: cover` crops, so use `coverTransform` for the live view and `containTransform` for the review screen.
- No `window` or `document` in these files.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
