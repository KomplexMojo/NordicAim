# M09: Photo metadata and lighting

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M04 | low | M | sessions-categorize (EXIF, lighting suggestion) |

## Goal
Every uploaded photo gets EXIF (when present), resolved capture time, image stats, and a lighting suggestion.
The owner can confirm or override the lighting.

## Read first
- `docs/spec/metadata-lighting.md` §1–§4
- `fixtures/reference/IMG_5057.exif.json`, `IMG_5132.exif.json`

## In scope
`exif.ts`, `image-stats.ts`, `lighting.ts`; wiring into the upload route; PATCH lighting.

## Out of scope
UI (M10).

## Files
- `src/lib/media/exif.ts`, `image-stats.ts`, `lighting.ts`
- Update `src/app/api/sessions/[sessionId]/photos/route.ts` (POST) and `[photoId]/route.ts` (PATCH `lighting`)
- `tests/unit/media/exif.test.ts`, `image-stats.test.ts`, `lighting.test.ts`

## Steps
1. `readExif` per §1, handling both exif-reader key styles.
2. `computeImageStats` per §3.
3. `estimateBrightnessValue` and `suggestLighting` per §4, rules in exact order.
4. Upload route: after ingest, `exif = await readExif(original, format)`;
   `captureTime = resolveCaptureTime({ exif, origin, clientLocal, clientOffset })`;
   `imageStats = await computeImageStats(working)`; suggestion from
   `{ bv: exif?.brightnessValue ?? estimateBrightnessValue(exif ?? {…nulls}), flashFired: exif?.flashFired ?? null, localHour, stats }`;
   `lighting = suggestion.label`; `lightingConfirmed = false`.
5. PATCH `{ lighting }` sets `lighting` and `lightingConfirmed = true`.
6. Never write GPS values to logs. GPS is stored in `photo.json` only (it's the owner's own server).

## Tests
- Every lighting vector in §4 (label and confidence exact).
- `estimateBrightnessValue` vector.
- Image stats synthetic vector (§3).
- Private (skip if absent): `readExif` on both HEICs matches the sidecar `exif` for every non-GPS key, and
  `gpsPresent === true`. The test must **not** print GPS values: compare with `expect(exif.gps).not.toBeNull()` only.
- `readExif` on a PNG made with sharp → `null`.
- Upload route with the reference JPEG (no EXIF), origin `camera-overlay`, clientLocal `2026-09-05T16:56:03`,
  offset `-07:00` → `captureTime.source 'client-clock'`, `utc '2026-09-05T23:56:03.000Z'`, lighting
  `daylight` 0.5 (hour 16, reference image not warm), or whatever `suggestLighting` returns for its actual
  stats. Assert equality with a direct `suggestLighting` call.

## Acceptance
```bash
pnpm check
```

## Pitfalls
- exif-reader `DateTimeOriginal`: take `toISOString().slice(0, 19)` (spec §1.3). Don't call `toLocaleString`.
- `Flash` 16 is **not fired**; use `& 1`.
- `ISOSpeedRatings` may be an array.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
