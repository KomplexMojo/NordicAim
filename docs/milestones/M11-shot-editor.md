# M11: Shot editor and demo seed

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M06, M10 | medium | L | cv-scoring (interactive correction), groups-moa |

## Goal
On the phone, the owner can adjust calibration (prefilled from the overlay), place, move, and delete shots,
set multiplicity and per-unit positions, see live scores and ranges, and mark the target reviewed. This
renders the diagram files. The app is fully usable without CV after this milestone.

## Read first
- `docs/spec/geometry-scoring.md` §2, §3, §7, §8
- `docs/spec/data-model.md` §4, §7 (analysis and diagram routes)
- `docs/spec/rendering-composite.md` §3 (reuse the renderer for the preview)
- `docs/DESIGN.md` "Computer vision evaluation and review" steps 5–8

## In scope
Review page, analysis GET/PUT, diagram route, the seed script, and the ground-truth capture procedure.

## Out of scope
Auto calibration (M12), auto shots (M13).

## Files
- `src/app/sessions/[sessionId]/photos/[photoId]/review/page.tsx`
- `src/components/review/ReviewScreen.tsx`, `ImageStage.tsx` (zoom/pan + SVG overlay), `CalibrationControls.tsx`,
  `ShotLayer.tsx`, `ShotInspector.tsx`, `ResultsPanel.tsx`, `ModeToggle.tsx`
- `src/app/api/sessions/[sessionId]/photos/[photoId]/analysis/route.ts` (GET, PUT)
- `src/app/api/sessions/[sessionId]/photos/[photoId]/diagram/route.ts`
- `src/lib/analysis/service.ts`: `saveAnalysis(sessionId, photoId, input, now)` recomputes `computed`;
  `markReviewed(...)` also writes diagram files
- `scripts/seed-demo.ts` + script `"seed:demo": "tsx scripts/seed-demo.ts"`
- `fixtures/reference/ground-truth/README.md`
- `tests/unit/analysis/service.test.ts`, `tests/e2e/review.spec.ts`

## Steps
1. **ImageStage**: shows `working` in a container. Zoom with +/− buttons (1×–6×) and pinch (two pointers);
   pan by dragging with one finger when no shot is grabbed. Keep a single `{ scale, tx, ty }` state. An SVG
   overlay in image pixel coordinates draws:
   - all template rings from the calibration via `mmToPx` (sampled as polylines of 96 points; they're
     ellipses when `axisRatio < 1`)
   - shots
   - the MPI.
2. **Modes** (segmented): **Shots** (tap empty space adds a shot at `pxToMm`; drag a shot to move) and
   **Calibrate** (drag the centre handle; drag the radius handle on the anchor ring; sliders for axis ratio
   0.70–1.00 and angle 0–179; numeric inputs for cx, cy, and radiusPx for precision and testing).
3. **ShotInspector** (selected shot): multiplicity stepper 1–20, delete, and when position is `both`, one
   Prone/Standing/Auto toggle per unit (Auto = null override).
4. **ResultsPanel**: live `analyzeTarget` on the client (the scoring lib is pure).
   - **Precision**: total, X, tally, range (pessimistic–optimistic, averaged).
   - **Sighting**: hits/misses for the scored zone and range.
   - Always: ES mm/MOA/MRAD and MPI offset.
   - For `both`: per-position subsets.
   - Warnings: over-count and missing count.
   - `pinnedMode` select (none/optimistic/pessimistic/averaged).
   - Toggle **Diagram preview**: `renderDiagramSvg(full)` scaled to fit.
5. Autosave: PUT the analysis debounced 800 ms. The server validates, recomputes `computed` with
   `ENGINE_VERSION`, sets the photo status via `nextStatus`, and returns it.
6. **Mark reviewed** (enabled when categorization is complete and calibration is set): the server renders
   `diagrams/<pid>-full.svg`, `-full.png`, and `-cell.svg`, then sets `status = 'reviewed'`. **Reopen** sets
   `calibrated` again.
7. The diagram route serves the stored files, or renders on demand if missing, with
   `Cache-Control: private, no-store`.
8. `seed-demo.ts`: create session "Demo — reference targets" (date 2026-09-05). Import both `docs/reference`
   JPEGs through the repos, not HTTP (origin `import`, clientLocal from each sidecar's `captureLocal`,
   offset `-07:00`). Categorize from the sample-shots fixtures, set calibration from
   `fixtures/reference/seed-calibrations.json`, set shots from the fixtures, and mark reviewed. Print the
   session URL path. Idempotent: delete any existing session with the same name first.
9. `fixtures/reference/ground-truth/README.md`: explains how the owner creates ground truth. Seed or capture
   the reference targets, carefully calibrate and place every hole in the editor, then run
   `pnpm tsx scripts/export-ground-truth.ts <sessionId> <photoId> <name>` (write this small script too). It
   writes `{ calibration, shots, imageSize }` JSON with no image data and no GPS.

## Tests
- Unit: `saveAnalysis` recomputes and matches `analyzeTarget` for the precision fixture (72); an invalid shot
  (multiplicity 0) → 400.
- E2E (Pixel 7):
  1. `pnpm seed:demo` in global setup, or seed via the repos in a test fixture
  2. open the precision review → the results panel shows `72 / 100`
  3. add a shot far outside the rings → declared 10, identified 11 → over-count warning visible
  4. delete it → warning gone
  5. set multiplicity of P8 to 1 → identified 9 (total 66), `missing 1`, and the range shows pessimistic **71**,
     optimistic **76**, averaged **73.3** (66 + 5, 66 + 10, 66 + 66/9). Also assert these equal what
     `analyzeTarget` returns for the edited shots.
  6. mark reviewed → diagram PNG route returns 200 image/png.
- E2E: the sighting demo shows `9 hit / 1 miss`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm seed:demo
```
**Human required (owner):** create ground-truth files for the two private reference photos (or the reference
JPEGs) per the README. Agents: *safe for any tier* to write the script and README only.

## Pitfalls
- Hit-testing shots: use a finger-sized radius (22 CSS px, converted to image px by the current zoom).
- Store shots in **mm**, never px, so calibration changes move them correctly.
- Don't compute scores on the server only; the client needs live feedback. Both use the same pure lib.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
