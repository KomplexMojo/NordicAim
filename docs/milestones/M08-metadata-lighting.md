# M08: Pull photo metadata and lighting

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M04 | low | M | pull photo metadata |

## Goal
Every ingested photo gets EXIF (when readable), resolved capture time, image stats, and a lighting suggestion. This is
pipeline step A2, done inside `ingestPhoto`.

## Read first
- `docs/spec/metadata-lighting.md` §1–§4
- `docs/spec/analysis-pipeline.md` §2 (A2)
- `fixtures/reference/IMG_5057.exif.json`, `IMG_5132.exif.json`, `exif-sample.jpg`

## In scope
`exif.ts`, `image-stats.ts`, `lighting.ts`; extending `ingestPhoto`.

## Out of scope
The metadata screen (M09).

## Files
- `src/lib/media/exif.ts`, `image-stats.ts`, `lighting.ts`
- `src/lib/services/ingest.ts` (extend)
- `tests/helpers/stub-image-tools.ts` (configurable `toRgba`)
- `tests/unit/media/exif.test.ts`, `image-stats.test.ts`, `lighting.test.ts`, `tests/unit/services/ingest.test.ts` (extend)

## Steps
1. `readExif` per §1 (exact exifr options; catch → null).
2. `computeImageStats` per §3.
3. `estimateBrightnessValue` and `suggestLighting` per §4 (rule order exact).
4. Extend `ingestPhoto` **before** the transaction:
   - `exif = await readExif(bytes)`
   - `captureTime = resolveCaptureTime({ exif, origin, clientLocal, clientOffset })`
   - `stats = computeImageStats(await imageTools.toRgba(working, 256))`
   - `localHour` from `captureTime.local`
   - `suggestion = suggestLighting({ bv: exif?.brightnessValue ?? estimateBrightnessValue(...), flashFired: exif?.flashFired ?? null, localHour, stats })`
   - `lighting = suggestion.label`; `lightingConfirmed = false`.
5. Never log GPS values.

## Tests
- All lighting vectors and the BV estimate.
- Image stats vector (meanLuma 113.51; brightMean 250/200/150).
- `readExif(exif-sample.jpg)` matches the §1 table; `tiny-sighting.heic` → null; random bytes → null.
- Private (skip if absent): `IMG_5132.HEIC` → null or matching the sidecar's non-GPS fields (never print GPS).
- Ingest: `exif-sample.jpg` bytes as origin `import` → `source 'exif'`, utc `2026-09-05T23:56:03.000Z`, `daylight` 0.9;
  camera-overlay without EXIF at 16:56 local with non-warm stats → `client-clock`, `daylight` 0.5.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- `reviveValues: false` is mandatory.
- `Flash` 16 = not fired.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
