# M11: Shot editor and demo seed

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M06, M10 | medium | L | cv-scoring (interactive correction), groups-moa |

## Goal
On the phone, the owner can adjust calibration (prefilled from the overlay), place, move, and delete shots,
set multiplicity and per-unit positions, and see live scores and ranges. A target becomes **Reviewed
automatically** once its shot count matches the declared rounds (REV-9), or with one tap when rounds are
unaccounted for. Diagram files render automatically for reviewed targets. The app is fully usable without CV
after this milestone.

## Read first
- `docs/spec/geometry-scoring.md` §2, §3, §7, §8
- `docs/spec/data-model.md` §3 (`nextStatus`), §4 (`TargetAnalysis`), §7 (analysis and diagram routes)
- `docs/spec/rendering-composite.md` §3 (reuse the renderer for the preview)
- `docs/DESIGN.md` "Computer vision evaluation and review" steps 5–8; `docs/DESIGN-REVISIONS.md` REV-9

## In scope
Review page, analysis GET/PUT, automatic status and diagram refresh, diagram route, seed script, ground-truth procedure.

## Out of scope
Auto calibration (M12), auto shots (M13).

## Files
- `src/app/sessions/[sessionId]/photos/[photoId]/review/page.tsx`
- `src/components/review/ReviewScreen.tsx`, `ImageStage.tsx` (zoom/pan + SVG overlay), `CalibrationControls.tsx`,
  `ShotLayer.tsx`, `ShotInspector.tsx`, `ResultsPanel.tsx`, `StatusChip.tsx`, `ModeToggle.tsx`
- `src/app/api/sessions/[sessionId]/photos/[photoId]/analysis/route.ts` (GET, PUT)
- `src/app/api/sessions/[sessionId]/photos/[photoId]/diagram/route.ts`
- `src/lib/analysis/service.ts`:
  - `saveAnalysis(sessionId, photoId, input, now)`: validate, recompute `computed`, then `refreshStatus`
  - `refreshStatus(sessionId, photoId, now)`: compute `nextStatus`, persist it, write or delete diagram files.
    Also called from the M10 photo PATCH handler after categorization changes (update that handler).
- `scripts/seed-demo.ts` + script `"seed:demo": "tsx scripts/seed-demo.ts"`
- `scripts/export-ground-truth.ts`, `fixtures/reference/ground-truth/README.md`
- `tests/unit/analysis/service.test.ts`, `tests/unit/domain/next-status.test.ts`, `tests/e2e/review.spec.ts`

## Steps
1. **ImageStage**: shows `working` in a container. Zoom with +/− buttons (1×–6×) and pinch (two pointers);
   pan by dragging with one finger when no shot is grabbed. Keep a single `{ scale, tx, ty }` state. An SVG
   overlay in image pixel coordinates draws:
   - all template rings from the calibration via `mmToPx` (sampled as 96-point polylines; they're ellipses
     when `axisRatio < 1`)
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
   - `pinnedMode` select (none/optimistic/pessimistic/averaged).
   - Toggle **Diagram preview**: `renderDiagramSvg(full)` scaled to fit.
5. Autosave: PUT the analysis debounced 800 ms → `saveAnalysis` → response `{ analysis, status }`.
6. **StatusChip** (top of ResultsPanel), driven by the client-side `nextStatus` for instant feedback and
   confirmed by the PUT response:
   - `reviewed` → green **Reviewed ✓** (automatic when identified = declared)
   - missing N > 0 → amber **N rounds unaccounted** with a button **Accept with N missing** (PUT
     `acceptedMissingCount = N`). If more rounds go missing later, the status drops back automatically and the
     button reappears with the new N.
   - over-count M > 0 → red **M too many shots: remove or reduce multiplicity** (no accept option)
   - no calibration → grey **Calibrate target first**.
   There is no manual "Mark reviewed" button.
7. **Diagrams** (`refreshStatus`): when the resulting status is `reviewed`, (re)write `diagrams/<pid>-full.svg`,
   `-full.png`, and `-cell.svg`. When it isn't, delete those files if present. The diagram route serves stored
   files, or renders on demand if missing, with `Cache-Control: private, no-store`.
8. `seed-demo.ts`: create session "Demo — reference targets" (date 2026-09-05). Import both `docs/reference`
   JPEGs through the repos, not HTTP (origin `import`, clientLocal from each sidecar's `captureLocal`, offset
   `-07:00`). Categorize from the sample-shots fixtures, set calibration from
   `fixtures/reference/seed-calibrations.json`, set shots from the fixtures through `saveAnalysis` (the status
   becomes `reviewed` automatically because identified = declared). Print the session URL path. Idempotent:
   delete any existing session with the same name first.
9. Ground truth: `fixtures/reference/ground-truth/README.md` explains how the owner creates it. Seed or capture
   the reference targets, carefully calibrate and place every hole in the editor, then run
   `pnpm tsx scripts/export-ground-truth.ts <sessionId> <photoId> <name>`. It writes
   `{ calibration, shots, imageSize }` JSON with no image data and no GPS.

## Tests
- Unit `next-status.test.ts`: every vector listed under `nextStatus` in data-model §3.
- Unit `service.test.ts`:
  - saving the precision fixture → status `reviewed`, diagram files exist
  - P8 multiplicity 1 → `calibrated`, diagram files deleted
  - `acceptedMissingCount: 1` → `reviewed` again
  - an invalid shot (multiplicity 0) → 400
  - then a categorization PATCH that changes roundsProne to 12 → `calibrated` (identified 9, missing 3, accepted 1).
- E2E (Pixel 7):
  1. seed the demo session in a test fixture (via the repos)
  2. open the precision review → results show `72 / 100` and the chip shows **Reviewed ✓**
  3. add a shot far outside the rings → identified 11 → red over-count chip
  4. delete it → **Reviewed ✓**
  5. set multiplicity of P8 to 1 → identified 9 (total 66), `missing 1`, range pessimistic **71**, optimistic
     **76**, averaged **73.3** (66 + 5, 66 + 10, 66 + 66/9); the amber chip shows **Accept with 1 missing**.
     Also assert these equal what `analyzeTarget` returns.
  6. tap **Accept with 1 missing** → **Reviewed ✓**
  7. the diagram PNG route returns 200 image/png.
- E2E: the sighting demo shows `9 hit / 1 miss` and **Reviewed ✓**.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm seed:demo
```
**Human required (owner):** create ground-truth files for the reference photos per the README. Agents:
*safe for any tier* to write the script and README only.

## Pitfalls
- Hit-testing shots: use a finger-sized radius (22 CSS px, converted to image px by the current zoom).
- Store shots in **mm**, never px, so calibration changes move them correctly.
- The client and server must use the same pure `nextStatus` and `analyzeTarget`. Never duplicate the logic.
- Don't let clients send `status`; the server always recomputes it.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
