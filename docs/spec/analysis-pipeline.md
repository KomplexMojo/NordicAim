# Spec: MVP user flow and the automatic analysis pipeline

Implements REV-15, REV-16, REV-18. Code: `src/lib/pipeline/*`, `src/lib/domain/status.ts`, the CV worker, and the
screens listed in §1.

## 1. User flow and routes

**Navigation (REV-55, 2026-09-19).** Home is the Shooting tab; no screen carries its own Home link (the app header
does not either). Each screen's back link is its parent: results → `All sessions`, metadata → `Back to session`,
target → `Back to results` (REV-73: there is no separate Adjust screen; the target's photo section edits in place). The target screen
carries the photo section, and results carries **Add photos** (`/sessions/:sid/capture`).

The user experience is three steps: **take picture(s) → add metadata → receive analysis**.

| Route (hash) | Screen | Milestone |
|---|---|---|
| `#/` | Home: quick-start button + up to 5 recent sessions | M09 |
| `#/sessions` | Redirects to `#/` (REV-72). Home lists **every** session (name, date, target count) and is the one place a session is deleted | M09 |
| `#/sessions/:sid` | Redirect: to `metadata` if any photo is `needs-metadata`, else to `results` | M09 |
| `#/sessions/:sid/capture` | **Step 1: take picture(s)** with template overlay | M07 |
| `#/sessions/:sid/metadata` | **Step 2: add metadata** | M09 |
| `#/sessions/:sid/results` | **Step 3: receive analysis** (summary image + target cards) | M12, M14 |
| `#/sessions/:sid/photos/:pid` | Target: full diagram, all metrics, and the photo section — the M13 editor in place (Save / Re-analyze) with the diagram↔photo slider and the wipe/fade switch built in (REV-73, REV-78) | M12, M13 |
| `#/sessions/:sid/photos/:pid/adjust` | Redirects to the target screen (REV-73): viewing and adjusting are one screen | M13 |
| `#/review/:sessionId` | Optional: review the session's photos one at a time (needs attention first) with Adjust embedded | M21 |
| `#/settings` | **Settings**: backing sheet (mode, card colour), hole size, about (REV-47, REV-48) | M22 |
| `#/settings/backing-card` | Capture in card mode: photograph the backing card (full screen, no tab bar) | M22 |
| `#/diagnostics` | Device capability checks | M01 |

**Three main screens (REV-47).** A bottom tab bar, fixed and clear of `env(safe-area-inset-bottom)`, has three tabs of at
least 44 px, each an icon and a label, with the active one marked: **Shooting** (`#/` and every `#/sessions/...` and
`#/review/...` route), **Settings** (`#/settings`) and **Diagnostics** (`#/diagnostics`). It is **hidden on the full-screen
capture screens** (`#/sessions/:sid/capture`, `#/settings/backing-card`). Scrolling content is padded by the bar's height plus
the safe-area inset so the bar never covers it.

**Step 1: take picture(s)** (spec/capture-overlay.md): quick start → pick Sighting/Precision and position → overlay →
capture → Use photo (Stage A starts in the background) → next target → **Done** → metadata screen.

**Step 2: add metadata** (`MetadataPage`):
- Session name (default `Session <YYYY-MM-DD>`) and optional session notes.
- One card per photo: thumbnail, a small Stage A progress indicator ("Checking photo…", "Aligning…", "Finding shots…",
  "Ready"), and these fields:
  - **Template** (prefilled from capture) and **Position** (prefilled)
  - **Rounds** for prone and/or standing (defaults from `categorizationForKind`, REV-79)
  - **Lighting**: select, prefilled with the suggestion and a hint `Suggested from photo: <label>`
  - **Notes** (optional)
  - **Remove photo**.
- **Add more photos** → capture screen.
- Primary button **Analyze N targets**: enabled when every photo's categorization is complete. Tapping it confirms
  lighting on every photo, sets `session.analyzeRequestedAt`, and navigates to results.

**Step 3: receive analysis** (`ResultsPage`):
- Top: **Session summary** card with the summary image, **Share**, and the "Attach in Garmin Connect" steps (M14).
- Then one **target card** per photo in capture order:
  - the `cell` diagram
  - headline (precision: `72 / 100 · X 1`, or `68 / 100 · 1 miss · X 1` when rounds were scored as misses; sighting:
    `9/10 hits @ 45 mm`; `both`: per-position headlines). The score is definite — no range (REV-39)
  - key metrics (group size mm · MOA · MRAD; MPI offset)
  - a **rejected** target (`too-many-holes`) shows the photo and its reason instead of a diagram, headline and metrics
  - status chip plus reason messages (§4)
  - no buttons (REV-73): the cell diagram is the link to the target screen, where the photo is editable in place.
- While a target is processing, its card shows a spinner with the current stage.

## 2. Pipeline stages (per photo)

**Stage A: automatic, starts immediately after a photo is stored (needs no user metadata)**

| Step | Name (owner's wording) | What happens | Output |
|---|---|---|---|
| A1 | *(store)* | `ingestPhoto` saves original/working/thumb and the photo record | photo, blobs |
| A2 | **Pull photo metadata** | Inside `ingestPhoto` (M08): EXIF (if readable), capture time, image stats, lighting suggestion | `photo.exif`, `captureTime`, `lightingSuggestion` |
| A3 | **Review image** | Worker: sharpness score and template hint | `pipeline.sharpness`, `pipeline.templateHint` |
| A4 | **Overlay it on the target template** | Worker: detect the anchor disc near the overlay prior, then measure every printed circle and store the sheet's tilt with it (REV-44, §3) → choose the alignment (§3) | `analysis.calibration`, `pipeline.alignment`, warnings |
| A5 | *(detect shots)* | Worker: hole detection with the calibration (skipped if there's no calibration or any shot is manual). Holes are found without assuming they are brighter or darker than their surroundings (REV-34), anywhere on the paper sheet (REV-36); printed rings, guides and numerals are removed by their known positions (REV-35); every automatic shot has `multiplicity` 1 (REV-28); when the declared rounds are known the set is **reconciled** against them (REV-39, geometry-scoring §8.3): rejected (`too-many-holes`), capped (`extra-candidates-dropped`, REV-28), given inferred double punches (`double-punch-assumed`) and misses (`rounds-scored-as-miss`). With a coloured backing (REV-38, `backing-sheet.md` §5) — the **Settings** backing mode and colour as they are when A5 runs (REV-48) — holes are found by colour first, falling back to the above with warning `backing-colour-not-found` | `analysis.shots` (source `auto`) |

**Stage B: runs when analysis has been requested for the session and the photo's metadata is complete**

| Step | Name | What happens | Output |
|---|---|---|---|
| B1 | **Incorporate user metadata** | Read categorization and lighting | — |
| B2 | **Generate analysis: scoring (core MVP, REV-20)** | `analyzeTarget(template, categorization, shots, profile)`: precision ring scores /100, X count, tally; sighting hits/misses/clean per zone; `both` split; missing rounds scored as misses, after reconciling the shots against the declared rounds again (geometry-scoring §8.3; a rejected target gets no result); group size mm/MOA/MRAD; MPI offset (geometry-scoring) | `analysis.computed` |
| B3 | *(diagrams)* | Render `full-svg`, `full-png`, `cell-svg`; rasterise before the transaction | diagram blobs |
| B4 | *(status)* | `photoStatus(...)` (§4), including the `template-mismatch` warning when `templateHint.template !== categorization.template && templateHint.confidence >= 0.5` | `photo.status`, `photo.reasons` |
| B5 | *(summary)* | After all of a session's photos are settled, schedule the summary image build (§7) | artifact |

## 3. Alignment rules (pure, `src/lib/pipeline/alignment.ts`)

```ts
export function chooseAlignment(input: {
  prior: Calibration | null;          // capture.calibrationPriorFramePx scaled to working px, else null
  // from detectAnchor (already fill ≥ 0.85). `outsidePrior`: a real disc was measured, but further from the
  // overlay than the prior gate allows (M10 step 3.3) — still better evidence than the prior itself (REV-25).
  detection: { calibration: Calibration; confidence: number; outsidePrior: boolean } | null;
}): { calibration: Calibration | null; method: 'cv' | 'overlay' | 'none'; confidence: number | null;
      warnings: Array<'alignment-uncertain'> };
```

| prior | detection | Result |
|---|---|---|
| any | present, `outsidePrior: false` | `cv`, the detection's calibration (`source: 'auto'`), its confidence, no warning |
| any | present, `outsidePrior: true` | `cv`, the detection's calibration (`source: 'auto'`), its confidence, warning `alignment-uncertain` |
| present | null | `overlay`, the prior (`source: 'overlay'`), confidence null, warning `alignment-uncertain` |
| null | null | `none`, calibration null, confidence null, no warning (status reports `target-not-found`) |

**Never prefer the prior over a measured disc (REV-25).** The overlay prior says where the target was *aimed*, not where it
*is*; using it for an off-centre photo silently scores the wrong part of the image. A detection that fails only the prior's
proximity gate is still used, and the `alignment-uncertain` warning sends the photo to `needs-attention` so the owner can
confirm or fix it in Adjust. The prior remains the fallback when no disc is found at all.

**Measuring the disc on a printed sheet (REV-26).** The outermost dark shape is not always the anchor disc: on the precision
sheet the printed ring numbers at 12 and 6 o'clock can touch the aiming mark and bridge it out to ring 2, so a contour traced
around the outside measures 24–39% too large. Since `scale = radiusPx / (anchorDiameterMm/2)`, that silently compresses every
shot's mm position by ~28%. Two rules apply together:

1. **Fill guard, measured before the CLOSE.** A candidate's `fill` is the fraction of filled pixels inside its fitted ellipse on
   the **pre-CLOSE** binary, and a candidate with `fill < 0.85` is rejected. Measuring after the CLOSE is kernel-dependent and
   unsafe: a merged blob measures 0.69 at kernel 9 but **0.99** at kernel 30, which is what a capture prior produces. Measured
   pre-CLOSE, the merged blob is 0.52–0.63 and a true sighting disc is 0.962.
2. **Nested search, on the pre-CLOSE binary.** When an outer candidate fails the guard, the candidates lying geometrically inside
   its fitted ellipse are tested with the same quality rules, and the best one that passes is used. Those candidates come from the
   **pre-CLOSE** binary: the CLOSE is precisely what welds the rings to the aiming mark, so in the CLOSEd tree the disc's boundary
   is not a contour at all (one crescent child at kernel 9, *no* children at kernel 30). Pre-CLOSE the sheet's shapes are still
   separate components and the mark appears as its own contour — measured 264.8 px against a seed of 265 (+0.07%) on
   `IMG_5132-precision.jpg`. A disc found this way is an ordinary detection (`source: 'auto'`), and the prior gate and
   `outsidePrior` apply to it as usual.
3. **Ranking inside a nested pool uses `fill² × area`.** A printed ring line around the mark passes the guard (its interior is
   mostly the mark) and, being larger, beats the mark on plain `fill × area` by 7.40%. Squaring the fill picks the mark and is the
   smallest change correct on every measured case; a single-candidate pool is unaffected, since any monotone score picks it.

Detection returns `null` — and the prior fallback above applies — only when neither an outer candidate nor any nested candidate passes.

**The sheet's tilt (REV-44, M18).** A circle photographed off-axis projects to an ellipse whose centre is *not* the image
of the circle's centre, so rings drawn concentric around the fitted disc drift off the printed rings, most visibly at the
10 and 9 rings. After `detectAnchor` finds a disc, the worker measures every printed circle of the template
(`src/lib/cv/ring-edges.ts`) and fits a homography to them (`src/lib/geometry/fit-homography.ts`), then stores it as the
calibration's five ellipse fields plus `perspective` (`calibrationWithPerspective` in `src/lib/cv/alignment-perspective.ts`).
The template measured is `capture.overlayTemplate`, else A3's hint, else the one whose anchor size the disc was measured
at. When the measurement fails (fewer than 3 printed circles found, a projective fit worse than the ellipse fit on the
same points, or a homography that is not a valid calibration) the detected disc is kept with `perspective: null`,
which is the pre-M18 calibration. A prior (`method: 'overlay'`) always has `perspective: null`.

Prior scaling: `scaleCalibration(capture.calibrationPriorFramePx, max(working.w, working.h) / max(frameWidthPx, frameHeightPx))`.

**Sharpness** (pure `sharpness(cv, img)` in `src/lib/cv/sharpness.ts`): the variance of `cv.Laplacian` (`CV_64F`, ksize 1) on the gray
image resized to longest 1200 px. `image-blurry` warning when `< BLUR_THRESHOLD` (`src/lib/cv/constants.ts`). The initial
value is **40**, provisional: M10 records the values measured on the reference JPEGs and synthetic blurred images, and
adjusts the constant with a note.

## 4. Status and reasons (pure, `src/lib/domain/status.ts`)

```ts
export type PhotoStatus = 'needs-metadata' | 'processing' | 'ready' | 'analyzed' | 'needs-attention' | 'failed';
export type Reason = 'target-not-found' | 'no-shots-found' | 'too-many-shots' | 'extra-candidates-dropped'
  | 'rounds-unaccounted' | 'alignment-uncertain' | 'image-blurry' | 'template-mismatch' | 'backing-colour-not-found'
  | 'too-many-holes' | 'double-punch-assumed' | 'rounds-scored-as-miss';
export function photoStatus(input: { categorization: Categorization; analysis: TargetAnalysis; result: AnalysisResult | null })
  : { status: PhotoStatus; reasons: Reason[] };
```

Rules, first match sets the status. Pipeline warnings are **always appended** to `reasons` (in the order
`extra-candidates-dropped`, `too-many-holes`, `double-punch-assumed`, `rounds-scored-as-miss`,
`backing-colour-not-found`, `alignment-uncertain`, `image-blurry`, `template-mismatch`), except for `needs-metadata`,
`processing`, and `failed`:
1. categorization incomplete → `needs-metadata`, []
2. `stageA === 'error' || stageB === 'error'` → `failed`, []
3. `stageA` is `pending`/`running`, or `stageB === 'running'` → `processing`, []
4. `stageB === 'pending'` → `ready`, [...warnings]
5. `calibration === null` → `needs-attention`, [`target-not-found`, ...warnings]
6. `result === null || result.all.identified === 0` → `needs-attention`, [`no-shots-found`, ...warnings]
7. any subset `overcount > 0` → `needs-attention`, [`too-many-shots`, ...warnings]
7a. warnings include `too-many-holes` → `needs-attention`, [`too-many-holes`, ...other warnings]. **Evaluated before rule 6**
   (M20): a rejected target has no result, so in this position rule 6 would always report it as `no-shots-found`. (REV-39/M20: clearly more
   holes than the declared rounds means the target is **rejected** and carries no score — it is likely the wrong target or
   the wrong round count, and the declared count is fact. `double-punch-assumed` and `rounds-scored-as-miss` are notes and
   never change the status.)
8. warnings include `extra-candidates-dropped` → `needs-attention`, [...warnings] (REV-28: the shot set was capped to
   the declared rounds, so the owner should confirm which marks were kept)
9. `pipeline.alignment.method === 'overlay'` → `needs-attention`, [`alignment-uncertain`, ...other warnings] (REV-31: the
   overlay fallback means **no disc was found**, so the rings sit where the owner aimed rather than where the target is. A guess
   must not present as a finished score. A `cv` alignment with `outsidePrior: true` is *not* escalated — there the disc was
   measured, so its `alignment-uncertain` warning stays an appended note.)
10. otherwise → `analyzed`, [(`rounds-unaccounted` if Σ subset.missing > 0 and the warnings do not include
    `rounds-scored-as-miss`), ...warnings] (M20: reconciliation reports its misses as `rounds-scored-as-miss`; `rounds-unaccounted`
    remains only for a result that was never reconciled. M24, issue #8 point 5: this rule is unchanged — `rounds-unaccounted`
    is **reworded, not retired** (a result stored before M20 and not yet re-analyzed still produces it); only its message text
    changed, to drop the stale "score shown as a range".)

**Vectors** (complete categorization unless stated; "done/done" = stageA done, stageB done):
- incomplete categorization, stageA running → `needs-metadata`, []
- stageA error → `failed`
- stageA running → `processing`
- stageA done, stageB pending, warnings [image-blurry] → `ready`, [image-blurry]
- done/done, calibration null → `needs-attention`, [target-not-found]
- done/done, identified 0 → `needs-attention`, [no-shots-found]
- done/done, overcount 1, warnings [alignment-uncertain] → `needs-attention`, [too-many-shots, alignment-uncertain]
- done/done, warnings [extra-candidates-dropped] → `needs-attention`, [extra-candidates-dropped]
- done/done, `alignment.method` `overlay` → `needs-attention`, [alignment-uncertain] (REV-31)
- done/done, `alignment.method` `cv` with warnings [alignment-uncertain] (the `outsidePrior` case) → `analyzed`, [alignment-uncertain]
- done/done, precision golden fixture (missing 0) → `analyzed`, []
- done/done, golden with P8 multiplicity 1 (missing 1) → `analyzed`, [rounds-unaccounted]
- done/done, warnings [too-many-holes], result null → `needs-attention`, [too-many-holes] (M20)
- done/done, missing 1, warnings [rounds-scored-as-miss, double-punch-assumed] → `analyzed`, [double-punch-assumed, rounds-scored-as-miss] (M20)

**Messages** (`reasonMessage(reason, ctx)` in `src/lib/domain/reason-messages.ts`):

| Reason | Message |
|---|---|
| `target-not-found` | Couldn't find the target in this photo. Use Adjust to line it up. |
| `no-shots-found` | No shots detected. Use Adjust to add them. |
| `too-many-shots` | More shots found than the rounds you entered. Check the rounds or adjust shots. |
| `extra-candidates-dropped` | Some detected marks were ignored because you fired `<N>` rounds. |
| `rounds-unaccounted` | `<N>` round(s) not found — re-analyze to score them as misses. |
| `alignment-uncertain` | Used your on-screen alignment — check the rings line up. |
| `image-blurry` | This photo looks blurry, so results may be less accurate. |
| `template-mismatch` | This looks like a `<sighting/precision>` target — check the template. |
| `backing-colour-not-found` | No backing colour showed through the holes, so standard detection was used. Check the backing card or lighting. |
| `too-many-holes` | Found `<N>` clear holes but you entered `<D>` rounds. This may be the wrong target or the wrong round count. |
| `double-punch-assumed` | `<N>` hole(s) look like two shots through the same hole. |
| `rounds-scored-as-miss` | `<N>` round(s) weren't found and are scored as misses. |

## 5. Triggers and runner

State lives in `analysis.pipeline` (data-model §4) and `session.analyzeRequestedAt` (data-model §2).

**Pure planner** (`src/lib/pipeline/plan.ts`):

```ts
export type Job = { kind: 'A'; photoId: string } | { kind: 'B'; photoId: string };
export function planJobs(sessions: BiathlonSession[], photos: TargetPhoto[], analyses: TargetAnalysis[]): Job[];
```

1. For every photo whose `stageA` is `pending` or `running` → `A` job.
2. For every photo in a session with `analyzeRequestedAt !== null`, categorization complete, `stageA === 'done'`, and
   `stageB` `pending` or `running` → `B` job.
3. Order: all A jobs by `importedAt` ascending, then all B jobs by `importedAt` ascending.

Vectors:
- two photos with stageA pending → [A p1, A p2]
- a photo with stageA done and stageB pending in a session without analyzeRequestedAt → []
- the same with analyzeRequestedAt set → [B]
- categorization incomplete → no B
- a mix → A jobs first.

**Runner** (`src/lib/pipeline/runner-browser.ts`, singleton):
- `start(ctx)` on app load: reset `running` → `pending` (interrupted jobs), then loop.
- Loop: `planJobs` → take the **first** job → run it → repeat; idle when there are no jobs. One job at a time.
- `notify()` is called by services after ingest, metadata changes, Analyze, and adjustments. It wakes the loop.
- Stage A job: set `stageA 'running'` → A3–A5 (worker calls with `Comlink.transfer` of the working bytes) → one transaction
  saves calibration, shots (only if §8 allows), pipeline fields, `stageA 'done'`, and the photo status. Catch → `stageA 'error'`,
  `error` = first 200 chars.
- Stage B job: set `stageB 'running'` → B2–B4 → one transaction → `stageB 'done'`. Catch → `stageB 'error'`.
- Emits `pipeline-changed` events (`src/lib/pipeline/events.ts`, an `EventTarget`) with `{ photoId, sessionId }`. Screens re-read on these.
- **Retry**: the failed-status UI button resets the failed stage to `pending` and calls `notify()`.
- **Re-analysis**: once `analyzeRequestedAt` is set, any change to a photo's categorization, lighting, shots, or calibration sets
  its `stageB = 'pending'` (services do this), so results refresh automatically.
- **A changed template re-runs Stage A (REV-57, issue #10).** Changing `categorization.template` on a photo whose Stage A has
  finished also sets `stageA = 'pending'` (and `stageB = 'pending'`), so alignment and detection follow the template instead of the
  guess or overlay Stage A first saw — the disc size (115 vs 112.4 mm) and the printed circles A5 erases both depend on it. It does
  this **only when nothing is manual**: no `manual` calibration and no `manual` shot, which §8 protects. With anything manual the
  change only re-scores, as before, and **Re-analyze** in Adjust is the way to catch up. (`shouldRerunStageA`,
  `src/lib/pipeline/template-change.ts`.) A template changed **while Stage A is running** is caught when that run commits: the
  stored template is compared with the one the run used and, if it differs, Stage A is queued again once.

## 6. Worker API (`src/workers/cv.worker.ts`)

```ts
interface CvWorkerApi {
  ping(): Promise<{ loadedMs: number; hasMat: boolean }>;                                   // M01
  reviewAndAlign(workingJpeg: ArrayBuffer, prior: Calibration | null, templateHint: TemplateId | null):
    Promise<{ detection: { calibration: Calibration; confidence: number; outsidePrior: boolean } | null;
              sharpness: number; templateHint: { template: TemplateId; confidence: number } | null }>; // M10
  detectShots(workingJpeg: ArrayBuffer, calibration: Calibration, template: TemplateId, holeDiameterMm: number,
    backing: BackingInput):
    Promise<{ shots: Shot[]; detection: DetectionRecord;                                    // M11, M19
              suggestions: ShotCandidate[]; holeWidths: HoleWidth[] }>;                     // M21
}
```

`suggestions` (M21, REV-40) are the few discarded candidates worth offering in Adjust (`suggestShots` in
`src/lib/cv/suggestions.ts`), and `holeWidths` (REV-41) each detected hole's measured width for Adjust's double-punch
prompt (colour path only; the standard path returns none — M21 Open questions). Both are **derived**: Stage A ignores
them, and they are never stored, scored or drawn on a diagram.

The worker decodes JPEG bytes with `createImageBitmap` → `OffscreenCanvas` → `getImageData` → `RgbaImage`, then calls pure
functions. `reviewAndAlign` searches for both anchor sizes when `templateHint` is null (imports). Stage A passes it the **owner's
template** — `categorization.template`, else `capture.overlayTemplate` (REV-57; before, only the overlay) — so an import whose
template is already set is aligned against the right disc size.

## 7. Summary image auto-build

**Waiting, not skipping (owner report 2026-09-19).** A rebuild that finds a photo `processing` waits for the runner (at most 3 s) and then builds with whatever is `analyzed`. It used to skip outright, so a photo left at `processing` — a job the runner is not working on — blocked that session's summary for ever, silently.

- After any Stage B job finishes, if **no photo in that session is `processing`** and **at least one is `analyzed`**, schedule
  `buildComposite(ctx, sessionId, browserRenderTools)` with a 1500 ms debounce per session (a new trigger resets the timer).
- Slots come from `selectDefaultSlots` over `analyzed` photos (rendering-composite §5).
- Keep the newest **3** artifacts per session; delete older `artifact:<id>:*` blobs and their `ArtifactMeta`.
- While a rebuild is pending, the Session summary card shows "Updating summary…" over the previous image.

## 8. Adjustments never get overwritten

- If the user saves a calibration in Adjust, its `source` is `'manual'` and `pipeline.alignment.method = 'manual'`.
- Stage A never runs A4 when `calibration?.source === 'manual'`, and never runs A5 when any shot has `source === 'manual'`.
- Adjust offers **Re-analyze** (explicit; REV-46, formerly *Re-detect shots*): it first **saves what is on screen** —
  the alignment and every shot, exactly as Save does — then runs detection against **that** alignment, with the **Settings**
  backing and hole size as they are now (REV-48; changing a setting never re-runs anything by itself), replaces `auto`
  shots with what it finds, keeps `manual` ones, and re-scores. Nothing the user has on screen is discarded.
  A detected shot within **0.8 hole diameters** (`SAME_HOLE_DIAMETERS`, the tolerance M16 R4 uses to match detections
  to the owner's taps) of a kept `manual` shot is the same hole and is dropped: the user's shot wins, so re-analyzing
  never counts a hole twice. Deliberately under one diameter — two genuinely overlapping holes sit 0.5–1 diameter
  apart, and the second is a real shot.
- **A shot is where its hole is in the photo** (REV-46). Its millimetre position is derived through the alignment,
  so when the alignment changes in Adjust every shot is **re-projected**:
  `newMm = pxToMm(mmToPx(oldMm, oldCalibration), newCalibration)`. The holes stay put in the photo and the rings
  move; the score then follows the corrected rings. This applies to `auto` and `manual` shots alike.
- **Re-projection is not an edit.** On Save, a shot counts as changed only if it differs from the stored shot
  *re-projected into the saved alignment*, compared within `REPROJECT_TOLERANCE_MM` (1e-6 mm — far below any drag, far
  above floating-point drift). An `auto` shot that merely followed a re-alignment stays `auto`, so Re-analyze can still
  replace it.
- **Saving shots in Adjust confirms the capped set** (owner report 2026-09-19): it removes `extra-candidates-dropped`, whose
  purpose (§4 rule 8) is to ask the owner which capped marks were kept. Stage B's reconciliation raises it again only if it
  drops shots on its next pass, so a real over-count is never hidden. A save of the alignment alone keeps it. Before this,
  the warning survived every save, pinning the photo at `needs-attention` and so keeping it out of the summary image forever.
- **Saving confirms an overlay-guess alignment** (owner report 2026-09-19): when the stored alignment is `method: 'overlay'`
  (§4 rule 9 — no disc was found, the rings sit where the owner aimed), a Save sends the alignment on screen even if the
  rings were not moved (`adjustSavePatch`), so it becomes `manual` and rule 9 releases the photo. The owner has seen those
  rings over the photo and saved. Before, a shots-only save left the guess stored and the photo at `needs-attention`.
- Saving in Adjust sets `stageB = 'pending'` and calls `notify()`.

## 9. Performance budget (iPhone 16 Pro Max, measured in M15)

| Operation | Budget |
|---|---|
| OpenCV first load in worker (cold) | ≤ 5 s |
| Stage A per photo (after load) | ≤ 3 s |
| Stage B per photo | ≤ 1 s |
| Summary image build | ≤ 2 s |

## 10. Test hooks (only when `VITE_FAKE_CAMERA === '1'`)

`window.__asaTest`:
- `listPhotos(sessionId)`, `getAnalysis(photoId)`
- `setShots(photoId, shots)`: saves shots as `manual` and sets stageB pending
- `setCalibration(photoId, cal)`: manual
- `waitForIdle()`: resolves when the runner has no jobs
- `loadDemo()`: creates session "Demo — reference targets" from `demo/sighting.jpg` and `demo/precision.jpg` with categorizations and
  shots from `@fixtures/sample-shots-*.json` and calibrations from `@fixtures/seed-calibrations.json` (both `manual`), requests
  analysis, and returns the session id.

These hooks let e2e tests verify flows independently of CV accuracy.
