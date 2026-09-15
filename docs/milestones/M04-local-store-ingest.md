# M04: Local storage and ingest

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | M | scaffold (HEIC ingest, photo workspace → on-device storage) |

## Goal
The IndexedDB database, repositories, session services, and the photo ingest service. Ingest stores the
original/working/thumb images, the photo record, and an initial analysis from the overlay prior. Browser image
adapters and the storage-persistence helper also land here.

## Read first
- `docs/spec/data-model.md` §2, §3, §5, §6, §7
- `docs/spec/metadata-lighting.md` §0, §2
- `docs/spec/capture-overlay.md` §3.3 (`scaleCalibration`), §5
- `docs/spec/privacy-storage-hosting.md` §2

## In scope
DB schema, repos, `ServiceContext`, session services, `ingestPhoto` (without EXIF, stats, or lighting; M08 adds
those), `format.ts`, `capture-time.ts`, `image-browser.ts`, `persistence-browser.ts`, test helpers, a diagnostics row.

## Out of scope
EXIF, image stats, lighting (M08); UI (M07, M09).

## Files
- `src/lib/store/db.ts` (`openAppDb(name = 'asa')`, `AppDb` type via `idb` `DBSchema`), `blob-keys.ts`
- `src/lib/store/sessions-repo.ts`, `photos-repo.ts`, `analyses-repo.ts`, `blobs-repo.ts`, `settings-repo.ts`, `errors.ts`
- `src/lib/services/context.ts` (`createServiceContext()`), `sessions.ts`, `ingest.ts`
- `src/lib/media/format.ts`, `capture-time.ts`, `image-browser.ts`
- `src/lib/store/persistence-browser.ts` (`requestPersistence`, `storageStatus`, `maybeRequestPersistence`)
- `src/lib/geometry/transform.ts`: `scaleCalibration` only, if M03 hasn't created it yet
- `src/lib/diagnostics/checks-browser.ts`: add check `ingest-pipeline`
- `tests/helpers/fixtures.ts`, `tests/helpers/db.ts` (`openTestDb()` → unique name), `tests/helpers/stub-image-tools.ts`
- `tests/unit/store/*.test.ts`, `tests/unit/services/sessions.test.ts`, `tests/unit/services/ingest.test.ts`,
  `tests/unit/media/format.test.ts`, `tests/unit/media/capture-time.test.ts`

## Steps
1. `db.ts`: version 1 upgrade creates the stores and indexes in data-model §6.
2. Repos: thin typed wrappers that accept an optional transaction and validate on read with zod
   (`CorruptRecordError(store, key)`). The blobs repo stores `StoredBlob` with `ArrayBuffer` bytes and offers
   `getBlob(key) → Blob | null` and `deleteByPrefix(tx, prefix)`.
3. Session services: `createSession`, `getSession`, `listSessions` (by `updatedAt` desc), `updateSession`
   (name/notes/sessionDate), and `deleteSession` (cascade: photos, analyses, `photo:<pid>:*`, `diagram:<pid>:*`,
   `artifact:<aid>:*`). Every mutation sets `settings.lastChangeAt` in the same transaction.
4. `format.ts` (`detectFormat`, `fitLongest`, `RgbaImage`) and `capture-time.ts` (`clientNow`, `formatOffset`,
   `localToUtc`, `resolveCaptureTime`) per metadata-lighting §0.1 and §2.
5. `ingestPhoto(ctx, input, imageTools)`, where input is
   `{ sessionId, blob, origin, originalFilename, clientLocal, clientOffset, capture, categorization }`:
   1. `bytes = new Uint8Array(await blob.arrayBuffer())`. `detectFormat` → null throws `UnsupportedFormatError`.
      More than 30 MB throws `TooLargeError`.
   2. `imgs = await imageTools.makeWorkingImages(blob, format)`; read `working` and `thumb` into `ArrayBuffer`s **now**.
   3. `exif = null`; `captureTime = resolveCaptureTime(...)`; `imageStats = null`;
      `lightingSuggestion = { label: 'unknown', confidence: 0, reasons: ['pending'] }`; `lighting = 'unknown'`;
      `lightingConfirmed = false`; `sheet` all null; `sourceRetention = 'kept'`.
   4. If `capture?.calibrationPriorFramePx`: analysis with
      `calibration = scaleCalibration(prior, max(working.w, working.h) / max(frameWidthPx, frameHeightPx))`, `shots []`,
      `pinnedMode null`, `acceptedMissingCount null`, `computed null`.
   5. `status = nextStatus(categorization ?? emptyCategorization, analysis ?? null, null)`.
   6. **One** transaction over `photos, blobs, analyses, sessions, settings`: put the photo, three blobs, the analysis
      (if any), push the id into `session.photoIds`, bump `updatedAt`, and set `lastChangeAt`. `await tx.done`. Return the photo.
6. `image-browser.ts` per metadata-lighting §0.2 (`loadImage`, `makeWorkingImages`, `toRgba`), exported as
   `browserImageTools: ImageTools`.
7. `persistence-browser.ts` per privacy §2. `maybeRequestPersistence(ctx)` calls `requestPersistence` only when
   `settings.persistRequested` is false.
8. Diagnostics `ingest-pipeline`: fetch `dev-fixtures/precision.jpg` → `browserImageTools.makeWorkingImages` → pass if
   working is 1200×1600 and thumb is 360×480.

## Tests
- Store: CRUD round-trips for every repo; a corrupt record (put invalid JSON directly) → `CorruptRecordError`; blob bytes round-trip.
- Sessions: `listSessions` order; `deleteSession` removes every related record and blob key (count by prefix = 0);
  `lastChangeAt` updated.
- Ingest (stub image tools returning a working 1200×1600 and a thumb 360×480):
  - frame 1200×1600 with prior `{cx 600, cy 800, radiusPx 300}` → stored calibration unchanged; frame 2400×3200 → factor 0.5
  - complete categorization + prior → status `calibrated`; complete, no prior → `categorized`; no categorization → `uncategorized`
  - session `photoIds` contains the new id
  - random bytes → `UnsupportedFormatError`.
- `format.ts` and `capture-time.ts` vectors (metadata-lighting §0.1, §2), including `detectFormat` on
  `fixtures/reference/tiny-sighting.heic` (read with `fs`).
- E2E (both projects): `#/diagnostics` → `ingest-pipeline` pass.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Awaiting `blob.arrayBuffer()` or `makeWorkingImages` inside a transaction makes it auto-commit and fail. Prepare first.
- `fake-indexeddb/auto` shares one global factory, so use unique DB names per test.
- Keep original bytes unmodified.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
