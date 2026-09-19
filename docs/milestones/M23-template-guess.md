# M23: Template guess — stop calling sighting sheets precision

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16 | high | S | review image · generate analysis |

## Goal
From the issue sweep ([#5](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/5)). `hintTemplate` (A3's template guess,
`src/lib/cv/template-hint.ts`) classifies **sighting** sheets as **precision**. That picks the wrong template for scoring **and** the
wrong anchor diameter (112.4 mm instead of 115 mm), so it affects live analyses, not just labels. First recorded as M10 open
question 3, noted again in M16 and M18, never fixed.

Known cases in the owner's private sample set: `IMG_5057 2.jpeg` (corrected by hand in the v2 labels) and `IMG_4743.jpeg` (still
labelled precision) — both the Caledonia Nordic sighting sheet. M10 found all three sighting sheets in its original sample misread.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A3), §4 (`template-mismatch`)
- `docs/spec/geometry-scoring.md` §1.2, §1.3 (what distinguishes the two sheets)
- `docs/milestones/M10-target-alignment.md` open question 3
- Issue #5

## In scope
Measuring `hintTemplate` over the private sample set, fixing it, correcting mislabelled entries in the private labels, and
confirming the user's own template choice overrides the guess everywhere.

## Out of scope
Detection thresholds (M16, M19), alignment (M18), any UI beyond what the override check needs.

## Files
- `src/lib/cv/template-hint.ts`, `src/lib/cv/constants.ts`
- `scripts/cv-eval.ts` (report the confusion matrix)
- `tests/unit/cv/template-hint.test.ts`
- `fixtures/private/review/ground-truth-holes-v2.json` (gitignored; correct labels there, never commit it)

## Steps
1. **Measure first.** Add to `pnpm cv:eval` a confusion matrix of `hintTemplate` against the true sheet type over every photo in
   `fixtures/private/additional references/` that has a target (skip loudly when the folder is absent, as in CI). The owner's
   labels record `template`, but those came from this same guess — **establish the true type from the sheet itself** (below) and
   list any photo where the label and the truth differ.
2. **Fix with a signal that separates the sheets** (geometry-scoring §1.2–§1.3). The precision sheet has **nine evenly spaced
   rings, 8 mm apart in radius, with printed numerals** on the black; the sighting sheet has **no scoring rings on the black** — only
   dashed guides at 110 and 40 mm, a solid 45 mm circle and a small inner circle. A radial profile of ring-line responses across the
   black disc separates them: many evenly spaced lines versus a few at fixed radii. Measure the chosen statistic on both sets and
   set the threshold from the gap; record the numbers next to the constant.
3. **Correct the private labels**: every entry whose `template` differs from the truth, with its `anchorDiameterMm`
   (115 sighting, 112.4 precision) and a `templateCorrected` note, as was done for `IMG_5057_2`. Re-run `pnpm cv:eval` and report how
   the per-template numbers move. The gate (recall ≥ 0.72, precision ≥ 0.85) must still pass.
4. **The user's choice wins.** Confirm that a template set on the metadata screen overrides the guess for scoring, the anchor size
   and detection (`shotTemplate`), and add a test if one is missing.

## Tests
- `hintTemplate` on the committed reference JPEGs: `IMG_5057-sighting.jpg` → sighting, `IMG_5132-precision.jpg` → precision.
- A synthetic sighting sheet (dashed 110/40 mm guides, 45 mm circle, no rings) → sighting; a synthetic precision sheet → precision.
- The user's categorization overrides the hint in `shotTemplate`.

## Acceptance
```bash
pnpm check
pnpm cv:eval   # prints the confusion matrix; zero sighting sheets called precision on the private set; gate passes
```

## Pitfalls
- The labels' `template` field is contaminated by this very bug — do not measure the fix against it.
- Never commit anything from `fixtures/private/`.

