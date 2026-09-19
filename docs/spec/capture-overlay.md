# Spec: step 1, take picture(s) with template overlay

Implements REV-5, REV-8, REV-15 step 1. Pure math: `src/lib/capture/overlay.ts`. Browser: `camera.ts`,
`fake-camera.ts`, `wake-lock-browser.ts`. UI: `src/components/capture/*`, route `#/sessions/:sessionId/capture`.

## 1. User flow

1. **Quick start** (home and `#/sessions`): if a session with `sessionDate` = today (local) exists, the button reads
   **Capture (today's session)** and opens its capture screen. Otherwise it reads **Start & capture**, creates
   `Session <YYYY-MM-DD>`, and opens its capture screen.
2. Pick **Template** (`Sighting` | `Precision`) and **Position** (`Prone` | `Standing` | `Both`), remembered per session in
   `localStorage` `asa.capture.<sessionId>` (try/catch).
3. The camera shows the template's overlay, with a label chip:
   - sighting: **"Align the dark disc with the thick circle"**
   - precision: **"Align the black aiming mark with the thick circle"**
4. Optional **size slider** (0.50–0.95 of the viewfinder's short side, default 0.85).
5. **Shutter** (72 px) → **review screen** (captured image + overlay where it was) → **Retake** / **Use photo**. The overlay is
   the anchor circle placed from the shot's calibration prior (frame-space, contain-fit onto the review image).
6. **Use photo** → `ingestPhoto` (§5) → Stage A starts in the background → back to the live camera; badge "N captured".
7. **Done** → `#/sessions/:sessionId/metadata` (step 2).
8. Fallbacks: native camera (`<input type="file" accept="image/*" capture="environment">`, `origin: 'camera-native'`) and
   **Import from Photos** (`accept="image/*,.heic,.heif"`, `multiple`, `origin: 'import'`). REV-50 (issue #1): each picked
   file — from either fallback — steps through the **same review screen** in turn, showing the chosen template's full
   overlay (`overlayLayout` + `renderOverlaySvg`, §3–§4) fitted to the review container, not to any frame-space prior — an
   import's framing is unknown, so this is informational only and never becomes a calibration prior
   (`capture: null`, `calibrationPriorFramePx` stays absent). The header reads "Imported photo *N* of *M*" when more than
   one file was picked (just "Imported photo" for one), or "Native photo" for the native-camera fallback. A "Loaded"
   badge and the overlay itself appear only once the picked image has rendered; **Keep** ingests it exactly as before
   (`origin: 'import'` or `'camera-native'`, no prior) and **Discard** drops it without storing anything. Cancelling the
   OS picker partway (or discarding some of a multi-file pick) keeps whatever was already kept.

## 2. Camera and wake lock

```ts
export async function startCamera(): Promise<MediaStream>;
// 1st: { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } }
// OverconstrainedError → retry { audio: false, video: { facingMode: 'environment' } }
export function stopCamera(stream: MediaStream): void;
export async function grabFrame(video: HTMLVideoElement): Promise<{ blob: Blob; widthPx: number; heightPx: number }>;
// canvas videoWidth × videoHeight → drawImage → toBlob('image/jpeg', 0.92) (null → throw)
export async function acquireWakeLock(): Promise<{ release(): Promise<void> } | null>; // navigator.wakeLock?.request('screen'); errors → null
```

- `<video autoPlay playsInline muted>` (required on iOS).
- Recompute the layout after `loadedmetadata`, on video `resize`, container `ResizeObserver`, and `orientationchange`.
- No `ImageCapture` (unavailable on iOS).
- Stop tracks and release the wake lock on unmount and when hidden; re-acquire both when visible.
- Errors: `!isSecureContext` → `insecure_context`; `NotAllowedError` → `permission_denied`; `NotFoundError` → `no_camera`; else
  `camera_error`. Show a message plus fallbacks.
- `CaptureInfo.trackSettings` = primitive values of `track.getSettings()`.

## 3. Overlay geometry (pure)

### 3.1 Circles per template

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
// centre (W/2, H/2); outerDiameterCss = fraction * min(W,H); mmToCss = outerDiameterCss / outerDiameterMm;
// maskHoleRadiusCss = outerRadiusCss * 1.08; RangeError if fraction outside [0.5, 0.95]
export function calibrationPriorFromOverlay(container: Size, frame: Size, template: TemplateId, outerDiameterFraction: number): Calibration;
// centre = cssToFrame(centerCss, cover); radiusPx = anchorRadiusCss / k; axisRatio 1; angleDeg 0; source 'overlay'; confidence null
```

`scaleCalibration(cal, factor)` (`src/lib/geometry/transform.ts`) multiplies `cx`, `cy`, and `radiusPx`. Stage A applies it (analysis-pipeline §3).

### 3.4 Test vectors

Container `390 × 844`, frame `1080 × 1920`, fraction `0.85`:

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
| `overlayLayout(sighting, 0.5)` | outerRadiusCss 97.5 |

## 4. Overlay rendering (`renderOverlaySvg(layout, template, size): string`, pure)

`pointer-events: none`, viewBox `0 0 W H`:
1. `<path class="overlay-mask" fill="rgba(8,12,18,0.35)" fill-rule="evenodd">`: the container rect plus a circle of radius `maskHoleRadiusCss`.
2. Each circle is drawn twice: a halo (class `overlay-halo`, stroke `#0B1220`), then a line with class `overlay-<style>`:
   - `anchor`: halo 5, line `#FFFFFF` 3, opacity 0.9
   - `ring`: halo 3.5, line 1.5, opacity 0.8
   - `guide`: halo 3.5, line 1.5, dasharray `6 6`, opacity 0.7
3. `overlay-cross`: two white 1.5 px lines through the centre, half-length `anchorRadiusCss × 0.15`.
4. `overlay-tick`: four 12 px outward ticks on the anchor circle at 0°, 90°, 180°, 270°.

Counts: precision 1 `overlay-anchor`, 4 `overlay-ring`; sighting 1 `overlay-anchor`, 1 `overlay-ring`, 2 `overlay-guide`.

## 5. From capture to storage

On **Use photo**:

```ts
const photo = await ingestPhoto(ctx, {
  sessionId, blob, origin: 'camera-overlay', originalFilename: null,
  ...clientNow(new Date()),
  capture: { overlayTemplate, outerDiameterFraction, frameWidthPx, frameHeightPx,
             calibrationPriorFramePx: calibrationPriorFromOverlay(container, frame, template, fraction), trackSettings },
  categorization: defaultCategorization(template, position),
}, browserImageTools);
await maybeRequestPersistence(ctx);  // privacy-storage-hosting §2
// ingestPhoto stores initialAnalysis (stageA 'pending') and calls pipelineHooks.notify() → Stage A runs in the background
```

## 6. Fake camera (dev/test only)

Only when `import.meta.env.VITE_FAKE_CAMERA === '1'` and the hash-route query has `fakeCamera=sighting|precision`:
- Draw `dev-fixtures/<name>.jpg` (metadata-free copies of the `docs/reference` JPEGs) contain-fit into a `1080 × 1920` canvas.
- Use `canvas.captureStream(15)` as the stream; show a "FAKE CAMERA" chip.
- Import the module dynamically inside the env check (tree-shaken from the Pages build).

`debug=1` shows `videoWidth×videoHeight` and the `FitTransform`.

## 7. Device checklist (M07, owner)

On the iPhone at `https://komplexmojo.github.io/advanced-shooting-analysis/`, both in Safari and from the Home Screen:
1. The permission prompt appears; the rear camera is used; the screen stays awake.
2. The overlay stays centred in portrait, including after rotation.
3. The `debug=1` resolution is ≥ 1920 on the long side.
4. After aligning a precision target's black disc and capturing, the review image shows the thick circle on the disc edge
   (within ~3 mm by eye). Same for the sighting sheet.
5. Native camera fallback and Photos import both work.
