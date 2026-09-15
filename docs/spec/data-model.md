# Spec: data model, on-device storage, services

Implementation: `src/lib/domain/*.ts` (zod schemas; types are `z.infer`), `src/lib/store/*` (IndexedDB),
`src/lib/services/*`. Every persisted record has `schemaVersion: 1`.

Formats:
- `UtcIso` = ISO-8601 with `Z` (e.g. `2026-09-05T23:56:03.000Z`)
- `LocalDateTime` = `YYYY-MM-DDTHH:mm:ss`, no zone
- `Offset` = `+HH:MM` or `-HH:MM`
- `LocalDate` = `YYYY-MM-DD`

## 1. Enums (`src/lib/domain/enums.ts`)

```ts
export const TemplateId   = z.enum(['sighting', 'precision']);
export const Position     = z.enum(['prone', 'standing', 'both']);
export const ShotPosition = z.enum(['prone', 'standing']);
export const Lighting     = z.enum(['daylight', 'night', 'artificial', 'mixed', 'unknown']);
export const MissingMode  = z.enum(['optimistic', 'pessimistic', 'averaged']);
export const PhotoOrigin  = z.enum(['camera-overlay', 'camera-native', 'import']);
export const Wind         = z.enum(['calm', 'light', 'moderate', 'strong']);
export const PhotoStatus  = z.enum(['uncategorized', 'categorized', 'calibrated', 'reviewed']);
```

Primitives (`primitives.ts`):
- `Id = z.string().uuid()`
- `UtcIso = z.string().datetime()`
- `LocalDateTime`, `LocalDate`, `Offset`: regex strings (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$`, `^\d{4}-\d{2}-\d{2}$`, `^[+-]\d{2}:\d{2}$`)
- `ShotId = z.string().min(1).max(64)`

## 2. Session (`session.ts`) → store `sessions`

```ts
export const CompositeSelection = z.object({
  sighting:  z.tuple([Id.nullable(), Id.nullable()]),
  precision: z.tuple([Id.nullable(), Id.nullable()]),
  confirmed: z.boolean(),          // false = suggested defaults, not yet confirmed by owner
});

export const ArtifactMeta = z.object({
  id: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  widthPx: z.number().int(), heightPx: z.number().int(), createdAt: UtcIso,
});

export const ShareRecord = z.object({
  id: Id, artifactId: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: UtcIso,
  method: z.enum(['web-share', 'download']),
});

export const BiathlonSession = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().trim().min(1).max(80),
  sessionDate: LocalDate,
  createdAt: UtcIso,
  updatedAt: UtcIso,
  photoIds: z.array(Id),             // capture/import order
  compositeSelection: CompositeSelection,
  artifacts: z.array(ArtifactMeta),
  shares: z.array(ShareRecord),
  notes: z.string().max(2000),
});
```

## 3. Photo (`photo.ts`) → store `photos`

```ts
export const Calibration = z.object({
  cx: z.number(), cy: z.number(),          // anchor centre, px in the image it belongs to
  radiusPx: z.number().positive(),         // anchor semi-major radius, px
  axisRatio: z.number().gt(0.3).lte(1),
  angleDeg: z.number().gte(0).lt(180),     // major axis, clockwise from image +x
  anchorDiameterMm: z.number().positive(), // 115 (sighting) or 112.4 (precision)
  source: z.enum(['overlay', 'manual', 'auto']),
  confidence: z.number().min(0).max(1).nullable(),
});

