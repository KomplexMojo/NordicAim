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
   1. Blur 5×5; Otsu inverted (**keep this pre-CLOSE binary**, step 2 measures on it); CLOSE with an elliptical kernel of
      `max(9, round(guessR × 0.08))`, where `guessR` is the prior's radius in detection px, or 0 when there is no prior (so the
      kernel is the floor, 9); contours with `RETR_CCOMP` so each outer contour's children are available.
   2. For each contour ≥ 1% of the area with ≥ 5 points: `fitEllipse` (halve the axes); `fill` = the fraction of filled pixels
      inside the fitted ellipse **on the pre-CLOSE binary** (REV-26 — the contour's own area, and the post-CLOSE fraction, both
      accept a merged blob); reject `fill < 0.85` or `b/a < 0.6`.
   2a. **Nested search (REV-26).** When an outer contour is rejected by step 2, test its child contours with the same rules and
      add those that pass to the candidate pool. A child that passes is an ordinary candidate: step 3 ranks it, and `source`,
      `confidence` and `outsidePrior` are set exactly as for an outer candidate.
   3. Ranking (REV-25 — the prior ranks candidates, it never discards a measured disc):
      - **With a prior**: candidates *inside* the gate (centre distance ≤ 0.25·R **and** radius ratio within [0.75, 1.33]) score
        `fill × (1 − dist/R)`; the best one is returned with `outsidePrior: false`.
      - If **no** candidate is inside the gate, rank every quality-passing candidate by `fill × area` (the no-prior score) and
        return the best with `outsidePrior: true`. Only return `null` when no candidate passes step 2 or step 2a at all.
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
- Fill guard (REV-26): a synthetic precision disc whose printed rings are bridged to the aiming mark by two spokes → the outer
  contour's pre-CLOSE `fill` is below 0.85 and it is rejected, at kernel 9 **and** at kernel 30 (the capture-prior kernel).
- Nested search (REV-26): the same bridged image → `detectAnchor` returns the **inner** aiming mark (radius within 2% of the
  true disc), not the merged shape, with `source 'auto'`.
- Reference photo (REV-26): `IMG_5132-precision.jpg` against `seed-calibrations.json` is **within** the step 10 tolerance
  (centre ≤ 5% R, radius ≤ 6%), with and without a capture prior. `IMG_5057-sighting.jpg` stays within tolerance (it has no
  merged shape, so the nested search must not change it). `pnpm cv:eval` exits 0.
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

1. **RESOLVED 2026-09-16 by owner decision REV-26: do both (a) and (b) — the pre-CLOSE fill guard *and*
   the nested search. Implement step 3 above as rewritten; round 1's work is already in the working tree,
   so this is a delta, not a rewrite. The evidence below is kept as the rationale.**
   A precision sheet's printed rings merge into the aiming
   mark, so the measured disc is 24-39% too large and, on the normal capture path, carries no warning.
   On `IMG_5132-precision.jpg` the ring numbers printed at 12 and 6 o'clock bridge the black aiming mark
   to rings 2/3, so the `RETR_EXTERNAL` contour of step 3.1 encloses everything out to ring 2. Its
   `fill = contourArea / (π a b)` is **1.000** — the contour is the *outer* boundary, so the ring gaps
   are inside it and the step 3.2 quality filter is vacuous for any outer boundary — and step 3.2
   accepts it.

   Measured against `seed-calibrations.json` (`radiusPx` 265; the 1200×1600 working image, detection
   scale 0.75):

   | CLOSE kernel (step 3.1) | when it happens | measured radius | radius err | `fill` (contourArea) | filled-pixel fraction inside the fitted ellipse, **post**-CLOSE | same, **pre**-CLOSE |
   |---|---|---|---|---|---|---|
   | k = 9  | import, no prior (`guessR` 0) | 329.9 px | **+24.48%** | 1.000 | 0.693 | 0.629 |
   | k = 25 | — | 368.9 px | **+39.19%** | 1.000 | 0.767 | 0.524 |
   | k = 30 | **capture with an overlay prior** (prior r ≈ 371 working px → `round(0.08·guessR)` = 30) | 368.8 px | **+39.18%** | 1.000 | **0.994** | 0.524 |

   Two consequences, both worse than the earlier note (which only measured the no-prior case):
   - With a realistic capture prior the error *grows* to ≈ +39%, and the radius ratio (≈ 368.8/371.3 ≈ 0.99)
     sits **inside** the step 3.3 gate, so the detection is returned with `outsidePrior: false`,
     `confidence` 1.000 → `chooseAlignment` yields `cv` / `auto` / 1.0 with **no `alignment-uncertain`
     warning**, and `photoStatus` reports `ready`/`analyzed`. Since `scale = radiusPx / (anchorDiameterMm/2)`,
     every shot's mm coordinate is compressed ~28%, corrupting ring scores, group size mm/MOA/MRAD and MPI
     offset — silently.
   - **The obvious fix is itself kernel-dependent, so it cannot be picked by an agent.** Redefining `fill`
     as the filled-pixel fraction inside the fitted ellipse rejects the merged blob at k = 9 and k = 25,
     but at k = 30 — the real capture path — the CLOSE has already filled the ring gaps and the fraction is
     **0.994**, which passes. Only measuring the fraction on the **pre**-CLOSE binary rejects it at every
     kernel size (0.52–0.63 vs `MIN_FILL` 0.85), and that variant still accepts the good sighting disc
     (`IMG_5057-sighting.jpg`: 0.962 pre-CLOSE, 0.995 post-CLOSE, radius err 0.06%).

   **The owner chose (a) + (b) together** (REV-26): (a) `fill` = filled-pixel fraction inside the fitted
   ellipse measured on the **pre-CLOSE** binary, which rejects the blob at every kernel size, and (b) look
   inside the outer contour (`RETR_CCOMP` children) for the real disc, so a precision photo still aligns
   automatically instead of falling back to the prior. Option (c) (restrict the search near the prior) was
   rejected because it contradicts REV-25 and does nothing for imports. The guard is the safety net: if the
   nested search ever fails, detection returns null and the overlay fallback applies with
   `alignment-uncertain`, rather than a wrong measurement being scored silently. The sighting sheet is
   unaffected (0.06% radius error) because its disc is the outermost dark shape.

   **`pnpm cv:eval` now exits non-zero because of this** (the reference rows are gated on M10 step 10's
   own tolerances, centre ≤ 5% of R and radius ≤ 6%, instead of being printed next to a zero exit code).
   **This affects real precision photos in M11/M12, not the synthetic fixtures those milestones are
   tested against.**