## Open questions
1. **The user's template does not reach the anchor size or A5 when it is chosen after Stage A (step 4).** Scoring always uses
   `categorization.template` (Stage B), and A5's `shotTemplate` puts the user's template first — both now pinned by tests. But
   (a) the worker's `reviewAndAlign` receives only `capture.overlayTemplate` (analysis-pipeline §6), so on an import the anchor
   size (`calibration.anchorDiameterMm`, 115 vs 112.4 mm = a 2.3% mm scale) comes from the hint even if a template is already
   set; and (b) a template changed on the metadata screen after Stage A only resets `stageB` (§5 *Re-analysis*), so the
   calibration's anchor size and the `auto` shots A5 detected with the hint's template (mm positions and the printed circles it
   erased) stay as Stage A left them, and are scored under the user's template. Captures are unaffected (the overlay template is the
   user's). With the hint fixed this only bites when the hint is wrong. A fix needs a spec decision: e.g. when
   `categorization.template` changes and no calibration is `manual`, set `stageA = 'pending'` (A4/A5 re-run, manual shots still
   protected by §8), and pass `categorization.template ?? capture.overlayTemplate` to `reviewAndAlign`. Not implemented: it
   changes §5/§6 triggers. Non-blocking for M15, but the owner should decide before the release.
2. `docs/spec/backing-sheet.md` §4 ("Known issue found on the way": the three backed sighting sheets read as precision) and
   M10 Open question 3 describe the bug this milestone fixes; neither is in this milestone's Files list, so both are left as they
   are. The backed sheets IMG_5194/5196/5198 now hint `sighting` (ringPeriodicity 0.181-0.258; the backed precision sheets
   0.648-0.676).

## Completion notes
**Implemented (2026-09-19).**
- **Measured first.** `scripts/cv-eval-template.ts` (called by `pnpm cv:eval`) prints the hint's confusion matrix against the
  **true** sheet type, per photo with its label, hint, confidence and `ringPeriodicity`, lists labels that differ from the truth,
  and fails the run on any confusion. The truth (`SHEET_TRUTH`, 41 photos with a target; the other five show no target) was read
  off every sheet from a crop, not from the labels. The two committed reference JPEGs always run; the private set is skipped
  loudly when absent. Before the fix (M10's transition count on A4's own disc): **5 of 19 sighting sheets called precision**
  (IMG_4743, IMG_4770, IMG_4771, IMG_5057 2, and the committed IMG_5057-sighting.jpg, all on the median-4 tie at confidence
  0.00); every precision sheet right; IMG_4447 has no disc. Every other sighting sheet was right at confidence 0.13-0.50 only.
  Labels that differed from the sheet: IMG_4743, IMG_4770, IMG_4771 (IMG_5057 2 was already corrected).
