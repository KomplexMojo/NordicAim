# M16: Detection accuracy and shot constraints

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M12 | high | M | generate analysis (detection quality) |

## Goal
Make a real photo produce a **plausible** shot set. Owner review of real targets against their diagrams (2026-09-16) found the
diagrams do not represent the photos: printed ring numerals are detected as shots, and blob area invents multiplicities, so a
10-round precision sheet reported 19 detections / 62 units. Three rules fix it (REV-27, REV-28): reject printed glyphs, start every
detection at **one hole**, and never report more shots than the declared rounds.

**Rework, 2026-09-17 (REV-34 to REV-37).** The first implementation was committed as `90464b8` and then rated by the owner on all
46 real photos: mean quality **below 2 out of 5**, recall **53%**, precision **61%**. The cause is measured, not guessed — see the
*Rework* section below, which **takes precedence over Steps 1, 2, 3, 7 and 8** wherever they disagree. Steps 4, 5, 6 and 9 stand.

## Read first
- **The *Rework* section below, first.** Then `docs/DESIGN-REVISIONS.md` REV-34 to REV-37 for the evidence.
- `docs/spec/analysis-pipeline.md` §2 (A5), §4
- `docs/spec/geometry-scoring.md` §7, §8
- `docs/milestones/M11-shot-detection.md` Steps 4–5 and Open questions 1–4
- `fixtures/private/review/` (gitignored): `ground-truth-holes-2026-09-17.json` (the 390 labelled holes, with per-photo caveats),
  `detection-review-2026-09-17.json` (the owner's raw ratings and comments), and `tool/` (the review page and the probes that
  produced the evidence — a reference implementation, not code to import)

## In scope
`src/lib/cv/holes.ts` (glyph rejection, multiplicity), a pure `capShots` helper, its use in Stage A and Stage B, `cv:eval` reporting.
**Rework adds:** polarity-free hole candidates (R1), printed-mark masking by template geometry including numeral rotation (R2),
paper-sheet search area (R3), the labelled-hole gate in `cv:eval` (R4), and the owner review page as a repo command (R5).

## Out of scope
The Adjust screen (M17), the summary image (M14), any change to ring scoring maths.

## Files
- `src/lib/cv/holes.ts`, `src/lib/cv/constants.ts` (new thresholds)
- `src/lib/scoring/cap-shots.ts` (pure) — or the nearest existing pure module; do not put it in a `*-browser.ts` file
- `src/lib/pipeline/stage-a.ts`, `stage-b.ts`
- `scripts/cv-eval.ts`
- `tests/unit/cv/holes.test.ts`, `tests/unit/scoring/cap-shots.test.ts`, `tests/unit/pipeline/stage-a.test.ts`
- **Rework:** `src/lib/cv/print-mask.ts` (pure: printed-mark geometry and numeral rotation), `src/lib/cv/sheet.ts` (pure: paper-sheet
  search area), `scripts/detection-review/` + `"review:detection"` in `package.json`, `tests/helpers/labelled-holes.ts`

## Rework (2026-09-17) — read this first

**What the owner's review measured** (all numbers from the 390 labelled holes; details in REV-34 to REV-37):
- Holes on the black mark are **not** reliably brighter than it. Of the holes the detector missed there, 66 were darker, 60 about the
  same and only 29 brighter; the holes it did find were overwhelmingly the bright kind (158 of 191). Both kinds occur in the same photo.
- **182 of 183 missed holes produced no candidate at all** — they are lost at thresholding, not by any later filter.
- The bright things on the black are the **printed white numerals, ring lines and dashed guides**, which is where the false detections
  come from. No shape metric separates them from holes; their *position* does.
- Holes on the white paper are outside the current search bound: paper holes lie at 61–97 mm (sighting) and 56–103 mm and a few
  beyond 110 (precision), against bounds of 62.5 and 82.2 mm.

**What was measured to work.** On the labelled holes, each signal's AUC against three kinds of non-hole (0.5 = no signal, 1.0 = perfect):

| Signal, on the black mark | vs plain black | vs a printed ring line | vs owner-flagged false |
|---|---|---|---|
| core brighter than surround (the current rule) | 0.71 | 0.69 | 0.39 |
| edge energy inside the hole footprint | **0.97** | **0.93** | 0.81 |
| share of pixels deviating either way | **0.98** | **0.91** | 0.69 |

On the white paper the same polarity-free signals score 0.95–0.97 against plain paper. So: finding holes needs a polarity-free
signal, and rejecting printed marks needs geometry. The probes are in `fixtures/private/review/tool/probe.mts` and `polarity.mts`.

**R1. Polarity-free candidates (REV-34).** Replace the signed thresholds of M11 step 3 and REV-32 with a test that fires on a hole
whether its core is darker, brighter or equal to its surroundings. Start from the two signals measured above (edge energy within a
hole-sized footprint, and the fraction of pixels deviating from the local median by more than `k × MAD` in either direction). Keep
REV-32's tiling and local statistics if they still earn their place, but **measure it**: report recall and precision with and without
tiling on the labelled set, and keep whichever wins. The M11 area gate and REV-28's `multiplicity = 1` stand.

**R2. Mask printed marks by geometry (REV-35).** Build the printed-mark mask from the template, in target mm:
- **Ring lines and dashed guides:** the annuli already erased by M11 step 4 (`printedCircleRadiiMm`) — keep, and add a test that a
  dashed guide on the sighting sheet produces no detection.
- **Numerals (precision sheet only):** numerals 1–8 print at the **centre of their ring band** on **four axes**. The sheet's rotation
  in the photo is unknown, so estimate it first: sample the printed-mark response along each band-centre circle and fit the 90°-periodic
  phase (for example the argument of Σ w·e^{4iθ}). Mask a box around each of the 32 positions, sized from the printed glyphs (measure
  it on the sample sheets; do not guess). A candidate inside a numeral box is dropped unless its R1 score clears a threshold measured
  on labelled holes that genuinely sit on numerals — report how many such holes exist and how many the mask costs.
- REV-27's elongation/stroke filter is **no longer the mechanism**. Keep it only if, measured on the labelled set with R1 and R2 in place,
  removing it lowers precision; otherwise delete it and say so.

