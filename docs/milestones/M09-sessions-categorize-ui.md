# M09: Sessions, quick start, categorize UI

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M07, M08 | low | M | sessions-categorize, workflow-link-activity (session container) |

## Goal
Mobile-first screens to start capturing in one tap, list and create sessions, see a session's targets, and edit each
photo's categorization, lighting, and sheet fields.

## Read first
- `docs/spec/data-model.md` §2, §3, §7
- `docs/spec/capture-overlay.md` §1 (quick start)
- `docs/spec/metadata-lighting.md` §4 (reason codes)
- `docs/DESIGN.md` "Selection UX"; `docs/DESIGN-REVISIONS.md` REV-8

## In scope
`#/sessions`, `#/sessions/:sessionId` (tabs), quick start, `CategorizeSheet`, `updatePhotoFields`, `deletePhoto`.

## Out of scope
Shot editing (M10), composite (M13), harness (M17), polish (M18).

## Files
- `src/routes/sessions/SessionsPage.tsx`, `SessionPage.tsx` (tabs **Targets** · **Composite** · **Harness**; the last two
  are placeholders until M13/M17). Replace M07's stub.
- `src/components/sessions/SessionList.tsx`, `SessionHeader.tsx`, `PhotoGrid.tsx`, `CategorizeSheet.tsx`, `LightingField.tsx`,
  `SheetFieldsForm.tsx`, `QuickStartButton.tsx`
- `src/lib/services/quick-start.ts` (`quickStart`, `quickStartLabel`), `src/lib/services/photos.ts` (`updatePhotoFields`, `deletePhoto`)
- `src/lib/app/use-live-query.ts` (a small hook that re-reads from IndexedDB after mutations, using an in-app event emitter)
- `tests/unit/services/quick-start.test.ts`, `tests/unit/services/photos.test.ts`, `tests/e2e/sessions.spec.ts`

## Steps
1. `quickStartLabel(sessions, now)` (pure): `Capture (today's session)` if any session has `sessionDate === localDate(now)`,
   else `Start & capture`.
2. `quickStart(ctx, navigate)`: find today's session (most recently updated if several) or create
   `Session <YYYY-MM-DD>` → `navigate('/sessions/<id>/capture')`.
3. `/sessions`: `QuickStartButton` (primary), a secondary **New session** (opens the session page), and cards
   (name, date, target count, last updated).
4. Session page header: inline-edit name/date and a notes textarea (debounced save 600 ms via `updateSession`).
5. **Targets** tab: **Capture target** (→ capture route) and **Import photos** (reuse `CaptureFallbacks` import).
   The grid shows thumbnails (from the `photo:<pid>:thumb` blob via object URLs, revoked on unmount), template and
   position badges, a status chip, and capture time `HH:mm`.
6. `CategorizeSheet` (bottom `Sheet`):
   - template and position toggles; rounds inputs only for relevant positions; fill defaults only for null rounds
   - `LightingField` ("Suggested: <label> (<reasons>)", select, **Confirm**)
   - sheet fields
   - capture line `Captured 2026-09-05 16:56 (-07:00) · source: client clock`
   - **Review shots** (→ `#/sessions/:sid/photos/:pid/review`, disabled until categorization is complete; the page arrives in M10)
   - **Delete photo** (confirm).
   - Autosave each change.
7. `updatePhotoFields(ctx, photoId, patch)`: validate, set `lightingConfirmed = true` when lighting is set, recompute
   status with `nextStatus(categorization, analysis, analysis?.computed?.result ?? null)` (M10 replaces this with
   `refreshStatus`), and set `lastChangeAt`, all in one transaction.
8. `deletePhoto`: cascade blobs and the analysis, remove from `session.photoIds`.

## Tests
- Unit: `quickStartLabel` (no sessions / older / today); `quickStart` creates once and then reuses; `updatePhotoFields`
  status changes (complete categorization + existing calibration → `calibrated`); `deletePhoto` cascade.
- E2E (both projects):
  1. empty app → **Start & capture** → URL `#/sessions/<id>/capture` → back → the button reads
     **Capture (today's session)** → tap → same id
  2. import `docs/reference/IMG_5132-precision.jpg` → sheet → Precision + Both → rounds 5/5 → change standing to 3 →
     reload → persisted
  3. lighting `artificial` → confirmed
  4. delete photo → grid empty.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Revoke object URLs for thumbnails to avoid memory growth on the phone.
- Rounds inputs: integers 1–50, `inputMode="numeric"`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
