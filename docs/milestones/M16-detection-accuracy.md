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
  threshold misses at least one; a hole placed exactly on a tile boundary is returned **once**; tiles with no candidate are
  skipped (assert the refine pass touches only the affected tiles); and a sheet with 6 holes but 10 declared rounds returns
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

1. **`capShots`'s area tie-break has nothing to read.** Step 4 ranks ties "by larger area", but `Shot`
   (data-model §4) carries no area, and adding one is a data-model change this milestone does not own.
   `capShots` is therefore generic over `Shot & { areaMm2?: number }`: the area comparison runs when a
   caller supplies it (`cv:eval` does, and the unit test pins the rule), while Stage A and Stage B pass
   stored `Shot`s, so in the app the order is confidence → smaller radius → id. Either add `areaMm2` to
   `Shot`, or drop "area" from the rule.
2. **Alignment is UNVERIFIED (step 7).** `fixtures/reference/ground-truth/` holds only its README, so
   `cv:eval` cannot produce the alignment table and gates nothing; it prints a NO GROUND TRUTH notice
   instead, as step 7 instructs. The anchor table is still measured against `seed-calibrations.json`,
   which was estimated by eye and is **not** ground truth. Nothing in REV-31 is actually demonstrated
   until the owner exports ground truth from Adjust (M13 step 7).
3. **Elongation does not separate printed glyphs from holes on real photos.** Measured on
   `IMG_5132-precision.jpg`, the two ranges overlap completely (glyphs 1.00–6.15, holes 1.06–3.48),
   because a ring numeral is a roundish blob, not a long stroke. The stroke-radius half of REV-27's
   filter does separate them cleanly, so the pair of tests works; but `fill` (glyphs ≤ 0.07, holes
   ≥ 0.38) and `circularity` (glyphs ≤ 0.11, holes ≥ 0.12) separate by a far wider margin and would be
   the better second test if REV-27 is ever revisited. Not changed here: the revision names elongation.
4. **`confidence` is a weak ranking key on real photos, so the cap's choice of which candidate to drop
   is close to arbitrary.** Confidence is `circularity × cluster factor`, and on real paper every
   component — true holes included — scores 0.02–0.37 (M11 Open question 5). The cap is still correct
   (it never reports more than the rounds fired), but *which* `declared` it keeps is not meaningfully
   ranked. The owner fixes a wrong choice in Adjust; M17's parked markers are the other half of this.
5. **The region scan changed which blobs carry the `cluster` flag.** On the synthetic overlapping pair
   the merged blob measures `k = 1.37` under tile-local thresholding, against 1.67 under the global
   thresholds, so it is now below `CLUSTER_AREA_RATIO` (1.6) and `cluster` is false. Nothing in the app
   reads `cluster` except `adjust.ts`'s "unchanged" comparison, but if M13/M17 want to offer
   "split this cluster" on merged holes, the flag no longer marks them reliably.
6. **The milestone has two steps numbered 3** ("Reject printed glyphs" and "One hole to start"), so the
   step numbers in these notes are 3a and 3b.
7. **The "numeral sectors" test pins the 12/6 o'clock column only.** On `IMG_5132-precision.jpg` the
   3 and 9 o'clock numerals share their band with a real hole (there is a hole at ≈ (−23, 0) mm, beside
   the printed "8"), so "no detection in the numeral sectors" cannot be asserted for all four axes
   without asserting away a real shot. The vertical column is where M11's 11 false detections were, and
   that is what the test asserts is now empty.
8. **`detectShots` gained an optional sixth parameter** (`options.method`, `options.tuning`) that
   analysis-pipeline §6's signature does not mention. The worker calls it with five arguments and gets
   the shipping method; only `cv:eval` and the unit tests pass the option, to compare the two
   segmentations and to sweep the region constants. §6 could gain the optional argument.
