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

## M13 — Adjust shots (optional correction)

- [ ] Export ground truth for both reference targets: run `pnpm dev:test`, in the console call `__asaTest.loadDemo()`, open Adjust on each target, line up the rings, mark every hole, Save, then More… → Export ground truth JSON. Rename the two downloads to `fixtures/reference/ground-truth/IMG_5057-sighting.jpg.json` and `IMG_5132-precision.jpg.json` (the exact filenames `scripts/cv-eval.ts` expects), commit them, then run `pnpm cv:eval` and confirm the new "owner ground truth" rows appear (they're reported, not gated). Watch for a `revokeObjectURL` race if the download doesn't start.
- [ ] Try Adjust on a real target on the iPhone: pinch to zoom (1x–6x) and one-finger pan, tap bare paper to add a shot, drag a shot, bump a multiplicity, drag the alignment centre and edge handles, confirm the live preview score and results card update after Save. The 22 CSS px shot hit radius and the 60vh stage height are the two numbers most likely to need tuning under a thumb — note anything that feels wrong.
- [ ] Rule on the four open questions in `docs/milestones/M13-adjust-shots.md`:
  1. Should the precision stage draw all ten ISSF rings (`geometry-scoring.md` §1.3) instead of capture-overlay §3.1's five circles (154.4 / 112.4 anchor / 74.4 / 42.4 / 10.4)? Change is one place: `src/lib/geometry/rings.ts`.
  2. Is the fallback starting calibration when no target is found — a centred disc at 0.35 × the image's short side, the only invented number in this milestone — acceptable?
  3. Should saving a manual calibration clear the `alignment-uncertain` warning? Currently it doesn't (spec §8 doesn't say to), so a photo the owner just lined up by hand still shows "Used your on-screen alignment — check the rings line up."
  4. Is the re-detect shot-id collision rule acceptable: a re-detected shot whose id collides with a kept manual one is renamed `auto-1-2`, `auto-1-3`, … (unspecified by the spec)?

## M18 — Alignment under perspective (the centre rings)

- [ ] OWNER GATE (blocking, M18's stop point): decide `docs/milestones/M18-alignment-perspective.md` Open question 1 — add `Calibration.perspective: { p, q } | null` (the target plane's vanishing line, applied before the ellipse map). 2 numbers complete the 7 observable degrees of freedom the 5 existing fields don't carry; verified on 12 owner photos to within 2.3e-4 px; `null` reproduces today's app bit-for-bit, so no migration and no rewriting of `source: 'manual'` calibrations. Also decide the sub-question: should a manual Adjust handle drag keep the measured `perspective` (recommended, plus a "reset alignment" action) or clear it?
- [ ] Decide how to close Open question 2 (missing ground truth): `fixtures/reference/ground-truth/` has only its README, so real-photo alignment numbers are measured evidence, not owner-confirmed. Either export ground truth from Adjust for the two reference JPEGs (see that README), or add a "rings line up / off" question to the M16 R5 review page (`pnpm review:detection`).
- [ ] Correct `fixtures/private/review/ground-truth-holes-v2.json`: the entry `IMG_5057_2` (`template: "precision"`, `anchorDiameterMm: 112.4`) is actually the Caledonia Nordic SIGHTING sheet (115 mm disc, 110/45/40 mm guides, 15 mm inner circle). This also means M16's detection numbers for that photo were computed against the wrong template.
- [ ] Decide whether to write the 15 mm inner-circle measurement into `docs/spec/geometry-scoring.md` §1.2 (still says "approximate, measure in M09") — note the supporting number isn't reproducible from the repo.
- [ ] Not yet actionable — do only after the shape above is ratified and wired into Stage A, `transform.ts` and Adjust: on the iPhone, check that the centre rings sit on the printed rings. The fix isn't shipped yet, so the device looks the same as before M18.

## M17 — Unplaced shot markers and the diagram/photo compare slider