- **Fix** (`src/lib/cv/template-hint.ts`): `ringPeriodicity(cv, img, cal)` walks 32 rays from 0.1 R to 0.9 R (400 samples per R),
  takes each ray's ring-line response (|gray − running median over ±0.03 R|, Gaussian-smoothed at σ 0.02 R), and returns the
  largest share of its DFT power, averaged over rays, in any period band [c/1.15, c·1.15] for c = 0.08-0.30 R. Evenly spaced
  precision rings (8 mm = 0.142 R) concentrate power in one band; the sighting sheet's few circles do not. The band search is
  scale-free so a mis-measured disc still works (IMG_4745's A4 disc sits on ring 6; a prior 40% large). `hintTemplate`:
  `>= TEMPLATE_PERIODICITY_THRESHOLD` (0.40) → precision, else sighting; confidence `clamp(|p − 0.40| / 0.15, 0, 1)`; no usable
  ray → precision at confidence 0 (as M10's tie). Constants and measurements are in `src/lib/cv/constants.ts`.
- **Measured statistic** (on A4's own disc): sighting 0.198-0.296 (19 sheets), precision 0.495-0.734 (23 sheets). With the disc
  radius ×0.85 or ×1.2: 0.186-0.285 / 0.534-0.741. Synthetic sheets, radius ×0.7-1.4: sighting 0.246-0.332, precision 0.653-0.838.
  The backed photos in `fixtures/private/backing/`: sighting 0.181-0.258, precision 0.648-0.676, all right. Sharp synthetic
  lines are why the smoothing exists: without it the synthetic precision sheet read 0.13-0.16 against the photos' gap of
  0.094-0.197, i.e. on the sighting side of its midpoint; at σ 0.01 the synthetic sighting sheet came within 0.1 of the photos' precision sheets.
  Cost: ~18 ms per hint in Node.
- **Labels corrected** in the gitignored `fixtures/private/review/ground-truth-holes-v2.json` (never committed): IMG_4743,
  IMG_4770, IMG_4771 → `template: 'sighting'`, `calibrationUsed.anchorDiameterMm` 115, hole mm rescaled by 115/112.4 (px
  unchanged — matching is in px), and a `templateCorrected` note.
- **User's choice**: scoring (Stage B) and A5's `shotTemplate` use `categorization.template` first — tests added. The anchor size
  does not follow a template chosen after Stage A: Open question 1.

**Commands run**
- `pnpm check` — pass (typecheck; lint with the 4 pre-existing warnings only; 77 files / 789 unit tests; privacy check).
- `pnpm cv:eval` — pass. Template hint: sighting 19 → 19 sighting / 0 precision; precision 23 → 23 precision / 0 sighting;
  1 no disc (IMG_4447). "Labels whose `template` differs from the sheet: none." Gate (template hint) pass.
  Detection gate on the labelled holes, before → after (fix + label correction):
  | set | before | after |
  |---|---|---|
  | gated · all (35) | 237/18/82, recall 74.3%, precision 92.9% | 245/18/74, recall **76.8%**, precision **93.2%** |
  | gated · precision | 22 photos, 72.8% / 90.1% | 19 photos, 74.3% / 88.9% (same photos minus the three mislabelled) |
  | gated · sighting | 13 photos, 77.4% / 98.8% | 16 photos, 80.1% / 99.1% |
  | pre-M18 A4 (no tilt) | 76.2% / 93.8% | 75.9% / 93.4% |
  Per photo, now read as sighting: IMG_4743 8 → 9 of 10, IMG_4770 4 → 8 of 10, IMG_4771 7 → 8 of 10, IMG_5057 2 4 → 6 of 7 TP;
  no photo lost a hole. M21 suggestions: accepting every real one now reaches 85.0% (was 83.7%). M18's alignment report improved
  (median centre-ring error, projective 0.150 → 0.140 mm). IMG_5057-sighting.jpg's UNVERIFIED fixture-shots mean error
  2.15 → 2.50 mm (its disc is now measured at 115 mm; ungated, the fixture was never measured off this JPEG).
- `pnpm test:e2e` (not an Acceptance command) — 67/68; `settings.spec.ts:105` "hole size … Reset returns 5.6" fails on
  mobile-chromium **with and without this change** (checked on a stash of the clean tree), so it is pre-existing (M22).

**Tests added/changed**
- `tests/unit/cv/template-hint.test.ts`: synthetic precision (with and without numerals) → precision at confidence ≥ 0.5;
  synthetic sighting (dashed 110/40 mm guides, 45 mm circle, no rings) → sighting; precision with the disc radius 40% large →
  precision; no ray in the image → null / precision at 0; `IMG_5057-sighting.jpg` → sighting and `IMG_5132-precision.jpg` →
  precision, on the seed calibration (confidence ≥ 0.5) and on A4's own import-path disc, whose anchor size is then 115 / 112.4.
  `medianOf` (only used by the old algorithm) and its test removed.
- `tests/unit/pipeline/stage-a.test.ts`: `shotTemplate` precedence (user's categorization over overlay, confident hint and
  anchor size; then overlay, hint, anchor size), and A5 detecting with the user's `sighting` despite a confident `precision` hint.
- `tests/unit/pipeline/stage-b.test.ts`: a confident `sighting` hint does not change precision scoring (§9.1, 72).
- `tests/unit/cv/backing-colour.test.ts` (private-fixture test): IMG_4743 was pinned to values measured under the wrong
  (precision) template. Read as sighting it has no coloured spot at all (0 spots, max chroma 45), so it moved from the
  chroma-floor table to the spot-count test; the comment says why.

**Deviations / reviewer notes**
- M10 step 5's algorithm (16 rays, transition count, median ≥ 5 / ≤ 3, `|median − 4| / 4`) is replaced; analysis-pipeline §2 A3
  names only "template hint" and B4's 0.5 confidence bar, which is kept. Confidence is now high on most photos (1.00 on 36 of
  42), so `template-mismatch` will fire whenever a user picks the other template on a clear photo — that is §2 B4's intent.
- The synthetic sighting sheet hints sighting at confidence 0.46 (its sharp 0.35 mm dashed guides read more periodic than any
  photo); its test asserts only confidence > 0.
- `scripts/cv-eval-template.ts` is a new helper beside the other `cv-eval-*.ts` modules; `SHEET_TRUTH` names private photo
  files (as other committed code already does), no image or label content.
