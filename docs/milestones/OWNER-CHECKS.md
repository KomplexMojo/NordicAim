# Owner checks

Checks only the owner can do: iPhone device tests, GitHub settings, and sign-offs. The `run-milestones` workflow appends a
section here after each milestone that has them.

- **Owner-gate milestones** (M01, M07, M15 in the index) stop the run until their items are done. Tick the boxes, paste any
  requested reports into the milestone's *Completion notes*, commit, then start the workflow again.
- **Other milestones** record their checks here and the run continues. Do them when convenient; if one fails, note it in the
  milestone's *Open questions* and tell Claude.

<!-- The workflow appends sections below this line. -->

## M01 — Scaffold, diagnostics, CI, Pages deploy

- [x] Enable GitHub Pages: repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. Then re-run the
      "Deploy to GitHub Pages" workflow (Actions tab → Run workflow), because the first deploy ran before Pages was enabled.
      _Done 2026-09-15 via `gh api` (build_type=workflow); deploy run 34988887060 succeeded and the site returns 200._
- [ ] On the iPhone, open https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics in Safari, then Add to
      Home Screen and open it from there.
- [x] Tap **Copy report** in both, and paste both reports into `docs/milestones/M01-scaffold.md` → Completion notes.
      _Home Screen report recorded 2026-09-15 (12 pass, 1 fail: cv-worker). Safari-tab report still optional._
- [ ] Any `fail` on `cv-worker`, `svg-raster`, `heic-decode`, `indexeddb`, or `share-files` on the real phone: record it
      under M01 Open questions and tell Claude. (`storage-persist` failed only under headless automation; the phone result is what counts.)
- [x] **Re-run diagnostics on the iPhone** after the OpenCV loader fix deploys and confirm `cv-worker` passes (cause was bundler interop wrapping OpenCV's Promise; see M01 Completion notes).
  _2026-09-15 (iOS 18.7, Safari 26.6.1). Home Screen app: 13 pass, 0 fail, `cv-worker` pass (hasMat=true); it was still on a pre-M05 cached build, so no `diagram-raster` row. Safari tab (current build): 12 pass, 1 fail, `cv-worker` and `diagram-raster` pass; the one fail is `storage-persist` (persisted=false), expected in a Safari tab because iOS grants persistent storage only to Home Screen apps (the Home Screen app reports persisted=true)._
- [x] Decide on the non-blocking M01 open questions: keep the shadcn "radix-nova" preset and its extra self-hosted
      dependencies (Geist font, radix-ui, lucide-react, next-themes, tw-animate-css, class-variance-authority), or trim them.
      _Owner decision 2026-09-15: **keep**. Recorded in PLAN.md D1._

## M03 — Scoring engine

- [x] Fix the MOA values for angular(27.7) and angular(41.9) in `geometry-scoring.md` §6 (true values 1.904512 and
      2.880832), then tighten `tests/unit/scoring/groups.test.ts` to 1e-6.
      _Done 2026-09-15: spec corrected and test tightened to 1e-6._
- [ ] Decide what an over-counted sighting subset's `range.*.misses` should be — it is currently `declared - hits`,
      which can go negative.
- [ ] Confirm top-level `SightingOutcome.misses` means identified-only misses, confirm the pessimistic tie-break
      (smallest `shotId` among units tied for the largest `radialMm`), and confirm the `both` all-subset warnings come
      from combined declared vs. identified. All three are recorded in the M03 Open questions.

## M05 — Diagram renderer

- [ ] Compare the generated samples to the mockups: open `docs/reference/generated/sample-{sighting,precision}-{full,cell}.png`
      next to `docs/reference/example-diagram-{sighting,precision}.png` on a real screen/device and confirm the visual
      match is acceptable (layout, target geometry, and panels). This is optional — M05 has no owner gate — since it was
      already visually checked in-session and the remaining differences are the documented REV-22/23/24 decisions
      (8 px shot dots, the in-target "115 mm" zone label placed outside the halo, and outlined/relocated x<k>/MPI
      labels) plus real computed text replacing the mockup's placeholder copy.
- [x] After pushing, open https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics on an iPhone in real
      Safari and confirm the diagram-raster row passes — this exercises the SecurityError data-URL fallback in
      `svgToPng`, which the e2e run doesn't reach.
      _2026-09-15 Safari tab: `diagram-raster` pass (decoded=1500x1700). The object-URL path worked (svg-raster path=object-url), so the data-URL fallback was not needed on this device._

## M07 — Capture screen with template overlay

- [ ] Push to `main`, wait for the "Deploy to GitHub Pages" workflow, then on the iPhone open
      https://komplexmojo.github.io/advanced-shooting-analysis/ both in Safari and as a Home Screen app
      (Share → Add to Home Screen), following `docs/DEVICE-TESTING.md`.
- [ ] Tap **New session**: confirm the camera permission prompt appears, the live picture is from the rear camera, and
      the screen doesn't dim or lock past the Auto-Lock time.
- [ ] Pick **Precision + Prone**: confirm the overlay is centred and stays centred after rotating to landscape and back.
      Switch away and back to the app and confirm the camera restarts (and the wake lock is re-acquired) — this can
      only be checked on a real device.
- [ ] In a Safari tab, add `?debug=1` to the capture URL and confirm the chip's larger resolution number is at least 1920.
- [ ] Line up a precision target's black aiming mark with the thick circle and capture: on the review screen the circle
      should sit on the disc edge within about 3 mm by eye; tap **Use photo** and confirm the badge count goes up by
      one. Repeat with the sighting sheet and Sighting position.
- [ ] Confirm the native-camera fallback (take/save a photo, badge +1) and **Import from Photos** with two photos
      including one HEIC (shows "Importing 1 of 2…", badge +2, correct count after Done).
- [ ] Paste the Safari-tab and Home Screen report blocks from `docs/DEVICE-TESTING.md` §4 into
      `docs/milestones/M07-capture-screen.md` → Completion notes; record any failure under Open questions.