2. **`guessR` in step 3.1 is undefined for an import.** With a prior it is plainly the prior's radius in
   detection px. With no prior (an import) there is nothing to guess from, so the implementation uses the
   formula's own floor (`max(9, 0)` = 9). Evidence for the floor: on the reference JPEGs a larger kernel only
   merges more of the printed rings into the aiming mark (24.5% radius error at k = 9 vs 39.2% at k = 25).
3. **Step 5 does not define how a "dark→light transition" is decided.** The implementation binarises the
   gray detection image at its Otsu threshold, samples each ray every 0.5 px out to 0.95·R, and merges runs
   shorter than 1 px (so a 1 px ring line still counts, isolated noise does not). A median of exactly 4 is a
   tie between "≥ 5 → precision" and "≤ 3 → sighting"; it resolves to `precision` with `confidence` 0, which
   is below every consumer's threshold. `IMG_5057-sighting.jpg` lands exactly on that tie (hint
   `precision`, confidence 0.00) — harmless today because §2 B4 only warns at confidence ≥ 0.5, but the
   sighting sheet ideally would not hint "precision" at all.
4. **"the worker isn't called for alignment" (manual calibration).** `reviewAndAlign` is one call that does
   both A3 and A4, and A3 is not skipped, so Stage A still calls it — with `prior: null` — and discards the
   detection, keeping the manual calibration and `alignment.method = 'manual'` (§8). If the intent was to
   skip the worker entirely for manual photos, the worker needs a separate A3-only entry point.
5. **`session.updatedAt` is not touched by Stage A.** data-model §7 says every mutating service updates it,
   but M10 step 7.6 lists only the analysis and the photo status, and bumping it from a background job would
   constantly reorder the sessions list. Flagging the difference rather than guessing.
6. **Warning ownership.** Stage A owns `alignment-uncertain` and `image-blurry` and rewrites both on every
   run; it preserves an existing `template-mismatch` because that one belongs to Stage B (§2 B4).
7. **The owner's acceptance step "how long Stage A took (shown in `debug=1`)" cannot be done as written.**
   No step, file or schema field in M10 covers a Stage A timing readout (`PipelineState` has no duration
   field, and adding one is a data-model change), and no UI file is in scope for this milestone. The owner
   can still confirm the alignment method per photo from the stored analysis; recording a duration needs a
   spec/data-model decision.