9. **Step 8 contradicts analysis-pipeline §4, and §4 wins.** The step asserts that a photo whose
   alignment came from the overlay fallback (`method: 'overlay'`, warning `alignment-uncertain`)
   "already reaches `needs-attention`". §4's rules say otherwise: pipeline warnings are *appended* to
   `reasons`, and `alignment-uncertain` matches none of rules 5–8, so such a photo lands on rule 9 and
   reads `analyzed`, with "Used your on-screen alignment — check the rings line up." underneath.
   Measured, not assumed: the stage-b test above seeds `alignment.method = 'overlay'` and gets
   `analyzed`. **Nothing was changed** (golden rule 2: the spec wins, and REV-31 names no rule number).
   The owner decides which is wanted — either §4 gains a rule "warnings include `alignment-uncertain` →
   `needs-attention`" (it would sit between the new rule 8 and rule 9, and would also change M13's
   Adjust preview), or step 8's wording is corrected to "is reported with its reason" and the milestone
   is already satisfied.
10. **`capShots`'s crop bound reads `outerRadiusMm + PAPER_OUTSET_MM` (5 mm), not step 2's
   `outerRadiusMm + 10`.** Step 2 describes the search area as "the rectified crop from M11 step 1
   (side `2 × (outerRadiusMm + 10) × 8`)". Two different numbers are in play: the rectified *image* is
   indeed cut at +10 mm (`rectifiedSidePx`, unchanged), while the *candidate* bound is M11 step 3's
   paper region, `searchRadiusMm = outerRadiusMm + PAPER_OUTSET_MM` — 82.2 mm on the precision sheet
   against the crop's 87.2 mm. The narrower bound is deliberate (it is exactly where M11 stopped
   thresholding, so no pixel outside it was ever classified) and is what the test and the REV-33
   assertion use, but code and milestone wording differ by 5 mm and the owner may want the step reworded.
11. **The M11 confidence floor was re-measured, not dropped.** Fix round 1 restored
   `expect(shot.cluster).toBe(false)` and `expect(shot.confidence).toBeGreaterThan(0.65)` on the eight
   cleanly separated synthetic holes; under the region scan they measure **0.790–0.884** (all
   `cluster: false`), so M11's floor still holds with room to spare. This matters because confidence is
   the cap's primary ranking key (Open question 4), so a silent drop on clean holes would have gone
   unnoticed. Open question 5 (the merged sighting blob losing its `cluster` flag) is unaffected.
## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16, and revised in **fix
round 1** after review. Per the orchestration overrides this milestone was **not** committed or pushed,
and its Status is left `in-progress`.

**Fix round 1 changed five things** (all three Acceptance commands re-run and passing afterwards):

1. The step 8 test asserted the opposite of its own name and never exercised the overlay path. It now
   seeds `pipeline.alignment.method = 'overlay'`, is named for what it asserts, and the contradiction
   between step 8 and analysis-pipeline §4 is recorded as **Open question 9** instead of being papered
   over (golden rule 2).
2. The `extra-candidates-dropped` message took its count from `result.all.declared`, which is null in
   the `ready` state §4 rule 4 displays it in — so the card could read "…because you fired 0 rounds."
   It now comes from the photo's own categorization, via new pure `declaredRoundsOrNull`
   (geometry-scoring §7), at all three call sites.
3. The private-set summary below understated every figure; it is restated from the actual `cv:eval`
   output.
4. The two M11 assertions deleted from the 8-separate-holes case (`cluster` false, `confidence > 0.65`)
   are restored, re-measured under the region scan — see **Open question 11**.
5. "Tilt and curl" gained the unit test the milestone's Tests list asks for, plus a matching `cv:eval`
   row; the crop-wording mismatch REV-33 introduced is recorded as **Open question 10**.

**All three Acceptance commands pass.**

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (4 pre-existing warnings), **462 unit tests in 53 files** (was 381 in 48), `privacy check passed (15 images)` |
| `pnpm cv:eval` | **pass (exit 0)** — synthetic anchor and shot cases within tolerance, both reference photos within the seed tolerance, neither yielding more detections than its declared rounds |
| `pnpm test:e2e` | **pass** — 30/30 across mobile-chromium and mobile-webkit, including the new REV-28 results test |
| **Human (owner)** | photograph both sheets on the iPhone → Analyze → confirm the shot count is plausible and the diagram resembles the photo. **Not done by the agent** |

### What was built

- **`src/lib/cv/holes.ts`** — the public detector. Runs one of two segmentations, applies REV-27's shape
  filter, REV-33's crop assertion and REV-28's `multiplicity = 1`, and returns either `Shot[]`
  (`detectShots`, unchanged signature) or the full `DetectionReport` (`detectShotCandidates`: every
  candidate with its measured area, circularity, elongation, stroke radius and fill, plus everything
  the gates rejected and why). `cv:eval` reports from the second.
