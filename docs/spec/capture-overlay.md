# Spec: in-app capture with template overlay

Implements REV-5, REV-6, REV-8. The pure math is in `src/lib/capture/overlay.ts` and `src/lib/capture/tilt.ts`
(no DOM). Browser code is in `src/lib/capture/camera.ts`, `fake-camera.ts`, and `wake-lock-browser.ts`. The UI is
in `src/components/capture/*`, route `#/sessions/:sessionId/capture`.

## 1. User flow

1. **Quick start** (landing page and `#/sessions`): one primary button. If a session with `sessionDate` = today
   (local) exists, it reads **Capture (today's session)** and opens that session's capture screen. Otherwise it
   reads **Start & capture**, creates `Session <YYYY-MM-DD>` for today, and opens its capture screen. From an
   existing session page, **Capture target** does the same for that session.
2. Pick **Template** (`Sighting` | `Precision`) and **Position** (`Prone` | `Standing` | `Both`). Remember the last
   choice per session in `localStorage` key `asa.capture.<sessionId>` (inside try/catch).
3. The camera starts with the template's overlay centred. Label chip:
   - sighting: **"Align the dark disc with the thick circle"**
   - precision: **"Align the black aiming mark with the thick circle"**
4. Optional **size slider** (outer overlay diameter as a fraction of the viewfinder's short side, 0.50–0.95,
   default 0.85), torch toggle (if supported), and tilt indicator (§7, optional).
5. **Shutter** (72 px) grabs a frame and opens the **review screen** (captured image + overlay where it was),
   with **Retake** / **Use photo**.
6. **Use photo** calls `ingestPhoto` (§5), then returns to the live camera for the next target; a badge shows
   "N captured". **Done** goes to the session page.
7. Fallbacks, in order: native camera (`<input type="file" accept="image/*" capture="environment">`,
   `origin: 'camera-native'`, no prior), then **Import from Photos** (`accept="image/*,.heic,.heif"`, `multiple`,
   `origin: 'import'`).

## 2. Camera, wake lock (`camera.ts`, `wake-lock-browser.ts`)

```ts
export async function startCamera(): Promise<MediaStream>;
// 1st try:  { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } }
// on OverconstrainedError: retry { audio: false, video: { facingMode: 'environment' } }
export function stopCamera(stream: MediaStream): void;
export async function grabFrame(video: HTMLVideoElement): Promise<{ blob: Blob; widthPx: number; heightPx: number }>;
// canvas = videoWidth × videoHeight; drawImage(video,0,0); toBlob('image/jpeg', 0.92) (null → throw)
export function torchSupported(track: MediaStreamTrack): boolean;      // !!track.getCapabilities?.().torch
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void>; // applyConstraints({ advanced: [{ torch: on }] })

export async function acquireWakeLock(): Promise<{ release(): Promise<void> } | null>; // navigator.wakeLock?.request('screen'), errors → null
```

Rules:
- `<video autoPlay playsInline muted>`. iOS needs `playsInline` and `muted`.
- Frame size is known only after `loadedmetadata`. Recompute the layout on video `resize`, container
  `ResizeObserver`, and `orientationchange`.
- Don't use `ImageCapture` (unavailable on iOS Safari).
- Stop tracks and release the wake lock on unmount and on `visibilitychange` → hidden. Re-acquire both when visible.
- Error mapping: `!window.isSecureContext` → `insecure_context`; `NotAllowedError` → `permission_denied`;
  `NotFoundError` → `no_camera`; else `camera_error`. Show a message plus fallbacks.
- Record `track.getSettings()` (primitive values only) as `CaptureInfo.trackSettings`.

## 3. Overlay geometry (pure, `overlay.ts`)

### 3.1 Overlay circles per template

| Template | outerDiameterMm | Circles (diameter mm → style) |
|---|---|---|
| sighting | 115 | 115 → `anchor`; 110 → `guide`; 45 → `ring`; 40 → `guide` |
| precision | 154.4 | 154.4 → `ring`; 112.4 → `anchor`; 74.4 → `ring`; 42.4 → `ring`; 10.4 → `ring` |

```ts
export type OverlayStyle = 'anchor' | 'ring' | 'guide';
export function overlayCircles(template: TemplateId): { outerDiameterMm: number; anchorDiameterMm: number;
  circles: Array<{ diameterMm: number; style: OverlayStyle }> };
```

### 3.2 Viewfinder transforms

The `<video>` fills a `W × H` CSS px container with `object-fit: cover`; the frame is `Vw × Vh` px.

```ts
export interface Size { w: number; h: number }
export interface FitTransform { k: number; ox: number; oy: number } // css = frame * k + o
export function coverTransform(container: Size, frame: Size): FitTransform;   // k = max(W/Vw, H/Vh)
export function containTransform(container: Size, frame: Size): FitTransform; // k = min(W/Vw, H/Vh)
// ox = (W - Vw*k)/2 ; oy = (H - Vh*k)/2
export function cssToFrame(p: { x: number; y: number }, t: FitTransform): { x: number; y: number };
export function frameToCss(p: { x: number; y: number }, t: FitTransform): { x: number; y: number };
```

### 3.3 Layout and calibration prior

```ts
export interface OverlayLayout { centerCss: { x: number; y: number }; mmToCss: number; outerRadiusCss: number;
  anchorRadiusCss: number; circles: Array<{ rCss: number; style: OverlayStyle }>; maskHoleRadiusCss: number }
export function overlayLayout(container: Size, template: TemplateId, outerDiameterFraction: number): OverlayLayout;
// centre = (W/2, H/2); outerDiameterCss = fraction * min(W,H); mmToCss = outerDiameterCss / outerDiameterMm;
// maskHoleRadiusCss = outerRadiusCss * 1.08 ; throws RangeError if fraction outside [0.5, 0.95]
export function calibrationPriorFromOverlay(container: Size, frame: Size, template: TemplateId,
  outerDiameterFraction: number): Calibration;
// centre = cssToFrame(centerCss, cover); radiusPx = anchorRadiusCss / k; axisRatio 1; angleDeg 0; source 'overlay'; confidence null
```

`scaleCalibration(cal, factor)` (in `src/lib/geometry/transform.ts`) multiplies `cx`, `cy`, `radiusPx`.
`ingestPhoto` applies it with `factor = working.longest / max(frameWidthPx, frameHeightPx)`.

### 3.4 Test vectors

Container `390 × 844`, frame `1080 × 1920`, fraction `0.85`.

| Call | Expected (±1e-3) |
|---|---|
| `coverTransform` | k 0.439583, ox −42.375, oy 0 |
| `cssToFrame({195, 422})` | {540, 960} |
| `cssToFrame({0, 0})` | {96.398, 0} |
| `frameToCss({1080, 1920})` | {432.375, 844} |
| `containTransform` | k 0.361111, ox 0, oy 75.333 |
| `frameToCss({540, 960}, contain)` | {195, 422} |
| `overlayLayout(precision)` | outerRadiusCss 165.75, mmToCss 2.147021, anchorRadiusCss 120.663 |
| `overlayLayout(sighting)` | outerRadiusCss 165.75, mmToCss 2.882609, anchorRadiusCss 165.75, maskHoleRadiusCss 179.01 |
| `calibrationPriorFromOverlay(precision)` | cx 540, cy 960, radiusPx 274.493, anchorDiameterMm 112.4 |
| `calibrationPriorFromOverlay(sighting)` | cx 540, cy 960, radiusPx 377.062, anchorDiameterMm 115 |
| `scaleCalibration({cx 540, cy 960, radiusPx 274.493}, 0.5)` | cx 270, cy 480, radiusPx 137.2465 |
| `overlayLayout(sighting, fraction 0.5)` | outerRadiusCss 97.5 |

## 4. Overlay rendering (`renderOverlaySvg(layout, template, size): string`, pure)

SVG covering the container, `pointer-events: none`, viewBox `0 0 W H`:
1. **Dim mask**: one `<path class="overlay-mask" fill="rgba(8,12,18,0.35)" fill-rule="evenodd">` made of the
   container rect plus a circle of radius `maskHoleRadiusCss`.
2. **Circles**: each drawn twice. First a halo (class `overlay-halo`, stroke `#0B1220`), then a line with class
   `overlay-<style>`:
   - `anchor`: halo width 5, line `#FFFFFF` width 3, opacity 0.9
   - `ring`: halo 3.5, line 1.5, opacity 0.8
   - `guide`: halo 3.5, line 1.5, `stroke-dasharray="6 6"`, opacity 0.7
3. **Crosshair** (class `overlay-cross`): two white 1.5 px lines through the centre, half-length `anchorRadiusCss × 0.15`.
4. **Ticks** (class `overlay-tick`): four 12 px outward white ticks on the anchor circle at 0°, 90°, 180°, 270°.

Counts: precision → 1 `overlay-anchor`, 4 `overlay-ring`. Sighting → 1 `overlay-anchor`, 1 `overlay-ring`,
2 `overlay-guide`. The label chip is HTML.

## 5. From capture to storage

`ingestPhoto(ctx, input, imageTools)` with:

```ts
{ sessionId, blob, origin: 'camera-overlay', originalFilename: null,
  clientLocal, clientOffset,                     // clientNow() at capture
  capture: { overlayTemplate, outerDiameterFraction, frameWidthPx, frameHeightPx, calibrationPriorFramePx, tiltDeg, trackSettings },
  categorization: defaultCategorization(template, position) }
```

If `capture.calibrationPriorFramePx` is set, the initial `TargetAnalysis` gets
`calibration = scaleCalibration(prior, workingLongest / frameLongest)`, `shots: []`, `pinnedMode: null`,
`acceptedMissingCount: null`, `computed: null`.

## 6. Fake camera (dev/test only)

Enabled only when `import.meta.env.VITE_FAKE_CAMERA === '1'` **and** the URL query (inside the hash route) has
`fakeCamera=sighting|precision`:
- Load `dev-fixtures/<name>.jpg` (copies of `docs/reference/IMG_5057-sighting.jpg` / `IMG_5132-precision.jpg`,
  metadata-free) into a `1080 × 1920` canvas, drawn with contain fit.
- Use `canvas.captureStream(15)` as the stream. Show a "FAKE CAMERA" chip.
- The Pages workflow never sets `VITE_FAKE_CAMERA`. Guard the import with the env check so it is tree-shaken.

`debug=1` in the query shows a chip with `videoWidth×videoHeight` and the current `FitTransform`.

## 7. Tilt indicator (optional, `tilt.ts` + UI)

The target hangs vertically, so the phone should be upright: ideal `beta = 90`, `gamma = 0`.

```ts
export function tiltDeg(beta: number, gamma: number): number;      // Math.hypot(beta - 90, gamma)
export function tiltLevel(deg: number): 'good' | 'fair' | 'poor'; // ≤ 3 good, ≤ 8 fair, else poor
```

Vectors: (90, 0) → 0 `good`; (87, 4) → 5 `fair`; (80, 0) → 10 `poor`; (93, −3) → 4.243 `fair`.

On iOS, call `DeviceOrientationEvent.requestPermission()` from a tap ("Enable level"). If denied or unavailable,
hide the indicator. Store the tilt at capture in `CaptureInfo.tiltDeg`.

## 8. Human device checklist (M07, owner)

On the iPhone at `https://komplexmojo.github.io/advanced-shooting-analysis/`, in a Safari tab **and** as a Home
Screen app:
1. The camera permission prompt appears; the rear camera is used; the screen stays awake while capturing.
2. The overlay stays centred in portrait; rotating doesn't misplace it.
3. The `debug=1` chip shows ≥ 1920 on the long side.
4. Aligning the precision sheet's black disc and capturing gives a review image with the thick circle on the disc
   edge (within ~3 mm visually). Same for the sighting sheet's dark disc.
5. The torch toggle works or is hidden. Native camera fallback and Photos import both work.
6. Optional tilt indicator: permission prompt, and it turns green when the phone is square to the target.
