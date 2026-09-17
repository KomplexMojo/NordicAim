# M16: Detection accuracy and shot constraints

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M12 | high | M | generate analysis (detection quality) |

## Goal
Make a real photo produce a **plausible** shot set. Owner review of real targets against their diagrams (2026-09-16) found the
diagrams do not represent the photos: printed ring numerals are detected as shots, and blob area invents multiplicities, so a
10-round precision sheet reported 19 detections / 62 units. Three rules fix it (REV-27, REV-28): reject printed glyphs, start every
detection at **one hole**, and never report more shots than the declared rounds.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A5), §4
- `docs/spec/geometry-scoring.md` §7, §8
- `docs/milestones/M11-shot-detection.md` Steps 4–5 and Open questions 1–4

## In scope
`src/lib/cv/holes.ts` (glyph rejection, multiplicity), a pure `capShots` helper, its use in Stage A and Stage B, `cv:eval` reporting.

## Out of scope
The Adjust screen (M17), the summary image (M14), any change to ring scoring maths.

## Files
- `src/lib/cv/holes.ts`, `src/lib/cv/constants.ts` (new thresholds)
- `src/lib/scoring/cap-shots.ts` (pure) — or the nearest existing pure module; do not put it in a `*-browser.ts` file
- `src/lib/pipeline/stage-a.ts`, `stage-b.ts`
- `scripts/cv-eval.ts`
- `tests/unit/cv/holes.test.ts`, `tests/unit/scoring/cap-shots.test.ts`, `tests/unit/pipeline/stage-a.test.ts`

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
2. **Reject printed glyphs (REV-27).** M11 step 4 erases printed *circles* only, so the numerals at 12 and 6 o'clock survive and
   are detected as shots. Add a shape filter to M11 step 5, before the component is accepted:
   - `elongation = major/minor` of the fitted ellipse; reject `elongation > ELONGATION_MAX`.
   - `strokeRadius` = the maximum inscribed radius (distance transform peak) of the component; reject
     `strokeRadius < STROKE_MIN_FRACTION × (holeDiameterMm/2)`. A bullet hole is a compact blob; a printed glyph is a thin stroke.
   - Both constants live in `constants.ts`. **Measure them** on `fixtures/private/additional references/` and the two reference
     JPEGs, then record the measured separation and the chosen values in Completion notes, the way M10 did for `BLUR_THRESHOLD`.
     If no single pair of values separates glyphs from holes on real photos, stop and record it under Open questions rather than
     tuning until the reference photo passes.
3. **One hole to start (REV-28).** In M11 step 5 replace `multiplicity = cluster ? clamp(round(k), 2, 8) : 1` with
   `multiplicity = 1`, always. Keep computing `cluster` and use it only for `confidence` and for the `cluster` flag on the shot.
   Overlapping holes are therefore one shot until the owner says otherwise in Adjust — which is the point: the app never invents
   rounds the owner did not fire.
4. **Never exceed the declared rounds (REV-28).** Add pure
   `capShots(shots: Shot[], declared: number): { kept: Shot[]; dropped: Shot[] }`: when `shots.length > declared`, keep the best
   `declared` ranked by `confidence` descending, ties by larger area then by smaller radial distance, so the ranking is total and
   deterministic; everything else is `dropped`.
   - Stage A applies it after A5 **when the categorization is already complete** (declared rounds are known); otherwise it leaves
     the shots alone, because Stage A runs before metadata.
   - Stage B applies it again after metadata, so the rule always holds by the time anything is scored or drawn.
   - When anything is dropped, add the warning `extra-candidates-dropped` so the photo reports it rather than hiding it.
5. **Reason and status.** Add `extra-candidates-dropped` to `Reason` in `docs/spec/analysis-pipeline.md` §4 and to
   `reason-messages.ts` ("Some detected marks were ignored because you fired N rounds."). A capped photo is still
   `needs-attention`, since the owner should confirm which marks were kept.
6. **`cv:eval`** reports, per reference photo: detections, units, recall and precision against the fixture/ground-truth shots, and
   how many candidates the cap dropped. It exits non-zero if a reference photo yields more detections than its declared rounds.
7. **Alignment accuracy (REV-31).** The owner's example analysis showed the drawn rings shifted up-and-left and too large relative
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
8. **Say so when alignment is unverified (REV-31).** A photo whose alignment came from the overlay fallback
   (`method: 'overlay'`, warning `alignment-uncertain`) must not present as a finished score: it already reaches
   `needs-attention` via analysis-pipeline §4, so confirm that path holds once the cap and glyph filter change the shot set, and
   add a test for it rather than assuming.

## Tests
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

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste the `cv:eval` table and the measured glyph-filter values into Completion notes.
**Human (owner):** on the iPhone, photograph both sheets → Analyze → confirm the shot count is plausible and the diagram
resembles the photo.

## Pitfalls
- Don't tune the thresholds until one photo passes; they must separate glyphs from holes on the whole `additional references` set.
- `capShots` is pure: no `Date.now()`, no DOM.
- Never drop or renumber a shot whose `source` is `'manual'` (analysis-pipeline §8) — cap only `auto` shots.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
