# Spec: data model, on-device storage, services

Implementation: `src/lib/domain/*.ts` (zod schemas; types are `z.infer`), `src/lib/store/*` (IndexedDB),
`src/lib/services/*`, `src/lib/pipeline/*`. Every persisted record has `schemaVersion: 1`.

Formats: `UtcIso` = ISO-8601 with `Z`; `LocalDateTime` = `YYYY-MM-DDTHH:mm:ss`; `Offset` = `±HH:MM`;
`LocalDate` = `YYYY-MM-DD`.

## 1. Enums (`src/lib/domain/enums.ts`)

```ts
export const TemplateId   = z.enum(['sighting', 'precision']);
export const Position     = z.enum(['prone', 'standing', 'both']);
export const ShotPosition = z.enum(['prone', 'standing']);
export const Lighting     = z.enum(['daylight', 'night', 'artificial', 'mixed', 'unknown']);
export const PhotoOrigin  = z.enum(['camera-overlay', 'camera-native', 'import']);
export const PhotoStatus  = z.enum(['needs-metadata', 'processing', 'ready', 'analyzed', 'needs-attention', 'failed']);
export const Reason       = z.enum(['target-not-found', 'no-shots-found', 'too-many-shots', 'rounds-unaccounted',
                                    'alignment-uncertain', 'image-blurry', 'template-mismatch']);
export const Warning      = z.enum(['alignment-uncertain', 'image-blurry', 'template-mismatch']);
export const StageState   = z.enum(['pending', 'running', 'done', 'error']);
```

Primitives (`primitives.ts`): `Id = z.string().uuid()`, `UtcIso = z.string().datetime()`, regex strings for
`LocalDateTime`, `LocalDate`, `Offset`, and `ShotId = z.string().min(1).max(64)`.

## 2. Session (`session.ts`) → store `sessions`

```ts
export const ArtifactMeta = z.object({
  id: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  widthPx: z.number().int(), heightPx: z.number().int(), createdAt: UtcIso,
});
export const ShareRecord = z.object({
  id: Id, artifactId: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: UtcIso, method: z.enum(['web-share', 'download']),
});
export const BiathlonSession = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().trim().min(1).max(80),
  sessionDate: LocalDate,
  createdAt: UtcIso,
  updatedAt: UtcIso,
  photoIds: z.array(Id),                 // capture/import order
  analyzeRequestedAt: UtcIso.nullable(), // set by "Analyze"; enables Stage B (analysis-pipeline §5)
  artifacts: z.array(ArtifactMeta),      // newest last; at most 3 kept
  shares: z.array(ShareRecord),
  notes: z.string().max(2000),
  // REV-38: the optional coloured backing for this session. Shape in `backing-sheet.md` §3
  // (`backingMode` Auto/None/Coloured, and the measured `BackingSheet` when a card was photographed).
});
```

## 3. Photo (`photo.ts`) → store `photos`

```ts
export const Calibration = z.object({
  cx: z.number(), cy: z.number(), radiusPx: z.number().positive(),
  axisRatio: z.number().gt(0.3).lte(1),
  angleDeg: z.number().gte(0).lt(180),     // major axis, clockwise from image +x
  anchorDiameterMm: z.number().positive(), // 115 (sighting) or 112.4 (precision)
  source: z.enum(['overlay', 'auto', 'manual']),
  confidence: z.number().min(0).max(1).nullable(),
});

export const CaptureInfo = z.object({
  overlayTemplate: TemplateId.nullable(),
  outerDiameterFraction: z.number().min(0.3).max(1).nullable(),
  frameWidthPx: z.number().int().positive(),
  frameHeightPx: z.number().int().positive(),
  calibrationPriorFramePx: Calibration.nullable(),   // FRAME pixels
  trackSettings: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

export const ExifMeta = z.object({
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

export const TargetPhoto = z.object({
  schemaVersion: z.literal(1),
  id: Id, sessionId: Id,
  origin: PhotoOrigin,                   // REV-38 adds `backing-card` for a photo of the backing (`backing-sheet.md` §3)
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
  notes: z.string().max(1000).nullable(),
  status: PhotoStatus,                      // computed by photoStatus (analysis-pipeline §4); never set by UI code
  reasons: z.array(Reason),
});
```

