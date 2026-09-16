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

1. **Where Retry lives is unspecified.** Step 5 ("reset the failed stage to `pending` → notify") names no file and no
   signature, and no service file is in scope. Implemented as `retryFailedStage(ctx, photoId)` in
   `src/lib/pipeline/runner-browser.ts` (the runner file the milestone does list): one transaction resets whichever
   stage is `error`, clears `pipeline.error`, recomputes the status, emits `pipeline-changed` and calls
   `pipelineHooks.notify()`. If it belongs in `services/photos.ts` instead, say so and it moves.
2. **The Stage B wiring changed shape, which changed an M10 test.** M10 left a `registerStageBHandler` registry with
   the comment "M12 registers the Stage B handler". Step 2 says the runner handles `B` jobs, so the runner now calls
   `runStageB` directly and `RunnerDeps` gained a required `renderTools`; the registry is gone (it had no other
   caller). `tests/unit/pipeline/runner.test.ts`'s "skips Stage B jobs until a handler is registered (M12)" was
   therefore replaced by a test that a `B` job actually runs, plus one for `retryFailedStage`.
3. **The milestone's literal `profile:` expression does not typecheck.** `BIATHLON_50M` is declared `as const`, so
   `{ ...BIATHLON_50M, holeDiameterMm: settings.profileOverrides.holeDiameterMm }` widens `holeDiameterMm` away from
   the literal type `analyzeTarget`'s `profile?: typeof BIATHLON_50M` demands. Implemented exactly as written plus an
   `as typeof BIATHLON_50M` assertion. geometry-scoring §10 should give the profile a named type rather than
   `typeof BIATHLON_50M` so an override is expressible.
4. **No spec states the number formats for the result *screens*.** rendering-composite §3 item 10 states them for the
   diagrams ("mm 1 dp, MOA/MRAD 2 dp, averages 1 dp; unavailable `—`"), and the screens show the same quantities, so
   `formatMm` / `formatAngular` were added to `src/lib/scoring/format.ts` (whose own header says later UI milestones
   own display) and used by `MetricsList` and the target detail. `render/text-lines.ts` keeps its private copies —
   refactoring an M05 file was out of scope.
5. **"Zoomable" (step 4) is not defined.** Implemented as a **Zoom in / Fit to width** toggle: fit-to-width by default,
   and a 1200 px-wide diagram inside a scrolling container when zoomed. No pinch-zoom gesture handling.
6. **The range line's wording is only given for precision.** Step 3's `Range: pessimistic … · averaged … · optimistic …`
   matches the precision footer (rendering-composite §3 item 10, line 4). For a sighting target the same line reports
   hits, with a trailing " hits" (`Range: pessimistic 7 · averaged 8.0 · optimistic 9 hits`).
7. **`loadDemo` races the runner, and §10 does not say so.** §10's order (ingest, then "mark stage A done via the repos
   directly") cannot be race-free: `ingestPhoto` calls `pipelineHooks.notify()`, so a real Stage A job can already have
   read the record before the manual data is written. The hook therefore writes the manual data, `await waitForIdle()`,
   writes it again, and only then calls `requestAnalysis` — so the demo never depends on how the race resolved.
8. **Two files outside the milestone's *Files* list**, both to avoid duplicating logic:
   `src/components/results/DiagramSvg.tsx` (loads a stored diagram blob and draws it inline; shared by the result card
   and the target detail) and `tests/helpers/stub-render-tools.ts` (shared by the Stage B and runner tests).
9. **Status `ready` is not in step 3's chip list.** analysis-pipeline §4 rule 4 gives a photo whose Stage B is still
   `pending` the status `ready`, which is exactly "queued on the results screen". It is rendered with the processing
   spinner ("Waiting to score…") rather than a fourth chip colour.
10. **Real precision photos are expected to land on `needs-attention`, not `analyzed`** — this is M11's open question 4
    (printed ring numerals are detected as shots: 19 detections / 62 units against ~10 rounds on
    `IMG_5132-precision.jpg`), now visible in the UI as `too-many-shots`. The e2e journey test therefore accepts either
    terminal status. This is the thing the owner check below will see first, and it feeds M13 and CV tuning.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-16. Per the orchestration overrides this
milestone was **not** committed or pushed, and its Status is left `in-progress`.

