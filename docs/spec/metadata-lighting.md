# Spec: ingest, photo metadata, capture time, image stats, lighting

Implementation: `src/lib/media/{ingest,exif,capture-time,image-stats,lighting}.ts` (server) and
`src/lib/capture/client-time.ts` (browser).

## 0. Ingest (`ingest.ts`)

```ts
export type ImageFormat = 'jpeg' | 'png' | 'heic';
export function detectFormat(buf: Buffer): ImageFormat | null;
// jpeg: bytes FF D8 FF ; png: 89 50 4E 47 0D 0A 1A 0A ;
// heic: bytes 4..8 === 'ftyp' AND brand (bytes 8..12) in ['heic','heix','hevc','hevx','mif1','msf1']
export async function makeWorkingImages(buf: Buffer, format: ImageFormat): Promise<{
  workingJpeg: Buffer;
  thumbJpeg: Buffer;
  originalSize: { widthPx: number; heightPx: number };          // after auto-orientation
  workingSize: { widthPx: number; heightPx: number; scaleFromOriginal: number };
}>;
```

Pipeline: if `heic`, decode with `heic-convert` (`format: 'JPEG', quality: 0.95`) to a JPEG buffer first.
Then `sharp(input).rotate()` (auto-orient; **must** come before any resize or re-encode), resize so the
longest side ≤ 3000 (`withoutEnlargement`), `.jpeg({ quality: 90 })` gives `working.jpg`. The thumb uses
longest side 480 at q80. sharp drops metadata by default, so keep it that way.
`scaleFromOriginal = working.longest / oriented original longest`.

Vectors: `detectFormat` on the first 16 bytes of each format → the right format; random bytes → `null`.
Private-fixture test (skip if absent): `IMG_5057.HEIC` → working 2250×3000, thumb 360×480.

## 1. EXIF for originals that have it (`exif.ts`)

```ts
export async function readExif(buf: Buffer, format: ImageFormat): Promise<ExifMeta | null>;
```

1. `const meta = await sharp(buf).metadata()`. If `!meta.exif`, return `null` (typical for PNG and in-app captures).
2. `const e = exifReader(meta.exif)`. Accept both key-name styles: `e.Photo ?? e.exif`, `e.Image ?? e.image`,
   `e.GPSInfo ?? e.gps`.
3. **Wall clock pitfall**: `DateTimeOriginal` is a `Date` whose *UTC fields* hold the local wall clock, so
   `captureLocal = d.toISOString().slice(0, 19)`.
4. `captureOffset = Photo.OffsetTimeOriginal ?? null` (validate `^[+-]\d{2}:\d{2}$`).
5. `captureUtc` = `captureLocal` interpreted at `captureOffset` → ISO with `Z`; `null` if no offset.
6. GPS: `GPSLatitude` is `[deg, min, sec]` → `deg + min/60 + sec/3600`, negated when `GPSLatitudeRef === 'S'`
   (lon: `'W'`). `gpsPresent = lat != null`. `altM = GPSAltitude` (negate if `GPSAltitudeRef === 1`).
7. `flashRaw = Photo.Flash`; `flashFired = (flashRaw & 1) === 1`. Value 16 means **not fired**.
8. `whiteBalance`: 0 → `auto`, 1 → `manual`.
9. `brightnessValue = Photo.BrightnessValue`, `iso = Photo.ISOSpeedRatings` (first element if array),
   `exposureTimeSec = Photo.ExposureTime`, `fNumber = Photo.FNumber`, `lens = Photo.LensModel`,
   `make/model` from `Image`, `gpsImgDirection = GPSInfo.GPSImgDirection`,
   `widthPx/heightPx = meta.width/height`.

**Vectors**: compare against the committed GPS-free sidecars `fixtures/reference/IMG_5057.exif.json` and
`IMG_5132.exif.json` (private-fixture tests; skip if the HEIC is absent). Every non-GPS field must match
(numbers ±1e-9). `gpsPresent` must be `true`. **Never** write `gps` values into fixtures, snapshots, or logs.

## 2. Capture time

### 2.1 Browser (`client-time.ts`)

```ts
export function clientNow(d = new Date()): { clientLocal: string; clientOffset: string };
export function formatOffset(tzOffsetMinutes: number): string;
// NOTE: Date.getTimezoneOffset() is POSITIVE west of UTC. Vectors: 420 → "-07:00"; 0 → "+00:00"; -330 → "+05:30"; -345 → "+05:45"
```

`clientLocal` is built from `getFullYear()`, `getMonth()+1`, `getDate()`, `getHours()`, `getMinutes()`,
`getSeconds()` as `YYYY-MM-DDTHH:mm:ss`.

### 2.2 Server (`capture-time.ts`)

```ts
export function resolveCaptureTime(input: { exif: ExifMeta | null; origin: PhotoOrigin; clientLocal: string; clientOffset: string }): CaptureTime;
export function localToUtc(local: string, offset: string): string; // "2026-09-05T16:56:03","-07:00" → "2026-09-05T23:56:03.000Z"
```