**Helpers** (`src/lib/domain/categorization.ts`):
- `isCategorizationComplete(c)`: template and position set; `roundsProne` set if position ∈ {prone, both}; `roundsStanding`
  set if position ∈ {standing, both}.
- `declaredRounds(c)`: geometry-scoring §7; throws `IncompleteCategorizationError`.
- `defaultCategorization(template, position)`: prone → `{ roundsProne: 10 }`; standing → `{ roundsStanding: 10 }`; both → `{ 5, 5 }`.
- `emptyCategorization()`: all null.

## 4. Analysis (`analysis.ts`) → store `analyses`

```ts
export const Shot = z.object({
  id: ShotId, xMm: z.number(), yMm: z.number(),
  multiplicity: z.number().int().min(1).max(20),
  positionOverrides: z.array(ShotPosition.nullable()).nullable(),
  source: z.enum(['auto', 'manual']),
  confidence: z.number().min(0).max(1).nullable(),
  cluster: z.boolean(),
}).refine(s => s.positionOverrides === null || s.positionOverrides.length === s.multiplicity);

export const PipelineState = z.object({
  stageA: StageState,
  stageB: StageState,
  error: z.string().max(200).nullable(),
  alignment: z.object({ method: z.enum(['cv', 'overlay', 'manual', 'none']), confidence: z.number().min(0).max(1).nullable() }),
  templateHint: z.object({ template: TemplateId, confidence: z.number().min(0).max(1) }).nullable(),
  sharpness: z.number().nullable(),
  warnings: z.array(Warning),
});

export const TargetAnalysis = z.object({
  schemaVersion: z.literal(1),
  photoId: Id,
  calibration: Calibration.nullable(),     // WORKING image px
  shots: z.array(Shot),
  pipeline: PipelineState,
  updatedAt: UtcIso,
  computed: z.object({ engineVersion: z.string(), result: AnalysisResultSchema }).nullable(),
});

export function initialAnalysis(photoId: string, nowIso: string): TargetAnalysis;
// calibration null, shots [], computed null,
// pipeline { stageA 'pending', stageB 'pending', error null, alignment { method 'none', confidence null },
//            templateHint null, sharpness null, warnings [] }
```

`AnalysisResult` (from `analyzeTarget`, geometry-scoring §10):

```ts
export interface UnitResult { shotId: string; unitIndex: number; xMm: number; yMm: number; radialMm: number;
  position: 'prone' | 'standing'; ring: number | null; isX: boolean | null; zone: 'clean' | 'hit' | 'miss' | null; }
export interface Angular { moa: number; mrad: number }
export interface MpiOffset { xMm: number; yMm: number; xMoa: number; yMoa: number; xMrad: number; yMrad: number }
export interface GroupEllipse { cxMm: number; cyMm: number; rxMm: number; ryMm: number; angleDeg: number }
export interface PrecisionScore { tally: number[]; xCount: number; identifiedTotal: number; maxPossible: number;
  range: { optimistic: number; pessimistic: number; averaged: number } }
export interface SightingModeOutcome { hits: number; misses: number; mpi: { xMm: number; yMm: number } | null }
export interface SightingOutcome { zoneDiameterMm: 45 | 115 | null; hits: number; clean: number; misses: number;
  range: { optimistic: SightingModeOutcome; pessimistic: SightingModeOutcome; averaged: SightingModeOutcome } }
export interface SubsetResult { key: 'prone' | 'standing' | 'all'; declared: number; identified: number; missing: number;
  overcount: number; units: UnitResult[]; mpi: { xMm: number; yMm: number } | null; extremeSpreadMm: number | null;
  extremeSpreadAngular: Angular | null; meanRadiusMm: number | null; mpiOffset: MpiOffset | null;
  groupEllipse: GroupEllipse | null; precision: PrecisionScore | null; sighting: SightingOutcome | null; warnings: Array<'overcount'> }
export interface AnalysisResult { engineVersion: string; template: 'sighting' | 'precision'; position: 'prone' | 'standing' | 'both';
  subsets: SubsetResult[]; all: SubsetResult }
```

Status: `photoStatus` in `src/lib/domain/status.ts`, with rules and vectors in **analysis-pipeline §4**.

## 5. Settings (`settings.ts`) → store `settings`, key `'app'`

