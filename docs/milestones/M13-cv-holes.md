# M13: CV hole detection

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M12 | medium | L | cv-scoring (detect holes, dense clusters) |

## Goal
Given a calibrated photo, propose shots in mm with multiplicity hints for merged or torn clusters. The owner
accepts, edits, or ignores the proposals. It never overwrites manual work silently.

## Read first
- `docs/spec/geometry-scoring.md` §1–§3
- `docs/spec/data-model.md` §4 (`Shot`), §7 (auto-detect route)
- `docs/DESIGN.md` "Reference reads" (sighting dense overlap is the hard case)

## In scope
Rectification to a canonical mm image, hole segmentation inside and outside the dark disc, cluster
multiplicity hints, cluster splitting, route, editor integration, evaluation.

## Out of scope
Deep learning (excluded by design); full perspective homography.

## Files
- `src/lib/cv/rectify.ts`: `rectify(workingJpeg, calibration, template)` → canonical Mat at **8 px/mm**, size
  `2·(outerRadiusMm + 10)·8` square, centre = target centre
- `src/lib/cv/holes.ts`: `detectHoles(workingJpeg, calibration, template, profile)` → `AutoShot[]`
- `src/lib/cv/split-cluster.ts`: `splitCluster(points, k)` → k centroids (`cv.kmeans`, fixed attempts 5, `KMEANS_PP_CENTERS`)
- `src/app/api/sessions/[sessionId]/photos/[photoId]/analysis/auto-detect/route.ts`
- Editor updates in `src/components/review/*`
- `scripts/cv-eval.ts` (extend)
- `tests/unit/cv/holes.test.ts`

## Steps
1. `rectify`: build the affine transform mapping target mm to working px, using `mmToPx` at three points
   (0,0), (10,0), (0,10). Invert it, then `warpAffine` into canonical space where canonical px =
   `(x + half) · 8, (half − y) · 8`.
2. Single hole area `A1 = π · (holeDiameterMm/2)² · 64` px² (≈ 1576 at 5.6 mm).
3. **Inside the dark disc** (radius ≤ anchor R − 1 mm): holes are light, so
   `mask_in = gray > (median(gray in disc) + 45)`.
4. **Outside** (up to outer radius + 5 mm): holes are darker than paper, so
   `mask_out = gray < (median(gray in paper annulus) − 50)`.
5. Remove printed lines. For every template circle (ring radii, guides, and zone circles), zero the mask
   within ±0.9 mm of that radius. Then MORPH_CLOSE 3×3 and MORPH_OPEN 3×3.
6. Components (`connectedComponentsWithStats`). Discard components with area < 0.35·A1. For each:
   - `k = area / A1`
   - circularity = 4π·area / perimeter² (perimeter from `findContours` + `arcLength`)
   - `cluster = k ≥ 1.6 || circularity < 0.65`
   - `multiplicity = cluster ? clamp(round(k), 2, 8) : 1`
   - centre = centroid, converted to mm
   - `confidence = clamp(circularity, 0, 1) × (cluster ? 0.6 : 1)`.
7. Return `AutoShot = Shot & { source: 'auto' }` with ids `auto-<n>`. Sort by descending confidence.
8. Route: needs the saved calibration (else 409 `needs_calibration`). Returns `{ shots }` without saving.
9. Editor:
   - **Auto-detect shots** shows ghost markers.
   - **Accept all** adds every proposal whose centre is > 2.5 mm from existing shots.
   - **Replace all** asks for confirmation first.
   - Tap a ghost to accept it individually.
   - On a cluster shot, **Split** runs `splitCluster` on the component pixels (return them from the route as
     `clusterPointsMm` for cluster shots, capped at 400 points each) into k shots of multiplicity 1.
10. Extend `cv:eval`: match proposals to ground-truth shots greedily by nearest distance ≤ 3 mm. Report
    recall, precision, mean position error (mm), and unit-count error (Σ multiplicity difference).

## Tests
Synthetic via `tests/helpers/synthetic-target.ts` (tan hole discs of 5.6 mm, some overlapping):
- Precision, 8 separate holes (some straddling ring lines) → recall ≥ 0.95, precision ≥ 0.95, mean error ≤ 0.8 mm.
- Sighting: 4 holes, including two overlapping at 3 mm centre distance → one cluster with multiplicity 2
  (± 1) plus 2 singles, and total units within ±1 of 4.
- Holes on white paper outside the disc are detected.
- `splitCluster` on two Gaussian blobs 6 mm apart → centroids within 1 mm of truth.

## Acceptance
```bash
pnpm check
pnpm cv:eval
```
Quality bars (synthetic, required): the numbers above. Real photos (report only, no bar): paste
`cv:eval` output for the reference JPEGs and any owner ground truth into Completion notes.

## Pitfalls
- Backer material showing through torn paper varies in colour; thresholds are relative to local medians,
  never absolute.
- Masking ring lines can cut a hole in two. The close operation must run **after** masking.
- Never auto-save proposals.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
