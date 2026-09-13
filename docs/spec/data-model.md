# Spec: data model, workspace layout, API map

Implementation: `src/lib/domain/*.ts` (zod schemas; types are `z.infer`). Every persisted JSON file has
`schemaVersion: 1`. Timestamps: `UtcIso` = ISO-8601 with `Z` (for example `2026-09-05T23:56:03.000Z`).
`LocalDateTime` = `YYYY-MM-DDTHH:mm:ss` with no zone. `Offset` = `+HH:MM` or `-HH:MM`.
`LocalDate` = `YYYY-MM-DD`.

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

Primitives (`src/lib/domain/primitives.ts`): `Id = z.string().uuid()`, `UtcIso`, `LocalDateTime`,
`LocalDate`, and `Offset` as regex-validated strings; `ShotId = z.string().min(1).max(64)`.

## 2. Session (`session.ts`) → `sessions/<id>/session.json`

```ts
export const CompositeSelection = z.object({
  sighting:  z.tuple([Id.nullable(), Id.nullable()]),
  precision: z.tuple([Id.nullable(), Id.nullable()]),
  confirmed: z.boolean(),                 // false = defaults suggested, not yet confirmed by owner
});

export const ShareRecord = z.object({
  id: Id,
  artifactId: Id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: UtcIso,
  method: z.enum(['web-share', 'open-image']),
  garminDescriptionWritten: z.boolean(), // always false unless M21 enabled and used
});

export const GarminActivityRef = z.object({   // optional track (M20/M21)
  activityId: z.string().min(1),
  name: z.string(),
  typeKey: z.string(),
  startTimeLocal: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), // Garmin format, space separator
  durationSec: z.number().nonnegative(),
  distanceM: z.number().nonnegative().nullable(),
  source: z.enum(['demo', 'live']),
  addedBy: z.enum(['user', 'suggestion']),
});

export const GarminLink = z.object({
  activities: z.array(GarminActivityRef),
  primaryActivityId: z.string().nullable(),
});

export const BiathlonSession = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().trim().min(1).max(80),
  sessionDate: LocalDate,
  createdAt: UtcIso,
  updatedAt: UtcIso,
  photoIds: z.array(Id),                   // capture/import order
  compositeSelection: CompositeSelection,
  artifacts: z.array(z.object({ id: Id, sha256: z.string(), widthPx: z.number().int(), heightPx: z.number().int(), createdAt: UtcIso })),
  shares: z.array(ShareRecord),
  notes: z.string().max(2000),
  garmin: GarminLink.nullable(),           // null unless the optional Garmin track is used
});
```

## 3. Photo (`photo.ts`) → `sessions/<sid>/photos/<pid>/photo.json`

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
  calibrationPriorFramePx: Calibration.nullable(), // in FRAME pixels (before working resize)
  trackSettings: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable(),
});

export const ExifMeta = z.object({          // all fields nullable; present only if the original had EXIF
  captureLocal: LocalDateTime.nullable(),
  captureOffset: Offset.nullable(),
  captureUtc: UtcIso.nullable(),
  gpsPresent: z.boolean(),
  gps: z.object({ lat: z.number(), lon: z.number(), altM: z.number().nullable() }).nullable(),
  gpsImgDirection: z.number().nullable(),
  make: z.string().nullable(), model: z.string().nullable(), lens: z.string().nullable(),
  brightnessValue: z.number().nullable(),
  iso: z.number().nullable(), exposureTimeSec: z.number().nullable(), fNumber: z.number().nullable(),
  flashRaw: z.number().int().nullable(), flashFired: z.boolean().nullable(),
  whiteBalance: z.enum(['auto', 'manual']).nullable(),
  widthPx: z.number().int().nullable(), heightPx: z.number().int().nullable(),
});

