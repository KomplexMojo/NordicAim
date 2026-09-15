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
_(add here)_

## Completion notes
_(fill in when done)_
