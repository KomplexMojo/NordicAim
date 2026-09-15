# M08: Photo metadata and lighting

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M04 | low | M | sessions-categorize (EXIF, lighting suggestion) |

## Goal
Every ingested photo gets EXIF (when readable), resolved capture time, image stats, and a lighting suggestion.

## Read first
- `docs/spec/metadata-lighting.md` §1–§4
- `fixtures/reference/IMG_5057.exif.json`, `IMG_5132.exif.json`, `exif-sample.jpg`

## In scope
`exif.ts`, `image-stats.ts`, `lighting.ts`; extending `ingestPhoto`.

## Out of scope
UI for confirming lighting (M09).

## Files
- `src/lib/media/exif.ts`, `image-stats.ts`, `lighting.ts`
- `src/lib/services/ingest.ts` (extend)
- `tests/helpers/stub-image-tools.ts` (extend `toRgba` to return a configurable `RgbaImage`)
- `tests/unit/media/exif.test.ts`, `image-stats.test.ts`, `lighting.test.ts`, `tests/unit/services/ingest.test.ts` (extend)

## Steps
1. `readExif` per §1 (exifr options exactly as specified; catch → null).
2. `computeImageStats` per §3 (pure).
3. `estimateBrightnessValue` and `suggestLighting` per §4, rules in exact order.
4. Extend `ingestPhoto`, **before** the transaction:
   - `exif = await readExif(bytes)`
   - `captureTime = resolveCaptureTime({ exif, origin, clientLocal, clientOffset })`
   - `stats = computeImageStats(await imageTools.toRgba(workingBlob, 256))`
   - `localHour = captureTime.local ? Number(captureTime.local.slice(11, 13)) : null`
   - `suggestion = suggestLighting({ bv: exif?.brightnessValue ?? estimateBrightnessValue({ fNumber: exif?.fNumber ?? null, exposureTimeSec: exif?.exposureTimeSec ?? null, iso: exif?.iso ?? null }), flashFired: exif?.flashFired ?? null, localHour, stats })`
   - `lighting = suggestion.label`, `lightingConfirmed = false`.
5. Never log GPS values.

## Tests
- All lighting vectors (label and confidence exact) and the BV estimate vector.
- Image stats vector (113.51; brightMean 250/200/150).
- `readExif(fixtures/reference/exif-sample.jpg)` matches the §1 table; `tiny-sighting.heic` → null; random bytes → null.
- Private (skip if absent): `IMG_5132.HEIC` → null or matching the sidecar's non-GPS fields (never print GPS).
- Ingest (stub tools): a JPEG blob with the `exif-sample.jpg` bytes, origin `import` → `captureTime.source 'exif'`,
  utc `2026-09-05T23:56:03.000Z`, lighting `daylight` 0.9. A camera-overlay frame without EXIF, clientLocal
  `2026-09-05T16:56:03`, stub stats (not warm) → `client-clock`, `daylight` 0.5.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- Never let `exifr` revive dates (`reviveValues: false`); a revived `Date` shifts by the device timezone.
- `Flash` 16 means not fired (`& 1`).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