export const CaptureTime = z.object({
  local: LocalDateTime.nullable(),
  offset: Offset.nullable(),
  utc: UtcIso.nullable(),
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
  athleteName: z.string().max(80).nullable(),
  wind: Wind.nullable(),
  athleteCondition: z.string().max(200).nullable(),
  notes: z.string().max(1000).nullable(),
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
  status: PhotoStatus,
  sourceRetention: z.enum(['kept', 'discarded']),
});
```

**Helpers** (`src/lib/domain/categorization.ts`):
- `isCategorizationComplete(c)`: template and position set; `roundsProne` set if position ∈ {prone, both};
  `roundsStanding` set if position ∈ {standing, both}.
- `declaredRounds(c)`: see geometry-scoring §7. Throws if incomplete.
- `defaultCategorization(template, position)`: precision or sighting → prone {roundsProne 10}, standing
  {roundsStanding 10}; both → {5, 5} (from `BIATHLON_50M.defaults`).
- `nextStatus(categorization, analysis, result)` → `PhotoStatus`. **Always computed by the server** on every
  categorization PATCH and analysis PUT. Clients never set it. First match wins:
  1. categorization incomplete → `uncategorized`
  2. `analysis?.calibration` is null → `categorized`
  3. `result` is null or `result.all.identified === 0` → `calibrated`
  4. any subset has `overcount > 0` → `calibrated`
  5. `totalMissing` = Σ `subset.missing` over `result.subsets`; if `totalMissing === 0` → `reviewed`
     (auto-review: the shot count matches the declared rounds)
  6. `analysis.acceptedMissingCount !== null && totalMissing <= analysis.acceptedMissingCount` → `reviewed`
     (the owner tapped "Accept with N missing")
  7. otherwise → `calibrated`

  Vectors: precision golden fixture with a calibration → `reviewed`; same with P8 multiplicity 1 and
  `acceptedMissingCount` null → `calibrated`; with `acceptedMissingCount` 1 → `reviewed`; accepted 1 but P8
  and P9 removed (missing 3) → `calibrated`; an extra 11th shot → `calibrated` (over-count, even if accepted);
  calibration null → `categorized`; position `both` with roundsStanding null → `uncategorized`.

## 4. Analysis (`analysis.ts`) → `sessions/<sid>/photos/<pid>/analysis.json`

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
  calibration: Calibration.nullable(),     // in WORKING image px
  shots: z.array(Shot),
  pinnedMode: MissingMode.nullable(),
  acceptedMissingCount: z.number().int().min(1).nullable(), // owner accepted this many unaccounted rounds (see nextStatus)
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
export interface PrecisionScore { tally: number[] /* index 0..10 */; xCount: number; identifiedTotal: number;
  maxPossible: number; range: { optimistic: number; pessimistic: number; averaged: number } }
export interface SightingModeOutcome { hits: number; misses: number; mpi: { xMm: number; yMm: number } | null }
export interface SightingOutcome { zoneDiameterMm: 45 | 115 | null /* null for 'all' of both */; hits: number; clean: number; misses: number;
  range: { optimistic: SightingModeOutcome; pessimistic: SightingModeOutcome; averaged: SightingModeOutcome } }
export interface SubsetResult { key: 'prone' | 'standing' | 'all'; declared: number; identified: number; missing: number;
  overcount: number; units: UnitResult[]; mpi: { xMm: number; yMm: number } | null; extremeSpreadMm: number | null;
  extremeSpreadAngular: Angular | null; meanRadiusMm: number | null; mpiOffset: MpiOffset | null;
  groupEllipse: GroupEllipse | null; precision: PrecisionScore | null; sighting: SightingOutcome | null;
  warnings: Array<'overcount'> }
export interface AnalysisResult { engineVersion: string; template: 'sighting' | 'precision'; position: 'prone' | 'standing' | 'both';
  subsets: SubsetResult[] /* one per position present; for both: [prone, standing] */; all: SubsetResult }
```

## 5. Config → `config.json` (workspace root)

```ts
export const AppConfig = z.object({
  schemaVersion: z.literal(1),
  profileOverrides: z.object({ clickValueMm: z.number().positive().nullable(), holeDiameterMm: z.number().positive() }),
  garmin: z.object({ rememberedEmail: z.string().email().nullable() }),
});
// default: { schemaVersion: 1, profileOverrides: { clickValueMm: null, holeDiameterMm: 5.6 }, garmin: { rememberedEmail: null } }
```

## 6. Workspace layout (`src/lib/workspace/paths.ts`)

