# M04: On-device storage and photo ingest

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M02 | low | M | take picture(s) (store) |

## Goal
The IndexedDB database, repositories, session services, and `ingestPhoto`, which stores the original/working/thumb
images, the photo record, and the initial analysis (Stage A pending). Also: browser image adapters, the persistence
helper, and pipeline hooks.

## Read first
- `docs/spec/data-model.md` §2, §3, §4 (`initialAnalysis`), §5, §6, §7
- `docs/spec/metadata-lighting.md` §0, §2
- `docs/spec/analysis-pipeline.md` §2 (A1), §5 (`notify`)
- `docs/spec/privacy-storage-hosting.md` §2

## In scope
DB schema, repos, `ServiceContext`, session services, `ingestPhoto` (EXIF, stats, lighting come in M08), `format.ts`,
`capture-time.ts`, `image-browser.ts`, `persistence-browser.ts`, `pipeline/hooks.ts`, test helpers, a diagnostics row.

## Out of scope
Pipeline runner (M10), UI (M07, M09).

## Files
- `src/lib/store/db.ts` (`openAppDb(name = 'asa')`), `blob-keys.ts`, `sessions-repo.ts`, `photos-repo.ts`, `analyses-repo.ts`,
  `blobs-repo.ts`, `settings-repo.ts`, `errors.ts`, `persistence-browser.ts`
- `src/lib/services/context.ts`, `sessions.ts`, `ingest.ts`
- `src/lib/media/format.ts`, `capture-time.ts`, `image-browser.ts`
- `src/lib/pipeline/hooks.ts`: `pipelineHooks = { notify: () => {} }` plus `registerRunner(fn)`
- `src/lib/diagnostics/checks-browser.ts`: add `ingest-pipeline`
- `tests/helpers/fixtures.ts`, `db.ts` (`openTestDb()`), `stub-image-tools.ts`
- `tests/unit/store/*.test.ts`, `tests/unit/services/sessions.test.ts`, `ingest.test.ts`, `tests/unit/media/format.test.ts`, `capture-time.test.ts`

## Steps
1. `db.ts`: version 1 stores and indexes per data-model §6.
2. Repos: typed wrappers accepting an optional transaction, validated on read (`CorruptRecordError`). The blobs repo offers
   `putBlob`, `getBlob → Blob | null`, `deleteByPrefix`.
3. Session services: `createSession`, `getSession`, `listSessions` (updatedAt desc), `updateSession`, and `deleteSession`
   (cascade photos, analyses, `photo:<pid>:*`, `diagram:<pid>:*`, `artifact:<aid>:*`).
4. `format.ts` and `capture-time.ts` per metadata-lighting §0.1 and §2.
5. `ingestPhoto(ctx, input, imageTools)`, input
   `{ sessionId, blob, origin, originalFilename, clientLocal, clientOffset, capture, categorization }`:
   1. bytes → `detectFormat` (null → `UnsupportedFormatError`); > 30 MB → `TooLargeError`.
   2. `makeWorkingImages` → read the working and thumb ArrayBuffers **now**.
   3. `exif = null`; `captureTime = resolveCaptureTime(...)`; `imageStats = null`;
      `lightingSuggestion = { label: 'unknown', confidence: 0, reasons: ['pending'] }`; `lighting = 'unknown'`;
      `lightingConfirmed = false`; `notes = null`.
   4. `analysis = initialAnalysis(photoId, now)`. `{ status, reasons } = photoStatus({ categorization, analysis, result: null })`.
   5. One transaction over photos, blobs, analyses, sessions: put everything; push the id into `session.photoIds`; bump `updatedAt`.
   6. After commit: `pipelineHooks.notify()`. Return the photo.
6. `image-browser.ts` per metadata-lighting §0.2 → `browserImageTools`.
7. `persistence-browser.ts` per privacy §2.
8. Diagnostics `ingest-pipeline`: `dev-fixtures/precision.jpg` → `makeWorkingImages` → working 1200×1600, thumb 360×480.

## Tests
- Store CRUD for every repo; corrupt record → `CorruptRecordError`; blob bytes round-trip.
- Sessions: list order; cascade delete leaves 0 keys by prefix.
- Ingest (stub tools):
  - photo stored with `captureTime.source 'client-clock'` for camera-overlay
  - analysis `stageA 'pending'`, `calibration null`
  - complete categorization → status `processing`; no categorization → `needs-metadata`
  - session `photoIds` updated; `notify` called once (spy)
  - random bytes → `UnsupportedFormatError`.
