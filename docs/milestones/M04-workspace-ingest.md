# M04: Workspace storage and ingest API

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | M | scaffold (HEIC ingest, photo workspace) |

## Goal
Sessions and photos persist on disk. Uploads (camera frames, native camera, imports) are decoded into
working and thumbnail images, and a capture's calibration prior becomes the initial analysis.

## Read first
- `docs/spec/data-model.md` §2, §3, §6, §7 (rows marked M04)
- `docs/spec/metadata-lighting.md` §0 (ingest), §2.2 (capture time)
- `docs/spec/capture-overlay.md` §5 (upload payload)
- `docs/spec/access-deployment.md` §4 (same-origin)

## In scope
Repositories, atomic writes, ingest pipeline, capture-time resolution, calibration prior scaling, session and
photo route handlers, same-origin guard, test helpers.

## Out of scope
EXIF parsing and lighting (M09: until then `exif = null`, `imageStats = null`,
`lightingSuggestion = { label: 'unknown', confidence: 0, reasons: ['pending'] }`), auth middleware (M05), UI.

## Files
- `src/lib/workspace/paths.ts`, `fs-atomic.ts`, `sessions-repo.ts`, `photos-repo.ts`, `analysis-repo.ts`, `config-repo.ts`
- `src/lib/media/ingest.ts`, `src/lib/media/capture-time.ts`
- `src/lib/auth/same-origin.ts`, `src/lib/http/errors.ts` (`HttpError`, `jsonError`, `withErrors(handler)`)
- `src/app/api/sessions/route.ts`, `[sessionId]/route.ts`, `[sessionId]/photos/route.ts`,
  `[sessionId]/photos/[photoId]/route.ts`, `…/working/route.ts`, `…/thumb/route.ts`
- `tests/helpers/fixtures.ts`, `tests/helpers/tmp-workspace.ts`, `tests/unit/workspace/*.test.ts`,
  `tests/unit/media/ingest.test.ts`, `tests/unit/media/capture-time.test.ts`

## Steps
1. `paths.ts`: `workspaceRoot()` (env `ASA_WORKSPACE_DIR`, else `~/.advanced-shooting-analysis`), plus one
   function per path in data-model §6. Every id argument passes through `Id.parse`.
2. `fs-atomic.ts`: `writeJsonAtomic(path, value)`, `writeFileAtomic(path, buf)` (tmp + rename), `readJson(path, schema)`.
3. Repos: `createSession({ name, sessionDate, now, id })`, `getSession`, `listSessions` (newest `updatedAt`
   first), `updateSession`, `deleteSession` (recursive). Photos: `createPhoto`, `getPhoto`, `listPhotos`
   (session order), `updatePhoto`, `deletePhoto` (removes the dir and its id from the session). Analysis:
   `getAnalysis`, `putAnalysis`. Config: `getConfig` (default if missing), `putConfig`. Each repo takes
   `now: Date` and `id` from callers (handlers use `new Date()` and `crypto.randomUUID()`).
4. `ingest.ts` per metadata-lighting §0.
5. `capture-time.ts`: `resolveCaptureTime`, `localToUtc` per metadata-lighting §2.2.
6. `POST /api/sessions/:sid/photos`:
   1. `assertSameOrigin`
   2. `request.formData()`
   3. validate `origin`, `clientLocal`, `clientOffset`; optional `capture` and `categorization` JSON, each via zod
   4. check file ≤ 25 MB (else 413 `too_large`)
   5. `detectFormat` (null → 400 `unsupported_format`)
   6. `makeWorkingImages`
   7. write original, working, and thumb
   8. build the `TargetPhoto` (`status = nextStatus`)
   9. if `capture.calibrationPriorFramePx`: `putAnalysis` with calibration `scaleCalibration(prior, workingLongest / max(frameWidthPx, frameHeightPx))`, `shots: []`, `pinnedMode: null`, `computed: null`
   10. append the photo id to the session → 201 with the photo.
7. Other handlers per the data-model §7 M04 rows. Image GETs set `Content-Type: image/jpeg` and
   `Cache-Control: private, no-store`.
8. Test helpers: `hasPrivateFixture(name)`, `privateFixturePath(name)`, `referencePath(relative)`;
   `withTmpWorkspace()` sets `ASA_WORKSPACE_DIR` to a `mkdtemp` dir and removes it afterwards.

## Tests
- Session CRUD round-trip; `listSessions` ordering; delete removes the directory.
- Atomic write: after a successful write no `*.tmp-*` files remain.
- `paths.ts` rejects `../etc` as an id.
- `detectFormat` vectors (metadata-lighting §0).
- `makeWorkingImages` on a synthetic 4000×1000 PNG (made with sharp in the test) → working 3000×750, thumb 480×120.
- Private (skip if absent): `IMG_5057.HEIC` → working 2250×3000.
- `localToUtc` and `resolveCaptureTime` vectors (metadata-lighting §2.2).
- Route handler test (call the exported `POST` with a `Request` built from `FormData`): uploading
  `docs/reference/IMG_5132-precision.jpg` with origin `camera-overlay` and a capture prior
  `{ cx: 600, cy: 800, radiusPx: 300, … }` with frame 1200×1600 → analysis calibration unchanged (factor 1).
  A 2400×3200 frame claim with the same file → factor 0.5.
- Same-origin: an `Origin: https://evil.example` POST → 403.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- Call `.rotate()` before resizing, or phone photos come out sideways.
- `heic-convert` returns an `ArrayBuffer`; wrap it with `Buffer.from()`.
- Never trust `file.type` or the filename; use `detectFormat`.
- Keep original bytes unmodified.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
