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

1. **Which rings the stage draws is not stated.** Step 1 says "template rings from the calibration (`mmToPx`, 96-point
   polylines)" but names no circle set. Implemented with **capture-overlay §3.1's `overlayCircles`** — precision
   154.4 / 112.4 (anchor) / 74.4 / 42.4 / 10.4 mm, sighting 115 (anchor) / 110 / 45 / 40 mm — so Adjust draws exactly the
   circles the capture overlay drew, and no new constants were invented. If the precision sheet should instead show all ten
   ISSF rings (geometry-scoring §1.3), say so and the set changes in one place.
2. **One file outside the *Files* list**: `src/lib/geometry/rings.ts` (`ringPolyline`, `templateRingPolylines`,
   `polylineAttr`, `RING_POLYLINE_POINTS = 96`). AGENTS *Style* says pure logic stays out of React components, and the
   96-point rule is testable on its own (`tests/unit/geometry/rings.test.ts`); the repo map describes
   `src/lib/geometry/` as the mm↔px transforms, which is what this is.
3. **A photo with no calibration has nothing to adjust against.** `target-not-found` is precisely the case the screen
   exists for, but no spec says where the first ellipse comes from. `adjustStartCalibration` (in `services/adjust.ts`):
   the stored calibration → else the capture prior scaled to working px (capture-overlay §3.3) → else a centred disc of
   **0.35 × the working image's short side** with the template's anchor diameter. The 0.35 is the only invented number in
   this milestone.
4. **`Calibration.confidence` on a manual save is unstated.** §8 fixes `source: 'manual'` and
   `alignment = { method: 'manual', confidence: null }` but says nothing about the calibration's own `confidence`; it is
   set to `null`, to match the alignment.
5. **A manual fix does not clear `alignment-uncertain`.** §8 never says to, so `pipeline.warnings` is carried through
   untouched — which means a photo the owner has just lined up by hand keeps showing "Used your on-screen alignment —
   check the rings line up" on its card. If saving a manual calibration should drop that warning (and `image-blurry`
   should stay), that is a one-line change in `saveAdjustments`.
6. **"Modified" needs a definition.** Step 4 keeps untouched auto shots `auto`, so `markManualShots` diffs the saved
   array against the stored one by id and treats a shot as modified when `xMm`, `yMm`, `multiplicity`,
   `positionOverrides` or `cluster` differs. An untouched shot is written back byte-identical (source *and* confidence).
7. **Re-detect can collide on shot ids.** A manual shot may carry an id a fresh detection reuses (both are `auto-<n>`
   from `holes.ts`). Kept manual shots win; a colliding detected shot is renamed `auto-1-2`, `auto-1-3`, … Not specified.
8. **The live preview needs stage states `photoStatus` does not have yet.** Step 3 asks for "`photoStatus` reasons", but
   with the real record the draft would always be `ready` (rule 4, Stage B pending). The preview therefore evaluates
   `photoStatus` against a draft analysis with `stageA`/`stageB` = `'done'`, so it shows the terminal status and reasons
   the save will produce.
9. **"Overflow menu" (step 7) has no primitive.** `src/components/ui` has no dropdown-menu, so the export lives behind a
   **More…** button that opens a `Dialog` holding **Export ground truth JSON**.
10. **The export filename is not specified.** It downloads as `<originalFilename ?? photoId>.json` (so `precision.jpg.json`
    for the demo session); `fixtures/reference/ground-truth/README.md` tells the owner to rename it to the key
    `scripts/cv-eval.ts` looks for (`IMG_5132-precision.jpg.json`).