- `format.ts` and `capture-time.ts` vectors (including `tiny-sighting.heic` → `heic`).
- E2E: diagnostics `ingest-pipeline` pass.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Never await non-IDB work inside a transaction.
- Use unique fake-indexeddb DB names per test.
- Keep original bytes unmodified.

## Open questions
- **`createSession` exact signature.** data-model §7 lists only the function name; the default session
  name (`Session <YYYY-MM-DD>`) is described in analysis-pipeline §1 for the *Add metadata* screen, not
  for the service. Implemented as `createSession(ctx, { name?, sessionDate?, notes? } = {})`, defaulting
  `sessionDate` to `ctx.now()` and `name` to `Session <sessionDate>` when omitted, so a caller with no
  input still gets a valid record. Not blocking — M09 (which owns the screen) should confirm this matches
  what it needs, or pass explicit values itself.
- **`updateSession` signature.** data-model §7 shows `updateSession(name, sessionDate, notes)`, which reads
  as positional and required. Implemented as `updateSession(ctx, sessionId, { name?, sessionDate?, notes? })`
  (object of optional partial updates), consistent with every other service's `(ctx, id, patch)` shape and
  with `updatePhotoMetadata`'s spec signature (`{ categorization?, lighting?, notes? }`) one row below it.
  Not blocking.
- **Where ingest-specific errors live.** The milestone's Files list places `errors.ts` under `store/` and
  ties it to `CorruptRecordError` ("validated on read (`CorruptRecordError`)"). `UnsupportedFormatError`,
  `TooLargeError`, and `SessionNotFoundError` aren't store-record-corruption errors, so they're exported
  from `services/ingest.ts` / `services/sessions.ts` instead of `store/errors.ts`. Not blocking.
- **idb's structural transaction typing.** `idb`'s `IDBPTransaction<DBTypes, TxStores, Mode>` types its
  `.store` getter and `.objectStore(name).put/delete` conditionally on the exact `TxStores` tuple and
  `Mode`, so a single shared `AppTx` alias covering "any transaction over any subset of our stores,
  readwrite" isn't expressible without `any` for `TxStores`. `src/lib/store/db.ts`'s `AppTx` uses
  `any` for that parameter (documented inline) so repo functions can accept both single-store and
  multi-store transactions from services. This is scoped to the store layer's internal plumbing, not
  the public repo function signatures (which stay typed).

## Completion notes
Implemented per spec: `src/lib/store/{db,blob-keys,sessions-repo,photos-repo,analyses-repo,blobs-repo,
settings-repo,errors,persistence-browser}.ts`, `src/lib/services/{context,sessions,ingest}.ts`,
`src/lib/media/{format,capture-time,image-browser}.ts`, `src/lib/pipeline/hooks.ts`, a new
`ingest-pipeline` diagnostics check in `src/lib/diagnostics/checks-browser.ts` (added to
`tests/e2e/smoke.spec.ts`'s check list), and test helpers (`tests/helpers/{db,fixtures,
stub-image-tools}.ts`) plus unit tests under `tests/unit/{store,services,media}/`.

Commands run:
- `pnpm typecheck` — pass
- `pnpm lint` — pass (only pre-existing `react-refresh/only-export-components` warnings in
  `src/components/ui/{badge,button,toggle}.tsx`, unrelated to this milestone)
- `pnpm test` — pass, 181/181 tests (26 files), including the 5 new store repo files, `services/sessions`,
  `services/ingest`, `media/format`, `media/capture-time`
- `pnpm check:privacy` — pass (11 images checked)
- `pnpm check` — pass (runs all of the above)
- `pnpm test:e2e` — pass, 4/4 (mobile-chromium + mobile-webkit) × (home page, diagnostics page incl.
  `ingest-pipeline`)

Deviations from the milestone text: none beyond the signature choices recorded under *Open questions*.
`browserImageTools` in `image-browser.ts` matches the `ImageTools` shape from data-model §7 (`toRgba`
included even though only `makeWorkingImages` is exercised by this milestone's tests — `toRgba` is needed
by M08/M10/M11 and is part of the spec's interface, so it's implemented now rather than stubbed).

No human-required steps for this milestone (no owner gate, no device-only checks).