- **`src/lib/cv/hole-mask.ts`** (new) — the region/band maps and the global two-threshold mask, lifted
  out of the old `holes.ts` unchanged, so both methods share exactly one definition of "where the disc
  is, where the paper is, and which pixels are printed circles".
- **`src/lib/cv/holes-region.ts`** (new) — the REV-32 region scan: `REGION_MM` tiles at half-tile
  stride, classified by their centre, thresholded against their own median and MAD, empty tiles dropped
  with no further work, tiles with a candidate refined at up to `REGION_REFINE_MAX` lower `REGION_K`
  values, results deduped by centroid within one hole radius.
- **`src/lib/cv/component-metrics.ts`** (new) — one measurement pass over a binary mask: exact pixel
  areas and centroids from `connectedComponentsWithStats`, perimeter and fitted ellipse from the
  external contours, and the maximum inscribed radius from one `distanceTransform`. Shared by both
  methods so the `cv:eval` comparison is like-for-like.
- **`src/lib/scoring/cap-shots.ts`** (new) — pure `capShots`.
- **`src/lib/pipeline/stage-a.ts` / `stage-b.ts`** — the cap, with `extra-candidates-dropped`.
- **`src/lib/domain/`** — the new `Reason`/`Warning`, its place in the warning order, the status rule and
  the message; **`docs/spec/analysis-pipeline.md` §4** updated to match (new rule 8, renumbering the old
  rule 8 to 9).
- **`src/components/results/ReasonList.tsx`** and its three call sites — the new message names the
  declared rounds, so the component needed the number. It takes `declared: number | null` from
  `declaredRoundsOrNull(photo.categorization)` (`src/lib/domain/categorization.ts`, new, pure, tested),
  **not** `result.all.declared`: §4 rule 4 shows this reason while `stageB` is still `pending` and
  `analysis.computed` is null, which is exactly the state Stage A leaves a capped photo in before
  Analyze is tapped (fix round 1).

### Step 3a — the measured glyph filter (REV-27)

Measured on `docs/reference/IMG_5132-precision.jpg` with the **CV-measured** calibration (what A4 hands
A5 in the app). Glyphs are the components on the printed numeral column at 12 and 6 o'clock; holes are
the components the region scan keeps elsewhere, checked against the photo.

| class | n | stroke radius (mm) | elongation | circularity | fill | area (mm²) |
|---|---|---|---|---|---|---|
| printed numerals | 20 | **0.36 – 0.92** (p50 0.53) | 1.00 – 6.15 | 0.015 – 0.27 | 0.00 – 0.84 | 9.7 – 118 |
| bullet holes | 30 | **1.04 – 2.98** (p50 1.49) | 1.06 – 3.48 | 0.12 – 0.55 | 0.38 – 0.89 | 9 – 40 |

- `STROKE_MIN_FRACTION = 0.35` → **0.98 mm** for the 5.6 mm hole, which falls inside the measured gap
  (0.92 | 0.98 | 1.04). This is the test that does the work.
- `ELONGATION_MAX = 4` sits just above the largest real hole measured (3.48). It does **not** separate
  numerals from holes (see Open question 3); it removes the long thin remnants of printed ring lines.

On that photo the filter takes detections from M11's **19 detections / 62 units** to **10 detections /
10 units**, with nothing on the numeral column — pinned by
`tests/unit/cv/holes.test.ts › detects no ring numeral on the real precision sheet`.

### Step 1 — the measured region constants (REV-32)

Same two photos, same calibrations, `ELONGATION_MAX` and `STROKE_MIN_FRACTION` at their shipping values.
"On numeral column" counts detections inside the 12/6 o'clock printed numerals, i.e. false positives.

