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

### 1. RATIFIED 2026-09-18 by the owner (REV-44). Steps 2 and 3 are unblocked.

> "yes, ratify it, and keep the perspective on manual drag"

The shape below is now in `docs/spec/data-model.md` §3. The sub-decision is answered: **a manual handle drag in Adjust keeps
the measured `perspective`** — the sheet's tilt has not changed because the owner corrected where the target is — and a
separate **reset alignment** action clears it. Still to follow, as this question already lists: `transform.ts`,
geometry-scoring §2/§2.1 (every existing vector is unchanged, because `p = q = 0` is the identity), the `scaleCalibration`
invariance test, Stage A's 120–250 ms per photo against §9's budget (measure on the phone before switching it on, and fall
back to `perspective: null` if the ring measurement fails), Adjust's handles, and the M13 step 7 ground-truth export.

**Also, since REV-46 (2026-09-18):** `sameCalibration` in `src/routes/adjust/AdjustPage.tsx` decides whether the user moved
the alignment, and must compare `perspective` too, or a tilt-only change would not be saved. `reprojectShots`
(`src/lib/geometry/reproject.ts`) goes through `transform.ts`, so it follows the projective model automatically once
`mmToPx`/`pxToMm` apply it — keep its tests passing with a non-null `perspective` added to them.

**The original gate, kept for the evidence:**

Step 1 confirmed perspective, and the projective model fixes the centre (numbers below). Step 2 says to stop here,
because storing it changes `Calibration`. **The proposal, measured rather than guessed:**

```ts
export const Calibration = z.object({
  cx: z.number(), cy: z.number(), radiusPx: z.number().positive(),
  axisRatio: z.number().gt(0.3).lte(1),
  angleDeg: z.number().gte(0).lt(180),
  anchorDiameterMm: z.number().positive(),
  source: z.enum(['overlay', 'auto', 'manual']),
  confidence: z.number().min(0).max(1).nullable(),
  // NEW (M18): the target plane's vanishing line, in target mm. null = the sheet was square on, which
  // is exactly today's behaviour. Applied BEFORE the ellipse map:
  //   mmToPx(p) = ellipse( p / (perspective.p * p.xMm + perspective.q * p.yMm + 1) )
  perspective: z.object({ p: z.number(), q: z.number() }).nullable().default(null),
});
```

**Why two numbers are enough, and why this shape loses nothing.** A homography has 8 degrees of freedom, but concentric
circles cannot see the sheet's rotation in its own plane (rotating the rings changes nothing in the photo), so only 7 are
observable. The existing five fields carry 5 — the ellipse family is exactly "affine minus a rotation" — and the vanishing
line carries the other 2. Every homography factors as `ellipse · perspective · rotation`, and the rotation is the
unobservable one. **Verified numerically on 12 of the owner's photos:** decomposing each fitted homography into these seven
numbers and rebuilding it reproduces every sampled ring point to within **2.3e-4 px**. The fit pins the rotation to the
ellipse calibration's own frame (`alignRotationGauge`), so shot coordinates never silently swing about the centre.

**Migration for stored analyses: none needed.** `perspective` defaults to `null`, and `null` computes bit-for-bit what the
app computes today, so every stored `TargetAnalysis` keeps its current numbers until it is re-analysed. In particular a
calibration with `source: 'manual'` is never rewritten (analysis-pipeline §8). If the owner wants stored analyses improved
they must be re-run, which is a user action, not a migration.

**What else has to follow, if the owner says yes:**
- `src/lib/geometry/transform.ts` — `mmToPx` / `pxToMm` apply the factor. geometry-scoring §2.1 needs the extra step
  written into the spec; every existing vector is unchanged because `p = q = 0` is the identity.
