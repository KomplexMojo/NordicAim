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
_(add here)_

## Completion notes
_(fill in when done)_
