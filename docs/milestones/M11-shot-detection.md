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
_(add here)_

## Completion notes
_(fill in when done)_