11. **New shot ids** come from `ctx.newId()` (UUIDs, well inside `ShotId`'s 64 chars). No format is specified.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16. Per the orchestration overrides this
milestone was **not** committed or pushed, and its Status is left `in-progress`.

**Both Acceptance commands pass.**

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (the same 4 pre-existing warnings), **430 unit tests in 52 files** (was 406 in 50), `privacy check passed (15 images)` |
| `pnpm test:e2e` | **pass** — 28/28 (14 per project: mobile-chromium and mobile-webkit), including the 2 new `adjust.spec.ts` tests in both |
| `pnpm build` (not required; run as a check) | **pass** — `dist/` still contains no `__asaTest`, `sample-shots-*` or `seed-calibrations` content |

24 new unit tests: `tests/unit/services/adjust.test.ts` (17) and `tests/unit/geometry/rings.test.ts` (7). No existing
test needed changing.

### What was built

- **`src/lib/services/adjust.ts`** — `saveAdjustments(ctx, photoId, { calibration?, shots? })`: a calibration in the
  patch is stored `source: 'manual'` with `alignment = { method: 'manual', confidence: null }`; shots go through
  `markManualShots` (added/modified → `manual`, untouched auto shots written back unchanged); one transaction over
  `sessions/photos/analyses` sets `stageB: 'pending'`, recomputes `photoStatus`, touches `session.updatedAt`, then emits
  `pipeline-changed` and calls `pipelineHooks.notify()`. `redetectShots(ctx, photoId, cvApi)` prepares everything before
  the transaction (working bytes, settings, the worker call with `Comlink.transfer`), keeps every `manual` shot and
  replaces the `auto` ones, then commits the same way. Also `buildGroundTruth` (step 7) and `adjustStartCalibration`
  (Open question 3). Stage A's `shotTemplate` and `priorInWorkingPx` are reused rather than re-derived.
- **`src/lib/geometry/rings.ts`** — the 96-point ring polylines (Open question 2).
- **Adjust screen** (`routes/adjust/AdjustPage.tsx` at `#/sessions/:sid/photos/:pid/adjust`, registered in
  `app/router.tsx`): reads the record **once** and edits a local draft (a live query would throw the draft away every
  time the background runner touched the same photo), with Shots/Alignment modes, Save, **Re-detect shots**, and
  **More… → Export ground truth JSON**.
  - `ImageStage`: contain-fit working photo, zoom 1×–6× (buttons **and** two-finger pinch), one-finger pan when no shot
    or handle is grabbed, and an SVG overlay in image px (`viewBox = working size`) holding the ring polylines, the
    shots and the MPI. Strokes and the 22 CSS px hit target are divided by the current scale so they keep their
    on-screen size. Tap bare paper to add a shot (`pxToMm`), tap a shot to select it, drag one to move it.
  - `ShotLayer` (shots + multiplicity badge + MPI cross), `ShotInspector` (multiplicity 1–20 with ±1 buttons, per-unit
    Prone/Standing/Auto for a `both` target — resizing `positionOverrides` with the multiplicity so the `Shot` refine
    holds — and Delete), `AlignmentControls` (numeric cx/cy/radiusPx, axis ratio 0.70–1.00, angle 0–179, plus the
    draggable centre and major-axis-edge handles on the stage), `LivePreview` (`analyzeTarget` → `targetHeadline`,
    `MetricsList`, `StatusChip`, `ReasonList`, recomputed on every edit with the stored `holeDiameterMm` override so it
    matches what Stage B will compute).
- **`src/components/results/TargetCard.tsx`** — **Adjust shots** is now a link to the route (step 6).
- **`fixtures/reference/ground-truth/README.md`** — the shape of a ground-truth file, how to produce one from Adjust,
  the exact filenames `scripts/cv-eval.ts` looks for, and that its row is reported but never gated.

### Deviations

- The eleven items under *Open questions* above. The substantive ones are the ring set (1), the fallback starting
  calibration and its 0.35 factor (3), warnings not being cleared by a manual fix (5), and the re-detect id collision
  rule (7).
- One file outside the *Files* list (`src/lib/geometry/rings.ts`, Open question 2) and its unit test.
- The e2e "add a shot back near (−30.1, −28.4)" step taps by coordinate: it reads the stage's `data-scale` /
  `data-offset-x` / `data-offset-y` (published for exactly this) and zooms in until the tap point clears every existing
  shot's 22 CSS px hit radius — at 1× the old P9 spot is ~8 CSS px from P7, so an un-zoomed tap would select P7 instead
  of adding a shot. The stage also publishes `data-ready`, because reading the transform before its `ResizeObserver`
  fires produced a real flake (caught on a cold-cache run).

### Owner checks (not done by the agent)

- **Export ground truth for both reference targets and commit the JSON.** Follow
  `fixtures/reference/ground-truth/README.md`: `pnpm dev:test`, `__asaTest.loadDemo()`, Adjust each target until the
  rings and holes are right, Save, then **More… → Export ground truth JSON**; rename to
  `IMG_5057-sighting.jpg.json` / `IMG_5132-precision.jpg.json`, commit them, and run `pnpm cv:eval` to see the new
  "owner ground truth" rows.
- **Try Adjust on a real target on the iPhone**: pinch to zoom and drag to pan, drag a shot, add one with a tap, bump a
  multiplicity, drag the alignment handles, check the preview score changes as you go, Save, and confirm the results card
  updates. Note anything that feels wrong under a thumb — the 22 CSS px hit radius and the 60vh stage height are the
  two numbers most likely to need tuning.
