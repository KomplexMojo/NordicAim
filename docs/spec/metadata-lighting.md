# Spec: ingest, photo metadata, capture time, image stats, lighting

Pure: `src/lib/media/{format,capture-time,image-stats,lighting}.ts`. Browser adapters:
`src/lib/media/image-browser.ts`. EXIF: `src/lib/media/exif.ts` (uses `exifr`, which runs in both Node and browser).

## 0. Ingest

### 0.1 Format detection and sizing (pure, `format.ts`)

```ts
export type ImageFormat = 'jpeg' | 'png' | 'heic';
export function detectFormat(bytes: Uint8Array): ImageFormat | null;
// jpeg: FF D8 FF ; png: 89 50 4E 47 0D 0A 1A 0A ;
// heic: bytes 4..8 === 'ftyp' AND bytes 8..12 in ['heic','heix','hevc','hevx','mif1','msf1']
export function fitLongest(w: number, h: number, maxLongest: number): { w: number; h: number; scale: number };
// scale = min(1, maxLongest / max(w,h)); w,h = Math.round(w*scale), Math.round(h*scale)
export interface RgbaImage { data: Uint8ClampedArray; width: number; height: number }
```

Vectors:
- `fitLongest(4032, 3024, 3000)` → {3000, 2250, 0.744048 (±1e-6)}
- `fitLongest(1080, 1920, 3000)` → {1080, 1920, 1}
- `fitLongest(3024, 4032, 480)` → {360, 480, 0.119048}
- `fitLongest(1200, 1600, 480)` → {360, 480, 0.3}
- `detectFormat`: the first 16 bytes of each format → that format; `fixtures/reference/tiny-sighting.heic` → `heic`; random bytes → `null`.

### 0.2 Browser adapter (`image-browser.ts`) → implements `ImageTools` (data-model §7)

```ts
export async function loadImage(blob: Blob): Promise<HTMLImageElement>;
// URL.createObjectURL → new Image() → img.src → await img.decode() → revoke URL in finally.
// drawImage of an <img> applies EXIF orientation in current Safari/Chrome.
export async function makeWorkingImages(blob: Blob, format: ImageFormat): Promise<...>; // ImageTools signature
// img → fitLongest(naturalWidth, naturalHeight, 3000) → canvas → toBlob('image/jpeg', 0.9) = working
// thumb: fitLongest(…, 480) → toBlob('image/jpeg', 0.8)
export async function toRgba(blob: Blob, maxLongest: number): Promise<RgbaImage>; // canvas.getImageData
```

- HEIC: Safari on iOS/macOS decodes HEIC natively. Other browsers fail to decode, so throw
  `UnsupportedOnThisBrowserError('heic')` with the message "HEIC photos can only be opened in Safari on iPhone
  or Mac". The iOS photo picker usually hands over JPEG anyway.
- Never create a canvas larger than 16,000,000 px (working ≤ 3000 px guarantees this).
- Canvas re-encoding produces JPEGs **without metadata**.

## 1. EXIF (imports and native-camera files only, `exif.ts`)

```ts
export async function readExif(input: Blob | Uint8Array): Promise<ExifMeta | null>;
```

1. `const e = await exifr.parse(input, { tiff: true, exif: true, gps: true, reviveValues: false, translateValues: false, mergeOutput: true })`.
   Any throw, or `e` undefined → return `null`. `exifr` fails on some iPhone HEIC originals (PLAN F2); this is expected.
2. **Raw date strings** (because `reviveValues: false`): `DateTimeOriginal` = `"YYYY:MM:DD HH:mm:ss"` →
   `captureLocal = "YYYY-MM-DDTHH:mm:ss"` (replace the first two `:` with `-` and the space with `T`). **Never** let a
   library turn this into a `Date`; that applies the device timezone.
3. `captureOffset = OffsetTimeOriginal` if it matches `^[+-]\d{2}:\d{2}$`, else null. `captureUtc = localToUtc(...)` or null.
4. GPS: if `GPSLatitude` is an array `[d, m, s]` → `d + m/60 + s/3600`, negated when `GPSLatitudeRef === 'S'`
   (longitude: `'W'`). `gpsPresent = lat != null`. `altM = GPSAltitude` (negate if `GPSAltitudeRef === 1`).
5. `flashRaw = Flash`; `flashFired = (Flash & 1) === 1` (16 = **not fired**). `whiteBalance`: 0 → `auto`, 1 → `manual`.
6. `iso = ISO ?? ISOSpeedRatings` (first element if array); `exposureTimeSec = ExposureTime`; `fNumber = FNumber`;
   `brightnessValue = BrightnessValue`; `make = Make`; `model = Model`; `lens = LensModel`;
   `gpsImgDirection = GPSImgDirection`; `widthPx = ExifImageWidth ?? null`; `heightPx = ExifImageHeight ?? null`.

