# M17: Unplaced shot markers and the diagram/photo compare slider

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M13 | high | M | optional correction · receive analysis |

## Goal
Two owner requests from reviewing real targets (2026-09-16):
1. **REV-29** — when detection finds fewer shots than the rounds fired, the missing ones appear as **parked markers** off the
   target, which the owner drags onto the holes. Placing a shot becomes dragging, not hunting for a tap target.
2. **REV-30** — a **horizontal slider** under the target: all the way left shows the full diagram, all the way right shows the
   photo the diagram came from, and in between it wipes across, so the owner can check the diagram against the paper.

## Read first
- `docs/milestones/M13-adjust-shots.md` Steps 1–4 (ImageStage, Shots mode, Save)
- `docs/milestones/M12-analysis-results.md` Step 4 (target detail, the "show the working photo" toggle this replaces)
- `docs/spec/geometry-scoring.md` §2 (`mmToPx`, `pxToMm`), §8 (`missing`)
- `docs/spec/rendering-composite.md` §3 (the `full` diagram being compared)

## In scope
The parked-marker tray in Adjust, the compare slider on target detail, and the shared overlay that puts a diagram in image space.

## Out of scope
Detection itself (M16), the summary image (M14), storing anything new — parked markers are **derived**, never persisted.

## Files
- `src/components/adjust/UnplacedTray.tsx`, changes to `ImageStage.tsx` and `AdjustPage.tsx`
- `src/components/results/CompareSlider.tsx`, changes to `src/routes/target/TargetPage.tsx`
- `src/lib/render/diagram-overlay.ts` (pure: the diagram drawn in image px from a `Calibration`, reusing `mmToPx`)
- `tests/unit/render/diagram-overlay.test.ts`, `tests/unit/components/compare-slider.test.ts` (or the nearest existing pattern),
  `tests/e2e/adjust.spec.ts`, `tests/e2e/target.spec.ts`

## Steps
1. **Parked markers (REV-29).** In Adjust, compute `unplaced = max(0, declaredRounds(categorization) − identifiedUnits)`. Render
   that many numbered markers in a tray on the margin beside the target, visually identical to a placed shot so the owner can see
   what they are dragging.
   - Dragging a tray marker onto the image creates a shot at `pxToMm(point)` with `source: 'manual'`, `multiplicity: 1`, and
     removes it from the tray (the tray count is derived, so it shrinks on its own once the shot exists).
   - Dragging a placed shot back into the tray deletes that shot.
   - Each tray marker also offers **off target** (REV-33): the round was fired but hit outside the scoring area — the backing
     board, or the paper beyond ring 1 — so it cannot be dragged onto the diagram. Marking it records a miss for that round
     instead of leaving it unaccounted, which is what a shot off the paper actually is.
   - The tray is **derived state**: never stored, never sent to the pipeline, absent from `analysis.shots`. No data-model change.
   - When `unplaced === 0` the tray is hidden.
2. **Diagram in image space.** `renderDiagramOverlaySvg(result, shots, calibration, template, imageSize)` returns the diagram's
   target rings, shots, group ellipse and MPI positioned in **image pixels** via `mmToPx`, so it lines up with the photo. Pure;
   reuse the M05 renderers' geometry rather than duplicating constants. M13's `ImageStage` already draws rings this way — factor
   that out rather than writing a second copy.
3. **Compare slider (REV-30).** On target detail, a horizontal range input (0–1, default 0) under the image:
   - Both layers occupy the same box: the photo underneath, the diagram overlay on top.
   - The overlay is clipped to the left `value` fraction of the box (`clip-path: inset(0 <(1−value)·100%> 0 0)`), so 0 is the whole
     diagram, 1 is the whole photo, and in between the wipe boundary moves across. Draw a 2 px handle line at the boundary.
   - Keyboard accessible (it is a real `<input type="range">`), labelled "Diagram ↔ Photo", and at least 44 px of touch target.
   - **Fallback mode** (REV-30, the owner's second option): a small toggle switches the slider from *wipe* to *fade*, where the
     value drives the overlay's `opacity` instead of its clip. Same control, one line of difference.
   - This replaces M12 step 4's "toggle to show the working photo"; keep the route and every other element of that screen.
4. Both screens must work when the photo is missing (a deleted working blob): the slider degrades to the diagram alone and says so.

## Tests
- `renderDiagramOverlaySvg`: a shot at (0,0) mm lands on the calibration centre in px; a 10 mm offset lands `10 × scale` px away;
  no DOM access in the pure module.
- Slider: value 0 → overlay fully visible (`inset(0 0% 0 0)`); value 1 → fully clipped; 0.5 → half; fade mode drives opacity instead.
- Tray: declared 10 with 8 identified → 2 markers; dropping one on the image adds a `manual` shot with `multiplicity` 1 and leaves
  1 marker; dragging a placed shot to the tray removes it; `unplaced === 0` hides the tray.
- E2E (both projects): open Adjust on a demo target with a missing round → drag a tray marker onto the target → Save → the results
  card loses `rounds-unaccounted`. On target detail, move the slider from 0 to 1 and assert the clip/opacity changes.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human (owner):** on the iPhone, open a real target, sweep the slider and confirm the diagram lines up with the paper; drag a
parked marker onto a hole the app missed.

## Pitfalls
- The diagram is mm with **+y up**; the photo is px with **+y down**. Convert only through `mmToPx`/`pxToMm`.
- A dragged marker must land where the finger is, not where the SVG's untransformed origin is — account for zoom and pan.
- Parked markers are derived; storing them would let the pipeline overwrite them (analysis-pipeline §8).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