Priority:
1. `exif.captureLocal` present → `{ local, offset: exif.captureOffset ?? clientOffset, source: 'exif' }`
2. origin `camera-overlay` or `camera-native` → client values, `source: 'client-clock'`
3. otherwise → client values, `source: 'import-time'`

`utc = localToUtc(local, offset)`.

Vectors: `localToUtc("2026-08-24T19:30:09","-07:00")` → `"2026-08-25T02:30:09.000Z"`;
`localToUtc("2026-01-01T00:30:00","+05:30")` → `"2025-12-31T19:00:00.000Z"`.

## 3. Image stats (`image-stats.ts`)

```ts
export async function computeImageStats(workingJpeg: Buffer): Promise<ImageStats>;
```

`sharp(buf).resize(256, 256, { fit: 'inside' }).removeAlpha().raw()`. For each pixel,
`luma = 0.2126R + 0.7152G + 0.0722B`. `meanLuma` = mean luma. Sort by luma and take the brightest 20%
(`ceil(0.2 × n)` pixels; ties by index). `brightMean{R,G,B}` = mean channel values of that set.
Values are 0–255 and not rounded.

Vector (synthetic, generated in the test with sharp): a 100×100 image, left half `rgb(250,200,150)`, right
half `rgb(20,20,20)` → brightMean ≈ (250, 200, 150) ±1; meanLuma ≈ 110.29 ±1.

## 4. Lighting suggestion (`lighting.ts`)

```ts
export function estimateBrightnessValue(e: { fNumber: number | null; exposureTimeSec: number | null; iso: number | null }): number | null;
// all present → log2(N²) + log2(1/t) − log2(ISO / 3.125) ; else null
export function suggestLighting(input: { bv: number | null; flashFired: boolean | null; localHour: number | null; stats: ImageStats | null }): LightingSuggestion;
```

Inputs: `bv = exif?.brightnessValue ?? estimateBrightnessValue(exif) ?? null`;
`localHour = Number(captureTime.local.slice(11, 13))` or null;
`warm = stats != null && stats.brightMeanR / Math.max(stats.brightMeanB, 1) > 1.15`;
`nightHour(h) = h >= 21 || h < 5`; `dayHour(h) = h >= 8 && h < 18`.

Rules (first match wins; `reasons` are the codes in brackets):

| # | Condition | Result |
|---|---|---|
| 1 | bv null **and** localHour null **and** stats null | `unknown`, 0, [`no-signals`] |
| 2 | flashFired === true | `artificial`, 0.7, [`flash`] |
| 3a | bv ≥ 4 and nightHour | `mixed`, 0.4, [`bright`, `night-hour`] |
| 3b | bv ≥ 4 | `daylight`, 0.9, [`bright`] |
| 3c | bv < 0 and warm | `artificial`, 0.6, [`dark`, `warm-cast`] |
| 3d | bv < 0 | `night`, 0.6, [`dark`] |
| 3e | 0 ≤ bv < 4 and warm | `artificial`, 0.6, [`dim`, `warm-cast`] |
| 3f | 0 ≤ bv < 4 | `mixed`, 0.4, [`dim`] |
| 4a | bv null, localHour null | warm → `artificial` 0.4 [`warm-cast`]; else `unknown` 0 [`no-exposure`] |
| 4b | bv null, dayHour | warm → `mixed` 0.3 [`day-hour`, `warm-cast`]; else `daylight` 0.5 [`day-hour`] |
| 4c | bv null, nightHour | warm → `artificial` 0.5 [`night-hour`, `warm-cast`]; else `mixed` 0.3 [`night-hour`] |
| 4d | bv null (dawn/dusk hours) | `mixed`, 0.3, [`twilight-hour`] |

In-app captures have no EXIF, so they always go through rows 4a–4d. On import the photo is saved with
`lighting = suggestion.label` and `lightingConfirmed = false`. The categorize UI asks the owner to confirm or override.

**Vectors**

| Input | Expected |
|---|---|
| bv 5.568700362668135, flash false, hour 19 (IMG_5057 sidecar) | daylight 0.9 |
| bv 9.714420456927268, flash false, hour 16 (IMG_5132 sidecar) | daylight 0.9 |
| bv 1.2, hour 20, warm | artificial 0.6 |
| bv −2.5, hour 23, not warm | night 0.6 |
| bv 6, hour 23 | mixed 0.4 |
| flash true, bv 8 | artificial 0.7 |
| bv 2, hour 13, not warm | mixed 0.4 |
| bv null, hour 14, not warm | daylight 0.5 |
| bv null, hour 22, warm | artificial 0.5 |
| bv null, hour 19, not warm | mixed 0.3 |
| bv null, hour null, stats null | unknown 0 |
| `estimateBrightnessValue({ fNumber: 2.2, exposureTimeSec: 0.010101010101010102, iso: 64 })` | 4.5482 ±1e-3 |
