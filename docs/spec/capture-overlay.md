# Spec: step 1, take picture(s) with template overlay

Implements REV-5, REV-8, REV-15 step 1. Pure math: `src/lib/capture/overlay.ts`. Browser: `camera.ts`,
`fake-camera.ts`, `wake-lock-browser.ts`. UI: `src/components/capture/*`, route `#/sessions/:sessionId/capture`.

## 1. User flow

1. **Capture** and **Import** on home (REV-162; was REV-160's Capture/New): each always creates a fresh session dated today
   (`Session <YYYY-MM-DD>`, then `(2)`, `(3)`, … when that day already has a session) and never reuses one. **Capture**
   (camera icon) opens the new session's capture screen. **Import** (plus icon) opens the photo library at once, skips the
   camera and review screen, imports the picked photos (`origin: import`, empty categorization), and goes to
   `#/sessions/:sid/metadata`. Cancelling the picker creates nothing; if no photo could be imported the session is removed.
   Continue an existing session from the Sessions list.
2. Pick the **target type** (REV-79 / REV-162): `Sight in` | `Confirm` | `Prone` | `Standing`, which sets the template and
   position (`Both` is no longer offered), remembered per session in `localStorage` `asa.capture.<sessionId>` (try/catch).
   **Update backing** is an icon-only control in the capture header (colour swatch).
3. The camera shows the template's **align** overlay (REV-162), with a label chip:
   - sighting: **"Align the dark disc with the thick circle"** (full rings + registration squares)
   - precision: **"Line the paper's outer ring up with this circle."** (outer print ring only, thick, + centre cross +
     registration squares). Scoring rings are not drawn while aiming.
4. Optional **size slider** (0.50–0.95 of the viewfinder's short side, default 0.85).
5. **Shutter** (72 px) → **review screen** (captured image + overlay where it was) → **Retake** / **Use photo**. The overlay is
   the anchor circle placed from the shot's calibration prior (frame-space, contain-fit onto the review image).
6. **Use photo** → `ingestPhoto` (§5) → Stage A starts in the background → back to the live camera; badge "N captured".
7. **Done** → `#/review/:sessionId?pass=first` (REV-161). With nothing captured yet it is a quiet outline button (muted text)
   so the shutter is the one strong action; it stays tappable. From the first photo on it is the solid primary (issue #83).
8. No Phone camera / Import fallbacks on the capture screen (REV-162). When the live camera cannot start, the alert points
   to **Import** on Home (and allowing camera access for the site). Library import is only via Home **Import**.

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

## 4. Overlay rendering (`renderOverlaySvg(layout, template, size, mode = 'full'): string`, pure)

`mode`: `'full'` (default; informational import/template review) or `'align'` (live viewfinder, REV-162).

`pointer-events: none`, viewBox `0 0 W H`, `data-overlay-mode`:
1. `<path class="overlay-mask" fill="rgba(8,12,18,0.35)" fill-rule="evenodd">`: the container rect plus a circle of radius `maskHoleRadiusCss`.
2. Circles — each drawn twice: a halo (class `overlay-halo`, stroke `#0B1220`), then a line with class `overlay-<style>`:
   - `anchor`: halo 5, line `#FFFFFF` 3, opacity 0.9
   - `ring`: halo 3.5, line 1.5, opacity 0.8
   - `guide`: halo 3.5, line 1.5, dasharray `6 6`, opacity 0.7
   - **`align` + precision:** only the outer print ring, drawn with **anchor** stroke weights (class still `overlay-ring`).
   - **`full`**, or **`align` + sighting:** every circle from §3.1.
3. `overlay-cross`: two white 1.5 px lines through the centre; half-length is `outerRadiusCss × 0.15` for align-precision,
   else `anchorRadiusCss × 0.15`.
4. `overlay-tick`: four 12 px outward ticks on the anchor circle at 0°, 90°, 180°, 270° — omitted for align-precision.
5. **`align` only:** four open squares (`overlay-marker`, stroke 1.5, opacity 0.45) at the printed AprilTag centres
   (`SHEET_MARKER_CENTRES_MM` (±85, ±105) mm, size `SHEET_MARKER_SIZE_MM` = 20 mm; template-reference.md §10). Not readable
   tags — framing cues so the registration marks stay in the photo.

Counts (`full`): precision 1 `overlay-anchor`, 4 `overlay-ring`; sighting 1 `overlay-anchor`, 1 `overlay-ring`, 2 `overlay-guide`.
Counts (`align` precision): 1 `overlay-ring`, 0 `overlay-anchor`, 4 `overlay-marker`.

## 5. From capture to storage

On **Use photo**:

```ts
const photo = await ingestPhoto(ctx, {
  sessionId, blob, origin: 'camera-overlay', originalFilename: null,
  ...clientNow(new Date()),
  capture: { overlayTemplate, outerDiameterFraction, frameWidthPx, frameHeightPx,
             calibrationPriorFramePx: calibrationPriorFromOverlay(container, frame, template, fraction), trackSettings },
  categorization: categorizationForKind(kind),
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

On the iPhone at `https://komplexmojo.github.io/NordicAim/`, both in Safari and from the Home Screen:
1. The permission prompt appears; the rear camera is used; the screen stays awake.
2. The overlay stays centred in portrait, including after rotation.
3. The `debug=1` resolution is ≥ 1920 on the long side.
4. After aligning a precision target's black disc and capturing, the review image shows the thick circle on the disc edge
   (within ~3 mm by eye). Same for the sighting sheet.
5. Native camera fallback and Photos import both work.
