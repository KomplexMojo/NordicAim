# M11: Shot detection

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M10 | medium | L | generate analysis (find the shots to score) |

## Goal
Stage A step A5: given the alignment, the worker detects bullet holes and proposes shots in mm (with multiplicity for merged or
torn clusters). These are the inputs to scoring.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A5), §6, §8
- `docs/spec/geometry-scoring.md` §1–§3
- `docs/spec/data-model.md` §4 (`Shot`)
- `docs/DESIGN.md` "Reference reads"

## In scope
Rectification, segmentation, cluster multiplicity, cluster splitting, worker `detectShots`, the A5 step with the manual guard, evaluation.

## Out of scope
Scoring and UI (M12), manual editing (M13), deep learning.

## Files
- `src/lib/cv/rectify.ts`, `holes.ts`, `split-cluster.ts`
- `src/workers/cv.worker.ts` (add `detectShots`; add `splitCluster(pointsMm, k)` for M13)
- `src/lib/pipeline/stage-a.ts` (add A5)
- `scripts/cv-eval.ts` (extend)
- `tests/unit/cv/holes.test.ts`, `split-cluster.test.ts`, `tests/unit/pipeline/stage-a.test.ts` (extend)

## Steps
1. `rectify(cv, img, calibration, template)`: affine from target mm to working px via `mmToPx` at (0,0), (10,0), (0,10) → invert →
   `warpAffine` to canonical 8 px/mm, square side `2·(outerRadiusMm + 10)·8`.
2. `A1 = π (holeDiameterMm/2)² · 64`.
3. Inside the disc (≤ anchor R − 1 mm): `gray > median(disc) + 45`. Outside (to outer + 5 mm): `gray < median(paper annulus) − 50`.
4. Zero ±0.9 mm around every printed circle radius; CLOSE 3×3; OPEN 3×3.
5. Components: drop area < 0.35·A1. For each component:
   - `k = area/A1`
   - circularity
   - `cluster = k ≥ 1.6 || circularity < 0.65`
   - `multiplicity = cluster ? clamp(round(k), 2, 8) : 1`
   - centroid → mm
   - `confidence = clamp(circularity, 0, 1) × (cluster ? 0.6 : 1)`
   - ids `auto-<n>`, `source 'auto'`.
6. `splitCluster(cv, pointsMm, k)`: `cv.kmeans` (attempts 5, `KMEANS_PP_CENTERS`) → k centroids.
7. A5 in `runStageA`, after A4:
   - calibration null → skip (shots stay `[]`)
   - any shot has `source === 'manual'` → skip
   - otherwise `detectShots` → replace shots.
   Then `stageA 'done'`.
8. `cv:eval`: greedy match ≤ 3 mm against synthetic truth, the reference JPEGs (using fixture shots as approximate truth), and owner
   ground truth if present → recall, precision, mean error, unit-count error.

## Tests (Node, synthetic tan 5.6 mm holes)
- Precision, 8 separate holes (some on ring lines) → recall ≥ 0.95, precision ≥ 0.95, mean error ≤ 0.8 mm.
- Sighting: 4 holes, two overlapping at 3 mm → one cluster (multiplicity 2 ± 1) + 2 singles; total units within ±1 of 4.
- Holes on white paper outside the disc are found.
- `splitCluster` of two blobs 6 mm apart → centroids within 1 mm.
- `runStageA`: a manual shot present → `detectShots` not called; calibration null → not called.
- E2E: fake camera precision → `waitForIdle` → `shots.length > 0` (no accuracy assertion).

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste real-photo eval results into Completion notes (no bar for real photos). **Human (owner):** check detection on real
targets on the iPhone once M12 shows results.

## Pitfalls
- Thresholds relative to local medians.
- CLOSE after masking.
- Never overwrite manual shots.

## Open questions

1. **`outerRadiusMm` (step 1) is not defined anywhere.** Implemented as
   `overlayCircles(template).outerDiameterMm / 2` (capture-overlay §3.1), i.e. **57.5 mm** sighting (the disc) and
   **77.2 mm** precision (ring 1). That makes the canonical square 1080 px and 1395 px respectively. Confirm, or name a
   different circle.