| photo | REGION_MM | REGION_K | refineMax | detections | on numeral column |
|---|---|---|---|---|---|
| IMG_5132 (10 rounds, ~9–10 holes) | 8 | 3 | 3 | 9 | 0 |
| IMG_5132 | 8 | 5 | 3 | 5 | 0 |
| IMG_5132 | 10 | 4 | 3 | 11 | 0 |
| IMG_5132 | 10 | 5 | 3 | 7 | 0 |
| IMG_5132 | **12** | 3 | 3 | 21 | 2 |
| IMG_5132 | **12** | 4 | 3 | 13 | 0 |
| IMG_5132 | **12** | **5** | **3** | **10** | **0** |
| IMG_5132 | **12** | 6 | 3 | 9 | 0 |
| IMG_5132 | 15 | 3 | 3 | 22 | 1 |
| IMG_5132 | 15 | 5 | 3 | 12 | 1 |
| IMG_5057 (10 rounds, ~7–8 holes) | 8 | 5 | 3 | 2 | 0 |
| IMG_5057 | 10 | 4 | 3 | 7 | 0 |
| IMG_5057 | 10 | 5 | 3 | 6 | 0 |
| IMG_5057 | **12** | 4 | 3 | 7 | 0 |
| IMG_5057 | **12** | **5** | **3** | **7** | **0** |
| IMG_5057 | 15 | 5 | 3 | 11 | 2 |

Refinement, at the chosen 12 mm / k 5: IMG_5132 → 8, 9, 10, **10**, 11 detections at refineMax 0, 1, 2,
3, 5; IMG_5057 → 7 at every refineMax. So refinement recovers two holes and then flattens, which is why
`REGION_REFINE_MAX = 3` (the milestone's own value) is enough and why raising it is not a way to reach a
quota.

**Chosen: `REGION_MM = 12`, `REGION_K = 5`, `REGION_REFINE_MAX = 3`, `REGION_REFINE_FACTOR = 0.75`.**
8 mm starves the statistics (a 5.6 mm hole fills its own tile, so it drags the median with it) and 15 mm
over-detects; 12 mm is also the smallest tile that *guarantees* the milestone's half-stride claim —
`tile − hole = 6.4 mm ≥ the 6 mm stride`, so every hole is whole inside at least one tile, where 10 mm
leaves 4.4 mm against a 5 mm stride and guarantees nothing.

### Step 1 — "keep it only if it wins": global vs region

From `pnpm cv:eval`. The region scan is what ships.

```text
| case | method | truth | detected | units | recall | precision | mean err (mm) | cap drops | result |
|---|---|---|---|---|---|---|---|---|---|
| precision · 8 separate holes | global | 8 | 8 | 8 | 1.00 | 1.00 | 0.25 | 0 | reported |
| precision · 8 separate holes | region | 8 | 8 | 8 | 1.00 | 1.00 | 0.33 | 0 | pass |
| precision rot 30 · 8 separate holes | global | 8 | 8 | 8 | 1.00 | 1.00 | 0.24 | 0 | reported |
| precision rot 30 · 8 separate holes | region | 8 | 8 | 8 | 1.00 | 1.00 | 0.25 | 0 | pass |
| sighting · 4 holes, 2 overlapping | global | 4 | 3 | 3 | 0.75 | 1.00 | 0.56 | 0 | reported |
| sighting · 4 holes, 2 overlapping | region | 4 | 3 | 3 | 0.75 | 1.00 | 0.32 | 0 | pass |
| IMG_5057-sighting.jpg (fixture shots, cv calibration) | global | 7 | 5 | 5 | 0.14 | 0.20 | 1.87 | 0 | reported |
| IMG_5057-sighting.jpg (fixture shots, cv calibration) | region | 7 | 7 | 7 | 0.14 | 0.14 | 2.36 | 0 | <= 10 declared |
| IMG_5132-precision.jpg (fixture shots, cv calibration) | global | 9 | 0 | 0 | 0.00 | 0.00 | — | 0 | reported |
| IMG_5132-precision.jpg (fixture shots, cv calibration) | region | 9 | 10 | 10 | 0.22 | 0.20 | 2.22 | 0 | <= 10 declared |
```

On the real precision sheet the **global method now finds nothing at all** (every blob it produces is a
thin snake of ring line welded to numerals, which the glyph filter then rejects), while the region scan
finds 10 candidates for 10 rounds. On the sighting sheet it finds 7 against the global method's 5. The
region scan wins on both, and on the synthetic sheets it matches the global method's accuracy (mean
error 0.33 mm vs 0.25 mm, both inside the 0.8 mm bar). Cost: ~110 ms per precision sheet in Node, well
inside the §9 Stage A budget of 3 s.