export const CaptureInfo = z.object({       // present when origin is camera-overlay or camera-native
  overlayTemplate: TemplateId.nullable(),  // null for camera-native
  outerDiameterFraction: z.number().min(0.3).max(1).nullable(),
  frameWidthPx: z.number().int().positive(),
  frameHeightPx: z.number().int().positive(),
  calibrationPriorFramePx: Calibration.nullable(), // FRAME pixels (before working resize)
  tiltDeg: z.number().nullable(),          // from the optional tilt indicator
  trackSettings: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

export const ExifMeta = z.object({          // present only if the original file had readable EXIF
  captureLocal: LocalDateTime.nullable(), captureOffset: Offset.nullable(), captureUtc: UtcIso.nullable(),
  gpsPresent: z.boolean(),
  gps: z.object({ lat: z.number(), lon: z.number(), altM: z.number().nullable() }).nullable(),
  gpsImgDirection: z.number().nullable(),
  make: z.string().nullable(), model: z.string().nullable(), lens: z.string().nullable(),
  brightnessValue: z.number().nullable(), iso: z.number().nullable(),
  exposureTimeSec: z.number().nullable(), fNumber: z.number().nullable(),
  flashRaw: z.number().int().nullable(), flashFired: z.boolean().nullable(),
  whiteBalance: z.enum(['auto', 'manual']).nullable(),
  widthPx: z.number().int().nullable(), heightPx: z.number().int().nullable(),
});

export const CaptureTime = z.object({
  local: LocalDateTime.nullable(), offset: Offset.nullable(), utc: UtcIso.nullable(),
  source: z.enum(['exif', 'client-clock', 'import-time']),
});

export const ImageStats = z.object({ meanLuma: z.number(), brightMeanR: z.number(), brightMeanG: z.number(), brightMeanB: z.number() });
export const LightingSuggestion = z.object({ label: Lighting, confidence: z.number().min(0).max(1), reasons: z.array(z.string()) });

export const Categorization = z.object({
  template: TemplateId.nullable(),
  position: Position.nullable(),
  roundsProne: z.number().int().min(1).max(50).nullable(),
  roundsStanding: z.number().int().min(1).max(50).nullable(),
});

export const SheetFields = z.object({
  athleteName: z.string().max(80).nullable(), wind: Wind.nullable(),
  athleteCondition: z.string().max(200).nullable(), notes: z.string().max(1000).nullable(),
});

export const TargetPhoto = z.object({
  schemaVersion: z.literal(1),
  id: Id, sessionId: Id,
  origin: PhotoOrigin,
  originalFormat: z.enum(['jpeg', 'png', 'heic']),
  originalFilename: z.string().max(255).nullable(),
  importedAt: UtcIso,
  capture: CaptureInfo.nullable(),
  exif: ExifMeta.nullable(),
  captureTime: CaptureTime,
  working: z.object({ widthPx: z.number().int(), heightPx: z.number().int(), scaleFromOriginal: z.number().positive() }),
  imageStats: ImageStats.nullable(),
  lightingSuggestion: LightingSuggestion,
  lighting: Lighting,
  lightingConfirmed: z.boolean(),
  categorization: Categorization,
  sheet: SheetFields,
  status: PhotoStatus,                    // computed by services, never set directly by UI code
  sourceRetention: z.enum(['kept', 'discarded']),
});
```

**Helpers** (`src/lib/domain/categorization.ts`):
- `isCategorizationComplete(c)`: template and position set; `roundsProne` set if position ∈ {prone, both};
  `roundsStanding` set if position ∈ {standing, both}.
- `declaredRounds(c)`: see geometry-scoring §7. Throws `IncompleteCategorizationError` if incomplete.
- `defaultCategorization(template, position)`: prone → `{ roundsProne: 10 }`; standing → `{ roundsStanding: 10 }`;
  both → `{ 5, 5 }` (from `BIATHLON_50M.defaults`).
- `nextStatus(categorization, analysis, result)` → `PhotoStatus`. Computed by services on every change. First match wins:
  1. categorization incomplete → `uncategorized`
  2. `analysis?.calibration` null → `categorized`
  3. `result` null or `result.all.identified === 0` → `calibrated`
  4. any subset `overcount > 0` → `calibrated`
  5. `totalMissing` = Σ `subset.missing` over `result.subsets`; `totalMissing === 0` → `reviewed`
  6. `analysis.acceptedMissingCount !== null && totalMissing <= analysis.acceptedMissingCount` → `reviewed`
  7. otherwise → `calibrated`

  Vectors:
  - precision golden fixture + calibration → `reviewed`
  - P8 multiplicity 1, accepted null → `calibrated`
  - the same with accepted 1 → `reviewed`
  - accepted 1 but P8 and P9 removed (missing 3) → `calibrated`
  - an extra 11th shot → `calibrated`
  - calibration null → `categorized`
  - `both` with roundsStanding null → `uncategorized`

## 4. Analysis (`analysis.ts`) → store `analyses`

```ts
export const Shot = z.object({
  id: ShotId,
  xMm: z.number(), yMm: z.number(),                       // target mm, +y up
  multiplicity: z.number().int().min(1).max(20),
  positionOverrides: z.array(ShotPosition.nullable()).nullable(), // if set, length === multiplicity
  source: z.enum(['manual', 'auto']),
  confidence: z.number().min(0).max(1).nullable(),
  cluster: z.boolean(),
}).refine(s => s.positionOverrides === null || s.positionOverrides.length === s.multiplicity);

export const TargetAnalysis = z.object({
  schemaVersion: z.literal(1),
  photoId: Id,
  calibration: Calibration.nullable(),     // WORKING image px
  shots: z.array(Shot),
  pinnedMode: MissingMode.nullable(),
  acceptedMissingCount: z.number().int().min(1).nullable(),
  updatedAt: UtcIso,
  computed: z.object({ engineVersion: z.string(), result: AnalysisResultSchema }).nullable(), // cache
});
```

`AnalysisResult` (returned by `analyzeTarget`, geometry-scoring §10):

```ts
export interface UnitResult { shotId: string; unitIndex: number; xMm: number; yMm: number; radialMm: number;
  position: 'prone' | 'standing'; ring: number | null; isX: boolean | null; zone: 'clean' | 'hit' | 'miss' | null; }
export interface Angular { moa: number; mrad: number }
export interface MpiOffset { xMm: number; yMm: number; xMoa: number; yMoa: number; xMrad: number; yMrad: number }
export interface GroupEllipse { cxMm: number; cyMm: number; rxMm: number; ryMm: number; angleDeg: number }
export interface PrecisionScore { tally: number[] /* 0..10 */; xCount: number; identifiedTotal: number;
  maxPossible: number; range: { optimistic: number; pessimistic: number; averaged: number } }
export interface SightingModeOutcome { hits: number; misses: number; mpi: { xMm: number; yMm: number } | null }
export interface SightingOutcome { zoneDiameterMm: 45 | 115 | null; hits: number; clean: number; misses: number;
  range: { optimistic: SightingModeOutcome; pessimistic: SightingModeOutcome; averaged: SightingModeOutcome } }
export interface SubsetResult { key: 'prone' | 'standing' | 'all'; declared: number; identified: number; missing: number;
  overcount: number; units: UnitResult[]; mpi: { xMm: number; yMm: number } | null; extremeSpreadMm: number | null;
  extremeSpreadAngular: Angular | null; meanRadiusMm: number | null; mpiOffset: MpiOffset | null;
  groupEllipse: GroupEllipse | null; precision: PrecisionScore | null; sighting: SightingOutcome | null;
  warnings: Array<'overcount'> }
export interface AnalysisResult { engineVersion: string; template: 'sighting' | 'precision'; position: 'prone' | 'standing' | 'both';
  subsets: SubsetResult[]; all: SubsetResult }
```

## 5. Settings (`settings.ts`) → store `settings`, key `'app'`

```ts
export const AppSettings = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  profileOverrides: z.object({ clickValueMm: z.number().positive().nullable(), holeDiameterMm: z.number().positive() }),
  lastBackupAt: UtcIso.nullable(),
  lastChangeAt: UtcIso.nullable(),        // updated by every mutating service
  backupReminderDays: z.number().int().min(1).max(60),
  persistRequested: z.boolean(),
  persisted: z.boolean().nullable(),
});
// default: { schemaVersion 1, key 'app', profileOverrides { clickValueMm: null, holeDiameterMm: 5.6 },
//            lastBackupAt null, lastChangeAt null, backupReminderDays 7, persistRequested false, persisted null }
```

## 6. IndexedDB schema (`src/lib/store/db.ts`)

Database `asa`, version **1**, opened with `idb`'s `openDB`.

| Store | Key | Indexes | Value |
|---|---|---|---|
| `sessions` | keyPath `id` | `by-updatedAt` (`updatedAt`), `by-sessionDate` (`sessionDate`) | `BiathlonSession` |
| `photos` | keyPath `id` | `by-sessionId` (`sessionId`) | `TargetPhoto` |
| `analyses` | keyPath `photoId` | — | `TargetAnalysis` |
| `blobs` | out-of-line string key | — | `StoredBlob { bytes: ArrayBuffer; contentType: string; sizeBytes: number; createdAt: UtcIso }` |
| `settings` | keyPath `key` | — | `AppSettings` |

Blob keys (`blobKey.*` helpers in `src/lib/store/blob-keys.ts`):

| Key | Content |
|---|---|
| `photo:<pid>:original` | original file bytes (JPEG/PNG/HEIC) |
| `photo:<pid>:working` | JPEG, longest side ≤ 3000, oriented, no metadata |
| `photo:<pid>:thumb` | JPEG, longest side 480 |
| `diagram:<pid>:full-svg` · `diagram:<pid>:full-png` · `diagram:<pid>:cell-svg` | diagram files |
| `artifact:<aid>:png` · `artifact:<aid>:json` | composite image + JSON sidecar |

Rules:
- Bytes are stored as `ArrayBuffer` (not `Blob`) for maximum compatibility. Readers rebuild
  `new Blob([bytes], { type: contentType })`.
- **Prepare everything before a transaction** (including `await blob.arrayBuffer()`). Inside a transaction, only
  await IDB calls, then `await tx.done`.
- Deleting a photo deletes all `photo:<pid>:*` and `diagram:<pid>:*` keys via
  `IDBKeyRange.bound('photo:<pid>:', 'photo:<pid>:￿')`, and likewise for diagrams.
- Every read from a store is validated with its zod schema; on failure throw `CorruptRecordError(store, key)`.
- Tests use `fake-indexeddb/auto`; each test opens a uniquely named database (`asa-test-<n>`) via
  `openAppDb(name)`.

## 7. Services (`src/lib/services/*`)

```ts
export interface ServiceContext { db: AppDb; now: () => Date; newId: () => string }
// production: { db: await openAppDb('asa'), now: () => new Date(), newId: () => crypto.randomUUID() }
```

Every mutating service updates `settings.lastChangeAt = now().toISOString()` **in the same transaction**.

| Function | File | Milestone | Summary |
|---|---|---|---|
| `createSession(ctx, { name, sessionDate })` · `updateSession` · `deleteSession` (cascade) · `listSessions` (newest `updatedAt` first) · `getSession` | `sessions.ts` | M04 | session CRUD |
| `ingestPhoto(ctx, input, imageTools)` | `ingest.ts` | M04, M08 | stores original/working/thumb, photo record, initial analysis from the overlay prior |
| `updatePhotoFields(ctx, photoId, { categorization?, lighting?, sheet? })` | `photos.ts` | M09 | then `refreshStatus` |
| `deletePhoto(ctx, photoId)` | `photos.ts` | M09 | cascade blobs, remove from session |
| `saveAnalysis(ctx, photoId, { calibration, shots, pinnedMode, acceptedMissingCount }, renderTools)` | `analysis.ts` | M10 | recompute, `refreshStatus` |
| `refreshStatus(ctx, photoId, renderTools)` | `analysis.ts` | M10 | `nextStatus`; write/delete diagram blobs |
| `quickStart(ctx, navigate)` · `quickStartLabel(sessions, now)` | `quick-start.ts` | M09 | REV-8 |
| `loadDemoSession(ctx, assets, imageTools, renderTools)` | `demo.ts` | M10 | demo from reference photos + golden shots |
| `buildComposite(ctx, sessionId, rasterize)` | `src/lib/composite/build.ts` | M13 | CompositeArtifact |
| `recordShare(ctx, sessionId, artifactId, method)` | `shares.ts` | M14 | ShareRecord |
| `discardSources(ctx, sessionId, photoIds?)` | `sources.ts` | M14 | delete original/working/thumb |
| `exportBackup(ctx, { includeSourcePhotos })` · `importBackup(ctx, zipBytes, { onConflict })` | `src/lib/backup/*` | M15 | see privacy-storage-hosting §3 |

`imageTools` and `renderTools` are injected so services stay unit-testable in Node (stubs in tests; browser
implementations from `image-browser.ts` and `rasterize-browser.ts` in the app):

```ts
export interface ImageTools {
  makeWorkingImages(blob: Blob, format: ImageFormat): Promise<{ working: Blob; thumb: Blob;
    originalSize: { widthPx: number; heightPx: number }; workingSize: { widthPx: number; heightPx: number; scaleFromOriginal: number } }>;
  toRgba(blob: Blob, maxLongest: number): Promise<RgbaImage>;
}
export interface RenderTools { svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Blob> }
```

## 8. Example session record

```json
{
  "schemaVersion": 1,
  "id": "6f1d7c1e-3b1e-4f5e-9a3e-1c2d3e4f5a6b",
  "name": "Session 2026-09-05",
  "sessionDate": "2026-09-05",
  "createdAt": "2026-09-05T23:40:00.000Z",
  "updatedAt": "2026-09-06T00:05:00.000Z",
  "photoIds": ["0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d"],
  "compositeSelection": { "sighting": [null, null], "precision": ["0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d", null], "confirmed": false },
  "artifacts": [],
  "shares": [],
  "notes": ""
}
```