- [ ] On the iPhone, open Adjust shots on a real target where the app missed a hole: confirm the numbered "Not placed" markers appear in the tray beside the target, drag one onto the missed hole at both default zoom and after zooming/panning, and confirm it lands under your finger. Also drag a placed shot back onto the tray and confirm it is removed (note the tray only shows while at least one round is unplaced, so this is unavailable once every declared round is placed — see Open question 4 below).
- [ ] On the iPhone, on target detail, sweep the compare slider from 0 to 1 and confirm the wipe is legible and the boundary tracks the slider, then confirm whether the drawn diagram/rings line up with the printed ones on paper, and whether the 45 mm and 40 mm circles are visible on a sighting target. A visible offset is expected and attributed to M18 — confirm that reading is scoped there rather than needing a fix now.
- [ ] Try the "Fade instead of wipe" toggle on the device and tell us which of the two modes you actually use, so the other can be dropped or made the default.
- [ ] Decide Open question 2: how should a round that hits off the scoring area be recorded? REV-33's "off target" control isn't built because there's no miss representation yet and a fake shot beyond ring 1 would corrupt group size, mean radius, MPI and ellipse (M20 will add this properly) — confirm whether an off-target round should be excluded from group metrics entirely, or scored as a ring-0 unit at some nominal position.
- [ ] Decide whether the unplaced tray should also show in Alignment mode (the implementer restricted it to Shots mode because the stage's pointer is used by the centre/radius handles in Alignment; the milestone states no mode), and whether the tray should stay visible as a permanent drop zone when `unplaced === 0` so drag-to-delete keeps working (Open question 4).
- [ ] Confirm two write-in corrections: (1) the compare slider's direction — milestone step 3's formula `inset(0 <(1−value)·100%> 0 0)` is the reverse of its own sentence and its Tests vectors; the implementation follows the vectors (0 = whole diagram, 1 = whole photo), and the formula text should be corrected; (2) that always rendering the working photo under the diagram on target detail is acceptable now that M12 step 4's explicit "show the photo" toggle is gone (M17 step 3 sanctions this replacement).

## M18 — Alignment under perspective (the centre rings)

- [ ] On the iPhone, open the Pages build and import or capture a photo of a precision or sighting sheet taken at a
      slant (not square on). After Stage A finishes, open Adjust > Alignment and re-analyze if needed: confirm the
      drawn centre rings (10/9 on precision, the inner circle on sighting) sit on the printed rings at the centre, not
      only at the black-mark edge (M18 Acceptance, human step).
- [ ] On the iPhone, measure how long Stage A takes per photo now that it includes the tilt measurement, against the
      3 s/photo budget in `docs/spec/analysis-pipeline.md` §9 (in Node: 182–183 ms median, 230 ms max, up to 457 ms
      under load, per 1200 px photo). If the phone is over budget, report it — the tilt step can be dropped, falling
      back to `perspective: null`.
- [ ] In Adjust > Alignment on a tilted photo: drag the centre and radius handles and confirm the tilted rings track
      your finger and keep their tilted shape. Then tap **Reset alignment**: the rings should redraw as a plain
      ellipse, the button should become disabled, and the change should stick after Save.
- [ ] Decide Open question 6: accept the ~1.9-point drop in M16 labelled recall (74.3%, still above the 72% floor;
      precision 92.9%, above the 85% floor) in exchange for more accurate centre rings, or approve a minimum
      rms-improvement floor constant instead (measured example: a 25% floor would give 77.4% recall / 94.6% precision).
- [ ] Decide Open question 7: should **Reset alignment** clear only the tilt (as implemented), or the whole alignment?
- [ ] Decide Open question 2: provide owner-confirmed ring ground truth (export from Adjust, or a review-page
      confirmation) so the centre-ring measurement can be checked against it instead of against printed circles found
      in each photo.
- [ ] Correct Open question 3: the owner's labelled ground-truth set records `IMG_5057 2` as a precision sheet, but it
      is actually a sighting sheet.

## M19 — Coloured backing sheet option

- [ ] BLOCKING, OWNER-ONLY (M19 Open question 1): say which (if any) of `IMG_4743`, `IMG_4744`, `IMG_5182`, `IMG_5184` in `fixtures/private/additional references/` actually had a coloured backing sheet behind the target. `Auto` — the default mode, which the v1→v2 migration sets on every existing session — currently reads all four as backed, which `backing-sheet.md` §4 forbids on an unbacked photo. Measured evidence: on those four, the coloured pixels sit at accepted-pixel radius p10 101 mm (IMG_4743) and 128–133 mm (the others) against a 150 mm search cap, at hues 31–49° (bare wood) and 213° (sky/shade), with max chroma 82–110; the six confirmed-backed photos' coloured pixels sit at radius p10 4–12 mm with max chroma 209–223. No `AUTO_MIN_SPOTS` threshold separates unbacked (3–8 spots) from backed (6–10 spots) — the fix must be either a tighter sheet mask or a chroma/saturation floor, and nothing should be tuned without this answer.
- [ ] Photograph at least 10 targets with the backing sheet in varied light (sun, shade, indoor), each with a matching card photo taken in the same light; place the pairs in `fixtures/private/backing/`, add each pairing to `fixtures/private/backing/cards.json`, then label them with `pnpm review:detection` and paste the export. Until this is done the colour path stays UNVERIFIED and `pnpm cv:eval` prints `GATE: UNVERIFIED` (gates nothing). Labelling these photos also lets the `IMG_5189` proximity check run against real labels instead of the standard detector's candidates, which should settle whether IMG_5189 is 7 or 8 holes.
- [ ] Review `fixtures/private/review/detection-review.html` for the 6 already-backed photos to confirm the colour path's blobs sit on real holes before running the §7 labelling above.
- [ ] Resolve the schema-version conflict: `docs/spec/data-model.md` §2 and its §8 example record still say `schemaVersion: 1` for `BiathlonSession`, while `backing-sheet.md` §3 ("Schema version 1 → 2") and the shipped code/tests use 2. Either update `data-model.md` §2/§8 to schemaVersion 2 (M19 Open question 11), or say the conflict should be resolved the other way; `data-model.md` was not edited as part of M19 since it isn't in M19's Files list.
- [ ] Decide two smaller open questions: whether `possibleOverlap` belongs on `Shot` in `data-model.md` §4 (Open question 6), and whether `Shot` should carry an area field so Stage B's re-cap can rank colour-path shots by size instead of falling back to the radial tie-break (Open question 13).
- [ ] iPhone check once this reaches Pages (cannot be done from this machine): open a session, expand Session options, choose Coloured backing, use "Photograph backing card" in real light, and confirm the swatch, the card-mode capture screen (no target overlay), the "fill the frame" guide, 44 px tap targets in portrait one-handed use, and the "Holes found by backing colour" note on the results card.

## M19 — Coloured backing sheet option

- [ ] Confirm `AUTO_MIN_CHROMA = 124` in `src/lib/cv/constants.ts`, or say which single rule (chroma floor vs. the radial rule) should decide on its own. The suggested 150 assumed backed photos read at least 209, but measured this run IMG_5189 (pink) reads 138 and IMG_5198 reads 167, against the highest unbacked photo (IMG_5182) at 110 — a narrow 14-point margin either side. See M19 Open question 14.
- [ ] Accept the 10th-percentile radial rule (`AUTO_RADIUS_QUANTILE = 0.1`, using `outerRadiusMm(template)`) as the wide-margin check instead of tightening `findSheet`'s mask, since `findSheet` is shared with M16's standard detector. See M19 Open question 15.
- [ ] Update `docs/spec/backing-sheet.md` §4a to add the two new Auto rules (chroma floor `AUTO_MIN_CHROMA = 124`; the 10th-percentile distance of the coloured pixels must be at most `outerRadiusMm(template)`) and the two new fallback reasons, `'colour too dull for a backing'` and `'colour outside the rings'`.
- [ ] Gather the §7 evidence set: photograph at least 10 targets on the backing sheet in sun, shade and indoor light, each with a matching card photo in the same light. Place the pairs in `fixtures/private/backing/`, pair each target with its card in `cards.json`, label them with `pnpm review:detection`, and paste the export. Then re-measure the four Auto constants and the colour-path gate with `pnpm cv:eval`. Until this is done, the colour path and all four Auto constants stay UNVERIFIED.
- [ ] Test Auto on a target with scores written in coloured pen inside the rings — the known way to fool it, which the new chroma floor does not guard against (e.g. a fluorescent highlighter).
- [ ] On the iPhone, check the Session options panel (Auto/None/Coloured backing, card capture and import) and confirm the three-step flow (take picture(s) → add metadata → receive analysis) is unchanged.

## M20 — Declared rounds are fact (reject, double punches, misses)

- [ ] Acceptance: with at least 10 labelled targets of known round counts (including a double punch, a shot on the wrong target, and a neighbour's shot), enter the true rounds and confirm each outcome matches what happened: rejected (photo shown, headline "Found N clear holes but you entered D rounds…"), double punch ("Shots in this hole: 2" with the assumed-double note, reason "N hole(s) look like two shots…"), or misses (headline like "68 / 100 · 1 miss · X 1", reason "N round(s) weren't found and are scored as misses").
- [ ] On the iPhone (push to main, then open https://komplexmojo.github.io/advanced-shooting-analysis/): open a rejected target's card and confirm it shows the photo and the "Found N clear holes but you entered D rounds…" message, with no headline, score, diagram or metrics. Then open Adjust and confirm every detected shot is there to inspect.
- [ ] In Adjust on a target with missing rounds, confirm the tray is labelled "Scored as miss"; dragging a marker onto a hole should turn it into a shot and drop the miss count by one. On an inferred double, set the count to 1, Save, and confirm that round becomes a miss and is not re-inferred onto another hole.
- [ ] Confirm the decisions in M20 Open questions 3-8, especially: rule 7a (too-many-holes) runs before rule 6 and a rejected target stores computed: null; a rejected `both` target withholds the score for the whole target; the standard (no-backing) path never infers double punches (DOUBLE_PUNCH_MIN_RATIO_STANDARD = null); an inferred double is stored as the shot's multiplicity plus `inferred`; and once any shot is manual, nothing new is inferred.
- [ ] Confirm CONFIDENT_HOLE_MIN = 0.94 is acceptable even though it makes only about 9% of real standard-path holes confident, so rejection rarely fires there.
- [ ] Re-measure DOUBLE_PUNCH_MIN_RATIO = 1.8 once backing-sheet §7 has 10 or more labelled backing photos (it currently rests on only two known doubles).

## M14 — Session summary image and share

- [ ] On the iPhone: Share → Save Image → attach in Garmin Connect → confirm it looks right (milestone Acceptance human-required step; not attempted here, no physical device available).

## M21 — Session review, suggested holes and double punches

- [ ] On the iPhone (https://komplexmojo.github.io/advanced-shooting-analysis/ after the push), open a real session's results, tap "Review session", and walk it end to end: photos needing attention should come first, the header should read "Photo N of M" with the live headline score, Confirm with no edits just moves on, Confirm after an edit saves it, Skip moves on, and the final screen should list each photo's outcome with "See results" going back to the results screen.
- [ ] In Adjust on a real target that has suggestions (hollow dashed pink rings, which appear a moment after the page opens because one extra detection runs in the background), tap one and confirm it becomes a manual shot, the live score updates, and after Save the results card shows the new shot; confirm the rings don't read as counted shots, and that the "Hide/Show N suggested holes" control works.
- [ ] Open Adjust on a target with no suggestions and confirm nothing extra appears: no rings, no hide/show button, no extra help text.
- [ ] Double punch: on a target shot with a coloured backing sheet, select a hole wider than one shot and confirm "Looks like N shots" appears and one tap sets the count and marks the shot manual. On a target without a backing sheet the prompt will not appear (Open question 6, since nothing on an unbacked target measures hole width) — decide whether that's acceptable or name a width measurement to try.
- [ ] Note how long suggestions take to appear after opening Adjust on the phone (one extra detection runs each time), for M15's performance budget.
- [ ] Confirm the milestone's provisional answers to its Open questions: review is stateless and entered via the "Review session" link on the results screen (Q1/Q4), the 60 mm vector / round-up rule (Q5), and double-punch prompts appearing only on backed targets (Q6/Q9).