**The `recall`/`precision` columns on the two real photos are not a like-for-like accuracy measure**, and
the same caveat M11 recorded still applies: `fixtures/reference/sample-shots-*.json` was traced from the
owner's example *diagrams*, not measured off these JPEGs, so a detection can be right and still not match
it. That is exactly what Open question 2 is about — these numbers only become meaningful once the owner
exports ground truth.

### Step 7 — alignment accuracy (REV-31)

`cv:eval` grew the alignment table the step asks for, and prints this instead of it:

```text
### Alignment accuracy vs owner ground truth (REV-31; tolerance: centre 5.00% of R, radius 6.00%)

NO GROUND TRUTH: `fixtures/reference/ground-truth/` holds no `<key>.json` file, so alignment is
UNVERIFIED — the anchor table above is measured against `seed-calibrations.json`, which was
estimated by eye and is not ground truth. …
```

Measured against the seed estimates (reported, not ground truth): centre error 1.18% of R and radius
error 0.06–0.07% on `IMG_5057-sighting.jpg`, centre 1.02% and radius 0.07% on `IMG_5132-precision.jpg`,
for both the no-prior and capture-prior cases, with axis ratios 0.901 and 0.943. Every value is inside
the existing tolerance (centre ≤ 5%, radius ≤ 6%), which was **not** tightened, per the step.

**Step 8's premise turned out to be false, and is left to the owner (fix round 1).** The step says an
overlay-fallback photo "already reaches `needs-attention` via analysis-pipeline §4". It does not: §4
appends `alignment-uncertain` as a *warning*, so rules 5–8 never fire and rule 9 sets `analyzed` with
the reason shown beneath it. The test now seeds the real state (`pipeline.alignment.method: 'overlay'`
plus the warning), is named for what it asserts, and pins the behaviour as it is:
`tests/unit/pipeline/stage-b.test.ts › an overlay-fallback alignment is reported, but §4 lands on
`analyzed``. Per golden rule 2 the spec wins and the conflict is recorded as **Open question 9** rather
than being fixed by inventing a rule change. A *capped* photo does reach `needs-attention`, through the
new rule 8 — that half of the milestone is implemented and tested.

### The owner's wider reference set

`cv:eval` now reports `fixtures/private/additional references/` (46 files, gitignored, skipped when
absent) **per photo, never aggregated**: template, detections, glyph drops, outside-crop drops and tiles
scanned/with candidates. Nothing there is gated — there is no ground truth for those photos.

Read straight off that table (corrected in fix round 1; the first version of these notes understated
every figure):

- **An anchor was found on 40 of the 46 files.** Six return `no anchor`: `IMG_3478`, `IMG_3480`,
  `IMG_3485`, `IMG_3487`, `IMG_4447`, `IMG_5083`.
- **Precision sheets (26 photos) return 0–26 detections**, median 7.5. **Sighting sheets (14 photos)
  return 0–15**, median 5.5.
- **Nine photos return 14 or more detections**: `IMG_5152` 26, `IMG_5134` 25, `IMG_5153` 25, `IMG_4514`
  16, `IMG_5071` 16, `IMG_4745` 15, `IMG_5085` 15, `IMG_5183` 15, `IMG_5149` 14. Eleven are above ten
  once `IMG_4986` (11) and `IMG_5132 2` (11) are counted, so a 10-round declaration would send all
  eleven through the cap.
- **Over-detection is therefore still the standing risk this milestone only bounds, it does not cure**:
  the cap guarantees the count never exceeds the rounds fired, but on a sheet returning 26 candidates
  the cap's choice of which ten to keep is ranked by a weak confidence (Open question 4), and the
  owner fixes it in Adjust.
- **The REV-33 crop drops nothing on any of the 46** (`outside crop` is 0 on every row) — the backing
  board is excluded earlier, by `buildRegions` refusing to look there at all.
- Glyph drops are common on precision sheets (up to 12 on `IMG_5134` and `IMG_5152`) and rare on
  sighting sheets, which is what REV-27 predicts: only the precision sheet has printed numerals.

