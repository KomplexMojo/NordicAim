# M10: Shot editor, auto-review, demo session

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M05, M09 | medium | L | cv-scoring (interactive correction), groups-moa |

## Goal
On the phone, the owner adjusts calibration (prefilled from the overlay), places, moves, and deletes shots, sets
multiplicity and per-unit positions, and sees live scores and ranges. Targets become **Reviewed** automatically when
the shot count matches (or via "Accept with N missing"). Diagrams are stored automatically for reviewed targets.
**Load demo session** gives a realistic dataset. After this milestone the app is fully usable without CV.

## Read first
- `docs/spec/geometry-scoring.md` §2, §3, §7, §8
- `docs/spec/data-model.md` §3 (`nextStatus`), §4, §6 (diagram blob keys), §7 (`saveAnalysis`, `refreshStatus`, `loadDemoSession`)
- `docs/spec/rendering-composite.md` §3
- `docs/DESIGN-REVISIONS.md` REV-9

## In scope
Review route, analysis services, status chip, diagram blobs, demo session, ground-truth export, minimal settings page.

## Out of scope
Auto calibration (M11), auto shots (M12).

## Files
- `src/routes/review/ReviewPage.tsx` (route `/sessions/:sessionId/photos/:photoId/review`)
- `src/components/review/ReviewScreen.tsx`, `ImageStage.tsx`, `CalibrationControls.tsx`, `ShotLayer.tsx`, `ShotInspector.tsx`,
  `ResultsPanel.tsx`, `StatusChip.tsx`, `ModeToggle.tsx`
- `src/lib/services/analysis.ts` (`saveAnalysis`, `refreshStatus`); update `photos.ts` to call `refreshStatus`
- `src/lib/services/demo.ts` (`loadDemoSession`)
- `src/routes/settings/SettingsPage.tsx` (route `/settings`; M15 extends it) with **Load demo session**
- `public/demo/sighting.jpg`, `public/demo/precision.jpg` (copies of the `docs/reference` JPEGs)
- Vite and Vitest alias `@fixtures` → `fixtures/reference` (JSON imports)
- `fixtures/reference/ground-truth/README.md`
- `tests/unit/services/analysis.test.ts`, `tests/unit/services/demo.test.ts`, `tests/e2e/review.spec.ts`

## Steps
1. **ImageStage**: the `working` blob in a container; zoom 1×–6× (buttons and pinch) and one-finger pan when no shot is
   grabbed; a single `{ scale, tx, ty }` state. The SVG overlay in image px shows template rings via `mmToPx` (96-point
   polylines), shots, and the MPI.
2. **Modes**: **Shots** (tap adds at `pxToMm`; drag moves) and **Calibrate** (centre and radius handles; axis ratio
   0.70–1.00; angle 0–179; numeric cx/cy/radiusPx inputs).
3. **ShotInspector**: multiplicity 1–20, delete, and per-unit Prone/Standing/Auto when position is `both`.
4. **ResultsPanel**: live `analyzeTarget` (pure) showing precision (total, X, tally, range), sighting (hits/misses, range),
   ES mm/MOA/MRAD, MPI offset, `both` subsets, a `pinnedMode` select, and a **Diagram preview** toggle.
5. Autosave (debounce 800 ms) → `saveAnalysis(ctx, photoId, input, browserRenderTools)`:
   - validate; `computed = { engineVersion: ENGINE_VERSION, result: analyzeTarget(...) }`
   - `refreshStatus`: compute `nextStatus`. If `reviewed`, render and store `diagram:<pid>:full-svg`, `full-png`, and
     `cell-svg` (rasterise **before** the transaction). Otherwise delete those keys. Update the photo status and
     `lastChangeAt` in one transaction.
6. **StatusChip** (client-side `nextStatus` for instant feedback, confirmed after save):
   - `reviewed` → **Reviewed ✓**
   - missing N → amber **N rounds unaccounted** plus **Accept with N missing** (saves `acceptedMissingCount = N`)
   - over-count M → red **M too many shots: remove or reduce multiplicity**
   - no calibration → grey **Calibrate target first**.
   There is no manual "Mark reviewed" button.
7. `updatePhotoFields` (M09) now calls `refreshStatus` after categorization changes.
8. `loadDemoSession(ctx, assets, imageTools, renderTools)`:
   - fetch `demo/sighting.jpg` and `demo/precision.jpg`
   - create session "Demo — reference targets" (date 2026-09-05), deleting an existing one with that name first
   - ingest both (origin `import`, clientLocal from each sidecar's `captureLocal`, offset `-07:00`, categorization from
     the sample-shots fixtures)
   - `saveAnalysis` with calibrations from `seed-calibrations.json` and shots from the fixtures → both become `reviewed`
     automatically.
9. **Settings page**: a **Load demo session** button → navigate to the session.
10. **Ground truth**: in ReviewScreen's overflow menu, **Export ground truth JSON** downloads
    `{ calibration, shots, imageSize: working }` (no image data). `fixtures/reference/ground-truth/README.md` tells the owner
    how to create files for the reference targets and commit them.

## Tests
- Unit `analysis.test.ts` (fake-indexeddb, stub render tools):
  - precision fixture → `reviewed`, diagram keys exist
  - P8 multiplicity 1 → `calibrated`, diagram keys deleted
  - `acceptedMissingCount: 1` → `reviewed`
  - multiplicity 0 → validation error
  - categorization roundsProne 12 → `calibrated` (identified 9, missing 3, accepted 1)
  - every `nextStatus` vector in data-model §3 against real `analyzeTarget` output.
- Unit `demo.test.ts` (stub fetch and image tools): session created with 2 reviewed photos; running twice leaves one demo session.
- E2E (both projects):
  1. Settings → Load demo session
  2. open precision review → `72 / 100` and **Reviewed ✓**
  3. add a far shot → red over-count chip → delete it → **Reviewed ✓**
  4. P8 multiplicity 1 → range pessimistic **71**, optimistic **76**, averaged **73.3**; amber chip
  5. **Accept with 1 missing** → **Reviewed ✓**
  6. the sighting review shows `9 hit / 1 miss`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** create ground-truth JSON for both reference targets using the export button. Agents: *safe
for any tier* to build the export and README only.

## Pitfalls
- Hit radius for shots: 22 CSS px converted by the current zoom.
- Store shots in mm, never px.
- Rasterise diagrams before opening the transaction.
- One shared pure `nextStatus` and `analyzeTarget` for the UI and the service.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