**R3. Search the paper sheet (REV-36).** Segment the paper sheet around the target — the bright, low-saturation region connected to the
area just outside the outermost printed circle — fill it, and search inside its boundary eroded by 3 mm. Nothing outside the sheet is
ever a candidate, so REV-33's backing-board guarantee holds. Cap the search radius at 150 mm; if sheet segmentation fails, fall back to
105 mm and record the fallback on the analysis. Report how often segmentation fails on the 40 photos with a target. The rectified
image must cover the search area, so its canonical scale may need to drop below 8 px/mm: choose it from the working resolution, and
report Stage A time before and after.

**R4. Gate on the labelled holes (REV-37).** `cv:eval` loads `fixtures/private/review/ground-truth-holes-2026-09-17.json` (skipped with a
loud notice when absent, as CI will be):
- Match detections to labelled holes greedily in working px, tolerance `0.8 × hole diameter` (the owner tapped by eye).
- Report recall and precision **per photo and per template**, never only in aggregate, plus the baseline from this review
  (recall 53%, precision 61%; precision sheets 54% / 54%, sighting 51% / 87%).
- **Exclude caveated photos from the gate** (the `caveat` field — four photos where the owner read rank numbers as shot counts, one
  incompletely tagged, one where the wrong target was analysed) and report them separately.
- **Exit non-zero** below recall **0.85** or precision **0.85** on the gated set. These floors are provisional and the owner may move
  them. If they cannot be reached, stop and record the measured numbers under Open questions — do not tune until the numbers clear.
- Labels can be incomplete: a real hole the owner never tapped counts as a false positive. List every "false positive" the new detector
  makes on a gated photo so the owner can confirm or correct it in R5.

**R5. The owner re-rates (REV-37).** Port `fixtures/private/review/tool/` (`extract.mts`, `build.mjs`, `template.html`) to
`scripts/detection-review/` as `pnpm review:detection`. It reads `fixtures/private/additional references/`, writes
`fixtures/private/review/detection-review.html`, and **never writes an image or a photo-derived file outside `fixtures/private/`**.
Fix the two ways the first page misled the owner:
- rank labels read as shot counts — label them `#1`, `#2`…, and say on the page that every detection is **one** hole;
- a tap next to a detection toggled it instead of adding a missed hole — add a per-photo mode switch (**Mark detections** / **Add missed
  hole**) so a hole beside a marker can be added.
Also let the page load a previous export so the owner's existing marks carry over where positions still match.

**Moved out of M16:** Step 8 (alignment accuracy) is now **M18**, which the owner asked for after detection. Its "must not present as a
finished score" half (Step 9, §4 rule 9) stays here.