The conditions the milestone lists are each pinned by a named unit test rather than by an aggregate
number: backing board (`ignores holes in the backing board beside the sheet`), both polarities in one
photo (`finds a hole on the white paper outside the disc`), the sighting dashes (`never detects the
sighting sheet dashed guides`), overlapping holes (`reads two holes overlapping at 3 mm as ONE shot`),
**tilt and curl** (`finds every hole on a tilted sheet`, added in fix round 1: the same eight holes on a
sheet rotated 30° and foreshortened to axis ratio 0.82 — 8/8 matched, mean error 0.34 mm, against 0.33 mm
square to the camera; `cv:eval` gained the matching `precision rot 30 · 8 separate holes` row), and the
lighting gradient (`finds every hole under a lighting gradient that defeats the global thresholds`).

### Deviations and decisions

- **Three new modules instead of one `holes.ts`** (`hole-mask.ts`, `holes-region.ts`,
  `component-metrics.ts`). The milestone's *Files* names `holes.ts`; a single file holding both
  segmentations, the shared masks and the measurement pass would have been ~700 lines, against AGENTS.md's
  ~300-line rule. No behaviour moved: `holes.ts` re-exports `printedCircleRadiiMm` and the M11 constants,
  so every existing import still resolves.
- **`multiplicity` is always 1, and `cluster` is still measured** — it flags the shot and discounts the
  confidence, exactly as step 3b says. See Open question 5 for what that changed.
- **Region statistics are per class, not per tile-blind.** A tile takes the class of its centre (as the
  step says), and the median, MAD and candidate pixels are then taken only from pixels *of that class*.
  Without this a paper tile that clips the black aiming mark reads the mark as one enormous dark "hole",
  and a disc tile that clips the paper never reaches its threshold at all.
- **`REGION_MAD_FLOOR = 1`** (new constant, `constants.ts`): gray levels are 8-bit integers, so a flat
  synthetic tile measures MAD 0 and `k × MAD` would collapse to "any pixel that differs at all".
- **A cheap pre-check before OpenCV runs on a tile**: a tile whose raw candidate pixels cannot reach half
  the area gate is skipped without constructing a Mat. This is what makes 596 tiles cost ~110 ms.
- **Dedupe prefers a component that does not touch its tile's edge**, then higher fill, then larger area,
  then position. The milestone says "keep the higher fill"; on its own that can prefer a hole sliced by a
  tile boundary (a half-disc fills its own fitted ellipse nicely) over the whole copy in the neighbouring
  tile.
- **REV-33 is enforced twice**: the scan never looks at a tile whose centre is outside the search area,
  *and* a candidate whose centroid lands beyond it is dropped and reported as `outside-crop` — the step
  asks for the assertion, not just the assumption.
- **Stage B writes the capped shots back only when something was actually dropped**, so a re-run never
  rewrites shots it did not change.
- **`cv:eval` is 496 lines** (was 349). It is a Node-only script, not app code.
- `tests/helpers/synthetic-target.ts` gained `shadowOpacity` (the lighting gradient), `TILE_BOUNDARY_HOLE`
  and `BACKING_BOARD_HOLES`; `tests/e2e/pipeline.spec.ts` now asserts `multiplicity === 1` and
  `shots.length <= 10` on the fake-camera precision target.

### Owner checks (not done by the agent)

1. **On the iPhone, photograph both sheets → Analyze → confirm the shot count is plausible and the
   diagram resembles the photo.** This is the milestone's own human acceptance step.
2. **Export ground truth for both reference photos** (M13 step 7 → `fixtures/reference/ground-truth/`).
   Until then alignment accuracy (REV-31) is unverified and the real-photo recall/precision numbers above
   cannot be trusted in either direction — see Open question 2.
3. **Decide Open question 1** (whether `Shot` should carry its blob area so the cap's tie-break can use
   it) and **Open question 3** (whether REV-27's second test should be `fill`/`circularity` rather than
   elongation).
4. **Decide Open question 9**: step 8 asks for `needs-attention` on an overlay-fallback alignment, but
   analysis-pipeline §4 gives `analyzed` with the `alignment-uncertain` reason shown. Either §4 gains a
   rule (a spec change that also affects M13's Adjust preview) or step 8's wording is corrected. Nothing
   was changed either way, per golden rule 2.
5. **Decide Open question 10**: the REV-33 candidate bound is `outerRadiusMm + 5` (M11's paper region),
   while step 2's prose says the crop is `outerRadiusMm + 10`. No regression either way — but the
   wording and the code differ by 5 mm.
