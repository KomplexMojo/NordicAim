# M11: CV worker and calibration refine

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M10 | medium | M | cv-scoring (calibrate geometry, template auto-hint) |

## Goal
On the phone, a Web Worker running OpenCV.js finds the anchor disc (the sighting 115 mm dark disc or the precision
112.4 mm black mark) **near the current calibration prior**, returns a refined ellipse calibration for the owner to
accept, and gives an optional template hint.

## Read first
- `docs/spec/geometry-scoring.md` §1–§2
- `docs/spec/data-model.md` §3 (`Calibration`)
- `docs/spec/capture-overlay.md` §3.3
- `docs/spec/metadata-lighting.md` §0.1 (`RgbaImage`)

## In scope
Pure CV functions over `RgbaImage`, worker API, synthetic target helper, eval script, editor button.

## Out of scope
Hole detection (M12), homography.

## Files
- `src/lib/cv/gray.ts`: `toGrayMat(cv, img, maxLongest)` → `{ mat, scale }`
- `src/lib/cv/anchor.ts`: `detectAnchor(cv, img, prior | null, template)` → `{ calibration, confidence } | null`
- `src/lib/cv/template-hint.ts`: `hintTemplate(cv, img, calibration)` → `{ template, confidence }`
- `src/workers/cv.worker.ts` (extend): `autoCalibrate(workingBytes: ArrayBuffer, prior, template)` decodes via
  `createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))` → `OffscreenCanvas` → `getImageData` → pure functions
- `tests/helpers/rgba.ts`: `jpegFileToRgba(path)`, `svgToRgba(svg, w, h)` (using sharp, Node only)
- `tests/helpers/synthetic-target.ts`: `syntheticTargetSvg({ template, widthPx, heightPx, cal, holes })`
- `scripts/cv-eval.ts` + script `"cv:eval": "tsx scripts/cv-eval.ts"`
- `tests/unit/cv/anchor.test.ts`, `template-hint.test.ts`

## Steps
1. `toGrayMat`: `cv.matFromImageData`-equivalent from `RgbaImage` (`cv.matFromArray(h, w, cv.CV_8UC4, data)`) → `cvtColor` to gray → resize so
   longest ≤ 1200; return `scale`. Always `delete()` Mats in `finally`.
2. `detectAnchor`:
   1. GaussianBlur 5×5; Otsu threshold inverted.
   2. MORPH_CLOSE with an elliptical kernel of `max(9, round(anchorRadiusGuessPx × 0.08))` (guess from the prior, else
      0.3 × short side).
   3. `findContours` EXTERNAL.
   4. For each contour with ≥ 5 points and area ≥ 1% of the image: `fitEllipse` → semi-axes a ≥ b, `fill = area / (π a b)`,
      `axisRatio = b/a`. Reject if `fill < 0.85` or `axisRatio < 0.6`.
   5. With a prior (scaled): reject if centre distance > 0.25 × prior radius or radius ratio outside [0.75, 1.33].
      Score = `fill × (1 − dist/priorR)`. Without a prior, score = `fill × area`.
   6. Map back to working px (`/ scale`); convert the OpenCV angle to spec `angleDeg` (major axis, clockwise from image +x,
      [0, 180)) with a dedicated tested helper `openCvAngleToSpec`.
   7. Return `source: 'auto'`, `confidence = fill`.
3. `hintTemplate`: 16 rays from the centre, sampling gray within 0.95·R and counting dark→light transitions (threshold midway
   between the disc median and the paper median). Median ≥ 5 → `precision`; ≤ 3 → `sighting`; else nearest.
   `confidence = clamp(|median − 4| / 4, 0, 1)`.
4. Worker `autoCalibrate` → `{ calibration, confidence, templateHint } | null`.
5. Editor (M10 `CalibrationControls`): **Auto-detect target** → ghost ellipse → **Accept** (via `saveAnalysis`) / **Dismiss**.
   If the hint disagrees with the categorization at confidence ≥ 0.5, show a notice.
6. `cv-eval.ts` (Node): synthetic cases, the two `docs/reference` JPEGs against `seed-calibrations.json` (loose: centre ≤ 5% R,
   radius ≤ 6%), and any `fixtures/reference/ground-truth/*.json`. Print a table.

## Tests (Node, OpenCV.js, synthetic)
- Precision 1200×1600, cal `{620, 830, 260, 0.93, 0}`, 8 holes, prior offset (+20, −15) and radius 280 → centre within
  1.5% R, radius within 2%, axisRatio within 0.02.
- Sighting, same checks at radius 450.
- A 30° rotated ellipse → `angleDeg` within 2°.
- Blank paper → `null`.
- The template hint is correct for both synthetic templates.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste the `cv:eval` table into Completion notes. **Human (owner):** try **Auto-detect target** on the iPhone on both
demo photos and note the time taken and the result.

## Pitfalls
- OpenCV.js Mats leak without `.delete()`, and the phone has less memory than CI.
- `fitEllipse` returns full axis lengths; halve them.
- Send `ArrayBuffer`s to the worker with `Comlink.transfer` to avoid copies.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