## Steps
1. **Scan the target in regions (REV-32).** This replaces M11 step 3's two global thresholds
   (`gray > median(disc) + 45` inside, `gray < median(paper) − 50` outside). One pair of numbers for the whole sheet cannot cope
   with shadow across the paper, glare, or the different contrast of a hole on the black mark versus on white paper.
   - **Tile** the rectified image (canonical 8 px/mm) into `REGION_MM` squares (start at 10 mm = 80 px) at **half-tile stride**, so
     a hole straddling a boundary is whole in at least one tile.
   - **Classify** each tile by its centre: on the aiming mark (≤ anchor R − 1 mm) or on paper. A hole is *brighter* than the mark
     and *darker* than paper, so the sign of the test follows the class. Tiles straddling the edge take the class of their centre.
   - **Threshold locally**: per tile compute the median and MAD of gray, and take candidate pixels where
     `(gray − median) × sign > REGION_K × MAD`. MAD rather than mean and σ, so the hole's own pixels don't drag the threshold out.
   - **Skip an empty region and move on** (the owner's rule): a tile yielding no component past M11 step 5's area gate
     (`0.35 × A1`) is dropped with no further work. Most of a sheet is blank, so this is also where the time is saved.
   - **Refine only affected regions**: a tile with at least one candidate is re-run at up to `REGION_REFINE_MAX` (3) progressively
     lower `REGION_K` values, keeping only candidates that pass the glyph filter in step 2.
   - **Dedupe across tiles** by centroid: two candidates within one hole radius are the same hole; keep the higher fill.
   - `REGION_MM`, `REGION_K` and `REGION_REFINE_MAX` live in `constants.ts`. Measure them on the owner's real photos and record the
     values and the separation they gave, the way M10 did for `BLUR_THRESHOLD`.
   - **Never iterate to reach a quota.** Refinement stops at `REGION_REFINE_MAX` whether or not the count has reached the declared
     rounds. Whatever is still missing becomes a parked marker for the owner (REV-29). A detector told to keep looking until it
     finds ten will eventually find ten, and they will not be holes.
   - **Keep it only if it wins.** `cv:eval` reports recall and precision for the global method and the region method on every
     reference photo. The region scan ships only if it is better; record both tables in Completion notes either way.
2. **Never search outside the target crop (REV-33).** The owner's reference photos show the backing board peppered with old
   holes right up against the sheet — dozens of them, along the bottom and right of several photos. Nothing currently stops the
   detector collecting those, and with the step 4 cap it could keep *backing board* holes and drop real ones.
   - The candidate bound is M11 step 3's **paper region**, `outerRadiusMm + PAPER_OUTSET_MM` (5 mm) — not the rectified image's
     own `+10 mm` cut, which only sizes the canvas. The narrower bound is deliberate: it is exactly where M11 stopped
     thresholding, so no pixel outside it was ever classified. **Nothing outside it** is ever a candidate; assert this rather
     than assume it, dropping any component whose centroid falls outside.
   - A round that landed off the scoring area is still a fired round. It stays unidentified, so `missing` counts it, and the
     owner accounts for it in Adjust — see M17, where a parked marker can be marked **off target** instead of placed.
   - Test with a reference photo whose backing board is visible in frame: no detection may fall outside the crop.
3. **Reject printed glyphs (REV-27).** M11 step 4 erases printed *circles* only, so the numerals at 12 and 6 o'clock survive and
   are detected as shots. Add a shape filter to M11 step 5, before the component is accepted:
   - `elongation = major/minor` of the fitted ellipse; reject `elongation > ELONGATION_MAX`.
   - `strokeRadius` = the maximum inscribed radius (distance transform peak) of the component; reject
     `strokeRadius < STROKE_MIN_FRACTION × (holeDiameterMm/2)`. A bullet hole is a compact blob; a printed glyph is a thin stroke.
   - Both constants live in `constants.ts`. **Measure them** on `fixtures/private/additional references/` and the two reference
     JPEGs, then record the measured separation and the chosen values in Completion notes, the way M10 did for `BLUR_THRESHOLD`.
     If no single pair of values separates glyphs from holes on real photos, stop and record it under Open questions rather than
     tuning until the reference photo passes.
4. **One hole to start (REV-28).** In M11 step 5 replace `multiplicity = cluster ? clamp(round(k), 2, 8) : 1` with
   `multiplicity = 1`, always. Keep computing `cluster` and use it only for `confidence` and for the `cluster` flag on the shot.
   Overlapping holes are therefore one shot until the owner says otherwise in Adjust — which is the point: the app never invents
   rounds the owner did not fire.
5. **Never exceed the declared rounds (REV-28).** Add pure
   `capShots(shots: Shot[], declared: number): { kept: Shot[]; dropped: Shot[] }`: when `shots.length > declared`, keep the best
   `declared` ranked by `confidence` descending, ties by larger area then by smaller radial distance, so the ranking is total and
   deterministic; everything else is `dropped`.
   - Stage A applies it after A5 **when the categorization is already complete** (declared rounds are known); otherwise it leaves
     the shots alone, because Stage A runs before metadata.
   - Stage B applies it again after metadata, so the rule always holds by the time anything is scored or drawn.
   - When anything is dropped, add the warning `extra-candidates-dropped` so the photo reports it rather than hiding it.
6. **Reason and status.** Add `extra-candidates-dropped` to `Reason` in `docs/spec/analysis-pipeline.md` §4 and to
   `reason-messages.ts` ("Some detected marks were ignored because you fired N rounds."). A capped photo is still
   `needs-attention`, since the owner should confirm which marks were kept.
7. **`cv:eval`** reports, per reference photo: detections, units, recall and precision against the fixture/ground-truth shots, and
   how many candidates the cap dropped. It exits non-zero if a reference photo yields more detections than its declared rounds.
   - **The gate must test what this milestone exists to fix (added 2026-09-16).** "Detections ≤ declared rounds" is not a quality
     bar: the first run of this milestone exited 0 with **recall 0.14 and precision 0.14** on `IMG_5057-sighting.jpg` and
     **0.22 / 0.20** on `IMG_5132-precision.jpg`, while the synthetic cases scored 1.00 / 1.00. An acceptance command that cannot
     tell those apart is not an acceptance command. Once ground truth exists, `cv:eval` **exits non-zero** when a ground-truth
     photo falls below a recall and precision floor recorded in `constants.ts` — propose the floor from the measured numbers and
     record the reasoning; do not pick one that the current output happens to clear.
   - **`sample-shots-*.json` are not ground truth.** They were authored as *scoring* vectors (the 72/100 precision case, the 9-hit
     sighting case), not as a record of where the holes are in those photos. Recall measured against them says nothing, and the
     table must label those rows **unverified** rather than printing a number that reads like a result.
   - **While `fixtures/reference/ground-truth/` is empty, say so at the top of the output and in the milestone's Completion
     notes**, in the same words: detection quality on real photos is UNVERIFIED. The run may still exit 0 — nothing is gated yet —
     but no one reading the output should come away thinking it was measured.
8. **Alignment accuracy (REV-31).** The owner's example analysis showed the drawn rings shifted up-and-left and too large relative
   to the printed rings, which corrupts scoring even once the shots are right. Detection quality is meaningless if the geometry it
   is measured in is wrong, so verify both in the same milestone:
   - `cv:eval` gains an **alignment** table: for every photo with an owner ground-truth file
     (`fixtures/reference/ground-truth/<key>.json`, written by M13 step 7), report centre error as a percentage of R, radius error,
     and axis-ratio error, for both the no-prior and capture-prior cases.
   - It exits non-zero when a photo exceeds the existing seed tolerance (centre ≤ 5% of R, radius ≤ 6%). Record every measured
     value in Completion notes so the owner can decide whether to tighten it — do **not** tighten it in this milestone.
   - Ground-truth files supersede `seed-calibrations.json` (which was estimated by eye) wherever one exists.
   - **The owner must export ground truth for the real photos first** (M13 step 7, `fixtures/reference/ground-truth/README.md`).
     If no ground-truth file exists for any real photo, report that plainly and do not invent tolerances from the seed estimates.
9. **Say so when alignment is unverified (REV-31).** **Corrected 2026-09-16 — the original wording was wrong** and the review
   caught it: it claimed a photo whose alignment came from the overlay fallback "already reaches `needs-attention` via §4". It
   does not. `alignment-uncertain` is only an *appended* warning, so such a photo matches no rule 5–8 and lands on rule 9 →
   `analyzed`, under a confident-looking score. The premise was false, so the requirement was never met.
   - **§4 gains a rule** (owner decision, 2026-09-16): `pipeline.alignment.method === 'overlay'` → `needs-attention`, reasons
     `['alignment-uncertain', ...warnings]`, sitting between rule 8 and rule 9. `overlay` means **no disc was found at all** and
     the rings are drawn where the owner aimed, which is a guess, not a measurement — exactly what REV-31 says must not present
     as a finished score.
   - **`outsidePrior: true` keeps the appended-warning behaviour**: there the disc *was* measured, just far from the overlay, so
     the geometry is real and a warning is enough. Only the un-measured case is escalated.
   - This also changes M13's Adjust live preview, which shares `photoStatus`. That is intended.
   - The old text, kept for the record: A photo whose alignment came from the overlay fallback
   (`method: 'overlay'`, warning `alignment-uncertain`) must not present as a finished score: it already reaches
   `needs-attention` via analysis-pipeline §4, so confirm that path holds once the cap and glyph filter change the shot set, and
   add a test for it rather than assuming.

## Tests
- **Conditions the tuning set must cover** (from the owner's reference photos in `fixtures/private/additional references/`, 46
  files). Report each separately in `cv:eval` rather than reporting one aggregate number:
  - **Backing board in frame** (REV-33): old holes in the board beside the sheet — none may be detected.
  - **Holes on the white paper outside the black**: dark-on-light, the opposite polarity to a hole on the aiming mark. Both
    polarities must work in the same photo.
  - **Sighting dashed circles**: the 110 mm and 40 mm guides are *white dashes on black* — bright blobs on a dark ground, which
    is exactly the signature of a hole inside the disc. They are covered today only because 55 and 20 are in
    `printedCircleRadiiMm` (`[7.5, 20, 22.5, 55, 57.5]`). Add a test that pins this: no detection on the dashes.
  - **Overlapping and torn holes** touching each other near the centre (several photos), which must stay one shot each under
    REV-28 rather than becoming an invented multiplicity.
  - **Tilt and curl**: sheets photographed at an angle and not flat.
- Region scan (REV-32): on a synthetic sheet with a lighting gradient across it, every hole is found, where the old global
  threshold misses at least one; ~~a hole placed exactly on a tile boundary is returned **once**; tiles with no candidate are
  skipped (assert the refine pass touches only the affected tiles)~~ *(superseded by R1: tiling measured worse and was
  removed, so these became "each hole is returned exactly once"; Open question 9, owner to confirm)*; and a sheet with 6 holes but 10 declared rounds returns
  **6** shots, never 10 — refinement must not manufacture candidates to fill the quota.
- Glyph rejection: on `IMG_5132-precision.jpg`, no detection falls inside the numeral sectors, and total detections ≤ 10.
- Multiplicity: every auto shot from `detectShots` has `multiplicity === 1`, including on a deliberately overlapping synthetic pair.
- `capShots` vectors: 12 shots / declared 10 → 10 kept, 2 dropped, lowest confidence first; a tie broken by area then radius;
  `shots.length <= declared` → unchanged, `dropped` empty.
- Stage A: complete categorization → capped and warned; incomplete categorization → not capped.
- Stage B: re-caps after metadata; `identified <= declared` always, so `overcount` is unreachable from auto detection.
- E2E: the demo precision fixture still analyses without `too-many-shots`.
- **Rework:**
  - R1: a synthetic sheet with dark-core, bright-core and equal-core holes on the black **and** dark holes on the paper → all found.
  - R2: a synthetic precision sheet rotated by 0°, 17° and 45° → numeral rotation estimated within ±2°, and no detection on any numeral.
  - R2: a sighting sheet's dashed guides produce no detection.
  - R3: a synthetic sheet on a backing board peppered with holes → no detection off the sheet; holes on the paper beyond the old bound are found.
  - R3: sheet segmentation failing → the 105 mm fallback is used and recorded.
  - R4: the gate's matcher, on a hand-built labelled case, gives the expected recall/precision; caveated photos are excluded.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
pnpm review:detection
```
Paste the `cv:eval` table and the measured glyph-filter values into Completion notes. **Rework:** also paste the per-template
recall/precision against the baseline, the numeral-mask cost, the sheet-segmentation failure count and Stage A time before/after.
**Human (owner), rework:** open `fixtures/private/review/detection-review.html`, rate every photo again and paste the export.
**Human (owner):** on the iPhone, photograph both sheets → Analyze → confirm the shot count is plausible and the diagram
resembles the photo.

## Pitfalls
- Don't tune the thresholds until one photo passes; they must separate glyphs from holes on the whole `additional references` set.
- `capShots` is pure: no `Date.now()`, no DOM.
- Never drop or renumber a shot whose `source` is `'manual'` (analysis-pipeline §8) — cap only `auto` shots.

## Open questions

Rework (2026-09-17). Questions 1-11 of the first implementation are restated at the end, marked resolved or still open.

**Resolved 2026-09-18 by the owner's re-rating** (`fixtures/private/review/detection-review-v2-2026-09-17.json`, and
DESIGN-REVISIONS 2026-09-18). The owner took the third option in question 1 and re-rated, which changed both answers below.

- **Question 1 — the gate's numbers were measured against incomplete labels.** Re-rated: **recall 76.9%, precision 94.7%**
  (mean quality 2.94), against the 64.1% / 81.8% recorded below. Only **16 of 302 detections are false**; the labels were
  counting the owner's own unlabelled holes against the detector. Precision therefore clears its 85% floor; **recall does not**,
  and M16 stays blocked on that alone.
- **Question 3 — REV-27 is kept, now by measurement rather than by the letter of R2.** Of the 86 real holes missed, 30 produced
  a candidate that a filter discarded and 25 of those died on the glyph test. But that test discards **807 candidates across the
  41 targets, of which only 25 are real holes.** Admitting them costs 493 false detections (precision 37.9%); the best variant
  tried, a 40 mm radial gate with relaxed thresholds, still trades 5 points of recall for 16 of precision. Detection score does
  not separate the 25 from the 782 (the distributions overlap); radial distance helps but not enough. **Do not relax REV-27.**
- **Consequence.** Hand-written features are at their ceiling on bare paper at about 77% / 95%. The recall gap is addressed
  instead by **M21** (REV-40), which offers the ambiguous candidates to the user — measured to reach 83.3% recall with precision
  unchanged — and by **M19** (the backing sheet), where colour separates what shape and brightness cannot.
- **The sample set is worst-case, not typical (owner, 2026-09-18).** The 46 photos "were those I had on my phone before this
  work was started so will represent the worst photos available" — taken before the capture overlay existed, so the target is
  often small in frame, badly lit or cropped. **Recall 76.2% / precision 93.8% is therefore a pessimistic floor.** Re-measure
  once photos taken *through* the app exist; until then the gate deliberately sits on hard cases.
- **`IMG_5057 2.jpeg` was recorded as `precision`; it is a sighting sheet** (Caledonia Nordic, 115 mm disc, dashed 110/40 mm
  guides, 45 mm circle — confirmed visually 2026-09-18). Corrected in the v2 labels, with `anchorDiameterMm` 112.4 → 115. The
  aggregate is unchanged (76.2% / 93.8%); the per-template split moves to precision 22 photos / sighting 13. **The underlying
  defect is `hintTemplate`**, which classifies sighting sheets as precision (M10 open question 3) and so also picks the wrong
  anchor diameter. It is not fixed here — it needs its own measurement across the whole set, and it affects live analyses, not
  just the labels.
- **Sample-set corrections from the owner:** pull **IMG_5084** (a combined prone/standing target plus two others in frame), and
  **IMG_5153 duplicates IMG_5152**. The review page's rank labels also skipped numbers on IMG_4744, so its detected count reads
  high; fix with R5's labelling.

1. **BLOCKING — the R4 gate is not reached.** On the 34 gated photos the reworked detector measures **recall 64.1%,
   precision 81.8%** against floors of 85% / 85% (baseline 53% / 61%). Precision sheets 59.5% / 78.0% (baseline
   54% / 54%), sighting sheets 73.6% / 89.0% (baseline 51% / 87%). Per R4, tuning stopped here and `pnpm cv:eval`
   exits non-zero. Where the rest is lost, measured:
   - **Tight clusters.** IMG_5152 (6 of 19) and IMG_5153 (5 of 16) alone account for 24 of the 121 missed holes: torn,
     overlapping holes merge into one blob and the peaks are one hole radius apart at best.
   - **REV-27's stroke/elongation filter** costs recall: without it the same detector measures recall 72.7%,
     precision 79.5%. R2 says keep it when removing it lowers precision, and it does, so it is kept (question 3).
   - **A smaller footprint** (0.5 x hole radius) raised recall to 85% but collapsed precision to 18-27%: printed
     ring lines the ±0.9 mm bands miss (the calibration is off by 1-3 mm on the outer rings, M18's subject) become
     candidates. Registering each ring line locally (a per-sector radial search) recovered part of it (precision 27%)
     but not enough, and was not shipped.
   - **IMG_4745** (3 of 11, 13 false) has a calibration off by ~1.5x (labels there reach 218 mm), so R3 falls back
     and the rings are wrong; it is an alignment failure, not a detection one.
   The owner decides: re-rate with `pnpm review:detection` (labels are incomplete, and every unmatched detection is
   listed in `cv:eval` for confirmation), move the floors, or ask for another round (cluster splitting, and ring
   registration once M18 fixes the outer-ring alignment, are the two measured levers).
2. **The sheet fallback is not recorded on the analysis.** R3 says "record the fallback on the analysis", but
   `TargetAnalysis.pipeline` (data-model §4) has no field for it and `Warning` has no value for it, and a storage
   change is not something to guess. The fallback is in `DetectionReport.sheet.method` and reported by `cv:eval`
   (1 of 40 photos), but the worker returns only `{ shots }` (analysis-pipeline §6), so the app never sees it. Either
   add a warning (e.g. `sheet-not-found`, with its §4 place and message) or a pipeline field.
3. **REV-27 is kept by the letter of R2, at a recall cost.** Measured with R1 and R2 in place (same code, same
   photos, `pnpm cv:eval` gate): with the filter recall 64.1% / precision 81.8%; without it 72.7% / 79.5%. Removing it lowers precision,
   so R2 keeps it — but it also costs 8 points of recall, more than it gains in precision. Confirm, or change the rule.
4. **"Bright, low-saturation" is the wrong description of the owner's paper.** Measured at the reference annulus the
   sheets are bluish white (chroma 2-83 against gray 171-207) and the backing board is the *less* saturated surface.
   `sheet.ts` therefore segments by similarity to the reference paper (gray no more than 80 darker, chroma/gray ratio
   within 0.12, no sharp edge) rather than by low saturation. R3's wording could say so.
5. **A5 is ~7.5x slower in Node.** Median 96 ms (max 136) before, 728 ms (max 921) after, over the 40 photos with a
   target (A4 unchanged at ~43 ms). The detection square is 1200 px (150 mm at 4 px/mm) against the old 1395 px
   crop, but it runs two median filters, a sheet segmentation and per-candidate measurement. analysis-pipeline §9's
   3 s Stage A budget is for the iPhone and is unmeasured here (M15 measures it).
6. **The numeral mask drops every candidate in a numeral box on paper.** No labelled hole sits in a paper numeral box
   (0 of the 26 in boxes), so no keep threshold can be measured there; on the black mark the measured threshold is
   0.685 (holes 0.69-0.95, false detections 0.67-0.68). A synthetic "3" beside the mark's edge scores 0.79-0.87, which
   is why paper boxes keep nothing. A real hole on a paper numeral would be lost.
7. **The numeral rotation is weak on 3 of 22 precision photos** (IMG_4743, IMG_4771, IMG_5071: phase strength below
   0.3), where no numeral mask is applied. Some "reliable" estimates (IMG_4723 8.6°, IMG_5071 -12.4°) could not be
   checked against anything.
8. **Printed text and form lines on the paper** are the main remaining false detections beyond the rings (IMG_4514,
   IMG_5058, IMG_5132_2 in the unmatched list): R3 widened the search to where they are printed, and nothing in R2
   masks them. Some "false" detections at 125-140 mm may also be real holes the owner never tapped.
9. **Tiling lost, so REV-32's tile tests were removed.** Measured in the prototype with the same acceptance filters:
   tiled median/MAD (12 mm tiles) recall 49.6% / precision 63.3%; per-surface global statistics 55.8% / 66.9%; a
   sliding local median background 72.1% / 81.0%, which ships. The tests "a hole on a tile boundary is returned once"
   and "empty tiles are skipped" no longer describe anything and were replaced by "each hole is returned once".
10. **The overlapping-pair test is relaxed.** Two holes 3 mm apart may now come back as one or two shots (both
   multiplicity 1); the test asserts at most two, never an invented multiplicity, rather than exactly one merged shot.
11. **Detection scale.** R3 asks for the canonical scale to be chosen from the working resolution: the working images
   put the sheet at 2.5-6.4 px/mm, so detection rectifies at a fixed 4 px/mm (`DETECTION_PX_PER_MM`), which keeps the
   150 mm square at the working image's own 1200 px. A per-photo scale was not tried.

Earlier questions: (1) `capShots`'s area tie-break — **still open**; (2) alignment UNVERIFIED — **still open, now
M18**; (3) elongation does not separate glyphs — **superseded** by question 3 above; (4) confidence is a weak ranking
key — **changed**: confidence is now the R1 score (the deviating share of the hole disc, x0.6 for a cluster), which
does separate holes from background (AUC ~0.97) but not from print; (5) the `cluster` flag — **changed**: `cluster`
is now "blob area >= 1.6 hole areas"; (6) two steps numbered 3 — moot; (7) numeral column only — **replaced** by R2's
32-box mask and its synthetic test at 0°, 17° and 45°; (8) `detectShots`'s sixth parameter — **resolved**, removed;
(9) overlay alignment status — **resolved**: §4 rule 9 is implemented in `status.ts` with its vectors, and the Stage B
test now expects `needs-attention`; (10) the +5 mm crop bound — **superseded** by R3.

## Completion notes

Rework implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-17; committed as `2bd71f4`.
The first implementation's notes are in commit `90464b8`.

**Closed 2026-09-18 after the owner's re-rating.** The owner took R4's third option and re-rated every photo. Two
things changed as a result, both recorded in DESIGN-REVISIONS 2026-09-18:

1. **The labels were rebuilt.** `fixtures/private/review/ground-truth-holes-v2.json` (372 holes, 35 gated photos,
   built by `tool/truth-v2.mts`) replaces the v1 set, whose labels counted the owner's own unlabelled holes as false
   positives and understated precision by about 13 points. `LABELLED_HOLES_RELATIVE_PATH` now points at it.
2. **The recall floor moved to 0.72; precision stays at 0.85.** Measured against the corrected labels the detector is
   **recall 76.2%, precision 93.8%** — precision passes with room to spare, and recall cannot reach 0.85 by tuning
   (see Open question 3: recovering the discarded holes costs 493 false detections). The gap is closed by **M21**
   (offering the ambiguous candidates to the user, measured at 83.3% recall with precision unchanged) and **M19**
   (the coloured backing). The floor is a do-not-regress line with ~4 points of headroom, not a target.

The owner's iPhone check is still outstanding and is recorded in `OWNER-CHECKS.md`.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (4 pre-existing warnings), **477 unit tests in 54 files**, privacy check passed (15 images) |
| `pnpm cv:eval` | 2026-09-17: **FAIL (exit 1), as R4 intends** at recall 64.1% / precision 81.8% against the v1 labels. 2026-09-18 after the re-rating: **pass (exit 0)** — recall 76.2% (floor 72.0%), precision 93.8% (floor 85.0%) on the v2 labels; every synthetic case and both reference JPEGs pass |
| `pnpm test:e2e` | **pass** — 30/30 on mobile-chromium and mobile-webkit, including "the demo precision target analyses without too-many-shots" |
| `pnpm review:detection` | **pass** — wrote `fixtures/private/review/detection-review.html` (4.8 MB, 46 photos); smoke-tested headless: `#n` labels, mode switch (a tap on a detection in *Add missed hole* adds a marker), carry-over of the 2026-09-17 labels (146 marks), v2 export, no console errors |
| **Human (owner)** | re-rate on the review page and paste the export; iPhone check. **Not done by the agent** |

### What was built

- **R1 `src/lib/cv/hole-signal.ts`** — per surface (black mark / paper), a median background over 3 hole diameters;
  a pixel deviates when `|gray - background| > 3 x` the surface's median deviation (floor 2); the score is the
  deviating share of a hole-sized disc; candidates are peaks of the lightly smoothed score (>= 0.5), one hole radius
  apart. **`src/lib/cv/hole-features.ts`** measures each candidate: core contrast, surround share, and the blob of
  deviating pixels it sits on (area, moment elongation, maximum inscribed radius).
- **Acceptance (`holes.ts`)**: M11's area gate (blob >= 0.35 hole areas); REV-27 (elongation > 4 or inscribed
  radius < 0.35 x hole radius is print); on the mark, score >= 0.6; on paper, |core contrast| >= 40, surround <= 0.15,
  elongation <= 3; then R2's numeral boxes. `multiplicity` is always 1; `confidence` = score (x0.6 for a cluster).