```ts
export const AppSettings = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  profileOverrides: z.object({ holeDiameterMm: z.number().positive() }),
  persistRequested: z.boolean(),
  persisted: z.boolean().nullable(),
  // REV-38: the last backing the user chose, so a new session can offer it again (`backing-sheet.md` §3).
});
// default: { schemaVersion 1, key 'app', profileOverrides { holeDiameterMm: 5.6 }, persistRequested false, persisted null }
```

## 6. IndexedDB schema (`src/lib/store/db.ts`)

Database `asa`, version **1**, opened with `idb`'s `openDB`.

| Store | Key | Indexes | Value |
|---|---|---|---|
| `sessions` | keyPath `id` | `by-updatedAt`, `by-sessionDate` | `BiathlonSession` |
| `photos` | keyPath `id` | `by-sessionId` | `TargetPhoto` |
| `analyses` | keyPath `photoId` | — | `TargetAnalysis` |
| `blobs` | out-of-line string key | — | `StoredBlob { bytes: ArrayBuffer; contentType: string; sizeBytes: number; createdAt: UtcIso }` |
| `settings` | keyPath `key` | — | `AppSettings` |

Blob keys (`src/lib/store/blob-keys.ts`):
- `photo:<pid>:original`, `photo:<pid>:working` (JPEG ≤ 3000 px, oriented, no metadata), `photo:<pid>:thumb` (≤ 480 px)
- `diagram:<pid>:full-svg`, `diagram:<pid>:full-png`, `diagram:<pid>:cell-svg`
- `artifact:<aid>:png`, `artifact:<aid>:json`

Rules:
- Store bytes as `ArrayBuffer` and rebuild `Blob` on read.
- **Prepare everything before a transaction**; inside it, only await IDB calls, then `await tx.done`.
- Delete by prefix with `IDBKeyRange.bound('<prefix>', '<prefix>￿')`.
- Validate every read with zod; failure → `CorruptRecordError(store, key)`.
- Tests: `fake-indexeddb/auto`, with a unique DB name per test (`openAppDb('asa-test-<n>')`).

## 7. Services

```ts
export interface ServiceContext { db: AppDb; now: () => Date; newId: () => string }
export interface ImageTools {
  makeWorkingImages(blob: Blob, format: ImageFormat): Promise<{ working: Blob; thumb: Blob;
    originalSize: { widthPx: number; heightPx: number }; workingSize: { widthPx: number; heightPx: number; scaleFromOriginal: number } }>;
  toRgba(blob: Blob, maxLongest: number): Promise<RgbaImage>;
}
export interface RenderTools { svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Blob> }
```

| Function | File | Milestone |
|---|---|---|
| `createSession` · `getSession` · `listSessions` · `updateSession(name, sessionDate, notes)` · `deleteSession` (cascade) | `services/sessions.ts` | M04 |
| `ingestPhoto(ctx, input, imageTools)` → photo + `initialAnalysis` + status | `services/ingest.ts` | M04, M08 |
| `updatePhotoMetadata(ctx, photoId, { categorization?, lighting?, notes? })` · `deletePhoto` | `services/photos.ts` | M09 |
| `requestAnalysis(ctx, sessionId)` (sets `analyzeRequestedAt`, confirms lighting on all photos) | `services/photos.ts` | M09 |
| `quickStart(ctx, navigate)` · `quickStartLabel(sessions, now)` | `services/quick-start.ts` | M09 |
| `runStageA(ctx, photoId, cvApi, imageTools)` | `pipeline/stage-a.ts` | M10, M11 |
| `runStageB(ctx, photoId, renderTools)` | `pipeline/stage-b.ts` | M12 |
| `saveAdjustments(ctx, photoId, { calibration?, shots? })` · `redetectShots(ctx, photoId, cvApi)` | `services/adjust.ts` | M13 |
| `buildComposite(ctx, sessionId, renderTools)` · `loadArtifact` | `composite/build.ts` | M14 |
| `recordShare(ctx, sessionId, artifactId, method)` | `services/shares.ts` | M14 |

Every mutating service updates `session.updatedAt` and recomputes `photo.status`/`reasons` with `photoStatus` in the same transaction.
After committing, services call `pipelineHooks.notify()` (`src/lib/pipeline/hooks.ts`; a no-op until the runner is registered in M10).

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
  "analyzeRequestedAt": "2026-09-06T00:01:00.000Z",
  "artifacts": [],
  "shares": [],
  "notes": ""
}
```