2. **"every printed circle radius" (step 4) is not enumerated.** Implemented from the templates' own geometry
   (geometry-scoring §1.2/§1.3) in `printedCircleRadiiMm`: sighting `[7.5, 20, 22.5, 55, 57.5]`; precision
   `[2.5, 5.2, 13.2, 21.2, 29.2, 37.2, 45.2, 53.2, 56.2, 61.2, 69.2, 77.2]`, plus the *calibration's* own anchor radius
   (which a manual calibration can move off the template's).
3. **The ±0.9 mm erase can delete a dead-centre precision hole.** A 5.6 mm hole at (0, 0) is cut by both the inner-ten
   band (2.5 ± 0.9 → 1.6–3.4 mm) and the ring-10 band (5.2 ± 0.9), leaving only the r < 1.6 mm core: 8.0 mm² against
   `0.35 · A1` = 8.6 mm², so **an X is dropped**. Options: skip the two innermost bands, narrow them near the centre, or
   lower the minimum area inside ring 10. Not changed here — step 4 says "every printed circle radius".
4. **Printed numerals are detected as shots, and this is the dominant real-photo error (see Completion notes).** Step 4
   erases printed *circles*; the precision sheet also prints ring **numbers** — white on the black mark at 12 and 6
   o'clock, dark on the paper at 3 and 9 — and every one of them passes the step 3 tests. On `IMG_5132-precision.jpg`
   that gives **19 detections / 62 units against ~9 holes / 10 rounds**, which in M12 will read as `too-many-shots` on
   every real precision target. The numerals are thin and ragged, so they also fail the circularity test and become
   clusters with `multiplicity ≥ 2`, which is what inflates the unit count. A stroke-width or elongation filter, or
   erasing the two numeral sectors, would fix it — both are beyond what M11 specifies.
5. **Confidence does not separate the false positives on real photos.** Every real-photo component (true holes on the
   sighting sheet included) came out with `circularity` ≈ 0.02–0.13, because a torn hole photographed at ~5 px/mm has a
   very ragged boundary once it is upsampled to the canonical 8 px/mm. So a confidence threshold in M12 cannot be used
   to drop the numerals of question 4 without also dropping real holes. The synthetic sheets, whose holes are clean
   ellipses, score ≈ 1.0 — the unit tests therefore do **not** cover this.
6. **Which template A5 detects against is not specified.** `shotTemplate` in `stage-a.ts` uses
   `categorization.template → capture.overlayTemplate → A3's templateHint → the calibration's anchor diameter`.
7. **`splitCluster` is not in the worker API (analysis-pipeline §6)**, but the milestone's *Files* asks for it there.
   Added as `splitCluster(pointsMm: PointMm[], k: number): Promise<PointMm[]>`; §6 should gain the line.
8. **Shot id order is unspecified.** Ids are `auto-1 …` in ascending radial distance (ties by x, then y), so they are
   stable for a given image.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16. Per the orchestration overrides this
milestone was **not** committed or pushed, and its Status is left `in-progress`.

**All three Acceptance commands pass.**

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (4 pre-existing warnings), **381 unit tests in 48 files** (was 363 in 46), `privacy check passed (15 images)` |
| `pnpm cv:eval` | **pass (exit 0)** — 3 synthetic anchor cases, 4 reference anchor rows and 2 synthetic shot cases all within tolerance; real-photo shot rows reported, not gated |
| `pnpm test:e2e` | **pass** — 16/16 in mobile-chromium and mobile-webkit, including the extended `pipeline.spec.ts` in both |

18 new unit tests: `tests/unit/cv/holes.test.ts` (8), `tests/unit/cv/split-cluster.test.ts` (4),
`tests/unit/pipeline/stage-a.test.ts` (+6 for A5).

### What was built

- **`src/lib/cv/rectify.ts`** — step 1. `mmToPx` is sampled at (0,0), (10,0) and (0,10) to build the mm → working-px
  affine, which is inverted and `warpAffine`d into a square canonical view at 8 px/mm (1395 px precision, 1080 px
  sighting). An all-255 source mask is warped alongside with `INTER_NEAREST`, so pixels the warp invented outside the
  photo are never read as ink or as paper.
- **`src/lib/cv/holes.ts`** — steps 2–5. Local-median thresholds (`> median(disc) + 45` inside anchor R − 1 mm,
  `< median(paper) − 50` out to outer + 5 mm, both via a 256-bin histogram rather than a 2M-element sort), ±0.9 mm
  erase around every printed circle radius, CLOSE 3×3 then OPEN 3×3, then components → shots.
- **`src/lib/cv/split-cluster.ts`** — step 6. `cv.kmeans`, 5 attempts, `KMEANS_PP_CENTERS`; `k` clamped to
  `1 … points.length`, centres sorted so the result is reproducible.
- **`src/workers/cv.worker.ts` / `cv-client.ts`** — `detectShots` (§6's signature exactly) and `splitCluster`.
- **`src/lib/pipeline/stage-a.ts`** — A5 after A4, with the §8 guards, then `stageA: 'done'` in the same transaction.

### `pnpm cv:eval` — shot detection

```text
### Shot detection (greedy match <= 3 mm; synthetic bar: recall >= 0.95, precision >= 0.95, mean error <= 0.8 mm, unit count +/-1)

| case | truth | detected | recall | precision | mean err (mm) | unit count err | result |
|---|---|---|---|---|---|---|---|
| precision · 8 separate holes | 8 | 8 | 1.00 | 1.00 | 0.25 | +0 | pass |
| sighting · 4 holes, 2 overlapping | 4 | 3 | 0.75 | 1.00 | 0.56 | +0 | pass |
| IMG_5057-sighting.jpg (fixture shots) | 7 | 5 | 0.29 | 0.40 | 1.99 | +2 | reported · no bar |
| IMG_5132-precision.jpg (fixture shots) | 9 | 19 | 0.11 | 0.05 | 1.92 | +52 | reported · no bar |
```

The anchor and sharpness tables are unchanged from M10. The sighting cluster row's recall of 0.75 is the **correct**
outcome, not a miss: two of the four holes overlap and are reported as one cluster of multiplicity 2, which is why its
unit-count error is 0.

### Real photos — read this before the owner check (no bar, per the milestone)

The two reference rows above are **not** a like-for-like accuracy measure: `fixtures/reference/sample-shots-*.json` was
traced from the owner's example *diagrams*, not measured off these JPEGs, so a low recall against it is expected. What
the rows do show is a real problem, confirmed by dumping the detections:

- **`IMG_5057-sighting.jpg`** detects 5 blobs at (2.0, −0.5), (0.4, 4.2), (3.4, −11.0), (3.5, 11.5), (7.1, −19.6) mm —
  these line up with the actual ragged cluster in the photo. Sighting detection looks broadly right, with overlapping
  holes merged (which is what multiplicity is for).
- **`IMG_5132-precision.jpg`** detects 19 blobs / 62 units against ~9 holes. Eleven of them sit at x ≈ 0 with radii
  7.1, 7.5, 13.0, 13.2, 19.8, 21.4, 26.1, 27.6, 32.1, 38.7 mm — i.e. **the printed ring numbers** at 12 and 6 o'clock,
  which step 4 does not erase (it erases printed *circles*). They are thin and ragged, so they also fail the
  circularity test and are promoted to `multiplicity ≥ 2`, which is where +52 units comes from.

This is **Open question 4** and it is the one worth the owner's attention: as it stands, M12 will show
`too-many-shots` on a real precision target. Open question 5 records why a confidence threshold in M12 cannot filter
them out — on real photos every component, true holes included, scores `circularity` ≈ 0.02–0.13, against ≈ 1.0 on the
synthetic sheets the unit tests use.

### Deviations and decisions

- **No deviation from any stated number.** Every constant in steps 2–6 is implemented literally (45, 50, 0.9 mm, 0.35,
  1.6, 0.65, 0.6, clamp 2–8, 8 px/mm, 5 attempts). The three quantities the milestone leaves undefined —
  `outerRadiusMm`, the printed-circle list, and A5's template source — are Open questions 1, 2 and 6, each implemented
  from an existing spec section rather than invented.
- **Areas come from `connectedComponentsWithStats`, perimeters from `findContours`.** Step 5 says "components", and a
  component's pixel count is exact, whereas `contourArea` (a polygon through pixel centres) under-reads a 5.6 mm hole
  by ~4.4% and would have pushed the spec'd `k ≥ 1.6` cluster test onto the wrong side for a two-hole merge
  (1.587 vs 1.648). Contours are still walked once for `arcLength`, matched to their label by the label image under
  each contour's first point.
- **Two files outside the milestone's *Files* list**, both test-only: `tests/helpers/shot-match.ts` (the greedy ≤ 3 mm
  matcher, shared by the unit test and `cv:eval` so step 8 and the Tests section cannot drift apart) and holes support
  in `tests/helpers/synthetic-target.ts` (an optional `holesMm` on the spec, drawn through the app's own `mmToPx`, plus
  the two canonical hole layouts the milestone's Tests describe).
- **`tests/unit/pipeline/runner.test.ts`** needed `detectShots` added to its `CvApi` stub (the type widened).
- `bytes.slice(0)` in Stage A: `Comlink.transfer` detaches the buffer it sends, so A5 needs its own copy of the working
  JPEG rather than re-reading the blob.
- A5 leaves the stored shots untouched (rather than clearing them) when it is skipped, so a re-run can never destroy
  data it did not replace.

### Owner checks (not done by the agent)

- **On the iPhone, once M12 shows results, check detection on both real paper targets.** Expect the precision target to
  over-count badly (Open question 4); the sighting target should look roughly right with overlaps merged.
- **Decide Open questions 3 and 4** — whether a dead-centre X may be erased by the inner bands, and whether to add a
  numeral filter to step 4. Both change `docs/spec/analysis-pipeline.md` §2 (A5) or this milestone.
- **M13 will produce the real ground truth** (`fixtures/reference/ground-truth/*.json` from the Adjust export);
  `cv:eval` already picks those files up automatically and reports against them when they exist.
