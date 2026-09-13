# Spec: in-app capture with template overlay

Implements owner decisions REV-5 and REV-6. The pure math is in `src/lib/capture/overlay.ts` (no DOM).
Browser helpers are in `src/lib/capture/camera.ts` (client-only). The UI is in `src/components/capture/*`.

## 1. User flow

1. From a session, tap **Capture target**.
2. Pick **Template** (`Sighting` | `Precision`, segmented control) and **Position** (`Prone` | `Standing` |
   `Both`). Remember the last choice per session in `localStorage` (wrap in try/catch).
3. The camera starts with the chosen template's overlay centred in the viewfinder. A label chip says:
   - sighting: **"Align the dark disc with the thick circle"**
   - precision: **"Align the black aiming mark with the thick circle"**
4. Optionally adjust the **size slider** (overlay outer diameter as a fraction of the viewfinder's short
   side, 0.50–0.95, default 0.85) so the printed rings match at a comfortable distance. Torch toggle if supported.
5. Tap the **shutter** (72 px round button) to grab a frame and show the **review screen**: the captured
   image with the overlay drawn where it was, plus **Retake** / **Use photo**.
6. **Use photo** uploads (with capture info, calibration prior, and prefilled categorization) and returns to
   the live camera for the next target. A badge shows "N captured". **Done** goes back to the session.
7. Fallbacks, in order: native camera (`<input type="file" accept="image/*" capture="environment">`,
   `origin: 'camera-native'`, no prior), then **Import from Photos** (`accept="image/*,.heic,.heif"`,
   `multiple`, `origin: 'import'`).

## 2. Camera acquisition (`camera.ts`)

```ts
export async function startCamera(): Promise<MediaStream>;
// 1st try:  { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } }
// on OverconstrainedError: retry { audio: false, video: { facingMode: 'environment' } }
export function stopCamera(stream: MediaStream): void;           // stop every track
export async function grabFrame(video: HTMLVideoElement): Promise<{ blob: Blob; widthPx: number; heightPx: number }>;
// canvas.width = video.videoWidth; canvas.height = video.videoHeight; drawImage(video, 0, 0); toBlob('image/jpeg', 0.92)
export function torchSupported(track: MediaStreamTrack): boolean; // !!track.getCapabilities?.().torch
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void>; // applyConstraints({ advanced: [{ torch: on }] })
```

Rules:
- `<video autoPlay playsInline muted>`. iOS needs `playsInline` and `muted`.
- Frame size is known only after `loadedmetadata`: use `video.videoWidth/videoHeight`. Recompute the layout
  on `resize` of the video element, on the container `ResizeObserver`, and on `orientationchange`
  (dimensions swap).
- Don't use the `ImageCapture` API (unavailable on iOS Safari).
- Stop tracks on unmount and on `visibilitychange` → hidden. Restart when visible again.
- Error mapping (show a message and offer the fallbacks):
  `!window.isSecureContext` → `insecure_context` ("Camera needs HTTPS"); `NotAllowedError` → `permission_denied`;
  `NotFoundError` → `no_camera`; anything else → `camera_error`.
- Record `track.getSettings()` (primitive values only) as `CaptureInfo.trackSettings`.

## 3. Overlay geometry (pure, `overlay.ts`)

### 3.1 Overlay circles per template

`outerDiameterMm` is the largest drawn circle; the overlay scale is defined by it.

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

The `<video>` fills a container of `W × H` CSS px with `object-fit: cover`. The stream frame is `Vw × Vh` px.

```ts
export interface Size { w: number; h: number }
export interface FitTransform { k: number; ox: number; oy: number } // css = frame * k + o
export function coverTransform(container: Size, frame: Size): FitTransform;   // k = max(W/Vw, H/Vh)
export function containTransform(container: Size, frame: Size): FitTransform; // k = min(W/Vw, H/Vh)
// ox = (W - Vw*k)/2 ; oy = (H - Vh*k)/2
export function cssToFrame(p: {x: number; y: number}, t: FitTransform): {x: number; y: number}; // (p - o) / k
export function frameToCss(p: {x: number; y: number}, t: FitTransform): {x: number; y: number}; // p*k + o
```

### 3.3 Layout and calibration prior

```ts
export interface OverlayLayout {
  centerCss: { x: number; y: number };   // always container centre (W/2, H/2)
  mmToCss: number;                       // css px per mm
  outerRadiusCss: number;
  anchorRadiusCss: number;
  circles: Array<{ rCss: number; style: OverlayStyle }>;
  maskHoleRadiusCss: number;             // outerRadiusCss * 1.08
}
export function overlayLayout(container: Size, template: TemplateId, outerDiameterFraction: number): OverlayLayout;
// outerDiameterCss = fraction * min(W, H); mmToCss = outerDiameterCss / outerDiameterMm

export function calibrationPriorFromOverlay(container: Size, frame: Size, template: TemplateId,
  outerDiameterFraction: number): Calibration;
// centre = cssToFrame(centerCss, coverTransform); radiusPx = anchorRadiusCss / k;
// axisRatio 1; angleDeg 0; anchorDiameterMm from template; source 'overlay'; confidence null
```