- **R2 `src/lib/cv/print-mask.ts`** — the printed-circle bands (moved from `hole-mask.ts`), numeral centres from the
  template (band centres; the "3" between the mark's edge and ring 3), the rotation estimate (phase of
  Σ w e^{4iθ} over ink samples on the band-centre circles; strength < 0.3 = unreliable, no mask), and the 32 boxes
  (±2.5 mm radial and tangential: glyphs measured ~4 mm tall and 2.5-3 mm wide on IMG_4540, plus margin).
- **R3 `src/lib/cv/sheet.ts`** — the paper sheet: pixels like the reference annulus 1.5-6 mm beyond the outermost
  printed circle, OPEN 3 mm, components holding the annulus, union with the target, filled, eroded 3 mm, capped at
  150 mm. Falls back to the 105 mm circle when the annulus is darker than 100 or under half of it looks like paper.
  `rectify` gained options (scale, radius, a chroma channel).
- **R4 `tests/helpers/labelled-holes.ts` + `scripts/cv-eval-labelled.ts`** — labels loader, greedy working-px
  matcher (0.8 hole diameters), pooled figures, caveated photos reported but never gated, the baseline, the sheet
  fallback count, A4+A5 time, the numeral-mask cost, and every unmatched detection for the owner. `cv-eval.ts` lost
  the global/region comparison and labels the `sample-shots-*.json` rows UNVERIFIED.
