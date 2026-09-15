# M07: Capture screen with template overlay

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M04, M06 | medium | L | REV-5, sessions-categorize |

## Goal
On the iPhone, the owner picks a template and position, sees the matching overlay on the live rear camera (screen kept
awake), captures, reviews, and saves to on-device storage with a calibration prior, then continues to the next target.
Native camera and Photos import work as fallbacks.

## Read first
- `docs/spec/capture-overlay.md` (all)
- `docs/spec/metadata-lighting.md` §2.1
- `docs/spec/data-model.md` §3 (`CaptureInfo`), §7 (`ingestPhoto`)
- `docs/spec/privacy-storage-hosting.md` §2 (persistence request after first ingest), §7 (device testing)

## In scope
Capture route and components, camera and wake-lock helpers, fake camera, fallbacks, optional tilt indicator, device checklist.

## Out of scope
Categorize editing beyond the prefill (M09), EXIF and lighting (M08), CV (M11).

## Files
- `src/routes/capture/CapturePage.tsx` (route `/sessions/:sessionId/capture`)
- `src/components/capture/CaptureScreen.tsx`, `CameraView.tsx`, `OverlaySvg.tsx`, `TemplatePositionPicker.tsx`,
  `CaptureReview.tsx`, `CaptureFallbacks.tsx`, `SizeSlider.tsx`, `TiltIndicator.tsx`
- `src/lib/capture/camera.ts`, `fake-camera.ts`, `wake-lock-browser.ts`
- `src/lib/app/services.ts`: a React context providing `ServiceContext`, `browserImageTools`, `browserRenderTools`
- `src/routes/sessions/SessionStubPage.tsx` (minimal `/sessions/:sessionId`, replaced in M09)
- `public/dev-fixtures/*.jpg` (already present from M01)
- `tests/e2e/capture.spec.ts`
- `docs/DEVICE-TESTING.md`

## Steps
1. `camera.ts` and `wake-lock-browser.ts` per capture-overlay §2, including error mapping.
2. `fake-camera.ts` per §6. Import it dynamically inside `if (import.meta.env.VITE_FAKE_CAMERA === '1')`.
3. `CameraView`:
   - `<video autoPlay playsInline muted>` with `object-fit: cover`
   - track `videoWidth/Height` after `loadedmetadata`
   - `ResizeObserver` → `overlayLayout`
   - `OverlaySvg` renders `renderOverlaySvg` via `dangerouslySetInnerHTML` (pure, trusted output).
4. `TemplatePositionPicker` (≥ 44 px), label chip, `SizeSlider` (0.50–0.95, default 0.85), and a torch toggle when supported.
   Persist choices in `localStorage` `asa.capture.<sessionId>` (try/catch).
5. Acquire the wake lock when the camera starts; release on unmount and when hidden; re-acquire when visible.
6. Shutter: `grabFrame`; compute `calibrationPriorFromOverlay(container, frame, template, fraction)` at that moment;
   show `CaptureReview` (contain-fit image plus the anchor circle at the prior).
7. **Use photo**:
   - call `ingestPhoto(ctx, { sessionId, blob, origin: 'camera-overlay', originalFilename: null, ...clientNow(new Date()), capture, categorization: defaultCategorization(template, position) }, browserImageTools)`
   - then `maybeRequestPersistence(ctx)`
   - increment the badge and return to the live view (the stream stays open).
   - On error, show a toast and keep the review open.
8. **Retake** discards. **Done** → `#/sessions/:sessionId`.
9. `CaptureFallbacks`: native camera input (`origin: 'camera-native'`, no capture info) and Photos import
   (`origin: 'import'`, multiple, sequential with progress). `HEIC` failures on non-Safari show the §0.2 message.
10. `visibilitychange`: stop tracks and release the wake lock when hidden; restart when visible.
11. `debug=1` chip.
12. **Optional** `TiltIndicator` per capture-overlay §7 ("Enable level" button → permission → coloured dot + degrees).
    Store `tiltDeg` at capture.
13. `SessionStubPage`: session name, a thumbnail count, and a **Capture target** button (M09 replaces it).
14. `docs/DEVICE-TESTING.md`: the Pages URL, how to Add to Home Screen, and the capture-overlay §8 checklist with checkboxes.

## Tests
- E2E (both projects, fresh browser context):
  1. create a session through a small test helper page action (or seed via `page.evaluate` calling the service from `window.__asaTest`, exposed only when `VITE_FAKE_CAMERA === '1'`)
  2. open `#/sessions/<id>/capture?fakeCamera=precision`
  3. choose Precision + Prone → `.overlay-anchor` visible
  4. shutter → **Use photo**
  5. via `window.__asaTest.listPhotos(sessionId)`: 1 photo, origin `camera-overlay`, `capture.overlayTemplate 'precision'`,
     `categorization.roundsProne 10`; the analysis has `calibration.source 'overlay'`.
- E2E: `fakeCamera=sighting` + Both → rounds 5/5.
- E2E: import fallback with `docs/reference/IMG_5057-sighting.jpg` via `setInputFiles` → origin `import`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** complete `docs/DEVICE-TESTING.md` on the iPhone (Safari tab and Home Screen app) and paste
the results into Completion notes. Agents: *safe for any tier* to write the doc; don't tick the boxes yourself.

## Pitfalls
- iOS: without `playsInline` the video goes fullscreen; without `muted` autoplay fails.
- Recompute the layout on rotation (dimensions swap).
- Stop the stream on unmount, or the camera indicator stays on.
- `window.__asaTest` must not exist in the Pages build (same env guard as the fake camera).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