`scaleCalibration(cal, factor)` lives in `src/lib/geometry/transform.ts`: it multiplies `cx`, `cy`, `radiusPx`
by `factor` and leaves everything else unchanged. The server applies it on upload with
`factor = working.longestSide / frame.longestSide` to turn the frame-px prior into the working-image
calibration stored in `analysis.json` (`source: 'overlay'`).

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
| `overlayLayout(sighting)` | outerRadiusCss 165.75, mmToCss 2.882609, anchorRadiusCss 165.75 |
| `calibrationPriorFromOverlay(precision)` | cx 540, cy 960, radiusPx 274.493, anchorDiameterMm 112.4 |
| `calibrationPriorFromOverlay(sighting)` | cx 540, cy 960, radiusPx 377.062, anchorDiameterMm 115 |
| `scaleCalibration({cx 540, cy 960, radiusPx 274.493}, 0.5)` | cx 270, cy 480, radiusPx 137.2465 |
| `overlayLayout(sighting).maskHoleRadiusCss` | 179.01 |

## 4. Overlay rendering (`renderOverlaySvg(layout, template, size): string`, pure)

Absolutely positioned SVG covering the container, `pointer-events: none`, viewBox `0 0 W H`.

1. **Dim mask**: one `<path fill="rgba(8,12,18,0.35)" fill-rule="evenodd">` made of the container rect plus a
   circle of radius `maskHoleRadiusCss` at the centre.
2. **Circles**: each drawn twice, halo first, then line.
   - `anchor`: halo `#0B1220` width 5, line `#FFFFFF` width 3, opacity 0.9
   - `ring`: halo width 3.5, line width 1.5, opacity 0.8
   - `guide`: halo width 3.5, line width 1.5, `stroke-dasharray="6 6"`, opacity 0.7
3. **Crosshair**: two white 1.5 px lines through the centre, half-length `anchorRadiusCss * 0.15`.
4. **Ticks**: four 12 px outward white ticks at the anchor circle (0°, 90°, 180°, 270°).
5. The label chip is HTML (not in the SVG), top-centre, 16 px, on `rgba(8,12,18,0.6)`.

Snapshot-test the SVG for both templates at the §3.4 container size.

## 5. Upload payload from capture

`POST /api/sessions/:sid/photos` multipart fields:
- `file`: JPEG blob named `capture-<clientLocal with ':' replaced by '-'>.jpg`
- `origin`: `camera-overlay`
- `clientLocal`, `clientOffset`: from `clientNow()` (spec/metadata-lighting.md §2)
- `capture`: JSON `CaptureInfo` (`overlayTemplate`, `outerDiameterFraction`, `frameWidthPx`, `frameHeightPx`,
  `calibrationPriorFramePx`, `trackSettings`)
- `categorization`: JSON `defaultCategorization(template, position)`

Server (M04): stores the photo; if `capture.calibrationPriorFramePx` is set, writes the initial `analysis.json`
with `calibration = scaleCalibration(prior, working.longest / frame.longest)` and `shots: []`.

## 6. Dev-only fake camera

When `process.env.NODE_ENV !== 'production'` and the page URL has `?fakeCamera=sighting|precision`:
- Load `/dev-fixtures/<name>.jpg` (copies of `docs/reference/IMG_5057-sighting.jpg` / `IMG_5132-precision.jpg`,
  metadata-free) into an off-screen canvas of `1080 × 1920`, drawn with `contain` fit.
- Use `canvas.captureStream(15)` as the `MediaStream`.
- Show a "FAKE CAMERA" chip. The production build must tree-shake this path (guard with the env check).

Used by e2e tests. `?debug=1` shows a chip with `videoWidth×videoHeight` and the current `FitTransform`.

## 7. Human device checklist (M08, owner)

On the iPhone over the tailnet (Safari tab **and** home-screen app):
1. The permission prompt appears once; the rear camera is used.
2. The overlay stays centred in portrait; rotating does not misplace it.
3. The `?debug=1` resolution chip shows at least 1920 on the long side.
4. Aligning the precision sheet's black disc and capturing gives a review image with the thick circle on the
   black disc edge (within ~3 mm visually).
5. Same for the sighting sheet's dark disc.
6. The torch toggle works or is hidden. The native camera fallback and Photos import both upload.