- **R5 `scripts/detection-review/`** (`build.ts`, `photo.ts`, `template.html`) + `pnpm review:detection` — reads
  `fixtures/private/additional references/`, writes only `fixtures/private/review/detection-review.html` (asserted),
  images re-encoded by sharp with no metadata. `#1, #2…` rank labels and "every detection is ONE hole"; a per-photo
  *Mark detections* / *Add missed hole* switch; *Carry over earlier marks* from a pasted export (v2 exports carry
  positions) or from the embedded 2026-09-17 labels, matched within 0.8 hole diameters; storage key bumped to v2 so
  the first page's rank-based marks cannot leak in.
- **Step 9 / §4 rule 9** in `src/lib/domain/status.ts`: `alignment.method === 'overlay'` → `needs-attention`,
  `['alignment-uncertain', ...other warnings]`; a `cv` alignment with the warning stays `analyzed`. Tests: three new
  status vectors and the Stage B test.
- Deleted: `hole-mask.ts`, `holes-region.ts`, `component-metrics.ts` (tiling lost; see Open question 9).
- `tests/helpers/synthetic-target.ts`: hole styles (dark, bright, rim, paperDark), a letter sheet on a backing board,
  a no-paper ground, and numeral glyph blocks at any rotation.

### Measured values (R1-R4)

