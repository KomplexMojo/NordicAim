# M07: Capture screen with template overlay

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M04, M06 | medium | L | **1. take picture(s)** |

## Goal
The owner picks a template and position, lines up the printed target with the live overlay (screen kept awake), captures,
reviews, and saves on the phone. Stage A is queued, then capture continues with the next target. **Done** leads to step 2.
Native camera and Photos import work as fallbacks.

## Read first
- `docs/spec/capture-overlay.md` (all)
- `docs/spec/metadata-lighting.md` §2.1
- `docs/spec/analysis-pipeline.md` §1 (routes), §10 (test hooks)
- `docs/spec/privacy-storage-hosting.md` §2, §5

## In scope
Capture route and components, camera and wake lock, fake camera, fallbacks, base test hooks, stub metadata route, device checklist.

## Out of scope
The metadata screen (M09), EXIF and lighting (M08), the pipeline (M10+).

## Files
- `src/routes/capture/CapturePage.tsx`
- `src/components/capture/CaptureScreen.tsx`, `CameraView.tsx`, `OverlaySvg.tsx`, `TemplatePositionPicker.tsx`, `CaptureReview.tsx`,
  `CaptureFallbacks.tsx`, `SizeSlider.tsx`
- `src/lib/capture/camera.ts`, `fake-camera.ts`, `wake-lock-browser.ts`
- `src/lib/app/services.tsx` (React context: `ServiceContext`, `browserImageTools`, `browserRenderTools`)
- `src/lib/testing/test-hooks-browser.ts`: `installTestHooks()` with `listPhotos`, `getAnalysis`; called from `main.tsx` only when `VITE_FAKE_CAMERA === '1'`
- `src/routes/metadata/MetadataStubPage.tsx` (route `/sessions/:sid/metadata`, shows the photo count; replaced in M09)
- `tests/e2e/capture.spec.ts`, `docs/DEVICE-TESTING.md`

## Steps
1. `camera.ts` and `wake-lock-browser.ts` per capture-overlay §2.
2. `fake-camera.ts` per §6 (dynamic import inside the env check).
3. `CameraView`: `<video autoPlay playsInline muted>` with `object-fit: cover`; `ResizeObserver` → `overlayLayout`; `OverlaySvg`.
4. `TemplatePositionPicker` (≥ 44 px), label chip, `SizeSlider`; persist in `localStorage` (try/catch).
5. Wake lock acquired while the camera runs; released when hidden or on unmount.
6. Shutter → `grabFrame` + `calibrationPriorFromOverlay` → `CaptureReview` (contain-fit image + anchor circle).
7. **Use photo** → `ingestPhoto` per §5 → `maybeRequestPersistence` → badge +1 → live view. On error: toast, keep the review.
8. **Retake** discards; **Done** → `#/sessions/:sid/metadata`.
9. `CaptureFallbacks`: native camera and Photos import (sequential, with progress; HEIC-on-non-Safari message).
10. Visibility handling; `debug=1` chip.
11. `docs/DEVICE-TESTING.md`: Pages URL, Add to Home Screen, and the §7 checklist.

## Tests
- E2E (both projects):
  1. create a session by navigating to `#/` and using a temporary "New session" link (or via the service in `page.evaluate` through test hooks)
  2. open `#/sessions/<id>/capture?fakeCamera=precision` → Precision + Prone → `.overlay-anchor` visible
  3. shutter → Use photo
  4. `__asaTest.listPhotos` → 1 photo, origin `camera-overlay`, `capture.overlayTemplate 'precision'`, a non-null
     `capture.calibrationPriorFramePx`, roundsProne 10; `__asaTest.getAnalysis` → `pipeline.stageA 'pending'`
  5. Done → the metadata stub shows 1 photo.
- E2E: `fakeCamera=sighting` + Both → rounds 5/5.
- E2E: import `docs/reference/IMG_5057-sighting.jpg` via `setInputFiles` → origin `import`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** complete `docs/DEVICE-TESTING.md` on the iPhone (Safari and Home Screen) and paste results into
Completion notes. Agents: *safe for any tier* to write the doc only.

## Pitfalls
- iOS needs `playsInline` + `muted`.
- Recompute on rotation.
- Stop tracks on unmount.
- Test hooks and the fake camera must not exist in the Pages build.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