- `scaleCalibration` (capture-overlay §3.3) — unchanged. `perspective` is in **mm**, so rescaling image pixels does not
  touch it (the homography's last row is invariant under `diag(f, f, 1)`). Verified algebraically; worth a unit test.
- Stage A (analysis-pipeline §3) — after `detectAnchor`, run the ring measurement and store the fitted pair. **Cost
  measured here: 120–250 ms per 1200 px photo in Node** (two measurement passes over 5–12 circles). The phone will be
  slower; §9's budget needs checking before this is switched on.
- M13/M17 **Adjust** — the centre/edge/radius handles still edit the five ellipse fields. One decision is needed: does a
  manual handle drag **keep** the measured `perspective` (the sheet's tilt has not changed, so it should) or **clear** it?
  Recommendation: keep it, and offer a "reset alignment" that clears everything.
- The ground-truth export (M13 step 7) and `fixtures/reference/ground-truth/README.md` gain the field.
- `docs/spec/data-model.md` §3 and `docs/spec/geometry-scoring.md` §2 / §2.1.

### 6. The tilt costs M16's labelled recall 1.9 points (not blocking; the floors still pass)

With the tilt switched on, the gated labelled set goes from 76.2% / 93.8% to **74.3% / 92.9%** recall / precision
(floors 72% / 85%). Much of the loss is on the photos where the ring measurement is weak — the rows whose projective fit
barely improves the rms (IMG_4745, IMG_4770, IMG_4771, IMG_5057 2): measured, a rule "keep `perspective: null` unless the
projective fit improves the rms by at least a quarter" would give **77.4% / 94.6%**, above both. That 25% is the first
run's *descriptive* line, not a spec constant, and it was measured on the gate set itself, so it is **not** implemented —
the owner decides whether to add such a floor (and where it lives in `src/lib/cv/constants.ts`), or to accept the
trade: the centre rings are ~0.8 mm closer to the print on the median photo, which moves ring scores directly.

### 7. "Reset alignment" clears only the tilt

REV-44 says a separate "reset alignment" action clears the perspective; the first run's recommendation said it "clears
everything". Implemented as the spec reads: it sets `perspective: null` and leaves the ellipse fields as they are (a
reset of the whole alignment to what Stage A found would need the pre-edit calibration, which Adjust does not keep).
If the owner wants the broader meaning, say so.

### 8. The review page does not draw the tilt

`pnpm review:detection` (`scripts/detection-review/`) still draws its rings from `detectAnchor`'s ellipse. Only matters
if the owner rates alignment there again (Open question 2's second route); left alone because M18's scope is the app.

### 2. Step 3 has no owner-confirmed ground truth to measure against

`fixtures/reference/ground-truth/` still holds only its README — no owner-aligned rings have ever been exported from
Adjust — and `pnpm review:detection` has no "rings line up / off" question. So step 3 is measured against **the printed
circles found in each photo**, which is evidence (a sub-pixel edge fit on 500–2100 points per photo) but is not the owner
confirming what they see. The milestone forbids inventing a tolerance from eyeballed seeds, so nothing here is gated on
real photos. The owner decides which route to close this: export ground truth from Adjust for the two reference JPEGs, or
extend the review page (M16 R5) with a per-photo ring confirmation.

### 3. The owner's labelled set records `IMG_5057 2.jpeg` as `precision`, but it is a sighting sheet

`fixtures/private/review/ground-truth-holes-v2.json` has `IMG_5057_2` with `template: "precision"`. The photo is the
Caledonia Nordic sighting sheet (the 115 mm disc with the 110/45/40 mm guides). The alignment row for it is therefore
measured against the wrong circles, and — more importantly — **M16's detection numbers for that photo were also computed
against the wrong template**. Not fixed here: it is the owner's data, and changing it would move M16's gated figures.

### 4. The new modules are not named by any spec — ANSWERED in the second run

Now named: geometry-scoring §2.1 names `src/lib/geometry/homography.ts` (`homographyFromCalibration`,
`calibrationFromHomography`); analysis-pipeline §3 names `src/lib/cv/ring-edges.ts`, `src/lib/geometry/fit-homography.ts`
and `calibrationWithPerspective` in `src/lib/cv/alignment-perspective.ts`.

### 5. Confirmed, not a question: the sighting sheet's inner circle really is 15 mm

geometry-scoring §1.2 marks it "approximate, measure in M09". Measured on the owner's 14 sighting photos, against a model
fitted to the other four circles: **median implied diameter 14.94 mm** (the 110 mm guide measures 109.97 and the 115 mm
disc 115.01 on the same fits). The constant is right; it is the *measurement* of that circle that is fragile, because it
is small and the owner's shots tend to sit on it.

## Completion notes

**Status (second run, after REV-44 ratified the shape): steps 1-3 done.** The calibration now carries the sheet's tilt,
Stage A measures it, and every consumer of `mmToPx` / `pxToMm` follows it. The first run's evidence is kept below it.

### Second run (2026-09-18): the ratified shape, switched on

What changed, in the order Open question 1 lists it:

| Item | Where | What |
|---|---|---|
| `Calibration.perspective` | `src/lib/domain/photo.ts` | `z.object({ p, q }).nullable().default(null)`, exactly data-model §3. A record without it parses to `null` (tested). |
| `mmToPx` / `pxToMm` | `src/lib/geometry/transform.ts` | Step 0 (divide by `p·x + q·y + 1`) and its inverse. `perspective` null or absent skips it, so every pre-M18 number is bit-for-bit unchanged (tested with `toEqual`, not a tolerance). |
| geometry-scoring §2.1 | spec | Step 0, the inverse, the `E · P` homography, `scaleCalibration` invariance, and new vectors (`{10, 5}` → `{1076.923076923, 761.538461538}` with `p = 0.002, q = 0.004`). |
| Homography ↔ calibration | `src/lib/geometry/homography.ts` | `homographyFromCalibration` now builds `E · P(p, q)`; new `calibrationFromHomography` reads the seven numbers back out (polar decomposition of the Jacobian at the centre; the unobservable in-plane rotation is dropped and the vanishing line rotated to match). Round trip exact to 1e-9; a rotated homography maps every ring onto the same conic within 1e-9 mm. |
| Stage A (A4) | `src/workers/cv.worker.ts`, `src/lib/cv/alignment-perspective.ts` (`calibrationWithPerspective`) | After `detectAnchor`, measure the printed circles and store the fitted calibration. Template: `capture.overlayTemplate`, else A3's hint, else the anchor size's. Falls back to the detected disc with `perspective: null` when fewer than 3 circles are found, the projective fit is worse than the ellipse fit on the same points, or the homography is not a valid calibration. analysis-pipeline §2 (A4) and §3 say so. |
| A5 rectification | `src/lib/cv/rectify.ts` | A calibration with a `perspective` is warped with `warpPerspective` of the exact float64 homography (`rectifiedToWorking`); `perspective` null keeps the old 3-point affine path, untouched. |
| `scaleCalibration` | unchanged | Unit test: scaling a tilted calibration scales every mapped pixel by the factor and leaves `perspective` alone. |
| Adjust | `AdjustPage.tsx` (`sameCalibration` compares `perspective`), `AlignmentControls.tsx` | Handles and fields spread the calibration, so they keep the tilt (REV-44). New **Reset alignment** button clears it (disabled when there is none), with a one-line state text. `reprojectShots` follows automatically; its tests now include a non-null perspective and the 200-step drag. |
| Ground-truth export | `fixtures/reference/ground-truth/README.md` | `buildGroundTruth` already exports the whole calibration, so `perspective` is in it; the README documents the field and that an old file without it reads as `null`. |
| Drawing | none needed | Rings (`templateRingPolylines`), the diagram overlay and the Adjust centre handle all go through `mmToPx`; `(cx, cy)` is still the image of the target centre. |

**M18 Tests, all as unit tests with their stated tolerances:** tilted precision sheet — the stored calibration puts the
printed centre within 0.5 mm, the detected ellipse does not (`tests/unit/cv/alignment-perspective.test.ts`); square-on
sheet — stored and ellipse calibrations agree within 0.2 mm at the centre, the 10 ring and an outer point; round trip —
500 random calibrations with random perspectives, `pxToMm(mmToPx(p))` within 1e-6 mm
(`tests/unit/geometry/transform-perspective.test.ts`). Plus: rectify with a tilt puts a dot where `pxToMm` and the
sheet's own geometry put it (0.02 mm from the truth radius, against 0.84 mm for the same calibration warped affinely);
an e2e test that Stage A stores a tilt on the demo precision sheet, a manual edit keeps it, and Reset alignment clears it
and is saved.

**Step 3 on the stored calibration:** unchanged from the first run's table below — the stored seven numbers rebuild the
fitted homography exactly, so the "projective" column is what the app now stores. Re-run today: median centre-ring error
**ellipse 0.929 mm → projective 0.150 mm**, anchor edge 0.518 → 0.212 mm (worse on 2 of 42), per-circle centre spread
median 3.500 mm, off the line 0.066 mm. (The first run's 0.888 mm was measured before M19/REV-43-46 landed; HEAD without
this run's changes reproduces 0.929 exactly, so the difference is not from this work.)

**Effect on the M16 detection gate (read this, reviewer).** `cv:eval`'s labelled-holes evaluation now runs A4 the way the
app does, with the tilt, and reports the pre-M18 A4 alongside. Gated set: **with the tilt 237/18/82, recall 74.3%,
precision 92.9%**; without it 243/16/76, recall 76.2%, precision 93.8%. The R4 floors (72% / 85%) still pass. Per photo
it is mixed (e.g. IMG_4540 7→8, IMG_5149 8→10, IMG_5134 6→8 true positives; IMG_4770 7→4, IMG_4745 16/0→13/4), and the
rectified image is visibly *more* correct with the tilt (the sheet's edges come out parallel), so this is the detector's
tuning meeting a differently-resampled image, not a wrong warp. See Open question 6. Timing: the tilt measurement is
**median 182 ms, max 230 ms per 1200 px photo in Node**; Stage A (A4+A5) was median 922 ms in Node before it.

### Step 1 — the hypothesis is confirmed

The method: for each printed circle of known radius, walk 180 rays out from the model centre, find the ring line (or the
mark's edge) on each ray to sub-pixel accuracy, then fit an **ellipse to each circle on its own**. Under perspective those
per-circle centres step along a line, with the step growing as the square of the radius; under a plain fitting error they
scatter.

| | per-circle centre spread | distance off the best-fit line | correlation with r² |
|---|---|---|---|
| synthetic precision sheet, tilted 25° | 4.198 mm | 0.000 mm | −1.00 |
| the same sheet rolled 35° | 4.195 mm | 0.004 mm | −1.00 |
| synthetic sighting sheet, tilted 25° | 2.295 mm | 0.002 mm | +1.00 |
| synthetic precision sheet, square on | **0.003 mm** | 0.000 mm | 0.19 (noise) |
| synthetic sighting sheet, square on | **0.006 mm** | 0.001 mm | 0.23 (noise) |
| **42 real photos (2 reference JPEGs + the owner's 40 labelled targets)** | **median 3.500 mm** | **median 0.070 mm** | \|r²corr\| ≥ 0.9 on 29 of 42, ≥ 0.5 on 36 |

The centres are **50× closer to a line than the line is long**, and the displacement grows with r². That is perspective,
not a fitting error. The direction also agrees with how the photos were taken: the fitted vanishing line is dominated by
its **q** (vertical) term on every photo measured (q from −1.3e-4 to −1.0e-3 per mm, p typically 3× smaller), i.e. the
sheets lean away from the camera about a horizontal axis, as they would when photographed from standing height.

### Step 3 — the centre error, under each model

Measured against the printed circles found in each photo (see Open question 2 — this is not owner-confirmed). "Centre" is
the printed 10 ring (precision, 10.4 mm) or the inner circle (sighting, 15 mm); "edge" is the anchor's own boundary.

| | ellipse model (what the app stores today) | projective model |
|---|---|---|
| median centre-ring error, 42 photos | **0.888 mm** (max up to 3.07 mm) | **0.150 mm** |
| median anchor-edge error, 42 photos | 0.518 mm | **0.212 mm** |
| median fit rms over all circles | 0.997 mm | **0.284 mm** |

The centre is **5.9× better and the edge is 2.4× better**, so the fix does not buy the centre at the outer rings' expense
(M18 Pitfalls). The edge got *worse* on 3 of 42 photos, all of them in the group below. `0.888 mm` at the 10 ring is the
owner's "the centre rings are always slightly off" in millimetres: the 10 ring's radius is 5.2 mm, so the app's ring was
sitting about **17% of a 10-ring radius** off the printed one.

On **11 of 42 photos the projective fit did not improve the rms by a quarter**. Two different things are in that group and
the report says which by the circles/points and rms columns: photos taken nearly square on (nothing to correct — e.g.
IMG_5084, rms 0.476 → 0.360, centre error 0.185 → 0.176 mm), and photos where the **ring measurement itself** failed —
under 1400 believable points instead of the usual 2000+ (IMG_4743, IMG_4745, IMG_4770, IMG_4771), or the wrong recorded
template (IMG_5057 2.jpeg, Open question 3). Those rows are evidence about the measurement, not about either model.

### Synthetic ground truth (exact)

`tests/helpers/tilted-target.ts` renders a sheet under a **known** homography — every printed circle as a 256-point
polygon, because SVG's own transforms are affine and cannot express perspective — so the printed centre is exact.

| case | ellipse centre error | projective centre error | models differ |
|---|---|---|---|
| precision, tilt 25°, 600 mm | 1.168 mm | **0.153 mm** | 1.397 mm |
| precision, tilt 25° + roll 35° | 1.218 mm | **0.155 mm** | 1.360 mm |
| sighting, tilt 25° | 0.738 mm | **0.162 mm** | 0.929 mm |
| precision, square on | 0.154 mm | 0.154 mm | **0.000 mm** |
| sighting, square on | 0.160 mm | 0.160 mm | **0.000 mm** |

The 0.15 mm floor on the square-on rows is the rasteriser and the edge finder, not either model: both models report it
identically. The milestone's two bars (tilted within 0.5 mm; square-on agreement within 0.2 mm) are gated in `cv:eval`
and covered by unit tests.

### Files

| File | What it is |
|---|---|
| `src/lib/geometry/homography.ts` | the projective mm↔px map, built from a `Calibration`, plus the rotation gauge fix |
| `src/lib/geometry/fit-homography.ts` | Levenberg–Marquardt + Tukey biweight fit to points on circles of known radius |
| `src/lib/cv/ring-edges.ts` | sub-pixel measurement of every printed circle, pure over `RgbaImage`, no OpenCV |
| `src/lib/cv/alignment-perspective.ts` | both models fitted to the same points, plus step 1's centre-spread statistic |
| `scripts/cv-eval-alignment.ts` | the two tables above; wired into `pnpm cv:eval` |
| `tests/helpers/tilted-target.ts` | a sheet rendered under a known homography |
| `tests/unit/geometry/homography.test.ts` | geometry-scoring §2.1's vectors through the new model; the 1e-6 mm round trip |
| `tests/unit/geometry/fit-homography.test.ts` | exact recovery, the gauge fix, robustness to bad rays |
| `tests/unit/cv/alignment-perspective.test.ts` | the milestone's three tests end to end on rendered sheets |

`tests/helpers/synthetic-target.ts` only gained `export` on its `PAPER`, `INK` and `LINE_MM` constants, so the tilted
sheet is drawn in the same colours.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | pass — typecheck, lint (4 pre-existing warnings, 0 errors), 535 unit tests in 59 files, privacy check (15 images) |
| `pnpm cv:eval` | pass — every existing gate still passes, plus the 5 new synthetic perspective cases; the 42-photo table is reported, not gated |
| `pnpm test:e2e` | pass — 40 tests, mobile Chromium + mobile WebKit |

### Deviations

- **Step 2 stops before the data-model change**, as the milestone instructs. The projective model exists as pure code and
  is measured, but nothing stores it and nothing in the app uses it. Open question 1 is the owner's decision.
- Two things had to be **decided to make the measurement honest**, both recorded in the code: the fit uses Tukey's
  biweight (rays that latch onto a shot hole or a numeral are common on real paper and plain least squares lets a handful
  drag the model), and a per-circle ellipse fit always starts from an affine model (`affinePartAtCentre`) — an affine
  correction of a projective init is still projective, so without it the "ellipse centres" were not ellipse centres at
  all. The first version of this measurement had that bug and understated the spread by 5×.
- The alignment table uses the template the owner **recorded** for each photo rather than `hintTemplate`, which reads
  `IMG_5057-sighting.jpg` as `precision`. That template-hint mistake is not M18's to fix, but it would have silently
  wrecked two rows.

### Second run: files, commands, deviations

**Files changed:** `src/lib/domain/photo.ts`, `src/lib/geometry/transform.ts`, `src/lib/geometry/homography.ts`,
`src/lib/cv/alignment-perspective.ts`, `src/lib/cv/rectify.ts`, `src/workers/cv.worker.ts`,
`src/routes/adjust/AdjustPage.tsx`, `src/components/adjust/AlignmentControls.tsx`; `perspective: null` added to the
Calibration literals in `src/lib/capture/overlay.ts`, `src/lib/cv/anchor.ts`, `src/lib/services/adjust.ts`,
`scripts/cv-eval.ts` and the test helpers/fixtures; `scripts/cv-eval-labelled.ts` (A4 with the tilt, and the pre-M18 A4
reported beside it); specs `docs/spec/geometry-scoring.md` §2.1 and `docs/spec/analysis-pipeline.md` §2 (A4) / §3;
`fixtures/reference/ground-truth/README.md`. New tests: `tests/unit/geometry/transform-perspective.test.ts`, additions to
`homography.test.ts`, `reproject.test.ts`, `alignment-perspective.test.ts`, `pipeline/alignment.test.ts`, and an e2e test
in `tests/e2e/adjust.spec.ts`.

| Command | Result |
|---|---|
| `pnpm check` | pass — typecheck, lint (the same 4 pre-existing warnings, 0 errors), **628 unit tests in 65 files**, privacy check (16 images) |
| `pnpm cv:eval` | pass (exit 0) — every synthetic gate, the 5 M18 perspective cases, and the M16 labelled gate (74.3% / 92.9% with the tilt; floors 72% / 85%) |
| `pnpm test:e2e` | pass — **46 tests**, mobile Chromium + mobile WebKit, including the new REV-44 Adjust test (which also re-analyzes with a tilt, so the worker's `warpPerspective` path runs in both browsers) |

**Deviations (second run):**
- **Stage A's timing was not measured on the phone before switching the tilt on**, which Open question 1 asks for. It
  cannot be measured here; Node gives 182 ms median / 230 ms max for the tilt measurement, against a 3 s Stage A budget.
  It is an owner check.
- The demo session seeds its calibrations as `manual`, so Stage A never measures a tilt for it; the e2e test seeds a
  tilted calibration through `__asaTest.setCalibration` instead. The measurement itself is covered by unit tests on the
  rendered tilted sheets and by `cv:eval` on the owner's photos.
- The ellipse fit inside `estimatePerspective` now starts from `affinePartAtCentre(base)`, so a base that already
  carries a perspective (a stored tilted calibration) still yields an ellipse. For an ellipse base this is the same matrix;
  `cv:eval`'s tables are unchanged by it (checked against HEAD in a scratch worktree).
