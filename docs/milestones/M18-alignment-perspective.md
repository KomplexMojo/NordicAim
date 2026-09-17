# M18: Alignment under perspective (the centre rings)

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16 | high | M | overlay it on the target template · generate analysis |

## Goal
The rings the app scores against must sit on the printed rings **at the centre**, not only at the edge. In the owner's review of 46
real photos (2026-09-17) alignment was rated **"close" on 30, "good" on 8 and "wrong" on 1**, with the comments *"The centre rings are
always slightly off"* and *"The centre outline for the 10 mark isn't aligning."* The centre is where the 10 and 9 rings are, so a
millimetre or two there changes scores. This milestone finds out why, measures it, and fixes it — or stops with the evidence if the fix
needs a data-model change the owner has not approved.

## Read first
- `docs/DESIGN-REVISIONS.md` — the 2026-09-17 section, and REV-25, REV-26, REV-31
- `docs/spec/geometry-scoring.md` §1–§2 (templates, `mmToPx` / `pxToMm`)
- `docs/spec/analysis-pipeline.md` §3 (alignment rules)
- `docs/milestones/M10-target-alignment.md` Step 3 (anchor detection)
- `docs/spec/data-model.md` (the `Calibration` shape)

## In scope
Measuring the centre offset, a calibration that places the printed centre correctly under perspective, `cv:eval` alignment reporting.

## Out of scope
Hole detection (M16), the Adjust screen's handles (M13/M17) unless the calibration shape changes and they must follow.

## Steps
1. **Test the hypothesis before building on it.** The likely cause is perspective: the calibration is an *ellipse* fitted to the
   anchor disc (an affine model), but a circle photographed off-axis projects to an ellipse whose **centre is not the image of the
   circle's centre**. Concentric rings drawn around the ellipse centre then drift off the printed rings, most visibly at the middle.
   Check it on the owner's photos: fit ellipses to **several** printed circles on the same sheet (precision: the ring lines; sighting:
   the 115 mm disc, 110 and 40 mm guides, 45 mm circle and inner circle). Under perspective their centres step along a line toward
   the nearer side of the sheet; under a plain fitting error they scatter. Report the per-photo centre spread in mm. **If the centres
   do not line up, the hypothesis is wrong — record what they do show and stop.**
2. **Fit the geometry the photo actually has.** If step 1 confirms perspective, estimate a projective mapping (a homography) from the
   several concentric circles found in step 1, so that `mmToPx` / `pxToMm` place every ring and the true centre correctly.
   `Calibration` today holds an ellipse (`cx`, `cy`, `radiusPx`, `axisRatio`, `angleDeg`), which cannot express this. **Changing it is
   a data-model change** (stored analyses, Adjust handles, `scaleCalibration`, the ground-truth export), so:
   - write the proposed shape and a migration for stored analyses under *Open questions*;
   - **stop there** — this milestone is an owner gate — unless the owner has already ratified the shape.
3. **Measure against ground truth.** Report, per photo, the centre error of the printed 10-ring (precision) or inner circle (sighting)
   under the current ellipse and under the new model. Ground truth is either owner-aligned rings exported from Adjust
   (`fixtures/reference/ground-truth/`, M13 step 7) or, if none exists, rings the owner confirms in `pnpm review:detection` (M16 R5 may
   be extended with a "rings line up / off" confirmation per photo). **Do not invent a tolerance from eyeballed seeds.**

## Tests
- A synthetic precision sheet rendered with a known homography (tilted 25°): the ellipse model's centre error is reported (non-zero);
  the new model recovers the printed centre within 0.5 mm.
- An untilted synthetic sheet: both models agree within 0.2 mm (no regression on square-on photos).
- `mmToPx` ∘ `pxToMm` round-trips within 1e-6 mm under the new model.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste the per-photo centre spread from step 1 and the step 3 comparison into Completion notes.
**Human (owner):** decide the calibration shape in step 2, then check on the iPhone that the centre rings sit on the printed rings.

## Pitfalls
- A homography from **one** circle is under-determined; it needs several concentric circles (or other known points) on the same sheet.
- Don't let a better centre make the outer rings worse — report errors at the centre **and** at the anchor edge.
- Stored analyses with `source: 'manual'` calibrations are the owner's edits: a migration must never overwrite them (analysis-pipeline §8).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
