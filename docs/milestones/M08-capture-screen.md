# M08: Capture screen with template overlay

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M04, M07 | medium | L | REV-5, sessions-categorize |

## Goal
From a session, the owner picks template and position, sees the matching overlay on the live rear camera,
captures, reviews, and uploads with a calibration prior, then continues to the next target. Native camera and
Photos import work as fallbacks.

## Read first
- `docs/spec/capture-overlay.md` (all)
- `docs/spec/metadata-lighting.md` §2.1 (client time)
- `docs/spec/data-model.md` §3 (`CaptureInfo`), §7 (photos POST)

## In scope
Capture page and components, camera helpers, client time, fake camera, fallbacks, device checklist doc.

## Out of scope
Categorize editing beyond the prefill (M10), lighting (M09), CV (M12).

## Files
- `src/app/sessions/[sessionId]/capture/page.tsx` (client component inside a server wrapper that loads the session)
- `src/components/capture/CaptureScreen.tsx`, `CameraView.tsx`, `OverlaySvg.tsx`, `TemplatePositionPicker.tsx`,
  `CaptureReview.tsx`, `CaptureFallbacks.tsx`, `SizeSlider.tsx`
- `src/lib/capture/camera.ts`, `src/lib/capture/fake-camera.ts`, `src/lib/capture/client-time.ts`,
  `src/lib/capture/upload.ts` (`uploadCapture(sessionId, payload)`)
- `public/dev-fixtures/sighting.jpg`, `public/dev-fixtures/precision.jpg` (copies of the `docs/reference` JPEGs)
- `tests/unit/capture/client-time.test.ts`, `tests/e2e/capture.spec.ts`
- `docs/DEVICE-TESTING.md`

## Steps
1. `client-time.ts` per metadata-lighting §2.1.
2. `camera.ts` per capture-overlay §2, including error mapping.
3. `fake-camera.ts`: `createFakeCameraStream(name)` per capture-overlay §6. Guard the call site with
   `process.env.NODE_ENV !== 'production'`.
4. `CameraView`: `<video autoPlay playsInline muted>` with `object-fit: cover` filling the viewport height
   minus the controls. Track `videoWidth/Height` after `loadedmetadata`. A `ResizeObserver` on the container
   drives `overlayLayout`. `OverlaySvg` renders `renderOverlaySvg` output (via `dangerouslySetInnerHTML`;
   the output is trusted and pure).
5. `TemplatePositionPicker`: segmented toggles (≥ 44 px). Persist to `localStorage` key
   `asa.capture.<sessionId>` inside try/catch.
6. The label chip text per template (§1). `SizeSlider` 0.50–0.95, step 0.01, default 0.85, also persisted.
7. Torch toggle only when `torchSupported(track)`.
8. Shutter: `grabFrame(video)`; compute `calibrationPriorFromOverlay(containerSize, frameSize, template, fraction)`
   **at the moment of capture**; freeze into `CaptureReview`. The review shows the blob image with
   `containTransform` and draws the anchor circle at the prior (converted with `frameToCss` + contain).
9. **Use photo** → `uploadCapture` with the §5 payload. On success increment the badge and return to live
   view (the stream stays open). On failure show a toast and keep the review open for retry.
10. **Retake** discards. **Done** navigates to `/sessions/[id]`.
11. `CaptureFallbacks`: shown on camera error and always available in a "More" menu:
    native camera input (`origin: 'camera-native'`, no `capture` JSON) and import (`origin: 'import'`,
    multiple files, sequential uploads with progress).
12. `visibilitychange`: stop tracks when hidden, restart when visible.
13. `?debug=1` chip: `videoWidth×videoHeight`, `k`, `ox`, `oy`.
14. Session page link: add a primary **Capture target** button to `/sessions/[id]` (if the page doesn't exist
    yet, create a minimal one listing thumbnails; M10 replaces it).
15. `docs/DEVICE-TESTING.md`: how to run `pnpm dev` + `tailscale serve --bg 3874` and open it on the iPhone,
    plus the checklist from capture-overlay §7 with checkboxes.

## Tests
- Unit: `formatOffset` and `clientNow` vectors (use a fixed `Date`; mock the timezone by passing a stub with
  `getTimezoneOffset`).
- E2E (Chromium, logged in):
  1. create a session via API
  2. open `/sessions/<id>/capture?fakeCamera=precision`
  3. choose Precision + Prone
  4. assert the `.overlay-anchor` element is visible
  5. tap the shutter, then **Use photo**
  6. `GET /api/sessions/<id>/photos` → 1 photo, `origin 'camera-overlay'`, `capture.overlayTemplate 'precision'`, `categorization.roundsProne 10`
  7. `GET …/analysis` → `calibration.source 'overlay'`
- E2E: `?fakeCamera=sighting` + Both → categorization `{ roundsProne: 5, roundsStanding: 5 }`.
- E2E: import fallback with `docs/reference/IMG_5057-sighting.jpg` via `setInputFiles` → origin `import`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** complete `docs/DEVICE-TESTING.md` on the iPhone and paste the results into
Completion notes. Agents: *safe for any tier* to prepare the doc; do not mark the checklist yourself.

## Pitfalls
- iOS: without `playsInline` the video goes fullscreen; without `muted` autoplay fails.
- Dimensions swap on rotation; recompute on `resize` and `orientationchange`.
- Don't use `ImageCapture` or `navigator.mediaDevices` before checking `window.isSecureContext`.
- Stop the stream on unmount, or the camera light stays on.
- `toBlob` is async and may return null; handle it.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