Polarity-free signals at the owner's labelled holes (prototype, max within 1.5 mm, same photos): deviating share vs
plain background AUC 0.97 (mark) / 0.97 (paper), edge energy 0.81 / 0.95 — the share ships. On paper, at candidates:
core contrast AUC 0.89, surround 0.84, elongation 0.79 (TP vs FP).

**Per-template recall/precision against the baseline** (`pnpm cv:eval`, gated photos):

| set | photos | TP/FP/FN | recall | precision | baseline recall / precision |
|---|---|---|---|---|---|
| gated · all | 34 | 216/48/121 | 64.1% | 81.8% | 53.0% / 61.0% |
| gated · precision | 22 | 135/38/92 | 59.5% | 78.0% | 54.0% / 54.0% |
| gated · sighting | 12 | 81/10/29 | 73.6% | 89.0% | 51.0% / 87.0% |
| caveated (not gated) | 6 | 32/6/21 | 60.4% | 84.2% | — |

**Per photo** (`pnpm cv:eval`):

| photo | template | labelled | detected | TP | FP | FN | recall | precision | sheet | numeral rot | set |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG_4444 | sighting | 10 | 8 | 8 | 0 | 2 | 0.80 | 1.00 | segmented | — | gated |
| IMG_4514 | precision | 14 | 11 | 8 | 3 | 6 | 0.57 | 0.73 | segmented | -2.7° | gated |
| IMG_4515 | precision | 10 | 7 | 7 | 0 | 3 | 0.70 | 1.00 | segmented | -0.5° | gated |
| IMG_4540 | precision | 10 | 7 | 7 | 0 | 3 | 0.70 | 1.00 | segmented | 1.1° | gated |
| IMG_4673 | precision | 10 | 9 | 8 | 1 | 2 | 0.80 | 0.89 | segmented | 0.2° | gated |
| IMG_4722 | precision | 10 | 3 | 3 | 0 | 7 | 0.30 | 1.00 | segmented | 1.9° | gated |
| IMG_4723 | precision | 11 | 8 | 7 | 1 | 4 | 0.64 | 0.88 | segmented | 8.6° | gated |
| IMG_4742 | sighting | 7 | 4 | 4 | 0 | 3 | 0.57 | 1.00 | segmented | — | CAVEAT |
| IMG_4743 | precision | 10 | 8 | 8 | 0 | 2 | 0.80 | 1.00 | segmented | -32.7° (weak) | gated |
| IMG_4744 | sighting | 10 | 12 | 10 | 2 | 0 | 1.00 | 0.83 | segmented | — | gated |
| IMG_4745 | precision | 11 | 16 | 3 | 13 | 8 | 0.27 | 0.19 | fallback | 5.8° | gated |
| IMG_4746 | precision | 9 | 7 | 7 | 0 | 2 | 0.78 | 1.00 | segmented | 2.7° | CAVEAT |
| IMG_4770 | precision | 10 | 7 | 7 | 0 | 3 | 0.70 | 1.00 | segmented | -0.6° | gated |
| IMG_4771 | precision | 9 | 8 | 8 | 0 | 1 | 0.89 | 1.00 | segmented | -41.1° (weak) | gated |
| IMG_4820 | sighting | 10 | 8 | 7 | 1 | 3 | 0.70 | 0.88 | segmented | — | CAVEAT |
| IMG_4827 | precision | 9 | 7 | 7 | 0 | 2 | 0.78 | 1.00 | segmented | -1.3° | gated |
| IMG_4831 | sighting | 5 | 4 | 4 | 0 | 1 | 0.80 | 1.00 | segmented | — | gated |
| IMG_4985 | sighting | 10 | 7 | 6 | 1 | 4 | 0.60 | 0.86 | segmented | — | gated |
| IMG_4986 | precision | 6 | 7 | 4 | 3 | 2 | 0.67 | 0.57 | segmented | -5.2° | CAVEAT |
| IMG_5057_2 | precision | 11 | 6 | 6 | 0 | 5 | 0.55 | 1.00 | segmented | -3.1° | CAVEAT |
| IMG_5058 | precision | 11 | 8 | 5 | 3 | 6 | 0.45 | 0.63 | segmented | 6.2° | gated |
| IMG_5070 | precision | 7 | 5 | 3 | 2 | 4 | 0.43 | 0.60 | segmented | -6.0° | gated |
| IMG_5071 | precision | 10 | 10 | 8 | 2 | 2 | 0.80 | 0.80 | segmented | -12.4° (weak) | gated |
| IMG_5084 | sighting | 14 | 10 | 9 | 1 | 5 | 0.64 | 0.90 | segmented | — | gated |
| IMG_5085 | precision | 10 | 6 | 4 | 2 | 6 | 0.40 | 0.67 | segmented | -2.6° | CAVEAT |
| IMG_5129 | sighting | 9 | 10 | 8 | 2 | 1 | 0.89 | 0.80 | segmented | — | gated |
| IMG_5131 | sighting | 10 | 6 | 6 | 0 | 4 | 0.60 | 1.00 | segmented | — | gated |
| IMG_5132_2 | precision | 9 | 12 | 7 | 5 | 2 | 0.78 | 0.58 | segmented | -5.5° | gated |
| IMG_5134 | precision | 9 | 7 | 5 | 2 | 4 | 0.56 | 0.71 | segmented | -3.8° | gated |
| IMG_5146 | sighting | 10 | 6 | 6 | 0 | 4 | 0.60 | 1.00 | segmented | — | gated |
| IMG_5147 | sighting | 5 | 4 | 3 | 1 | 2 | 0.60 | 0.75 | segmented | — | gated |
| IMG_5148 | precision | 8 | 7 | 6 | 1 | 2 | 0.75 | 0.86 | segmented | 1.2° | gated |
| IMG_5149 | precision | 10 | 8 | 7 | 1 | 3 | 0.70 | 0.88 | segmented | 3.8° | gated |
| IMG_5151 | sighting | 7 | 5 | 5 | 0 | 2 | 0.71 | 1.00 | segmented | — | gated |
| IMG_5152 | precision | 19 | 6 | 6 | 0 | 13 | 0.32 | 1.00 | segmented | 1.2° | gated |
| IMG_5153 | precision | 16 | 6 | 5 | 1 | 11 | 0.31 | 0.83 | segmented | 0.8° | gated |
| IMG_5182 | sighting | 9 | 8 | 7 | 1 | 2 | 0.78 | 0.88 | segmented | — | gated |
| IMG_5183 | sighting | 11 | 11 | 9 | 2 | 2 | 0.82 | 0.82 | segmented | — | gated |
| IMG_5184 | precision | 8 | 9 | 6 | 3 | 2 | 0.75 | 0.67 | segmented | -0.5° | gated |
| IMG_5185 | precision | 6 | 4 | 4 | 0 | 2 | 0.67 | 1.00 | segmented | -3.8° | gated |