**Vectors** (`fixtures/reference/exif-sample.jpg`: a 300×400 metadata-controlled JPEG, **no GPS**, values mirroring
`IMG_5132`):

| Field | Expected |
|---|---|
| captureLocal / captureOffset / captureUtc | `2026-09-05T16:56:03` / `-07:00` / `2026-09-05T23:56:03.000Z` |
| brightnessValue | 9.71442 (±1e-9) |
| exposureTimeSec | 1/3425 (±1e-12) |
| fNumber / iso | 1.78 / 80 |
| flashRaw / flashFired / whiteBalance | 16 / false / `auto` |
| make / model / lens | `Apple` / `iPhone 16 Pro Max` / `iPhone 16 Pro Max back triple camera 6.765mm f/1.78` |
| gpsPresent / gps | false / null |

Also: `readExif` on `fixtures/reference/tiny-sighting.heic` (no metadata) → `null`. Private (skip if absent):
`readExif` on `fixtures/private/IMG_5132.HEIC` either returns `null` or matches the sidecar's non-GPS fields.
Assert without printing GPS values.

## 2. Capture time

### 2.1 Client clock (`capture-time.ts`, pure with an injected `Date`)

```ts
export function clientNow(d: Date): { clientLocal: string; clientOffset: string };
export function formatOffset(tzOffsetMinutes: number): string;
// Date.getTimezoneOffset() is POSITIVE west of UTC. Vectors: 420 → "-07:00"; 0 → "+00:00"; -330 → "+05:30"; -345 → "+05:45"
```

`clientLocal` is built from `getFullYear()`, `getMonth()+1`, `getDate()`, `getHours()`, `getMinutes()`, `getSeconds()`.

### 2.2 Resolution

```ts
export function resolveCaptureTime(input: { exif: ExifMeta | null; origin: PhotoOrigin; clientLocal: string; clientOffset: string }): CaptureTime;
export function localToUtc(local: string, offset: string): string;
```

Priority:
1. `exif.captureLocal` → `{ local, offset: exif.captureOffset ?? clientOffset, source: 'exif' }`
2. origin `camera-overlay` / `camera-native` → client values, `source: 'client-clock'`
3. else client values, `source: 'import-time'`

`utc = localToUtc(local, offset)`.

Vectors: `localToUtc("2026-08-24T19:30:09","-07:00")` → `"2026-08-25T02:30:09.000Z"`;
`localToUtc("2026-01-01T00:30:00","+05:30")` → `"2025-12-31T19:00:00.000Z"`;
`localToUtc("2026-09-05T16:56:03","-07:00")` → `"2026-09-05T23:56:03.000Z"`.

## 3. Image stats (pure, `image-stats.ts`)

```ts
export function computeImageStats(img: RgbaImage): ImageStats;
```

The caller passes `await imageTools.toRgba(working, 256)`. For each pixel, `luma = 0.2126R + 0.7152G + 0.0722B`.
`meanLuma` = mean luma. Sort pixel indices by luma descending (ties by index ascending) and take the first
`ceil(0.2 × n)`; `brightMean{R,G,B}` = the mean channels of that set. Values are not rounded.

**Vector** (build the `RgbaImage` directly in the test): 100×100, left 50 columns `rgb(250,200,150)`, right 50
columns `rgb(20,20,20)`, alpha 255 → `brightMeanR/G/B` = **250 / 200 / 150** exactly; `meanLuma` = **113.51** (±1e-9).

## 4. Lighting suggestion (pure, `lighting.ts`)

```ts
export function estimateBrightnessValue(e: { fNumber: number | null; exposureTimeSec: number | null; iso: number | null }): number | null;
// all present → log2(N²) + log2(1/t) − log2(ISO / 3.125) ; else null
export function suggestLighting(input: { bv: number | null; flashFired: boolean | null; localHour: number | null; stats: ImageStats | null }): LightingSuggestion;
```

Inputs:
- `bv = exif?.brightnessValue ?? estimateBrightnessValue(exif) ?? null`
- `localHour = Number(captureTime.local.slice(11, 13))`, or null
- `warm = stats != null && stats.brightMeanR / Math.max(stats.brightMeanB, 1) > 1.15`
- `nightHour(h) = h >= 21 || h < 5`; `dayHour(h) = h >= 8 && h < 18`

Rules (first match wins; reason codes in brackets):

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
| 4d | bv null (dawn/dusk) | `mixed`, 0.3, [`twilight-hour`] |

In-app captures have no EXIF, so they always use rows 4a–4d. On ingest, `lighting = suggestion.label` and
`lightingConfirmed = false`; the categorize UI asks the owner to confirm or override.

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
