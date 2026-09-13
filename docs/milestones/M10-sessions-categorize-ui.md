# M10: Sessions and categorize UI

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M08, M09 | low | M | sessions-categorize, workflow-link-activity (session container) |

## Goal
Mobile-first screens to list and create sessions, see a session's targets, and edit each photo's
categorization, lighting, and sheet fields.

## Read first
- `docs/spec/data-model.md` §2, §3, §7
- `docs/spec/metadata-lighting.md` §4 (reason codes, for display)
- `docs/DESIGN.md` "Selection UX"; `docs/DESIGN-REVISIONS.md`

## In scope
`/` (redirects to `/sessions` for now), `/sessions`, `/sessions/[id]` with tabs, the photo categorize sheet,
session PATCH (name, notes, date), and photo delete.

## Out of scope
Shot editing (M11), composite (M14), harness (M17), visual polish (M18).

## Files
- `src/app/sessions/page.tsx`, `src/app/sessions/new/page.tsx` (or a dialog)
- `src/app/sessions/[sessionId]/page.tsx` with tabs **Targets** · **Composite** · **Harness** (the last two
  are placeholders that say "Coming in M14/M17")
- `src/components/sessions/SessionList.tsx`, `SessionHeader.tsx`, `PhotoGrid.tsx`, `CategorizeSheet.tsx`,
  `LightingField.tsx`, `SheetFieldsForm.tsx`
- `src/lib/client/api.ts` (typed fetch helpers, zod-validated responses)
- `tests/e2e/sessions.spec.ts`

## Steps
1. `/sessions`: list cards (name, date, target count, last updated).
   - A **quick-start** primary button per capture-overlay §1 (**Start & capture** or
     **Capture (today's session)**), implemented as `quickStart(router, now)` in `src/lib/client/quick-start.ts`:
     `GET /api/sessions` → find a session with `sessionDate === localDate(now)` (most recently updated if
     several) → otherwise `POST /api/sessions { name: 'Session <YYYY-MM-DD>', sessionDate }` →
     `router.push('/sessions/<id>/capture')`.
   - Label helper `quickStartLabel(sessions, now)` is pure and unit-tested.
   - A secondary **New session** button (name default `Session <YYYY-MM-DD>`, date default today local) opens the
     session page instead of the camera.
2. `/sessions/[id]`: header with editable name and date (inline edit) and notes (textarea, autosave with a
   debounce of 600 ms).
3. **Targets** tab: big **Capture target** button (→ M08 page), secondary **Import photos**. The grid of
   thumbnails shows a template badge, position badge, status chip, and capture time `HH:mm`.
4. Tapping a thumbnail opens `CategorizeSheet` (shadcn `Sheet`, bottom on mobile):
   - Template toggle (Sighting/Precision) with a small reference image (`/dev-fixtures/*.jpg` is fine).
   - Position toggle. Rounds inputs appear only for the relevant positions (spec: Selection UX). Changing
     template or position fills defaults via `defaultCategorization` only for rounds that are null.
   - `LightingField`: select (daylight/night/artificial/mixed) showing "Suggested: <label> (<reasons>)", and
     a **Confirm** button when not confirmed.
   - Sheet fields: athlete name, wind select, athlete condition, notes.
   - Capture time line: `Captured 2026-09-05 16:56 (-07:00) · source: client clock`.
   - Buttons: **Review shots** (→ `/sessions/[id]/photos/[pid]/review`, disabled until categorization is
     complete; the page arrives in M11), **Delete photo** (confirm dialog).
   - Autosave each change via PATCH; show a saved indicator.
5. Remove the placeholder page from M08 if you created one; keep the Capture button.

## Tests
Unit: `quickStartLabel` → `Start & capture` with no sessions or only older dates; `Capture (today's session)`
when one has today's `sessionDate`.

E2E (logged in, Pixel 7 project):
0. Quick start: with an empty workspace, tap **Start & capture** → URL is `/sessions/<id>/capture` → go back to
   `/sessions` → the button now reads **Capture (today's session)** and tapping it opens the same session id
   (no second session created).
1. Create session → import `docs/reference/IMG_5132-precision.jpg` → open the sheet → choose Precision +
   Both → rounds 5/5 prefilled → change standing to 3 → reload → values persist.
2. Lighting: select `artificial` → `lightingConfirmed` true via API.
3. Capture flow from M08 still passes (the prefilled template shows in the sheet).
4. Delete photo → the grid is empty and the files are gone (API 404).

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Rounds must be integers 1–50; keep the input `inputMode="numeric"`.
- Don't block the UI on autosave; show errors via toast.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
