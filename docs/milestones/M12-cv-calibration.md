# M12: CV calibration refine

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M11 | medium | M | cv-scoring (calibrate geometry, template auto-hint) |

## Goal
Server-side OpenCV.js finds the anchor disc (the sighting 115 mm dark disc, or the precision 112.4 mm black
aiming mark) **near the current calibration prior** and returns a refined ellipse calibration for the owner to
accept. It also provides an optional template hint.

## Read first
- `docs/spec/geometry-scoring.md` §1–§2
- `docs/spec/data-model.md` §3 (`Calibration`), §7 (auto-calibrate route)
- `docs/spec/capture-overlay.md` §3.3 (how the prior is produced)

## In scope
`src/lib/cv/image-io.ts`, `anchor.ts`, `template-hint.ts`, synthetic target helper, route, editor button, eval script.

## Out of scope
Hole detection (M13), homography.

## Files
- `src/lib/cv/image-io.ts`: `loadGrayMat(jpeg, maxLongest)` → `{ mat, scale }` (via sharp raw greyscale → `cv.matFromArray`)
- `src/lib/cv/anchor.ts`: `detectAnchor(workingJpeg, prior | null, template)` → `{ calibration, confidence } | null`
- `src/lib/cv/template-hint.ts`: `hintTemplate(workingJpeg, calibration)` → `{ template, confidence }`
- `src/app/api/sessions/[sessionId]/photos/[photoId]/analysis/auto-calibrate/route.ts`
- `tests/helpers/synthetic-target.ts`: `renderSyntheticTarget({ template, widthPx, heightPx, cal, holes: {xMm, yMm}[] })` → JPEG (draw an SVG with sharp)
- `scripts/cv-eval.ts` + script `"cv:eval": "tsx scripts/cv-eval.ts"`
- `tests/unit/cv/anchor.test.ts`

## Steps
1. `loadGrayMat`: resize to longest ≤ 1200 for detection and record `scale = 1200 / longest` (or 1). Always
   `delete()` Mats in `finally`.
2. `detectAnchor`:
   1. `GaussianBlur` 5×5.
   2. Otsu threshold inverted (dark → 255).
   3. `morphologyEx` CLOSE with an elliptical kernel of `max(9, round(anchorRadiusGuessPx × 0.08))`. This fills
      white ring lines and bullet holes inside the disc.
   4. `findContours` (EXTERNAL).
   5. For each contour with ≥ 5 points and area ≥ 1% of the image: `fitEllipse` → major and minor radii and
      angle. Compute `fill = contourArea / (π·a·b)` and `axisRatio = b/a`.
   6. Reject if `fill < 0.85` or `axisRatio < 0.6`.
   7. If a prior exists (scaled into detection px), reject when the centre distance > 0.25 × prior radius or
      the radius ratio is outside [0.75, 1.33]. Score = `fill × (1 − centreDist/priorR)`. Without a prior,
      score = `fill × area` (largest wins).
   8. Convert the best result back to working px (`/ scale`). Map the OpenCV angle convention to spec
      `angleDeg` (major axis, clockwise from image +x, [0, 180)). Write a unit test for this mapping with a
      synthetic ellipse rotated 30°.
   9. Return `source: 'auto'`, `confidence = fill`.
3. `hintTemplate`: along 16 rays from the centre, sample greyscale inside radius 0.95·R and count dark→light
   transitions (threshold midway between the disc median and the paper median). Median count ≥ 5 →
   `precision`, ≤ 3 → `sighting`, else the one closest, with confidence `|median − 4| / 4` clamped to [0, 1].
4. Route: loads the working image and the current analysis calibration (the prior); returns
   `{ calibration, confidence, templateHint }` or 422 `not_found`. It does **not** save.
5. Editor (M11 `CalibrationControls`): **Auto-detect target** button → ghost ellipse overlay in a different
   colour → **Accept** (PUT the analysis with the new calibration) / **Dismiss**. If `templateHint` disagrees
   with the categorization at confidence ≥ 0.5, show a non-blocking notice.
6. `scripts/cv-eval.ts`:
   - For each ground truth in `fixtures/reference/ground-truth/*.json` (if any) and each synthetic case,
     report centre error (% of R), radius error (%), and axis-ratio error.
   - Always run on the two `docs/reference` JPEGs using `seed-calibrations.json` as a **loose** check
     (centre ≤ 5% R, radius ≤ 6%).

## Tests
Synthetic, no private files needed:
- Precision: 1200×1600 image, cal `{cx 620, cy 830, radiusPx 260, axisRatio 0.93, angleDeg 0}`, 8 holes. With
  a prior offset by (+20, −15) px and radius 280 → detected centre within 1.5% R, radius within 2%, axisRatio
  within 0.02.
- Sighting, same checks, radius 450.
- Rotated 30° ellipse → `angleDeg` within 2°.
- No disc (blank paper) → `null`.
- Template hint: synthetic precision → `precision`; synthetic sighting → `sighting`.

## Acceptance
```bash
pnpm check
pnpm cv:eval
```
Paste the `cv:eval` table into Completion notes.

## Pitfalls
- OpenCV.js Mats leak unless you call `.delete()`.
- `fitEllipse` returns full axis lengths (width/height), not radii; halve them.
- OpenCV's rotated-rect angle convention differs from the spec, so test the mapping.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
