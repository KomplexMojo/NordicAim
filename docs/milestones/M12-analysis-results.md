# M12: Analysis generation and results screen

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M05, M09, M11 | medium | L | incorporate user metadata · generate analysis (**scoring**) · **3. receive analysis** |

## Goal
Stage B runs after **Analyze**: it combines the user's metadata with the detected shots, **scores** each target, renders diagrams,
and sets the status and reasons. The results screen then shows the analysis for every target. The optional Adjust (M13) and the
summary image (M14) plug into this screen.

## Read first
- `docs/spec/analysis-pipeline.md` §1 (step 3), §2 (Stage B), §4, §5, §10
- `docs/spec/geometry-scoring.md` §10 (`analyzeTarget`)
- `docs/spec/rendering-composite.md` §3, §4 (diagrams, `targetHeadline`)
- `docs/spec/data-model.md` §4, §6

## In scope
`stage-b.ts`, runner B jobs, `summaryHooks` stub, results and target-detail screens, status chip and reasons, the remaining test hooks
(`setShots`, `setCalibration`, `loadDemo`).

## Out of scope
Adjust UI (M13), summary image (M14).

## Files
- `src/lib/pipeline/stage-b.ts`; update `runner-browser.ts` (B jobs), `hooks.ts` (`summaryHooks.schedule(sessionId)` no-op)
- `src/routes/results/ResultsPage.tsx` (replaces the stub), `src/routes/target/TargetPage.tsx`
- `src/components/results/TargetCard.tsx`, `StatusChip.tsx`, `ReasonList.tsx`, `MetricsList.tsx`, `ProcessingState.tsx`
- `src/lib/testing/test-hooks-browser.ts` (extend)
- `tests/unit/pipeline/stage-b.test.ts`, `tests/unit/domain/status-real.test.ts`, `tests/e2e/results.spec.ts`

## Steps
1. `runStageB(ctx, photoId, renderTools)`:
   1. read the photo and analysis; categorization must be complete (else leave `pending`)
   2. set `stageB 'running'`
   3. **B2 scoring**: `result = analyzeTarget({ template, categorization, shots, profile: { ...BIATHLON_50M, holeDiameterMm: settings.profileOverrides.holeDiameterMm } })`, only if calibration is non-null; else `result = null`
   4. B4 warnings: keep the stage A warnings; add `template-mismatch` per §2
   5. B3: if `result`, render `full-svg`, `cell-svg`, and rasterise `full-png` (before the transaction); if not, delete existing diagram keys
   6. one transaction: `computed = result ? { engineVersion, result } : null`, `stageB 'done'`, status and reasons via `photoStatus`, diagram blobs, `session.updatedAt`
   7. emit; `summaryHooks.schedule(sessionId)`.
   On a throw: `stageB 'error'`.
2. Runner: handle `B` jobs from `planJobs`.
3. **Results screen** per analysis-pipeline §1 step 3:
   - a placeholder for the summary card (filled by M14)
   - target cards in capture order:
     - `cell-svg` inline
     - `targetHeadline`
     - `MetricsList`: group size `mm · MOA · MRAD`, MPI offset, and for `both` per-position lines
     - the range line `Range: pessimistic … · averaged … · optimistic …` when missing > 0
     - `StatusChip` (`analyzed` green, `needs-attention` amber, `failed` red with **Retry**, `processing` spinner with stage wording)
     - `ReasonList` with `reasonMessage`
     - buttons **View** and **Adjust shots** (disabled until M13)
   - a link "Edit metadata" back to step 2.
4. **Target detail** `#/sessions/:sid/photos/:pid`: the `full-svg` (zoomable), every metric from `AnalysisResult` (tally table for
   precision; zone table for sighting; subsets for `both`), photo metadata (capture time and source, lighting, notes, alignment method,
   warnings), and a toggle to show the working photo.
5. Retry: reset the failed stage to `pending` → notify.
6. Test hooks: `setShots`, `setCalibration` (both `manual`; set stageB pending; notify), and `loadDemo()` per analysis-pipeline §10
   (it ingests `demo/*.jpg` with categorizations from the fixtures, sets calibration and shots as manual, and marks stage A done via
   the repos directly).

## Tests
- Unit `stage-b.test.ts` (fake-indexeddb, stub render tools):
  - precision golden fixture with manual calibration → **`analyzed`, `computed.result.all.precision.identifiedTotal === 72`, xCount 1**, diagram keys exist
  - sighting golden (prone) → `analyzed`, sighting hits 9, misses 1
  - P8 multiplicity 1 → `analyzed`, reasons `[rounds-unaccounted]`, range 71/76/73.3
  - calibration null → `needs-attention [target-not-found]`, no diagram keys
  - shots empty → `needs-attention [no-shots-found]`
  - an 11th shot → `needs-attention [too-many-shots]`
  - `templateHint` sighting with confidence 0.8 on a precision photo → reason `template-mismatch`
  - render throws → `stageB 'error'`.
- Unit `status-real.test.ts`: the analysis-pipeline §4 vectors computed with real `analyzeTarget` output.
- E2E (both projects):
  1. `__asaTest.loadDemo()` → `waitForIdle` → results show `72 / 100 · X 1` and `9/10 hits @ 45 mm`, both **Analyzed**
  2. View precision → the tally shows `8` ×2 and `6` ×3
  3. metadata: change precision roundsProne to 12 → back to results → `waitForIdle` → the reason text contains `2 round(s) not found` and the headline shows a range
  4. full journey: Start & capture (fake precision) → Done → Analyze → the results card reaches a terminal status (`analyzed` or `needs-attention`) without asserting scores.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human (owner):** on the iPhone, photograph a real target → Analyze → sanity-check the scores against your own count. Note
discrepancies in Completion notes; they feed M13 and CV tuning.

## Pitfalls
- Rasterise before the transaction.
- Only services set `status`.
- Make sure the runner's B jobs never start before stage A is `done`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
