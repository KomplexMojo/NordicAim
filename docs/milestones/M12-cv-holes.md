# M12: CV hole detection

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M11 | medium | L | cv-scoring (detect holes, dense clusters) |

## Goal
Given a calibrated photo, the worker proposes shots in mm with multiplicity hints for merged or torn clusters. The owner
accepts, edits, or ignores them. Nothing is overwritten silently.

## Read first
- `docs/spec/geometry-scoring.md` §1–§3
- `docs/spec/data-model.md` §4 (`Shot`)
- `docs/DESIGN.md` "Reference reads"

## In scope
Rectification, segmentation, cluster hints, cluster splitting, worker API, editor integration, evaluation.

## Out of scope
Deep learning; full homography.

## Files
- `src/lib/cv/rectify.ts`: `rectify(cv, img, calibration, template)` → canonical gray Mat at **8 px/mm**, square side
  `2·(outerRadiusMm + 10)·8`
- `src/lib/cv/holes.ts`: `detectHoles(cv, img, calibration, template, profile)` → `AutoShot[]` (+ `clusterPointsMm` for clusters, ≤ 400 points)
- `src/lib/cv/split-cluster.ts`: `splitCluster(cv, pointsMm, k)` → k centroids
- `src/workers/cv.worker.ts`: add `autoDetect(workingBytes, calibration, template, profile)` and `split(pointsMm, k)`
- Editor updates; `scripts/cv-eval.ts` (extend); `tests/unit/cv/holes.test.ts`, `split-cluster.test.ts`

## Steps
1. `rectify`: build the affine from target mm to working px with `mmToPx` at (0,0), (10,0), (0,10) → invert →
   `warpAffine` into canonical px `((x + half)·8, (half − y)·8)`.
2. Single hole area `A1 = π (holeDiameterMm/2)² · 64` (≈ 1576 px² at 5.6 mm).
3. Inside the dark disc (radius ≤ anchor R − 1 mm): `mask_in = gray > median(disc) + 45`. Outside (to outer + 5 mm):
   `mask_out = gray < median(paper annulus) − 50`.
4. Zero the mask within ±0.9 mm of every printed circle radius (rings, guides, zones); then CLOSE 3×3 and OPEN 3×3.
5. `connectedComponentsWithStats`; drop area < 0.35·A1. For each component:
   - `k = area / A1`
   - circularity from `findContours` + `arcLength`
   - `cluster = k ≥ 1.6 || circularity < 0.65`
   - `multiplicity = cluster ? clamp(round(k), 2, 8) : 1`
   - centre = centroid → mm
   - `confidence = clamp(circularity, 0, 1) × (cluster ? 0.6 : 1)`
   - ids `auto-<n>`, sorted by confidence desc.
6. Editor:
   - **Auto-detect shots** shows ghosts. It needs a saved calibration; otherwise show "Calibrate target first".
   - **Accept all** adds proposals more than 2.5 mm from existing shots.
   - **Replace all** asks for confirmation first.
   - Tap a ghost to accept it individually.
   - **Split** on a cluster calls `split` into k multiplicity-1 shots.
   - Show a progress spinner while the worker runs.
7. Extend `cv:eval`: greedy match ≤ 3 mm → recall, precision, mean error (mm), unit-count error.

## Tests (Node, synthetic tan 5.6 mm holes)
- Precision, 8 separate holes (some on ring lines) → recall ≥ 0.95, precision ≥ 0.95, mean error ≤ 0.8 mm.
- Sighting: 4 holes with two overlapping at 3 mm → one cluster (multiplicity 2 ± 1) plus 2 singles; total units within ±1 of 4.
- Holes on white paper outside the disc are found.
- `splitCluster` of two Gaussian blobs 6 mm apart → centroids within 1 mm.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste real-photo `cv:eval` results (reference JPEGs, owner ground truth) into Completion notes; there's no bar for real
photos. **Human (owner):** run Auto-detect on the iPhone on both demo photos and note the duration and quality.

## Pitfalls
- Thresholds must be relative to local medians; backer colour varies.
- CLOSE runs after the line masking.
- Never auto-save proposals.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
