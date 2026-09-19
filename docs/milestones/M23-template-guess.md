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
_(add here)_

## Completion notes
_(fill in when done)_