The six photos without a target (IMG_3478, IMG_3480, IMG_3485, IMG_3487, IMG_4447, IMG_5083) are not run. The
unmatched detections on gated photos are listed by `cv:eval` in px and mm for the owner to confirm.

- **Numeral mask (R2):** 26 labelled holes sit inside a numeral box, none of them on paper; the mask dropped 2
  candidates and cost 0 labelled holes. Keep threshold on the mark 0.685 (holes 0.69-0.95, false 0.67-0.68).
- **REV-27 glyph filter:** measured with R1 and R2 in place, removing it takes precision from 81.8% to 79.5% (recall
  64.1% to 72.7%; both re-measured with `pnpm cv:eval` on the shipped code in fix round 1), so it stays at its measured values, elongation > 4 or inscribed radius < 0.98 mm (Open question 3).
- **Sheet segmentation (R3):** fell back on **1 of the 40** photos with a target (IMG_4745, whose calibration is ~1.5x
  off, so the reference annulus lands on a printed ring). On the other 39, all 379 labelled holes within 150 mm lie
  inside the segmented sheet (checked with `findSheet` directly).
- **Stage A time (Node, 40 photos):** A5 median 96 ms / max 136 ms before, 728 ms / 921 ms after; A4 ~43 ms both.
- **Tiling (R1):** tiled 49.6% / 63.3%, per-surface global 55.8% / 66.9%, sliding local median 72.1% / 81.0% (prototype,
  same filters without REV-27); the sliding median ships and the tiles are gone.