```text
$ASA_WORKSPACE_DIR/                         default ~/.advanced-shooting-analysis ; Docker: /data
  config.json
  sessions/<sessionId>/session.json
  sessions/<sessionId>/photos/<photoId>/photo.json
  sessions/<sessionId>/photos/<photoId>/original.(jpg|png|heic)
  sessions/<sessionId>/photos/<photoId>/working.jpg     auto-oriented, longest side <= 3000 px, q90, no metadata
  sessions/<sessionId>/photos/<photoId>/thumb.jpg       longest side 480 px, q80, no metadata
  sessions/<sessionId>/photos/<photoId>/analysis.json
  sessions/<sessionId>/diagrams/<photoId>-full.svg | -full.png | -cell.svg
  sessions/<sessionId>/exports/<artifactId>.png | <artifactId>.json
```

- All writes are atomic: write `<file>.tmp-<random>` in the same dir, then `rename`.
- Every path is built only through `paths.ts` functions, which validate ids with `Id.parse`, so path traversal is impossible.

## 7. HTTP API map

Errors: `{ "error": { "code": "<snake_case>", "message": "<human text>" } }` with a matching status
(400 validation, 401 unauthenticated, 403 cross-origin, 404 not found, 409 conflict, 413 too large,
429 rate limited, 500 internal). All handlers: `runtime = 'nodejs'`.

| Method & path | Milestone | Body / result |
|---|---|---|
| GET `/api/health` | M01 | `{ ok, libs }` (public) |
| POST `/api/auth/login` · POST `/api/auth/logout` | M05 | `{ passphrase }` → sets or clears cookie |
| GET · POST `/api/sessions` | M04 | list · `{ name, sessionDate? }` → session |
| GET · PATCH · DELETE `/api/sessions/:sid` | M04 | PATCH `{ name?, notes?, sessionDate? }` |
| POST `/api/sessions/:sid/photos` | M04, M09 | multipart: `file`, `origin`, `clientLocal`, `clientOffset`, `capture?` (JSON), `categorization?` (JSON) → photo (max 25 MB) |
| GET `/api/sessions/:sid/photos` | M04 | photo[] |
| GET · PATCH · DELETE `/api/sessions/:sid/photos/:pid` | M04, M10 | PATCH `{ categorization?, lighting?, sheet? }` (status is recomputed, never accepted) |
| GET `/api/sessions/:sid/photos/:pid/working` · `/thumb` | M04 | image/jpeg, `Cache-Control: private, no-store` |
| GET · PUT `/api/sessions/:sid/photos/:pid/analysis` | M11 | PUT `{ calibration, shots, pinnedMode, acceptedMissingCount }` → `{ analysis, status }` |
| POST `/api/sessions/:sid/photos/:pid/analysis/auto-calibrate` | M12 | → `{ calibration }` (not saved) |
| POST `/api/sessions/:sid/photos/:pid/analysis/auto-detect` | M13 | → `{ shots }` (not saved) |
| GET `/api/sessions/:sid/photos/:pid/diagram?variant=full\|cell&format=svg\|png` | M11 | image |
| GET · PUT `/api/sessions/:sid/composite-selection` | M14 | CompositeSelection |
| POST `/api/sessions/:sid/composite` | M14 | → `{ artifactId, widthPx, heightPx, sha256 }` |
| GET `/api/sessions/:sid/composite/:artifactId` | M14 | image/png (only registered artifacts) |
| POST `/api/sessions/:sid/shares` | M15 | `{ artifactId, method }` → ShareRecord |
| POST `/api/sessions/:sid/sources` | M15 | `{ action: 'keep' \| 'discard', photoIds?: Id[] }` |
| GET `/api/harness/shooting?from&to` | M17 | trends |
| `/api/garmin/*`, `/api/sessions/:sid/garmin*` | M20–M21 | see spec/garmin-optional.md §5 |

## 8. Example `session.json`

```json
{
  "schemaVersion": 1,
  "id": "6f1d7c1e-3b1e-4f5e-9a3e-1c2d3e4f5a6b",
  "name": "Roller-ski + range",
  "sessionDate": "2026-09-05",
  "createdAt": "2026-09-05T23:40:00.000Z",
  "updatedAt": "2026-09-06T00:05:00.000Z",
  "photoIds": ["0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d"],
  "compositeSelection": { "sighting": [null, null], "precision": ["0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d", null], "confirmed": false },
  "artifacts": [],
  "shares": [],
  "notes": "",
  "garmin": null
}
```
