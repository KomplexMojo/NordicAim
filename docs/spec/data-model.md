# Spec: data model, on-device storage, services

Implementation: `src/lib/domain/*.ts` (zod schemas; types are `z.infer`), `src/lib/store/*` (IndexedDB),
`src/lib/services/*`, `src/lib/pipeline/*`. Every persisted record has `schemaVersion: 1`, except `BiathlonSession`, which REV-38 (M19) raised to **2** when it gained the backing fields and REV-48 (M22) raised to **3** when they moved to `AppSettings` (`backing-sheet.md` §3, §3a).

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
  // REV-38 (M19) raised this to 2 (session backing fields); REV-48 (M22) raised it to 3 when they moved to
  // AppSettings (§5). Migration: backing-sheet.md §3a.
  schemaVersion: z.literal(3),
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
  // REV-48: no backing fields. The backing is a Settings choice for every session (§5, backing-sheet.md §2).
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
  // REV-44 (M18): the target plane's vanishing line, in target mm. null = the sheet was square on, which is
  // exactly the pre-M18 behaviour. Applied BEFORE the ellipse map:
  //   mmToPx(p) = ellipse( p / (perspective.p * p.xMm + perspective.q * p.yMm + 1) )
  // No migration: null computes bit-for-bit what the app computed before, so every stored TargetAnalysis keeps
  // its numbers until re-analysed, and a source: 'manual' calibration is never rewritten (analysis-pipeline §8).
  // A manual handle drag in Adjust KEEPS this; only "reset alignment" clears it.
  perspective: z.object({ p: z.number(), q: z.number() }).nullable().default(null),
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
  // REV-67: for a sighting target, whether it is the initial sight-in or the confirm. absent or null = not chosen, inferred by order.
  sightingRole: z.enum(['sight-in', 'confirm']).nullable().optional(),
  // REV-79: the UI now sets template, position, rounds and role together from one target kind (`domain/target-kind.ts`); `position: 'both'`
  // is no longer offered but stored values still read.
});

export const TargetPhoto = z.object({
  schemaVersion: z.literal(1),
  id: Id, sessionId: Id,
  origin: PhotoOrigin,                   // REV-38 added `backing-card`; since REV-48 nothing new is written with it (`backing-sheet.md` §3)
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
- ~~`defaultCategorization`~~ removed (REV-92): `categorizationForKind(kind)` in `domain/target-kind.ts` (REV-79) gives the default rounds per kind.
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
  possibleOverlap: z.boolean().default(false),              // REV-38 (backing-sheet.md §5.5)
  overlapRatio: z.number().nonnegative().optional(),        // REV-39 (M20): hole area / the photo's median hole area
  inferred: z.literal('double-punch').optional(),           // REV-39 (M20): multiplicity - 1 rounds were inferred
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
// REV-39 (M20): definite scores — the optimistic / pessimistic / averaged `range` was removed.
export interface PrecisionScore { tally: number[]; xCount: number; identifiedTotal: number; maxPossible: number }
export interface SightingOutcome { zoneDiameterMm: 45 | 115 | null; hits: number; clean: number; misses: number }
export interface SubsetResult { key: 'prone' | 'standing' | 'all'; declared: number; identified: number; missing: number;
  overcount: number; units: UnitResult[]; mpi: { xMm: number; yMm: number } | null; extremeSpreadMm: number | null;
  extremeSpreadAngular: Angular | null; meanRadiusMm: number | null; accuracyRmseMm: number | null; mpiOffset: MpiOffset | null;
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
  // REV-48: the backing setting itself, for every session (`backing-sheet.md` §2, §3). `backing.cardPhotoId`
  // is always null: the card photo is not kept, only its measured colour.
  backingMode: BackingMode,              // 'auto' | 'none' | 'coloured'
  backing: BackingSheet.nullable(),
  // REV-56: how a hole is scored (`geometry-scoring.md` §3). Both default when absent, so older rows read back.
  scoringRule: z.enum(['gauge', 'centre', 'visible']).default('gauge'),
  handedness: z.enum(['right', 'left']).default('right'), // REV-88
  athleteName: z.string().max(40).default(''), // REV-99: Settings → Athlete; free text, trimmed
  athleteClub: z.string().max(60).default(''), // REV-99: the ski club
  visibleHoleDiameterMm: z.number().min(2).max(5.6).default(4.5), // provisional
  // REV-58: which diagram renderer last drew every stored diagram (`rendering-composite.md` §6). Behind the code's
  // DIAGRAM_RENDERER_VERSION at app start means every finished analysis goes back to Stage B once.
  diagramRendererVersion: z.number().int().min(0).default(0),
  // Owner instruction, 2026-09-26: the raw-hole-count safety net (§8 below). Defaults for older rows so they read back.
  maxPlausibleHoles: z.number().int().positive().default(10),
});
// default: { schemaVersion 1, key 'app', profileOverrides { holeDiameterMm: 5.6 }, persistRequested false, persisted null,
//            backingMode 'auto', backing null, scoringRule 'gauge', visibleHoleDiameterMm 4.5, maxPlausibleHoles 10 }
```

- **Hole size** (REV-47 Settings screen): `profileOverrides.holeDiameterMm` is editable in Settings, **2–12 mm**, reset to
  **5.6** (.22 LR). It feeds detection and scoring; changing it re-runs and re-scores nothing already stored.
- **Scoring rule** (REV-56): `scoringRule` and `visibleHoleDiameterMm`, chosen in Settings. Unlike the hole size and the backing,
  which change *detection*, the rule only changes how the same shots are *read*, so **changing it re-scores every stored session**
  (marks `stageB` pending; shots and alignment are never touched, and each session's summary rebuilds).
- **Migration (REV-48).** A settings row written by REV-38 carries `lastBackingMode` / `lastBacking`; on read they are
  copied to `backingMode` / `backing` (the schema version stays 1, as REV-38's own additions did). A row with neither
  reads as `'auto'` / `null`.

## 6. IndexedDB schema (`src/lib/store/db.ts`)

Database `asa`, version **1**, opened with `idb`'s `openDB`.

| Store | Key | Indexes | Value |
|---|---|---|---|
| `sessions` | keyPath `id` | `by-updatedAt`, `by-sessionDate` | `BiathlonSession` |
| `photos` | keyPath `id` | `by-sessionId` | `TargetPhoto` |
| `analyses` | keyPath `photoId` | — | `TargetAnalysis` |
| `blobs` | out-of-line string key | — | `StoredBlob { bytes: ArrayBuffer; contentType: string; sizeBytes: number; createdAt: UtcIso }` |
| `secrets` | `key` (`'provenance'`) | — | `{ key, keyB64 }` — the derived provenance key (REV-100, `provenance.md`). Database version 2. **Never in a backup**; the passphrase is never stored. |
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
| `createSession` · `getSession` · `listSessions` · `updateSession(name, sessionDate, notes)` · `previewSessionDeletion` · `deleteSession` (cascade, REV-61: removes the session, its photos, analyses, `photo:*`/`diagram:*` blobs and the session's `artifact:*` blobs, working from raw records so an unreadable one is still removed; returns a `SessionDeletionReport`) | `services/sessions.ts` | M04 |
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
  "schemaVersion": 3,
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
