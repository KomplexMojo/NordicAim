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
   2a. **Nested search (REV-26), on the pre-CLOSE binary.** When an outer contour is rejected by step 2, test the **pre-CLOSE**
      contours lying geometrically inside its fitted ellipse with the same rules, and add those that pass to the candidate pool.
      Not the CLOSEd tree's children: the CLOSE welds the rings to the mark, leaving one crescent child at kernel 9 and none at
      kernel 30, whereas pre-CLOSE the mark is its own contour (264.8 px vs seed 265 on `IMG_5132-precision.jpg`). A nested
      candidate that passes is an ordinary candidate: step 3 ranks it, and `source`, `confidence` and `outsidePrior` are set
      exactly as for an outer candidate.
   3. Ranking (REV-25 — the prior ranks candidates, it never discards a measured disc):
      - **With a prior**: candidates *inside* the gate (centre distance ≤ 0.25·R **and** radius ratio within [0.75, 1.33]) score
        `fill × (1 − dist/R)`; the best one is returned with `outsidePrior: false`.
      - If **no** candidate is inside the gate, rank every quality-passing candidate by `fill² × area` (the no-prior score) and
        return the best with `outsidePrior: true`. Only return `null` when no candidate passes step 2 or step 2a at all.
      - **Without a prior**: score `fill² × area` (`FILL_EXPONENT` 2 — plain `fill × area` ranks a printed ring line above the
        aiming mark by 7.40% once the pool is nested), `outsidePrior: false` (the gate doesn't apply).
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

1. **RESOLVED 2026-09-16 by owner decision REV-26, and implemented in fix round 2.** A precision sheet's
   printed ring numbers bridge the aiming mark out to ring 2, so the outer contour measured 24-39% too
   large and, on the capture path, carried no warning — silently compressing every shot's mm position
   ~28%. Both remedies are now in `src/lib/cv/anchor.ts`: `fill` is the filled-pixel fraction inside the
   fitted ellipse measured on the **pre-CLOSE** binary (0.52-0.63 for the merged blob at every kernel
   size, 0.962 for a true sighting disc), and a rejected outer candidate triggers a **nested search** for
   the real disc. `IMG_5132-precision.jpg` now measures **1.02% centre / 0.07% radius** against
   `seed-calibrations.json` with *and* without a capture prior, and `pnpm cv:eval` exits 0. See new
   questions 9 and 10 for the two places the implementation had to go beyond the literal spec text.

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
9. **The nested search has to read the PRE-CLOSE binary, not the CLOSEd contour tree** (non-blocking; the
   milestone's own Tests only pass this way). Step 3.2a and REV-26 rule 2 say children come from the
   `RETR_CCOMP` extraction, which is taken after the CLOSE. Measured on `IMG_5132-precision.jpg`, that
   cannot work: the CLOSE is precisely what welds the rings to the aiming mark, so afterwards the disc's
   boundary is not a contour at all — the merged blob has **one** child at kernel 9 (a crescent, pre-CLOSE
   fill 0.681, correctly rejected) and **no children at all** at kernel 30. On the pre-CLOSE binary the
   sheet's shapes are still separate components, and `RETR_CCOMP` lists a component sitting inside
   another's hole at the top level, so the disc appears as its own contour:

   | pre-CLOSE contour | radius (working px) | fill | vs seed 265 |
   |---|---|---|---|
   | inner white ring line | 209.9 | 0.920 | −20.8% |
   | inner white ring line | 248.4 | 0.917 | −6.3% |
   | **the aiming mark** | **264.8** | **0.900** | **+0.07%** |
   | ring 1 | 291.0 | 0.775 | rejected by the guard |
   | merged blob | 329.9 | 0.629 | rejected by the guard |

   The implementation therefore tests **both** the rejected candidate's post-CLOSE hierarchy children (the
   literal rule) and every pre-CLOSE contour lying geometrically inside the rejected candidate's fitted
   ellipse. The spec should say which binary the nested search reads.
10. **Step 3.3's no-prior score `fill × area` picks a ring line over the aiming mark once the pool is
    nested** (non-blocking; flagged because it changes a spec'd formula). A ring line printed around the
    mark passes the fill guard — its interior is mostly the mark — and, being larger, wins on `fill × area`.
    Measured over the bridged fixture and the reference photo:

    | pool | `fill × area` | `fill² × area` | `fill⁸ × area` | max fill |
    |---|---|---|---|---|
    | bridged fixture (disc fill 0.998 vs ring 0.877) | ring, **+7.40%** | disc, +0.17% | disc, +0.17% | disc, +0.17% |
    | `IMG_5132` (5 candidates, fills 0.895–0.920) | mark, +0.07% | mark, +0.07% | **+6.27%** | **+20.78%** |

    The implementation uses `fill² × area` (`FILL_EXPONENT`), the smallest change correct on every measured
    case; a pool with one candidate is unaffected, since any monotone score picks it. The owner should
    ratify the exponent or state a different discriminator.
11. **The synthetic sighting fixture was unfaithful and became undetectable under the REV-26 guard.**
    Round 1 drew the sheet's prone zone as a *filled white* 45 mm disc inside the 115 mm ink disc, which
    punches ~15% out of the anchor: pre-CLOSE fill **0.845**, just below the spec'd 0.85 guard, so once the
    guard landed the synthetic sighting sheet returned no detection at all. On the real sheet
    (`docs/reference/IMG_5057-sighting.jpg`, fill 0.962) every zone marking is a thin **white line** on a
    solid black disc. The fixture now draws the prone solid, prone guide and inner circle as white strokes
    (fill **0.988**). This changes a fixture three test files share — `hintTemplate` confidence moved
    0.75 → 0.50 (still `sighting`) and its sharpness 284.0 → 325.6 — so it is recorded rather than buried.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16. **Fix round 2** landed the
REV-26 delta (the owner's decision on round 1's Open question 1) on top of round 1's implementation, which
was committed as `93b8cf5`. Per the orchestration overrides this milestone was **not** committed, pushed, or
set to `done`.

**All three Acceptance commands now pass**, including `pnpm cv:eval`, which round 1 left failing by design.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (4 pre-existing warnings), **363 unit tests in 46 files**, `privacy check passed (15 images)` |
| `pnpm cv:eval` | **pass (exit 0)** — all 3 synthetic cases and all 4 reference rows within tolerance |
| `pnpm test:e2e` | **pass** — 16/16 in mobile-chromium and mobile-webkit, including `tests/e2e/pipeline.spec.ts` in both |

Fix round 2 added **5** unit tests to `tests/unit/cv/anchor.test.ts` (358 → 363): two for the REV-26 fill
guard and nested search on the bridged fixture (kernel 9 and the capture-prior kernel 30), and three for the
reference photos (`IMG_5132-precision.jpg` with and without a capture prior, `IMG_5057-sighting.jpg`
unchanged).

### `pnpm cv:eval`

```text
### Anchor detection — synthetic sheets (prior offset +20/-15 px)

| case | centre err (of R) | radius err | axisRatio | angle err | template hint | result |
|---|---|---|---|---|---|---|
| precision 260px | 0.37% | 0.18% | 0.930 | 0.01° | precision (0.75) | pass |
| precision rot 30 | 0.36% | 0.21% | 0.930 | 0.02° | precision (1.00) | pass |
| sighting 450px | 0.21% | 0.14% | 0.930 | 0.01° | sighting (0.50) | pass |

### Anchor detection — reference JPEGs (seed tolerance: centre 5.00% of R, radius 6.00%)

| photo | prior | centre err (of R) | radius err | axisRatio | template hint | vs seed |
|---|---|---|---|---|---|---|
| IMG_5057-sighting.jpg | no prior | 1.18% | 0.06% | 0.901 | precision (0.00) | within seed tolerance |
| IMG_5057-sighting.jpg | capture prior | 1.18% | 0.07% | 0.901 | precision (0.00) · outsidePrior | within seed tolerance |
| IMG_5132-precision.jpg | no prior | 1.02% | 0.07% | 0.943 | precision (0.75) | within seed tolerance |
| IMG_5132-precision.jpg | capture prior | 1.02% | 0.07% | 0.943 | precision (0.75) · outsidePrior | within seed tolerance |

### Sharpness (blurred = Gaussian sigma 3)

| image | sharp | blurred | ratio |
|---|---|---|---|
| synthetic precision 260px | 1034.3 | 4.4 | 0.004 |
| synthetic precision rot 30 | 1032.2 | 4.4 | 0.004 |
| synthetic sighting 450px | 325.6 | 4.1 | 0.012 |
| IMG_5057-sighting.jpg | 422.5 | 7.2 | 0.017 |
| IMG_5132-precision.jpg | 607.1 | 11.4 | 0.019 |

lowest sharp = 325.6, highest blurred = 11.4
suggested BLUR_THRESHOLD = 61 (geometric mean of the two); current = 40

all synthetic cases and reference photos pass
```

The precision reference photo went from **24.48% radius error (outside tolerance, no warning on the capture
path)** in round 1 to **0.07%** here, with and without a capture prior. The sighting photo was already good
and is unchanged (0.06% → 0.06%), which is the check that the nested search does not disturb a sheet whose
disc is the outermost dark shape.

### Fix round 2 (the REV-26 delta)

- **`src/lib/cv/anchor.ts` — rule 1, the fill guard.** `fill` is now the filled-pixel fraction inside the
  fitted ellipse, measured on the **pre-CLOSE** binary (`ellipseFill`, rasterised only over the ellipse's
  bounding box to stay inside the §9 budget). The contour's own area is useless for this — an outer
  boundary always scores ~1.000, ring gaps included — and the post-CLOSE fraction is kernel-dependent
  (0.693 at k = 9 but 0.994 at k = 30, the kernel a capture prior produces).
- **`src/lib/cv/anchor.ts` — rule 2, the nested search.** Contours are taken with `RETR_CCOMP`; a rejected
  outer candidate's own children are tested, **and** so is every pre-CLOSE contour lying geometrically
  inside its fitted ellipse, which is the only place the swallowed disc still exists. See Open question 9
  for why the literal post-CLOSE-children rule cannot work, with the measurements.
- **`src/lib/cv/anchor.ts` — ranking.** The no-prior score is `fill² × area` (`FILL_EXPONENT`), because a
  nested pool contains ring lines that enclose the mark and beat it on the spec'd `fill × area`. Open
  question 10 has the comparison across four candidate rules.
- **`tests/helpers/synthetic-target.ts`** — the sighting sheet's prone zone is drawn as white strokes, as
  on the real sheet, instead of a filled white disc (Open question 11); new `bridgedPrecisionSvg` /
  `bridgedPrecisionRgba` fixture, whose ink bars stop 6 px short of the aiming mark so that — exactly as on
  `IMG_5132` — the mark is its own component pre-CLOSE while any CLOSE welds everything into one blob
  ~25% too large.
- **`scripts/cv-eval.ts`** — each reference photo is now evaluated twice, with no prior and with a capture
  prior ~40% larger than the disc (the case REV-26 is about), and `outsidePrior` is reported per row.

### `BLUR_THRESHOLD`: kept at 40 (analysis-pipeline §3 asked M10 to record the measurements and adjust)

Measured sharp images span 325.6–1034.3 and their blurred (σ = 3) copies span 4.1–11.4 — nearly two orders
of magnitude apart, so any threshold in 12…325 separates them. 40 sits 3.5× above the blurriest blurred
image and 8× below the least sharp sharp one, and it is the value already written into the spec. The
script's suggested 61 (the geometric mean of the two populations) would only narrow the margin against
genuinely soft real-world photos, so the constant is unchanged and this measurement is the note the spec
asked for.

### Deviations and decisions (rounds 1 and 2)

- **Two deviations from the literal spec text, both measured and both flagged for the owner:** the nested
  search reads the pre-CLOSE binary (Open question 9) and the no-prior score squares `fill`
  (Open question 10). Behaviour matches every case in the milestone's own *Tests* section.
- **One shared test fixture changed:** the synthetic sighting sheet (Open question 11).
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
- **New file outside the milestone Files list:** `tsconfig.scripts.json` (round 1, review minor), so `tsc -b`
  covers `scripts/`.
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

- **On the iPhone, capture both paper targets** and note the alignment method recorded for each
  (`#/diagnostics`, or the stored analysis). A precision sheet should now align as `cv`; if it falls back to
  `overlay` with `alignment-uncertain`, the nested search missed and that is worth reporting.
- **Ratify the two spec deviations**, Open questions 9 (nested search reads the pre-CLOSE binary) and 10
  (`fill² × area`), so `docs/spec/analysis-pipeline.md` §3 matches the code.
- See Open question 7 about the Stage A duration: nothing in M10's scope displays it.
