# M09: Add metadata screen, quick start, sessions

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M07, M08 | low | M | **2. add metadata** · incorporate user metadata (inputs) |

## Goal
Step 2 of the MVP: after capturing, the owner confirms template, position, rounds, lighting, and optional notes for each
photo, then taps **Analyze**. The milestone also delivers the home screen with quick start and the sessions list.

## Read first
- `docs/spec/analysis-pipeline.md` §1 (routes, step 2), §4 (status), §5 (triggers, re-analysis)
- `docs/spec/data-model.md` §2, §3, §7
- `docs/spec/capture-overlay.md` §1 (quick start)
- `docs/spec/metadata-lighting.md` §4 (suggestion shown)
- `docs/DESIGN.md` "Selection UX"

## In scope
Home, sessions list, session redirect, metadata screen, `updatePhotoMetadata`, `deletePhoto`, `requestAnalysis`, quick start,
data-change events, and a results stub route.

## Out of scope
The pipeline runner (M10), results (M12), styling polish (M15).

## Files
- `src/routes/home/HomePage.tsx`, `src/routes/sessions/SessionsPage.tsx`, `SessionRedirect.tsx`
- `src/routes/metadata/MetadataPage.tsx` (replaces M07's stub)
- `src/components/metadata/PhotoMetadataCard.tsx`, `TemplatePositionFields.tsx`, `RoundsFields.tsx`, `LightingField.tsx`, `StageAProgress.tsx`
- `src/components/sessions/QuickStartButton.tsx`, `SessionList.tsx`
- `src/lib/services/photos.ts` (`updatePhotoMetadata`, `deletePhoto`, `requestAnalysis`), `src/lib/services/quick-start.ts`
- `src/lib/pipeline/events.ts` (`emitPipelineChanged({ sessionId, photoId? })`, `onPipelineChanged(cb) → unsubscribe`)
- `src/lib/app/use-live-query.ts` (re-reads on `pipeline-changed`)
- `src/routes/results/ResultsStubPage.tsx` (route `/sessions/:sid/results`; replaced in M12)
- `tests/unit/services/photos.test.ts`, `quick-start.test.ts`, `tests/e2e/metadata.spec.ts`

## Steps
1. `quickStartLabel` and `quickStart` per capture-overlay §1.
2. **Home** `#/`: title, `QuickStartButton`, the 5 most recent sessions (name, date, target count), a link to all sessions,
   and the line "Results are stored only on this phone."
3. **Sessions** `#/sessions`: the full list. **SessionRedirect** `#/sessions/:sid` per analysis-pipeline §1.
4. **Metadata screen** per analysis-pipeline §1 step 2:
   - session name and notes (save debounced 600 ms via `updateSession`)
   - one card per photo:
     - thumbnail via object URL, revoked on unmount
     - `StageAProgress` from `pipeline.stageA`, with alignment/detection wording once M10/M11 exist (until then "Waiting…")
     - Template and Position toggles
     - Rounds fields (only relevant positions; defaults fill null rounds only)
     - Lighting select prefilled with `Suggested from photo: <label>`
     - Notes
     - **Remove photo** (confirm)
   - **Add more photos** → capture
   - **Analyze N targets**: disabled until all categorizations are complete, with a hint listing what's missing.
5. `updatePhotoMetadata(ctx, photoId, patch)`: validate; if `session.analyzeRequestedAt !== null` and categorization or lighting
   changed, set `pipeline.stageB = 'pending'`; recompute status with `photoStatus({ categorization, analysis, result: analysis.computed?.result ?? null })`;
   one transaction; then `emitPipelineChanged` and `pipelineHooks.notify()`.
6. `deletePhoto`: cascade blobs and the analysis, remove from `photoIds`, emit, notify.
7. `requestAnalysis(ctx, sessionId)`: set `analyzeRequestedAt = now`; for each photo set `lightingConfirmed = true`, and if
   `stageB === 'done'` set it to `pending`; recompute statuses; one transaction; emit; notify. The UI then navigates to `#/sessions/:sid/results`.
8. `ResultsStubPage`: "Analysis will appear here" plus each photo's status.

## Tests
- Unit:
  - `quickStartLabel` / `quickStart` (creates once, then reuses)
  - `updatePhotoMetadata` (status `needs-metadata` → `processing` while stageA pending; stageB reset only after analyze requested)
  - `deletePhoto` cascade
  - `requestAnalysis` sets fields and confirms lighting.
- E2E (both projects):
  1. `#/` → **Start & capture** → capture precision (fake camera) → Done → metadata screen shows 1 card with Precision/Prone/10 prefilled
  2. change position to Both → rounds 5/5 appear → set standing 3 → reload → persisted
  3. import a second photo with no template → **Analyze** disabled → choose Sighting → enabled
  4. Analyze → URL `#/sessions/<id>/results`
  5. back to `#/` → button reads **Capture (today's session)**.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Revoke thumbnail object URLs.
- Rounds inputs: integers 1–50, `inputMode="numeric"`.
- Never set `photo.status` directly from UI code; services compute it.

## Open questions

- **Rounds fields on a position change.** Step 4's bullet says "defaults fill null rounds only", but the M09 e2e
  vector #2 (Precision/Prone/10 → switch to Both → "rounds 5/5 appear") requires the *already-set* `roundsProne=10`
  to become `5`, not stay `10`. A strict "only fill null fields" rule can't produce that. Implemented: changing
  **Position** (with a template already chosen) re-derives *both* rounds fields from `defaultCategorization(template,
  position)` unconditionally (discarding a prior explicit edit too); changing **Template** alone never touches
  rounds. Directly editing a Rounds input never triggers this. Non-blocking — later milestones don't depend on the
  distinction — but flagging the tension in case the intended rule was different (e.g. "keep a user's explicit rounds
  edit and only backfill the newly-relevant field").
- **Vector #3's exact interaction ("choose Sighting → enabled") isn't reachable as written.** `Categorization`
  requires both `template` and `position` (`isCategorizationComplete`), so selecting only a template can't complete
  it — and `CaptureFallbacks`' import categorization is the capture screen's own remembered per-session prefs
  (capture-overlay §1.2), which are already Precision/Prone once a first photo has been captured in that session, so
  a same-session second import doesn't start out "with no template" either. `tests/e2e/metadata.spec.ts` covers the
  spirit of the vector instead (Analyze disabled while categorization is incomplete → enabled once template *and*
  position are both picked), using a photo imported before anything is picked in a fresh session. Non-blocking.
- **`useLiveQuery`'s `loading` flag and `PipelineChangedDetail`'s exact re-read granularity** aren't specified beyond
  "re-reads on pipeline-changed" — implemented as: every `pipeline-changed` event triggers a full re-run of the
  screen's `query()`, regardless of whether the event's `sessionId`/`photoId` matches what the screen is showing.
  Fine at today's data volumes (M10's runner will be the main emitter); worth narrowing later if a screen's query
  becomes expensive.

## Completion notes

- **Commands run** (none commit/push per orchestration overrides):
  - `pnpm typecheck` — pass
  - `pnpm lint` — pass (4 pre-existing warnings in `src/components/ui/*` and `src/lib/cv/opencv.ts`, unrelated to
    this milestone; 0 errors)
  - `pnpm test` — 322/322 pass (39 files), including new `tests/unit/services/photos.test.ts` (10 tests) and
    `tests/unit/services/quick-start.test.ts` (4 tests)
  - `pnpm check:privacy` — pass (15 images)
  - `pnpm check` — pass (all of the above)
  - `pnpm test:e2e` — 14/14 pass (both projects), run three times to confirm stability. One run at the default
    6-worker concurrency (12 logical CPUs here) hit transient `Start & capture` button timeouts on a cold dev-server
    start; two subsequent runs of the identical command, and runs at `--workers=2`/`--workers=4`, were all
    14/14 green. This is a local machine/timing characteristic of running fake-camera + IndexedDB e2e tests at high
    parallelism, not a functional defect — CI already retries (`retries: 2`) and reuses a warm server run-to-run.
  - `pnpm build` — pass (production build succeeds; only pre-existing chunk-size warnings)
- **Deviations / notable decisions**:
  - `tests/e2e/capture.spec.ts`'s `createSessionViaHome` helper was updated from clicking the removed "New session"
    button to the new quick-start button ("Start & capture" on a fresh session) — required because M09 replaces
    HomePage's placeholder button with `QuickStartButton`.
  - `MetadataStubPage.tsx` was deleted (replaced by `MetadataPage.tsx`, as directed by the milestone).
  - See *Open questions* above for the rounds-defaults and vector-#3 interpretation calls.
- **Owner/device checks**: none required — M09 has no owner gate and nothing here needs a physical device beyond
  the general iPhone smoke-test already covered by later gated milestones (M15).
