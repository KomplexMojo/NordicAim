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

_2026-09-16: the owner captured targets at the range on the evening of 2026-09-15 using the Home Screen app and reported
that it worked as expected, then instructed the run to continue from M08. The boxes above stay unticked because the
itemised checks and the `docs/DEVICE-TESTING.md` report blocks were not captured — revisit them if capture misbehaves
during M10/M11 work._

## M08 — Pull photo metadata and lighting

- [ ] None required for this milestone — it's pure logic plus an ingest-pipeline extension with no UI or device-specific behavior. Owner gates in README.md are only at M01, M07, M15.

## M10 — Pipeline runner, image review, template alignment

- [ ] **On the iPhone, capture both paper sheets and note the alignment method recorded for each** (via the stored analysis).
      A precision sheet should now align as `cv`. A fallback to `overlay` with `alignment-uncertain` means the nested search
      missed on real capture geometry — worth reporting, since that is exactly the case REV-26 was written to fix.
- [ ] **Ratify (or reject) two refinements to REV-26 that measurement forced.** Both are already applied to the spec and the
      code, so nothing is inconsistent; they are recorded here because they change rules the owner had pinned:
      1. The nested search reads the **pre-CLOSE** binary. The original rule said the CLOSEd `RETR_CCOMP` children, which
         cannot work: the CLOSE is what welds the rings to the mark (one crescent child at kernel 9, none at kernel 30).
      2. Ranking in a nested pool uses `fill² × area`, not `fill × area`, which prefers a printed ring line by 7.40%. On the
         real reference photo either formula picks the aiming mark; only the synthetic bridged fixture needs the exponent.
- [ ] **Confirm the redrawn synthetic sighting fixture.** Round 1 drew the prone zone as a filled white disc (fill 0.845, just
      under the 0.85 guard), which made the synthetic sighting sheet undetectable once REV-26 landed. It now draws white
      strokes, matching `docs/reference/IMG_5057-sighting.jpg` (fill 0.988). Side effects: template-hint confidence
      0.75 → 0.50 (still `sighting`), sharpness 284.0 → 325.6.
- [ ] **Decide the Stage A duration readout.** M10's own acceptance asks the owner to note "how long Stage A took (shown in
      `debug=1`)", but no step, schema field or UI in M10's scope records or displays it. That half of the acceptance cannot be
      performed as written; adding it is a data-model plus UI decision.
- [ ] Optional: **the median-4 tie in the template hint.** `IMG_5057-sighting.jpg` lands exactly on the tie and hints
      `precision` at confidence 0.00. Harmless today (Stage B only warns at confidence ≥ 0.5), but the sighting sheet ideally
      would not hint `precision` at all.
- [ ] Optional: **`BLUR_THRESHOLD` stays at 40.** `cv:eval` measures the lowest sharp image at 325.6 and the sharpest blurred
      one at 11.4, suggesting 61. 40 was kept as the more conservative choice (fewer false "blurry" warnings); raise it if real
      photos slip through.

## M11 — Shot detection

- [ ] Once M12 renders results, test shot detection on both real paper targets on the iPhone. Expect the precision
      sheet to badly over-count (the printed ring numerals get detected as shots — see next item); the sighting sheet
      should look roughly right, with overlapping holes merged into one cluster.
- [ ] Decide whether to fix the precision-target over-count (Open question 4) by adding a stroke-width/elongation
      filter, or by erasing the numeral sectors, in step 4 of `docs/milestones/M11-shot-detection.md` and
      `docs/spec/analysis-pipeline.md` §2 (A5). As written, M12 will show `too-many-shots` on every real precision target.
- [ ] Decide Open question 3: the ±0.9 mm erase bands around the inner-ten (2.5 mm) and ring-10 (5.2 mm) radii can
      delete a dead-centre precision hole (leaves 8.0 mm² against the 8.6 mm² minimum), silently dropping an X. Options:
      skip the two innermost bands, narrow them near the centre, or lower the minimum area inside ring 10. This affects
      scoring, so settle it before M12 is accepted.
- [ ] Ratify Open questions 1, 2 and 6 into `docs/spec/`: the definition of `outerRadiusMm` (outermost overlay
      circle), the enumerated printed-circle radius list, and which template A5 detects against (categorization →
      capture overlay → A3 hint → anchor diameter). Each is derived from an existing spec section, not invented.
- [ ] Add the `splitCluster(pointsMm, k)` line to the worker API in `docs/spec/analysis-pipeline.md` §6 (Open
      question 7), or drop the method from the worker surface, so the spec and worker API agree before M13 uses it.

## M12 — Analysis generation and results screen

- [ ] On the iPhone: photograph a real target → Analyze → sanity-check the scores against your own count, and record discrepancies in the M12 Completion notes (feeds M13 and CV tuning). Expect the precision sheet to report `too-many-shots` / Needs attention — this is M11 open question 4 (printed ring numerals detected as shots: 19 detections / 62 units against ~10 rounds on IMG_5132-precision.jpg), restated as M12 open question 10, now visible in the UI for the first time. The sighting sheet should look roughly right, with overlapping holes merged.
- [ ] Visually check the two new screens on a phone: results cards and target detail in portrait, 44 px tap targets (Retry, View, Adjust shots, Zoom in / Fit to width, Show the photo), and the amber/emerald status badges in dark mode — none of this is covered by the e2e assertions.
- [ ] Decide where Retry should live: `src/lib/pipeline/runner-browser.ts` (where it is now, as `retryFailedStage`) or `src/lib/services/photos.ts`. Step 5 names no file and no service file was in scope (M12 Open question 1).
- [ ] Ratify removing M10's `registerStageBHandler` registry in favour of the runner calling `runStageB` directly with a required `RunnerDeps.renderTools` — this replaced the M10 runner test "skips Stage B jobs until a handler is registered (M12)" with a test that a B job actually runs.
- [ ] Decide M12 Open question 3: `geometry-scoring.md` §10 types the profile as `typeof BIATHLON_50M`, which forces an `as` cast to apply the stored `holeDiameterMm` override — a named profile type in the spec would remove it.
- [ ] Confirm the invented wording is acceptable, since no spec states it: the processing spinner strings ("Waiting to process the photo…", "Reviewing the photo and finding shots…", "Scoring the target…", "Waiting to score…") and the sighting range line's trailing " hits" (Open question 6).
