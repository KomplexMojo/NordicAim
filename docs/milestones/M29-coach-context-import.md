# M29: Pull shooting context from 545 Coach (attach-to-session)

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M14, M22 | high | L | post-MVP — receive analysis (coach context) |

**Post-MVP.** Backlog B15 (`docs/BACKLOG.md`). Exists as a full milestone file, not a backlog bullet, because the
spec behind it (`docs/spec/coach-context-import.md`) was validated against a real 545 Coach export and fully walked
through with the owner (2026-10-05) — the same standard M26 set for a milestone with real evidence behind it.

## Goal
Let the owner attach a 545 Coach export (sight/zero-click history, session wind, metal-bout hit/miss — the three
record types NordicAim's own pipeline can't capture or derive itself) to one specific NordicAim session, and show
that context on the session's shooting-analysis composite image: windage next to the season/lighting icons in the
header, and iconic hit/miss discs for each metal bout. One direction only (545 Coach → NordicAim), file-based, no
runtime network call — `AGENTS.md`'s no-network invariant is unchanged.

## Read first
- `docs/spec/coach-context-import.md` — the spec for this milestone, all sections. §4 is the import file shape
  (confirmed against a real export), §5 the attach/preview/add/remove flow, §6 what renders on the composite, §7
  what's still open (read before writing any code that touches those items).
- `docs/spec/rendering-composite.md` §Header (season/lighting badges, x 1010/1064, y 38) and the band layout
  (`composite-band.ts`) — where the windage badge and metal-icon rows attach; §5's build-before-transaction and
  sha256 pattern applies to any new composite inputs too.