**Both Acceptance commands pass.**

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (the same 4 pre-existing warnings), **406 unit tests in 50 files** (was 381 in 48), `privacy check passed (15 images)` |
| `pnpm test:e2e` | **pass** — 24/24 (12 per project: mobile-chromium and mobile-webkit), including the 4 new `results.spec.ts` tests in both |
| `pnpm build` (not required; run as a check) | **pass** — and `dist/` contains no `__asaTest`, `sample-shots-*` or `seed-calibrations` content, so the hooks and fixtures stay out of the Pages build |

25 new unit tests: `tests/unit/pipeline/stage-b.test.ts` (11), `tests/unit/domain/status-real.test.ts` (10),
`tests/unit/scoring/format.test.ts` (+3); `tests/unit/pipeline/runner.test.ts` gained a Stage B job test and a
`retryFailedStage` test in place of the M10 handler-registry test.

### What was built

- **`src/lib/pipeline/stage-b.ts`** — `runStageB(ctx, photoId, renderTools)`: incomplete categorization leaves Stage B
  `pending`; then `stageB 'running'` → B2 `analyzeTarget` (only with a non-null calibration, with the stored
  `holeDiameterMm` override) → B4 warnings (Stage A's, plus `template-mismatch` when
  `templateHint.template !== categorization.template && confidence >= 0.5`, and a stale one is dropped) → B3 renders
  `full-svg`, `cell-svg` and rasterises `full-png` **before** the transaction → one transaction over
  `sessions/photos/analyses/blobs` writing `computed`, `stageB 'done'`, `photoStatus`, the diagram blobs (or deleting
  `diagram:<pid>:*` when there is no result) and `session.updatedAt` → emit → `summaryHooks.schedule(sessionId)`.
  Any throw is recorded as `stageB 'error'` with the message truncated to 200 chars, like Stage A.
- **`src/lib/pipeline/hooks.ts`** — `summaryHooks.schedule(sessionId)` plus `registerSummaryScheduler` (a no-op until
  M14 registers the debounced `buildComposite`).
- **`src/lib/pipeline/runner-browser.ts`** — `B` jobs run `runStageB` with `deps.renderTools`; `retryFailedStage`.
  `plan.ts` already guarantees a `B` job only exists once that photo's Stage A is `done`, so the pitfall holds without
  a second check in the runner.
- **Results screen** (`routes/results/ResultsPage.tsx`, replacing the M09 stub, which is deleted): a summary-card
  placeholder for M14, one `TargetCard` per photo **in `session.photoIds` order**, and an "Edit metadata" link.
  `TargetCard` shows the inline `cell-svg`, `targetHeadline`, `MetricsList` (group size mm · MOA · MRAD, MPI offset,
  per-position lines for `both`, and the range line when missing > 0), `StatusChip` (green / amber / red + **Retry** /
  spinner), `ReasonList` with `reasonMessage`, and **View** plus a disabled **Adjust shots**.
- **Target detail** (`routes/target/TargetPage.tsx`, route `#/sessions/:sid/photos/:pid`): the zoomable `full-svg`,
  a section per subset (plus the combined subset for `both`) with identified/missing/overcount, ES, angular size, mean
  radius, MPI and MPI offset, a ring tally table for precision or the zone outcome for sighting, the photo's own facts
  (capture time and source, lighting, notes, alignment method and confidence, warnings) and a show/hide toggle for the
  working photo.
- **Test hooks** (`lib/testing/test-hooks-browser.ts`) — `setShots`, `setCalibration` (both save as `manual`, set
  `stageB 'pending'`, recompute the status and notify) and `loadDemo()` per §10. Incoming values are validated with the
  domain zod schemas rather than trusted.

### Deviations

- The five extra items are Open questions 1, 2, 3, 4 and 8 above (Retry's home, the runner's Stage B wiring and the
  test it replaced, the `profile` cast, the two formatting helpers added to `scoring/format.ts`, and the two files
  outside the *Files* list). Nothing else departs from a stated name, number or format.
- `ResultsStubPage.tsx` is deleted (the milestone says the results screen "replaces the stub"); `M09-add-metadata.md`
  still lists it historically, with its own "replaced in M12" note.

### Owner checks (not done by the agent)

- **On the iPhone: photograph a real target → Analyze → sanity-check the scores against your own count.** Expect the
  precision sheet to report `too-many-shots` (M11 open question 4, above); the sighting sheet should be close, with
  overlapping holes merged. Note discrepancies here — they feed M13 and CV tuning.
