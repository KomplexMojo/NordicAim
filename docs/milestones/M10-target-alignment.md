# M10: Pipeline runner, image review, template alignment

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M04, M06 | medium | M | review image · overlay it on the target template |

## Goal
The background pipeline exists and runs Stage A steps A3 (review image: sharpness and template hint) and A4 (overlay on template:
CV alignment of the anchor disc near the overlay prior, with fallback) for every captured or imported photo, in a Web Worker on the phone.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A3, A4), §3, §5, §6
- `docs/spec/geometry-scoring.md` §1–§2
- `docs/spec/capture-overlay.md` §3.3
- `docs/spec/metadata-lighting.md` §0.1 (`RgbaImage`)

## In scope
`planJobs`, `chooseAlignment`, the runner, `stage-a.ts` (A3–A4), CV functions (`gray`, `anchor`, `sharpness`, `template-hint`),
worker `reviewAndAlign`, synthetic test helpers, the eval script.

## Out of scope
Shot detection (M11), Stage B (M12).

## Files
- `src/lib/pipeline/plan.ts`, `alignment.ts`, `stage-a.ts`, `runner-browser.ts`; update `hooks.ts` (`registerRunner`) and `src/main.tsx` (start the runner)
- `src/lib/cv/gray.ts`, `anchor.ts`, `sharpness.ts`, `template-hint.ts`, `constants.ts` (`BLUR_THRESHOLD = 40`)
- `src/workers/cv.worker.ts` (add `reviewAndAlign`)
- `tests/helpers/rgba.ts` (`jpegFileToRgba`, `svgToRgba`, `blurRgba` via sharp), `tests/helpers/synthetic-target.ts`
- `scripts/cv-eval.ts` + `"cv:eval": "tsx scripts/cv-eval.ts"`
- `tests/unit/pipeline/plan.test.ts`, `alignment.test.ts`, `stage-a.test.ts`; `tests/unit/cv/anchor.test.ts`, `sharpness.test.ts`, `template-hint.test.ts`

## Steps
1. `planJobs` and `chooseAlignment` (pure) with the spec vectors.
2. `toGrayMat(cv, img, maxLongest)` → `{ mat, scale }`. Always `delete()` Mats.
3. `detectAnchor(cv, img, prior | null, anchorDiameterMm | 'both')`:
   1. Blur 5×5; Otsu inverted; CLOSE with an elliptical kernel of `max(9, round(guessR × 0.08))`; external contours.
   2. For each contour ≥ 1% of the area with ≥ 5 points: `fitEllipse` (halve the axes); `fill = area / (π a b)`; reject `fill < 0.85` or `b/a < 0.6`.
   3. Ranking (REV-25 — the prior ranks candidates, it never discards a measured disc):
      - **With a prior**: candidates *inside* the gate (centre distance ≤ 0.25·R **and** radius ratio within [0.75, 1.33]) score
        `fill × (1 − dist/R)`; the best one is returned with `outsidePrior: false`.
      - If **no** candidate is inside the gate, rank every quality-passing candidate by `fill × area` (the no-prior score) and
        return the best with `outsidePrior: true`. Only return `null` when no candidate passes step 2 at all.
      - **Without a prior**: score `fill × area`, `outsidePrior: false` (the gate doesn't apply).
   4. Convert back to working px; `openCvAngleToSpec` helper (tested); `source 'auto'`, `confidence = fill`.
   5. When the anchor diameter is `'both'` (imports without a template), the returned `anchorDiameterMm` comes from
      `hintTemplate` (precision → 112.4, sighting → 115).
4. `sharpness(cv, img)` per analysis-pipeline §3.
5. `hintTemplate(cv, img, calibration)`: 16 rays; dark→light transitions within 0.95·R; median ≥ 5 → precision, ≤ 3 → sighting,
   else nearest; `confidence = clamp(|median − 4| / 4, 0, 1)`.
6. Worker `reviewAndAlign` per §6 (decode with `createImageBitmap` + `OffscreenCanvas`).
7. `runStageA(ctx, photoId, cvApi, imageTools)`:
   1. read the photo, analysis, and working bytes
   2. **skip A4 if `calibration?.source === 'manual'`**
   3. `prior = capture?.calibrationPriorFramePx ? scaleCalibration(prior, workingLongest / frameLongest) : null`
   4. call the worker
   5. `chooseAlignment` → calibration, alignment, warnings (add `image-blurry` if `sharpness < BLUR_THRESHOLD`), `templateHint`, `sharpness`
   6. one transaction: save the analysis with `stageA 'done'` (M11 inserts A5 before `done`), recompute status
   7. emit and notify.
   On a throw: `stageA 'error'`, `error` truncated to 200 chars.
8. `runner-browser.ts` per §5 (start, loop, notify, reset `running` → `pending` on start, sequential jobs, `waitForIdle()` for tests).
   Stage B jobs are ignored until M12 registers a handler.
9. Extend test hooks: `waitForIdle`.
10. `cv-eval.ts`: synthetic cases; reference JPEGs vs `seed-calibrations.json` (centre ≤ 5% R, radius ≤ 6%); sharpness of the
    reference JPEGs and of blurred copies (σ = 3). Print a table and a suggested `BLUR_THRESHOLD`.

## Tests
- `plan` and `alignment` vectors (analysis-pipeline §3, §5).
- Anchor (synthetic, Node): precision 1200×1600 `{620, 830, 260, 0.93, 0}` with a prior offset (+20, −15) and radius 280 → centre ≤ 1.5% R,
  radius ≤ 2%, axisRatio ± 0.02, `outsidePrior` false; sighting radius 450 the same; rotated 30° → angle ± 2°; blank → null.
- Anchor, far off-centre (REV-25): the same precision disc with a prior whose centre is 0.6·R away → still returns the measured
  disc (centre ≤ 1.5% R) with `outsidePrior: true`, **not** null.
- Sharpness: the same synthetic image blurred σ = 3 → sharpness at most 1/3 of the original.
- Template hint correct for both synthetic templates.
- `runStageA` with a stub `cvApi`:
  - detection present (`outsidePrior: false`) → `cv`, no warning
  - detection present with `outsidePrior: true` → `cv` with the detection's calibration + `alignment-uncertain` (REV-25); the prior is **not** used
  - detection null with a prior → `overlay` + `alignment-uncertain`, calibration = scaled prior (frame 2400×3200, working 1200×1600 → factor 0.5)
  - no prior, no detection → `none`
  - manual calibration → the worker isn't called for alignment
  - worker throws → `stageA 'error'`.
- E2E (both projects): capture with the fake camera (precision) → `__asaTest.waitForIdle()` → analysis `stageA 'done'`, `alignment.method` ∈ {cv, overlay}, calibration non-null.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste the `cv:eval` table and any change to `BLUR_THRESHOLD` into Completion notes. **Human (owner):** capture both paper targets
on the iPhone; note the alignment method and how long Stage A took (shown in `debug=1`).

## Pitfalls
- Mats leak without `.delete()`.
- Transfer ArrayBuffers to the worker with `Comlink.transfer`.
- Don't await the worker inside a transaction.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