8. **What is `pipeline.templateHint` when no anchor is found?** §2 lists A3 ("review image → sharpness
   score and template hint") as producing `templateHint` independently of A4, but `hintTemplate` needs a
   disc to walk its 16 rays from. The worker therefore uses `detection?.calibration ?? prior`, so an
   import of an unrecognised photo yields a sharpness score and `templateHint: null`. Defensible, but the
   spec should say so rather than leaving A3's output coupled to A4's success.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16; **fix round 1** applied
the same day after an independent review. Per the orchestration overrides this milestone was **not**
committed, pushed, or set to `done`.

**Status after fix round 1: the milestone cannot be marked done.** One Acceptance command (`pnpm cv:eval`)
now fails, deliberately and truthfully, on Open question 1 — a geometry decision AGENTS.md golden rule 2
reserves for the owner/spec. See *Fix round 1* below.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean (now including `scripts/`), lint 0 errors (4 pre-existing warnings), **358 unit tests in 46 files**, `privacy check passed (15 images)` |
| `pnpm cv:eval` | **FAIL (exit 1)** — all 3 synthetic cases pass and `IMG_5057-sighting.jpg` is within tolerance; `IMG_5132-precision.jpg` is 24.48% outside the step 10 radius tolerance (Open question 1) |
| `pnpm test:e2e` | **pass** — 16/16 in mobile-chromium and mobile-webkit, including `tests/e2e/pipeline.spec.ts` in both projects |

M10 added **35** unit tests across 7 new files (`tests/unit/cv/{anchor,sharpness,template-hint}.test.ts`,
`tests/unit/pipeline/{plan,alignment,stage-a,runner}.test.ts`); the suite total went from 322 to 358.
(An earlier agent report said "61 new unit tests" — that number was wrong; 35 is what vitest reports for
exactly those paths.)

### `pnpm cv:eval`

```text
### Anchor detection — synthetic sheets (prior offset +20/-15 px)

| case             | centre err (of R) | radius err | axisRatio | angle err | template hint    | result |
|------------------|-------------------|------------|-----------|-----------|------------------|--------|
| precision 260px  | 0.37%             | 0.18%      | 0.930     | 0.01°     | precision (0.75) | pass   |
| precision rot 30 | 0.36%             | 0.21%      | 0.930     | 0.02°     | precision (1.00) | pass   |
| sighting 450px   | 0.21%             | 0.14%      | 0.930     | 0.01°     | sighting (0.75)  | pass   |

### Anchor detection — reference JPEGs, no prior (seed tolerance: centre 5.00% of R, radius 6.00%)

| photo                 | centre err (of R) | radius err | axisRatio | template hint    | vs seed                      |
|-----------------------|-------------------|------------|-----------|------------------|------------------------------|
| IMG_5057-sighting.jpg | 1.18%             | 0.06%      | 0.901     | precision (0.00) | within seed tolerance        |
| IMG_5132-precision.jpg| 3.69%             | 24.48%     | 0.932     | precision (1.00) | FAIL (outside seed tolerance)|

### Sharpness (blurred = Gaussian sigma 3)

| image                       | sharp  | blurred | ratio |
|-----------------------------|--------|---------|-------|
| synthetic precision 260px   | 1034.3 | 4.4     | 0.004 |
| synthetic precision rot 30  | 1032.2 | 4.4     | 0.004 |
| synthetic sighting 450px    | 284.0  | 4.0     | 0.014 |
| IMG_5057-sighting.jpg       | 422.5  | 7.2     | 0.017 |
| IMG_5132-precision.jpg      | 607.1  | 11.4    | 0.019 |

lowest sharp = 284.0, highest blurred = 11.4
suggested BLUR_THRESHOLD = 57 (geometric mean of the two); current = 40
1 reference photo(s) outside the M10 step 10 seed tolerance (centre 5.00% of R, radius 6.00%)
```

### Fix round 1 (review findings)

- **Blocker — precision disc measured 24–39% too large, with no warning on the capture path.** Not fixed:
  every candidate fix changes the geometry of step 3.2/3.3, which AGENTS.md golden rule 2 reserves for the
  owner/spec. The review's evidence was reproduced and **extended** in Open question 1: with a realistic
  capture prior the error grows to +39% *and* the `alignment-uncertain` warning is lost, and the review's
  suggested fix (filled-pixel fraction inside the fitted ellipse) turns out to be **kernel-dependent** —
  it rejects the merged blob at k = 9/25 (0.693/0.767) but *accepts* it at k = 30 (0.994), which is
  exactly the kernel a capture prior produces. Only measuring that fraction on the **pre-CLOSE** binary
  (0.52–0.63 for the blob, 0.962 for the good sighting disc) rejects it at every kernel size. Open
  question 1 now states the three options and the numbers behind each, so the decision can be made without
  re-measuring.
- **Major — `pnpm cv:eval` reported a hollow pass.** Fixed (`scripts/cv-eval.ts`): the reference rows are
  now gated on the step 10 tolerances (`referenceFailures`) and feed `process.exit` alongside the synthetic
  ones, so the Acceptance command fails while the blocker stands instead of printing "outside seed
  tolerance" next to exit 0.
- **Minor — `waitForIdle()` could resolve before the runner started.** Fixed
  (`src/lib/pipeline/runner-browser.ts`): `pump()` no longer settles waiters when `active` is null, so a
  waiter that arrives before `startPipelineRunner` (`main.tsx` starts it from an async
  `loadAppServices().then(...)`) stays queued until the first drain. `resetRunnerForTests()` now releases
  queued waiters instead of dropping them. New unit test: *"does not report idle before the runner has
  started (§10)"*.
- **Minor — `scripts/` was not typechecked.** Fixed: new `tsconfig.scripts.json` (a copy of
  `tsconfig.test.json` with `include: ["scripts"]` and `resolveJsonModule`), referenced from
  `tsconfig.json`, so `tsc -b` inside `pnpm check` now covers `scripts/cv-eval.ts` and the pre-existing
  `scripts/render-samples.ts`. Both are clean.
- **Minor — manual calibration still calls `reviewAndAlign`.** Not changed: observable behaviour already
  complies with §8 (calibration untouched, `alignment.method` `'manual'`, no warnings, `prior: null`);
  skipping the worker entirely needs an A3-only entry point, which is a §6 `CvWorkerApi` change. Open
  question 4.
- **Minor — A3's `templateHint` is null when A4 finds nothing.** Not changed; recorded as new Open
  question 8.
- **Minor — wrong test count in the agent report.** Corrected above (35 new, 358 total).

### `BLUR_THRESHOLD`: kept at 40 (analysis-pipeline §3 asked M10 to record the measurements and adjust)

Measured sharp images span 284–1034, blurred (σ = 3) copies span 4.0–11.4 — nearly two orders of magnitude
apart, so any threshold in 12…280 separates them. 40 sits 3.5× above the blurriest blurred image and 7×
below the least sharp sharp one, and it is the value already written into the spec. The script's suggested
57 (the geometric mean of the two populations) is within noise of 40 and would only narrow the margin
against genuinely soft real-world photos, so the constant is unchanged and this measurement is the note the
spec asked for.

### Deviations and decisions

- **OpenCV in Node tests** (`tests/helpers/opencv.ts`): the app's static-ESM loader
  (`src/lib/cv/opencv-entry.ts`) is what the browser bundle needs, but under vite-node the same import
  yields a module namespace carrying a `then` binding (the package's CJS export is a Promise), and awaiting
  it throws `Method Promise.prototype.then called on incompatible receiver [object Module]` — the same class
  of interop bug as the M01 iPhone failure. Tests and `cv:eval` load it with `createRequire` and then hand
  the result to the app's own `resolveOpenCv`, so production code is exercised, not bypassed.
- **`pnpm cv:eval` runs as `tsx --tsconfig tsconfig.test.json`**: `src/` uses the `@/` alias internally and
  the root `tsconfig.json` is solution-style (no `paths`), so tsx needs to be pointed at a config that has
  them. (`tsconfig.scripts.json` is the *typecheck* project for the same files; tsx keeps using the test one
  because it also needs `tests/helpers`.)
- **New file outside the milestone Files list:** `tsconfig.scripts.json` (fix round 1, review minor).
- `eslint.config.js`: the node-globals block now covers `scripts/**/*.ts` as well as `.mjs` (for `cv-eval.ts`).
- `src/lib/store/{photos,analyses}-repo.ts` gained `listPhotoRecords` / `listAnalysisRecords` (zod-validating
  `getAll`), which the runner needs to plan over every photo.
- `src/lib/cv/opencv.ts` gained a `CvMat` type alias (the same allowed `any` handle) so Mat-returning
  helpers read clearly without spreading `any` through `src/lib`.
- `tests/e2e/capture.spec.ts` asserted `stageA === 'pending'` straight after capture; the M10 runner starts
  Stage A immediately, so it now accepts `pending | running | done`.
- The runner skips a job whose handler *throws out of* `runStageA` (as opposed to recording `stageA:
  'error'`, which it does for CV failures) for the rest of the page's life, so a broken record cannot spin
  the loop. `resetRunnerForTests()` clears that.
- Stage B jobs are planned but skipped until `registerStageBHandler` is called (M12).

### Owner checks (not done by the agent)

- **Decide Open question 1** (blocking): which of options (a) pre-CLOSE filled-pixel `fill`, (b) nested
  contours, or (c) prior-restricted search the spec should adopt for step 3.2/3.3. `pnpm cv:eval` stays red
  until it is implemented.
- On the iPhone, capture both paper targets and note the alignment method used for each. See Open question 7
  about the Stage A duration: nothing in M10's scope displays it.
