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
   - **REV-39 (M20 step 8):** once declared-round reconciliation lands, a marker standing for a round M20 has already assumed
     was a miss is labelled **Scored as miss** rather than left as a plain unplaced marker — the score is definite, and the
     marker exists so the owner can still place the shot if the app was wrong.
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

1. **Step 3's clip formula contradicts step 3's own sentence and the *Tests* vectors.** The step says
   `clip-path: inset(0 <(1−value)·100%> 0 0)`, but also "0 is the whole diagram, 1 is the whole photo", and *Tests*
   fixes `value 0 → inset(0 0% 0 0)` (**fully visible**), `1 → fully clipped`, `0.5 → half`. Clipping to the left
   `value` fraction gives the opposite of all three. Implemented as `inset(0 ${value·100}% 0 0)` — i.e. the overlay
   keeps the left **`1 − value`** of the box — because that satisfies the sentence and all three stated vectors
   (AGENTS rule 4: the vectors get the exact expected value). If the formula was meant literally, the slider's
   direction reverses and those three vectors change.
2. **"Off target" (REV-33) is not implemented: nothing in the data model can record a miss yet.** Step 1's third
   bullet asks for a control that "records a miss for that round instead of leaving it unaccounted". `Shot`
   (`data-model.md` §4) has no miss flag, and `SubsetResult` only has `missing = declared − identified`
   (`geometry-scoring.md` §8). The only way to turn an unaccounted round into a scored zero today is to synthesise a
   shot at an invented coordinate beyond ring 1 / the zone — which would also enter the group metrics (extreme
   spread, MPI, mean radius, the ellipse — §6), changing numbers the owner is reading. AGENTS rule 2 forbids
   guessing on scoring and geometry, so the control is **left out** rather than approximated. **M20 introduces
   exactly this representation** (step 5.3 `missesAssumed`, reason `rounds-scored-as-miss`, and step 8's *Scored as
   miss* label on M17's parked markers), so the natural fix is for M20 to add the field and this control together.
   *Owner decision needed:* is a round that hit off the scoring area excluded from the group metrics (it never
   touched the scored paper), or is it a ring-0 unit at some nominal position?
3. **REV-39's "Scored as miss" label is deferred with M20**, as step 1 says ("once declared-round reconciliation
   lands"). M20 is still `pending`, so no marker carries that label yet; the tray shows plain unplaced markers.
4. **A tray hidden at `unplaced === 0` has nothing to drag a placed shot onto.** Step 1 asks for both "dragging a
   placed shot back into the tray deletes that shot" and "when `unplaced === 0` the tray is hidden". Once every
   declared round is placed, the drag-to-delete gesture therefore has no drop target and the owner must use the
   inspector's **Delete**. Implemented literally (hidden at 0). A permanently visible drop zone would be a one-line
   change if that is what was meant.
5. **The overlay's shot-marker size is unspecified.** `renderDiagramOverlaySvg`'s signature (step 2) carries no
   display size, and rendering-composite §3 item 7's fixed 8 px marker is tied to the diagram's own px/mm scale,
   which does not exist in image space. The overlay draws each shot at the **hole diameter** mapped through the
   calibration — what M13's `ShotLayer` already does — with §3 item 7's ×1.25 when `multiplicity > 1`.
   `holeDiameterMm` is an optional 6th argument defaulting to the profile's 5.6 mm; the target screen passes the
   stored setting. Marker **positions** are exact `mmToPx` either way; only the size is a display choice.
6. **Ring colours over a photo.** rendering-composite §3 item 5 splits `ringOnLight` / `ringOnDark` by ring number,
   which is precision-specific. The overlay uses the general form of the same rule — a circle wider than the anchor
   disc lies on white paper (`ringOnLight`), one inside it lies on the aiming mark (`ringOnDark`) — which reproduces
   §3's split for precision and keeps every sighting circle white on the dark disc. No new colour constant.
7. **There is no React test renderer in this repo** (no `@testing-library/react`, and PLAN §3 does not list one), so
   the component tests the milestone names are covered as: pure unit tests of the arithmetic the components read
   (`compareLayerStyle` in `tests/unit/components/compare-slider.test.ts`, `unplacedRounds` in
   `tests/unit/services/adjust.test.ts`), plus E2E for the DOM behaviour (drag in, drag out, tray hidden at 0,
   slider 0 → 1 in both modes). Adding a renderer would be a new dependency, which AGENTS rule 3 forbids here.
8. **A photo with no calibration cannot be compared.** Step 4 covers a *missing photo* but not a *missing
   calibration*; with no calibration there is no mm→px map, so the screen shows a line pointing at **Adjust shots**
   in place of the slider.
9. **One helper outside the *Files* list**: `unplacedRounds(categorization, shots)` in `src/lib/services/adjust.ts`
   (M13's own Adjust service). AGENTS *Style* keeps pure logic out of React components, and the derivation is the
   one thing the milestone states as a formula, so it is unit-tested on its own. `ImageStage` also gained a
   `StageApi` ref and an `onShotDragEnd` callback — both are "changes to `ImageStage.tsx`", which the *Files* list
   allows.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-18. Per the orchestration overrides
this milestone was **not** committed or pushed, and its Status is left `in-progress` for the reviewer.

**Both Acceptance commands pass.**

### Commands

| Command | Result |
|---|---|
| `pnpm check` | pass (typecheck, lint — 4 pre-existing warnings, 0 errors —, 503 unit tests, privacy check 15 images) |
| `pnpm test:e2e` | pass — 40 tests, mobile-chromium + mobile-webkit |

### What was built

- **`src/lib/render/diagram-overlay.ts`** (pure, new). `diagramOverlayLayout` and `renderDiagramOverlaySvg(result,
  shots, calibration, template, imageSize, holeDiameterMm?)`: the rings, shots, group ellipse and MPI in **image
  px**. Rings come from `templateRingPolylines` (the module M13's `ImageStage` already draws with — factored out in
  M13, reused here rather than copied); every mm→px conversion is `mmToPx`; colours are the M05 `PALETTE`. The
  group ellipse is **sampled** as a 96-point polyline through `mmToPx`, because an ellipse in mm is not an ellipse
  of the same axes after the calibration's rotate-and-compress. Strokes are `vector-effect="non-scaling-stroke"`,
  so the overlay stays legible at any display size. The same file holds `compareLayerStyle(mode, value)`, the
  slider's whole arithmetic.
- **`src/components/results/CompareSlider.tsx`** (new) and `TargetPage`: the photo and that overlay in one box, an
  `<input type="range">` (0–1, step 0.01, default 0, 44 px, labelled "Diagram ↔ Photo", keyboard-driven), a 2 px
  handle line at the wipe boundary and a **Fade instead of wipe** toggle. It replaces M12 step 4's
  `toggle-working-photo`; the route, the full diagram, the zoom toggle, the subset cards, the tally and the photo
  facts are untouched. With no working blob the box shows the diagram alone and says so.
- **`src/components/adjust/UnplacedTray.tsx`** (new) and `AdjustPage`: `unplaced = max(0, declaredRounds −
  identified units)` numbered markers in a tray beside the stage, dragged onto the photo with pointer events (a
  ghost follows the finger). The drop point is converted through the stage's **live** transform
  (`ImageStage`'s new `StageApi.clientToMm`), so it lands under the finger at any zoom or pan, and becomes a shot
  with `source: 'manual'`, `multiplicity: 1`. A placed shot dragged onto the tray is deleted
  (`ImageStage.onShotDragEnd` + `elementFromPoint`). The count is derived on every render, never stored, never sent
  to the pipeline; at 0 the tray renders nothing. The tray is shown in the **Shots** mode only — in Alignment mode
  the stage's pointer belongs to the centre/radius handles and a dropped marker would add a shot the owner did not
  mean to place. The milestone does not state a mode, so say if it should be visible in both.

### For a reviewer to look at

- **Open question 1** is a real conflict inside step 3 — the implemented direction follows the *Tests* vectors.
- **Open question 2**: the REV-33 *off target* control is deliberately absent, awaiting M20's miss representation.
- The overlay was checked visually against a real reference photo at slider 0.5: the drawn rings sit slightly
  outside the printed ones, which is the offset **M18** exists to fix — the slider is now the tool that shows it.
- `ShotLayer`/`ImageStage` were *not* re-pointed at `renderDiagramOverlaySvg`: the stage's rings, shots and handles
  are interactive React elements with per-zoom stroke widths and hit targets, and its ring geometry already comes
  from the shared `src/lib/geometry/rings.ts`, so there is no second copy of the geometry.
