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
None blocking. One note: `exif.ts`'s `captureUtc` is computed only from `captureLocal` + `captureOffset` (null
when either is missing) — `resolveCaptureTime` is what applies the `clientOffset` fallback per §2.2, so this
matches the spec's priority order, not a gap.

## Completion notes
- Implemented `src/lib/media/exif.ts` (`readExif`, exifr with `reviveValues: false`/`translateValues: false`,
  raw `DateTimeOriginal` string parsing, GPS DMS→decimal, `Flash` bit 0 = fired), `src/lib/media/image-stats.ts`
  (`computeImageStats`, luma-sorted top-20% bright mean), `src/lib/media/lighting.ts`
  (`estimateBrightnessValue`, `suggestLighting` with the exact rule order/reason codes from §4).
- Extended `ingestPhoto` (`src/lib/services/ingest.ts`) to call `readExif` on the original bytes, compute
  `imageStats` via `imageTools.toRgba(working, 256)` before the transaction, derive `bv`/`localHour`, and set
  `lightingSuggestion`/`lighting`/`lightingConfirmed` per the spec. Added `toRgba` to the `ImageTools` interface
  (already implemented in `image-browser.ts` from M04/M06).
- Extended `tests/helpers/stub-image-tools.ts` with a configurable `toRgba` (default: flat neutral-gray 2x2,
  not warm) so ingest tests can control the lighting suggestion's `stats` input.
- Tests added: `tests/unit/media/exif.test.ts`, `image-stats.test.ts`, `lighting.test.ts` (all vectors from
  §1/§3/§4, including the private `IMG_5132.HEIC` check — `fixtures/private/` is present on this machine;
  `readExif` returns `null` for it, which is expected per PLAN F2/§1 note ("`exifr` fails on some iPhone HEIC
  originals")); extended
  `tests/unit/services/ingest.test.ts` with the two ingest vectors from the milestone (`exif-sample.jpg` as
  `import` → `source: 'exif'`, daylight 0.9; `camera-overlay` with no EXIF at 16:56 local, non-warm stats →
  `client-clock`, daylight 0.5).
- Commands run (from a clean working tree, orchestration override — no commit/push):
  - `pnpm typecheck` — pass
  - `pnpm lint` — pass (0 errors; 4 pre-existing warnings unrelated to this milestone)
  - `pnpm test` — pass (37 files, 310 tests)
  - `pnpm check:privacy` — pass (15 images)
  - `pnpm check` — pass (all of the above)
- No deviations from the spec.