- `docs/spec/data-model.md` §6 (IndexedDB schema) — where the new store is documented.
- `docs/spec/backup.md` §2 (what a backup covers today) — context for the open question on whether `coachContext`
  joins it (not decided; not in this milestone's scope).
- `AGENTS.md` hard invariants: IndexedDB transaction prep ordering, never overwrite a `source: 'manual'` edit, pure/
  adapter split (`src/lib/domain`, `src/lib/render` stay DOM-free; `*-browser.ts`/components do the file I/O).
- `src/lib/store/db.ts` — the cascading `if (oldVersion < N)` upgrade pattern this milestone extends to version 5.
- `src/lib/backup/restore.ts`, `src/components/settings/RestorePreview.tsx` — the closest existing precedent for
  "pick a file → validate → preview what will be written → confirm," which §5's attach flow mirrors.
- `src/lib/render/condition-icons.ts`, `src/lib/render/composite-band.ts`, `src/lib/composite/build.ts` — what the
  surfacing step extends.

## In scope
- `src/lib/domain/coach-context.ts`: zod schemas for `CoachContextFile`/`MetalContext`/`ZeroAdjustment`/
  `WindContext`/`conventions` (spec §4), and the persisted per-session record shape (adds a derived fingerprint per
  record, spec §5 step 6).
- `db.ts` version 5: new `coachContext` object store, keyed by NordicAim `sessionId`.
- A service that validates a picked file (named refusal, nothing written on failure — spec §5 step 3), matches its
  records to one session by date (`MetalContext`/`WindContext` by `sessionDate`, `ZeroAdjustment` by converting `at`
  to the device's local date), and computes each record's fingerprint.
- **Attach** action beside each session (main Sessions/Home screen) → file picker → **preview screen** (graphic
  rendering of the matched records, mirroring §6's composite representations) → **Add**/**Cancel** (spec §5 steps
  1, 2, 5).
- **On Add** (spec §5 step 6): cross-session duplicate check by fingerprint — collision with a **different**
  session refuses the whole Add with a named error, nothing written. Re-attaching to the **same** session is a full
  delete of its existing `coachContext` entry followed by a full write of the new Add — never a merge.
- **Remove** action per session (spec §5 step 7): deletes that session's `coachContext` entry outright.
- Surfacing on the shooting-analysis composite (spec §6): a windage badge next to the season/lighting icons in the
  header, and one row of five hit/miss discs per attached metal bout (grouped by `comboGroup` then position) in the
  session-analysis band. A session with no attached coach context renders exactly as it does today.
- `docs/spec/data-model.md` §6 and `docs/spec/rendering-composite.md` updated with the new store and the new header/
  band elements (new REV number, assigned while implementing).

## Out of scope
- Everything `docs/spec/coach-context-import.md` §3 already excludes: any runtime network call to 545 Coach,
  NordicAim computing its own metal hit-rate trends, importing 545 Coach's precision bout/photo/roster data, account
  linking or shared identity.
- Splitting one 545 Coach day-file across two NordicAim sessions shot on the same calendar date. The duplicate
  check in this milestone refuses the second session's Add outright; there is no deselect-before-Add workaround
  yet (spec §7 — explicit follow-up, not solved here).
- Surfacing `targetZone` or `race` anywhere in the UI. Both are stored (schemas carry them, `race` confirmed by the
  545 Coach developer as `null | 'sprint' | 'individual' | 'mass-start' | 'pursuit'`, spec §4) but nothing in spec
  §6 renders them yet.
- Including `coachContext` in NordicAim's own backup file (`backup.md` §2) — left for a follow-up once decided.
- Any change to precision scoring, `geometry-scoring.md`, or `BiathlonSession`/`TargetAnalysis` — coach context is
  additive and read-only alongside them, never merged in.

## Files
- `src/lib/domain/coach-context.ts` (new): schemas for the import file shape and the persisted per-session record.
- `src/lib/store/db.ts`: version 5, `coachContext` store, keyed by `sessionId`.
- `src/lib/store/coach-context-repo.ts` (new): get/put/delete by `sessionId`; a cross-session fingerprint lookup for
  the duplicate check.
- `src/lib/services/coach-context.ts` (new): parse/validate, date/timezone matching, fingerprint computation, the
  Attach/Add/Remove operations (mirrors `src/lib/services/backup.ts` and `src/lib/backup/restore.ts`'s validation
  shape).
- `src/components/sessions/SessionList.tsx`: Attach/Remove actions beside each session row.
- A new preview screen/component (mirrors `src/components/settings/RestorePreview.tsx`) for the file-picker →
  preview → Add/Cancel flow.
- `src/lib/render/condition-icons.ts`: windage badge glyph (strength band; clock-face orientation when known).
- `src/lib/render/composite-band.ts`, `src/lib/render/composite.ts`: metal-icon bout rows.
- `src/lib/composite/build.ts`: reads a session's attached `coachContext`, if any, before rendering.
- `docs/spec/data-model.md` §6, `docs/spec/rendering-composite.md`: updated to match.
- `fixtures/private/coach-context/` (gitignored): home for the owner's real 2026-09-28 export and any further real
  samples — never committed. Committed unit tests use a small hand-built synthetic fixture instead (see *Pitfalls*).

## Steps
1. Domain schemas (`coach-context.ts`): the import file shape per spec §4, and the persisted record shape (adds a
   fingerprint field — a hash of the record's own fields, excluding anything NordicAim assigns, so it stays stable
   across re-parses of the same 545 Coach record).
2. `db.ts` version 5: `coachContext` store in a new `if (oldVersion < 5)` block, keyed by `sessionId`.
3. `coach-context-repo.ts`: CRUD by `sessionId`, plus a helper that scans every session's stored fingerprints for a
   collision.
4. `coach-context.ts` service: validate the picked file (named refusal on bad JSON/`format`/`formatVersion`/shape,
   nothing written); filter `MetalContext`/`WindContext` by `sessionDate` and `ZeroAdjustment` by converting `at` to
   a local date (device timezone at attach time — reuse NordicAim's existing LocalDate conversion helper rather than
   writing a new one, spec §7); compute fingerprints.
5. Attach UI: action beside each session in `SessionList.tsx` → file picker → preview screen rendering the matched
   records graphically (reuse the step-8 render modules) → Add/Cancel.
6. On Add: run the duplicate check (step 3's helper); collision with a different session → refuse, name it, write
   nothing; same session already attached → delete then write (never merge); otherwise write via the repo.
7. Remove action: deletes the session's `coachContext` entry via the repo.
8. Surfacing: extend `condition-icons.ts` with the windage badge next to season/lighting; extend
   `composite-band.ts`/`composite.ts` with one disc row per metal bout, read via `composite/build.ts`. No attached
   context → output identical to today (regression-tested, step below).
9. Update `docs/spec/data-model.md` §6 and `docs/spec/rendering-composite.md` with the new store and the new
   header/band elements; assign the REV number here.

## Tests
- `tests/unit/domain/coach-context.test.ts`: schema accepts a hand-built synthetic fixture shaped like the real
  export (not the owner's actual file, see *Pitfalls*); rejects bad `format`/`formatVersion`/record shape with a
  named reason.
- `tests/unit/store/coach-context-repo.test.ts`: put/get/delete by `sessionId`; the cross-session fingerprint scan
  finds a planted collision and misses a non-colliding record.
- `tests/unit/services/coach-context.test.ts`: date matching for `MetalContext`/`WindContext`; the `at` → local-date
  conversion around a UTC day boundary (the real sample's `2026-09-29T01:19Z` landing on local `2026-09-28` is the
  motivating case — use an equivalent synthetic timestamp); fingerprint stability (same record parsed twice gives
  the same fingerprint); Add refuses on a cross-session collision and writes nothing; Add to the same
  already-attached session deletes then writes, never merges; Remove clears the entry.
- `tests/unit/render/condition-icons.test.ts`, `composite-band.test.ts`: windage badge for each strength band, with
  and without a known clock direction; one disc row per bout, grouped by `comboGroup` then position; a session with
  no attached context renders byte-identical to the pre-M29 output (regression guard, since composite output is
  sha256-compared elsewhere per `rendering-composite.md` §5).
- `tests/e2e/coach-context-attach.spec.ts`: Attach → file picker (a fixture file) → preview screen shows the
  matched records → Add writes and the composite reflects it; attaching the same file to a second session shows
  the named error and writes nothing; Remove clears it and un-blocks attaching elsewhere; re-attaching to the same
  session replaces rather than duplicating.

## Acceptance
```bash
pnpm check
pnpm test:e2e --project=mobile-chromium tests/e2e/coach-context-attach.spec.ts   # and the WebKit project on the owner's Mac
```
**Human (owner):** look at a real composite image with attached coach context and confirm the windage badge and
metal-icon rows read clearly — this is new visual ground with no prior design pass, the same way Goals (M27/M28)
was iterated after the owner saw it shipped. Also export a 545 Coach session with actual wind (not calm) once
available, to confirm the windage badge renders something beyond "none."

## Pitfalls
- **The fingerprint must hash only the 545 Coach record's own fields**, never anything NordicAim assigns
  (`sessionId`, attach timestamp) — otherwise every record trivially "collides" with itself and the duplicate check
  is meaningless.
- **Transaction prep order** (`AGENTS.md`): parsing, fingerprint computation, and the cross-session duplicate scan
  all happen before opening the readwrite transaction that writes `coachContext`.
- **Never let coach context touch `BiathlonSession`/`TargetAnalysis` fields a manual edit could already own** —
  it's additive, rendered alongside, never merged in.
- **The owner's real export is real training data tied to calendar dates** — it belongs in gitignored
  `fixtures/private/`, never `fixtures/reference/` or committed directly. Committed unit tests use a small
  hand-built synthetic fixture instead; an integration-style test against the real file (if one is added) must skip
  itself when `fixtures/private/` is absent, same as the HEIC-based tests already do.
- **The composite header already places the wordmark and brand mark at the right edge** (`rendering-composite.md`
  §Header, x 1010/1064 today) — fitting a third badge needs a real check against that existing grid, not a guess.
- **A session with no attached coach context must render byte-identical to today's composite** — this is a
  regression risk wherever composite output is hash-compared.

## Open questions
Carried from `docs/spec/coach-context-import.md` §7, still open after this milestone:
- Wind field serialization is unconfirmed beyond a calm-day export (`direction`/a real strength field may never
  populate; `note` may be where the band actually lands) — the windage badge will rarely show more than "calm"
  until a windy export is seen.
- Whether `coachContext` joins NordicAim's own backup file — deferred, not decided.
- Splitting one day-file across two NordicAim sessions shot on the same date — explicitly out of scope here (see
  *Out of scope*); needs a deselect-before-Add design before it can be solved.

Raised while implementing (none blocks a later milestone):
- **Empty match** (`coach-context-import.md` §7, "default behaviour when a session's date has no 545 Coach records"): built
  as the conservative choice. The preview says the export has nothing for that date and **Add** is disabled
  (`addCoachContext` also refuses it with `CoachContextEmptyError`), so no empty entry is ever written. Owner to confirm.
- **Windage band source.** §4 has no dedicated strength field, so the band is read from `note` only when it is exactly
  `none`/`light`/`moderate`/`strong` (any case). No speed → band rule is invented. A wind record whose note is anything else
  draws no badge (the preview says so). With several wind records on one date the badge uses the first with a known band.
  Revisit once a windy export is seen.
- **Lenient reads of two unconfirmed forms.** `WindContext.direction` accepts a string or a number (§7: serialization
  unconfirmed), and `ZeroAdjustment.at` / `source.exportedAt` accept a minute-precision UTC time (`2026-09-29T01:19Z`, as
  this milestone quotes the real sample) as well as `UtcIso`, which on its own refuses that form.
- **Identical bouts within one file** (for example two clean prone bouts in the same combo group) have the same
  fingerprint by design (it hashes only the record's own fields). Both are kept; they only matter to the cross-session
  check, which is what the spec intends.

## Completion notes
Implemented 2026-10-05 (not committed; the workflow's finalizer commits).

**What was built**
- `src/lib/domain/coach-context.ts`: zod schemas for the §4 file (`CoachContextFile`, `MetalContext`, `ZeroAdjustment`,
  `WindContext`, `CoachConventions`, `CoachSource`, `CoachRace`) and the persisted `AttachedCoachContext`
  (`{ schemaVersion: 1, sessionId, attachedAt, source, conventions, metal|zero|wind: [{ fingerprint, record }] }`);
  `parseCoachContextText` (named refusals `not-json` / `wrong-format` / `wrong-version` / `bad-shape`), `matchCoachContext`,
  and `fingerprintSource` (canonical, key-sorted JSON of `{ kind, record }`: only 545 Coach's own parsed fields).
- `src/lib/domain/coach-context-view.ts`: `metalBoutRows` (grouped by combo group in first-appearance order, null last, then
  prone before standing, file order within), `windBadgeOf` / `windBandOf` / `clockOf`, `zeroClicksLabel`.
- `src/lib/store/db.ts` version **5**: `coachContext` store, keyPath `sessionId`, in a new `if (oldVersion < 5)` block.
- `src/lib/store/coach-context-repo.ts`: get/put/delete by `sessionId` (zod-validated both ways), `listCoachContextSessionIds`,
  `findFingerprintCollision` (reads raw rows, skips the target session, so one unreadable row elsewhere can't hide a duplicate).
- `src/lib/services/coach-context.ts`: `prepareCoachAttach` (verify, match, sha256 fingerprints; writes nothing),
  `addCoachContext` (empty refused; duplicate scan **before** the transaction; then one readwrite transaction does
  delete-then-put, so a re-attach replaces and never merges; then `summaryHooks.schedule`), `removeCoachContext`,
  `deviceLocalDate` (reuses `clientNow` from `media/capture-time.ts`, the phone's own timezone at attach time).
- `deleteSession` (`services/sessions.ts`) now also deletes the session's `coachContext` row in its cascade transaction.
  Without it, a deleted session's records would block attaching them anywhere else.
- UI: a paperclip **545 Coach data** button on each row of the Sessions list (`SessionList.tsx`, `HomePage.tsx`; marked
  when attached), opening `CoachContextDialog.tsx`: **Attach 545 Coach data** → file picker → `CoachPreview.tsx` (the same
  windage badge and disc rows as the composite, drawn by `render/coach-preview.ts`, plus the zero-click list) → **Add** /
  **Cancel**, and **Remove 545 Coach data** when something is attached. Errors (refused file, duplicate) show in the dialog.
- Composite: `CompositeInput.coach` (optional). `condition-icons.ts` `renderWindIcon` at **x 956, y 38**, title cut at 47
  characters when it shows (measured: the 34 px gap between the lighting badge and the wordmark can't hold a 44 px badge).
  `coach-metal.ts` + `composite-band.ts`: one row of five discs per bout under the band's left column (+46 + 34 per bout).
  `composite/build.ts` reads the row (an unreadable row is left out with a console warning, rather than breaking the summary).
  `COMPOSITE_RENDERER_VERSION` 21 → 22.
- Test hook `getCoachContext(sessionId)` in `src/lib/testing/test-hooks-browser.ts` (fake-camera builds only).
- Docs: `data-model.md` §6 (version 5, the new store; §7 service row), `rendering-composite.md` (new "545 Coach context
  (REV-159, M29)" section), `DESIGN-REVISIONS.md` REV-159.

**Tests added:** `tests/unit/domain/coach-context.test.ts` (35), `tests/unit/store/coach-context-repo.test.ts` (5),
`tests/unit/services/coach-context.test.ts` (14, including the UTC-day-boundary case with `TZ=America/Edmonton` and
`Europe/Oslo` set at runtime), `tests/unit/render/composite-band.test.ts` (4), `tests/unit/render/composite-coach.test.ts`
(6: byte-identical guard with sha256 values captured from the renderer **before** any M29 change, plus coach-present
layout), windage cases in `tests/unit/render/condition-icons.test.ts`, two cases in `tests/unit/composite/build.test.ts`,
a v4→v5 case in `tests/unit/store/db-migration.test.ts`, and `tests/e2e/coach-context-attach.spec.ts`. The synthetic
fixture is `tests/helpers/coach-context.ts` (hand-built; the real export is not in the repo, and
`fixtures/private/coach-context/` does not exist on this machine yet, so no private-file test was added).

**Commands run**
- `pnpm check`: pass (typecheck, lint with the 4 existing warnings and no errors, 154 files / 1422 unit tests, privacy).
- `pnpm test:e2e --project=mobile-chromium tests/e2e/coach-context-attach.spec.ts`: pass. The owner's own `pnpm dev`
  (no fake camera) was on port 3874, so it ran through a throwaway config on port 3875 with `VITE_FAKE_CAMERA=1` (deleted).
- The same spec on `mobile-webkit`: pass (this machine has WebKit).
- Regression e2e on mobile-chromium (a11y, delete-session, smoke, session-kinds, season-filter, summary, navigation,
  session-date, backup): 30/30 pass.

**For the reviewer**
- `addCoachContext` and `removeCoachContext` don't change `session.updatedAt`. The context isn't in a backup, so bumping it
  would make the backup reminder treat the session as changed. The summary rebuild that follows writes the session anyway.
- Renderer version bumped although no-coach output is identical, per §6's "bump whenever this renderer's output changes".
  The only effect is a one-time rebuild of each summary when its results screen opens.