- **Fill before the median filter** (prototype runs, before the final code; not re-measured): painting the other
  surface *and* the printed bands with the local mean measured 59.0% / 71.6%; the surface median everywhere
  64.1% / 82.8%; the hybrid (other surface local mean, own bands the median) 64.4% / 82.2% in the prototype, which
  also keeps a paper hole beside the mark under a strong shadow gradient. The shipped hybrid measures
  **64.1% / 81.8%** in `pnpm cv:eval`, the only figures to use for the shipped detector.

`pnpm cv:eval`'s other sections: synthetic anchors pass (centre ≤ 0.37% of R); both reference JPEGs within the seed
tolerance; alignment vs owner ground truth still NO GROUND TRUTH (UNVERIFIED, M18); synthetic shots 8/8 (mean error
0.26 mm), 8/8 rotated (0.23 mm), sighting overlapping pair 3 units; IMG_5057-sighting.jpg 7 and IMG_5132-precision.jpg 8
detections, both within 10 declared (their `sample-shots` rows are labelled UNVERIFIED).

### Fix round 1 (2026-09-17)

Review findings and what was done:
- **Blocker, `pnpm cv:eval` exits 1 (R4 gate):** not tuned further, because R4 says to stop and record the numbers when the
  floors can't be reached. This still needs the owner's decision on Open question 1. Re-run: recall 64.1% / precision
  81.8% (precision sheets 59.5% / 78.0%, sighting sheets 73.6% / 89.0%), unchanged.
- **Inconsistent figures:** re-measured the REV-27 ablation on the shipped code by disabling `isPrintedGlyph` for one
  `cv:eval` run, then restored the file byte for byte (checked with `cmp`). Without the filter: 72.7% / 79.5%. With it:
  64.1% / 81.8%. Open question 3 and the REV-27 bullet now use these numbers. The fill-variant figures are marked as
  prototype runs.
- **Tests list still named the REV-32 tile tests:** struck through in *Tests* and pointed to Open question 9.
- **Sheet fallback not on the analysis (Open question 2), A5 timing (Open question 5):** still open questions for the owner or M15.
  No code change.

Re-run: `pnpm check` pass (477 tests), `pnpm cv:eval` FAIL (exit 1, gate as above), `pnpm test:e2e` pass (30/30),
`pnpm review:detection` pass (46 photos).

### Owner checks (not done by the agent)

1. **Re-rate:** run `pnpm review:detection`, open `fixtures/private/review/detection-review.html`, press *Carry over
   earlier marks → Use the 2026-09-17 labels*, correct the marks (*Add missed hole* for holes beside a marker), rate
   every photo and paste the export.
2. **Decide Open question 1** (the gate is not reached: accept, move the floors, or another round) and questions 2
   (record the sheet fallback), 3 (REV-27's recall cost) and 6 (paper numeral boxes).
3. **On the iPhone:** photograph both sheets → Analyze → confirm the shot count is plausible, the diagram resembles the
   photo, and Stage A still finishes in reasonable time (A5 is ~7.5x slower in Node, Open question 5).
