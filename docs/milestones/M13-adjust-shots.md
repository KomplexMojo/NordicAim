# M13: Adjust shots (optional correction)

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M12 | medium | M | optional correction after receiving analysis |

## Goal
When the automatic analysis is off (a missed overlap, a misaligned target), the owner can open **Adjust shots** from a result card,
fix the alignment and the shots on the photo, and save. Scoring and the results update automatically. The pipeline never
overwrites these edits.

## Read first
- `docs/spec/analysis-pipeline.md` §1 (adjust route), §8
- `docs/spec/geometry-scoring.md` §2, §3, §7
- `docs/spec/data-model.md` §3 (`Calibration`), §4 (`Shot`), §7 (`saveAdjustments`, `redetectShots`)

## In scope
The Adjust screen, `saveAdjustments`, `redetectShots`, live score preview, and the ground-truth export (dev tool).

## Out of scope
Pinned missing-round mode (backlog B9).

## Files
- `src/routes/adjust/AdjustPage.tsx`
- `src/components/adjust/ImageStage.tsx`, `AlignmentControls.tsx`, `ShotLayer.tsx`, `ShotInspector.tsx`, `LivePreview.tsx`
- `src/lib/services/adjust.ts`
- `tests/unit/services/adjust.test.ts`, `tests/e2e/adjust.spec.ts`
- `fixtures/reference/ground-truth/README.md`

## Steps
1. **ImageStage**: the `working` photo; zoom 1×–6× (buttons and pinch) and one-finger pan when no shot is grabbed; an SVG overlay in image
   px of template rings from the calibration (`mmToPx`, 96-point polylines), shots, and the MPI.
2. **Modes**:
   - **Shots**: tap to add at `pxToMm`; drag to move; select → `ShotInspector` (multiplicity 1–20, delete, per-unit
     Prone/Standing/Auto when position is `both`).
   - **Alignment**: centre and radius handles; axis ratio 0.70–1.00; angle 0–179; numeric cx/cy/radiusPx inputs.
3. **LivePreview**: client-side `analyzeTarget` + `targetHeadline` + `photoStatus` reasons, updating as you edit.
4. **Save** → `saveAdjustments(ctx, photoId, { calibration?, shots? })`:
   - edited calibration → `source 'manual'`, `pipeline.alignment = { method: 'manual', confidence: null }`
   - every shot added or modified → `source 'manual'`; untouched auto shots stay `auto`
   - set `stageB 'pending'`; recompute status; emit; notify; navigate back to results.
5. **Re-detect shots** → `redetectShots(ctx, photoId, cvApi)`: calls the worker's `detectShots` with the current calibration; replaces
   only `auto` shots; keeps `manual` ones; sets stageB pending.
6. Enable **Adjust shots** on result cards (M12).
7. **Export ground truth JSON** (overflow menu): downloads `{ calibration, shots, imageSize }` (no image data). `ground-truth/README.md`
   explains how the owner creates and commits these for the reference targets (used by `cv:eval`).

## Tests
- Unit `adjust.test.ts`:
  - saving a moved calibration → `manual`, alignment method `manual`, stageB pending
  - adding a shot marks only that shot `manual`
  - `redetectShots` with a stub worker keeps manual shots and replaces auto ones
  - after saving, `runStageA` (M10/M11) doesn't change the calibration or shots.
- E2E (both projects):
  1. `loadDemo` → results → **Adjust shots** on precision
  2. select P9 and delete → identified 9 (total 67), missing 1 → the live preview shows `73–77 / 100 · X 1` (pessimistic adds the
     lowest remaining ring 6, optimistic adds 10). Also assert this equals `targetHeadline(analyzeTarget(...))` in the test.
  3. Save → results card shows the range and the `rounds-unaccounted` reason
  4. Adjust again → add a shot back near (−30.1, −28.4) → Save → **Analyzed** without that reason.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human (owner):** export ground truth for both reference targets and commit the JSON files; try Adjust on a real target on the iPhone.

## Pitfalls
- Store shots in mm.
- Hit radius for shots: 22 CSS px at the current zoom.
- Never mark untouched auto shots as manual.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
