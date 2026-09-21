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
- **Default picks (non-blocking).** The spec doesn't say which template/position is selected before the owner picks. Implemented:
  nothing selected on a session's first visit; the shutter stays disabled (with a "Pick a template and position" hint) until both are
  picked, then the picks are remembered in `asa.capture.<sessionId>`.
- **Categorization for native-camera/Photos imports (non-blocking).** §1.8 doesn't say. Implemented: `defaultCategorization(template,
  position)` when both are picked on the capture screen, else `emptyCategorization()`; M09's metadata screen lets the owner fix it.
- **Size slider persistence and step (non-blocking).** Step 4 says "persist" after listing the slider; the spec key only names template and
  position. `outerDiameterFraction` is stored in the same `asa.capture.<sessionId>` JSON; slider step is 0.01 (UI granularity only,
  clamped to [0.50, 0.95]).
- **Session date is UTC (for M09).** The temporary **New session** button calls M04's `createSession`, whose `sessionDate` is
  `now.toISOString().slice(0, 10)` (UTC). capture-overlay §1.1's quick start compares against *today (local)*; in the evening west of
  UTC these differ. M09 should pass a local `sessionDate`.

## Completion notes
**Implemented (2026-09-15, orchestrated run; not committed, Status left `in-progress` for the reviewer/finalizer).**

Files: `src/lib/capture/camera.ts`, `wake-lock-browser.ts`, `fake-camera.ts`, plus two small helpers not in the Files list —
`src/lib/capture/prefs-browser.ts` (localStorage picks, try/catch, zod-validated) and `src/lib/capture/messages.ts` (label chips,
camera-error and ingest-error strings; keeps strings/pure logic out of components). `src/lib/app/services.tsx`
(`ServicesProvider`, `useServices`, `loadAppServices` → `{ ctx: ServiceContext, imageTools: browserImageTools, renderTools:
browserRenderTools }`). `src/lib/testing/test-hooks-browser.ts` (`installTestHooks` → `window.__asaTest.listPhotos/getAnalysis`).
Components `src/components/capture/{CaptureScreen,CameraView,OverlaySvg,TemplatePositionPicker,CaptureReview,CaptureFallbacks,SizeSlider}.tsx`,
routes `src/routes/capture/CapturePage.tsx` and `src/routes/metadata/MetadataStubPage.tsx`, `src/app/router.tsx`, `src/main.tsx`,
temporary **New session** button on `src/routes/home/HomePage.tsx`, `docs/DEVICE-TESTING.md`. Tests: `tests/e2e/capture.spec.ts`,
`tests/unit/capture/camera.test.ts`, `tests/unit/capture/prefs.test.ts`.

Commands and results:
- `pnpm check` → pass (typecheck, lint 0 errors / 4 pre-existing warnings in `components/ui` and `cv/opencv.ts`, vitest 34 files /
  285 tests, privacy check 15 images).
- `pnpm test:e2e` → 10/10 pass (mobile-chromium + mobile-webkit): smoke ×2, precision+prone capture, sighting+both 5/5, Photos import.
- `VITE_BASE=/NordicAim/ vite build` (to a scratch dir) → the bundle contains none of `FAKE CAMERA`, `__asaTest`,
  `installTestHooks`, `startFakeCamera`, `captureStream`, `fake-camera`, `test-hooks` (the fake camera, its chip, and the test hooks are
  all behind `import.meta.env.VITE_FAKE_CAMERA === '1'` and tree-shaken).
- Visual check in Playwright (iPhone 15 viewport, `fakeCamera=precision&debug=1`): overlay centred, label chip, FAKE CAMERA and debug chips,
  review image with the anchor circle at the same place on the frame as the live overlay.

Notes and deviations for the reviewer:
- e2e asserts beyond the milestone: frame 1080×1920, `outerDiameterFraction` 0.85, prior `cx` 540 / `cy` 960 (±1e-3; the overlay centre
  maps to the frame centre under a centred cover fit), `source 'overlay'`, `anchorDiameterMm` 112.4 / 115.
- The spec's §3.4 vectors were already unit-tested in M06 (`tests/unit/capture/overlay.test.ts`); M07 adds unit tests for the §2
  constraints and OverconstrainedError retry, the error-code mapping, `stopCamera`, `acquireWakeLock` (missing/failed → null),
  `trackSettings` filtering, and the §1.3 label strings.
- `trackSettings` keeps string, boolean, and **finite** number values (NaN/Infinity dropped because `CaptureInfo` uses `z.number()`).
- Test hooks install via a dynamic import, so e2e waits for `window.__asaTest` before calling it.
- Camera and wake lock live in `CameraView`: started when the document is visible, stopped/released on `visibilitychange → hidden` and
  on unmount, restarted when visible again. Layout recomputes on `loadedmetadata`, video `resize`, `ResizeObserver`, `orientationchange`.
- `maybeRequestPersistence` runs after a successful ingest in its own try/catch so a persistence failure never re-shows a saved photo's
  review. An ingest failure shows a toast and keeps the review.
- Diagnostics stays outside `ServicesProvider` so it still runs if IndexedDB can't open. `<Toaster>` is mounted next to the router.

**Owner device checklist (human required):** partly done. On the evening of 2026-09-15, at the range, the owner
captured targets using the Home Screen app and reported that the camera worked as expected. The itemised
`docs/DEVICE-TESTING.md` checks and the two report blocks were not captured, and the Safari-tab pass (including the
`debug=1` resolution check) was not run at the range. On 2026-09-16 the owner instructed the milestone run to continue
from M08 on that basis. Everything still unverified stays listed in `docs/milestones/OWNER-CHECKS.md`.
