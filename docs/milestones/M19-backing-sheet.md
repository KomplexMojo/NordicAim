# M19: Coloured backing sheet option

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16 | high | M | add metadata (option) · generate analysis |

## Goal
Let the shooter say, from a tucked-away option, that a coloured backing sheet was used — and optionally photograph the backing card —
so detection can find holes by the colour showing through them (REV-38). On the owner's first backing photo this found exactly the
8 holes with no fragments and no false marks, where the standard detector reported 17.

## Read first
- `docs/spec/backing-sheet.md` (all)
- `docs/spec/analysis-pipeline.md` §2 (A5), §4, §8
- `docs/spec/data-model.md` §2 (session), §5 (settings), photo `origin`
- `docs/milestones/M09-add-metadata.md` Steps (the metadata screen this extends)
- `docs/milestones/M16-detection-accuracy.md` *Rework* R3–R5 (sheet area, the labelled gate, the review page)

## In scope
The Session options panel, card capture/import, the data model and migration, colour measurement, the colour path in A5 with fallback,
the new reason, re-running detection when the backing changes, and backing support in `pnpm review:detection` and `cv:eval`.

## Out of scope
Assigning multiplicity from coloured area (only the `possibleOverlap` flag), the Adjust UI for that flag (M17), any change to the
three-step flow.

## Files
- `src/lib/domain/backing.ts`; `session.ts` (schema v2 + migration), `settings.ts` (`lastBacking`), `enums.ts` (`'backing-card'`,
  `backing-colour-not-found`), `reason-messages.ts`
- `src/lib/cv/backing-colour.ts` (pure: `backingColourFromCard`, `estimateBackingColour`, `detectByBackingColour`), `constants.ts`
- `src/lib/pipeline/stage-a.ts` (A5 branch, fallback, re-run on change), the store migration
- `src/components/metadata/SessionOptions.tsx`; capture screen card mode (no target overlay, a "fill the frame" guide)
- `scripts/cv-eval.ts`, `scripts/detection-review/` (backing photos, card swatch, method used)
- Tests under `tests/unit/cv/`, `tests/unit/domain/`, `tests/unit/pipeline/`, `tests/e2e/`

## Steps
1. Data model and migration per spec §3. Existing sessions load as `backing: null`; a v1 session round-trips to v2 unchanged otherwise.
2. `backingColourFromCard` and `estimateBackingColour` per §4, with their constants in `constants.ts`.
2a. `detectBackingPresence` per §4a, and `Auto` as the default mode; record `pipeline.detection.backing` on every analysis.
3. `detectByBackingColour` per §5 steps 1–5, and the A5 branch with the §5.6 fallback and `pipeline.detection` record.
4. Session options panel per §2: collapsed by default; `Auto` (default) / `None` / `Coloured backing`; swatch + source; **Photograph backing card** opens the
   capture screen in card mode; **Choose card photo** imports. A card photo that yields `null` shows the §4 message and is not saved as
   the session's card. New sessions inherit `AppSettings.lastBacking`.
5. Card photos: `origin: 'backing-card'`, excluded everywhere §3 lists. Deleting the session deletes them.
6. Changing the backing re-queues A5 per §5 for auto-only photos.
7. Reason `backing-colour-not-found` per §6.
8. `cv:eval`: a backing section over `fixtures/private/backing/` (skipped with a notice when absent) reporting, per photo, colour vs
   standard detections, recall and precision against labels when present, and the colour signature used. Gate per spec §7 **only when
   ≥ 10 labelled backing photos exist**; otherwise print the counts and `UNVERIFIED`.
9. `pnpm review:detection`: include `fixtures/private/backing/`, show which method ran, the card swatch, and `possibleOverlap` blobs.

## Tests
- `backingColourFromCard`: a synthetic pink card → hue within 3° of the true hue; a grey card → `null`; a card half in shadow still
  measures the hue within 5°.
- `detectByBackingColour` on a synthetic sheet with pink showing through 9 holes (one overlapping pair) and **blue handwriting** on the
  paper → 8 blobs, one flagged `possibleOverlap`, no blob on the handwriting or on any printed numeral or ring.
- On `fixtures/private/backing/IMG_5189.jpeg` (skip when absent): 8 detections, each within one hole radius of a real hole.
- With card `IMG_5190.jpeg` and target `IMG_5191.jpeg` (skip when absent): card hue within 3° of 15.9°; exactly 8 detections, one
  flagged `possibleOverlap`; and with the 3×3 opening removed the result is still 8 (the size guard catches the fringes) — pinning
  both defences.
- A synthetic sheet with 1-px coloured fringes along every printed ring edge → no detection on the fringes.
- `Auto` on every photo in `fixtures/private/` (skip when absent): all backed photos present, all unbacked photos absent, including the four with large coloured areas (IMG_4743, 4770, 4771, 5057 2).
- Fallback: backing set but the colour absent from the photo → standard detector runs, warning `backing-colour-not-found`, method `standard`.
- Card photos never appear in counts, results, the summary image or share payloads.
- Migration: a stored v1 session loads, validates and saves as v2 with `backing: null`.
- Changing the backing re-queues A5 for auto-only photos and leaves a photo with a manual shot untouched.
- E2E: open Session options, choose Coloured backing, import a card photo → swatch shown; the three-step flow is unchanged with the
  panel collapsed.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
pnpm review:detection
```
**Human (owner):** photograph at least 10 targets with the backing in varied light, each with a card photo in the same light; place them in
`fixtures/private/backing/`; label them with `pnpm review:detection`; paste the export. Until then the colour path is **unverified** and
the Completion notes must say so.

## Pitfalls
- A card photographed in different light from the target shifts the hue — measure it on the owner's set before trusting one card for a session.
- Coloured ink on the sheet (scores written in pen) can match the backing; hue plus the sheet area limit it, but test it.
- Never write the card photo, or anything derived from any photo, outside the phone's store or `fixtures/private/`.

## Open questions

### 1. ANSWERED 2026-09-18 — none of the four had a backing sheet

**All four are unbacked**, confirmed by looking at them: `IMG_4743` is a sighting sheet on a weathered **wooden frame**
(the 31–49° hues are the bare wood at the photo's left and right edges); `IMG_4744`, `IMG_5182` and `IMG_5184` are white
paper stapled to a **pale beige board**, photographed in shade. None carries a coloured backing — a fluorescent sheet is
unmistakable when present (compare `IMG_5189`/`IMG_5191`). **Say so if you disagree**; the constants below follow from this.

**The fix is therefore determined by the measurement already taken, not by tuning.** The implementer was right that
`AUTO_MIN_SPOTS` cannot separate the sets (3–8 unbacked spots against 6–10 backed). Two other measured axes separate them
cleanly, and both were named in its own analysis:

| | The four unbacked | The six backed |
|---|---|---|
| Accepted-pixel radius, p10 | **101–133 mm** (the board and scenery, at the 150 mm cap) | **4–12 mm** (where the holes are) |
| Max chroma | **82–110** (wood, sky, shade) | **209–223** (fluorescent paper) |

Either separates with a wide margin; together they are decisive. Implement **both**, because they fail differently — a
chroma floor catches a bright board, a radial rule catches a dull one:

- **A chroma floor** (`AUTO_MIN_CHROMA`, start **150**, midway between 110 and 209) — a backing sheet is fluorescent; wood,
  sky and shade are not.
- **A radial rule**: accepted pixels must cluster where holes can be, not in the outer band. The cleanest form is to tighten
  `findSheet`'s mask so the board around the sheet stops leaking in, which is the root cause the implementer identified;
  failing that, require the accepted-pixel radius p10 to sit inside the scoring area.

Both are §7 constants: provisional until the labelled backing set exists, and they must be re-measured with it. Keep the
four verdicts pinned by name in `tests/unit/cv/backing-colour.test.ts`, now asserting **not backed**.

### 1a. Original question, kept for the evidence
1. **BLOCKING — `Auto` reads four of the owner's 46 reference photos as backed** (`IMG_4743` 3 spots, `IMG_4744` 6,
   `IMG_5182` 8, `IMG_5184` 6; largest blob 0.22–0.88× a hole). §4 is explicit that "the colour path must never run on a
   photo without a backing", and §4a's table expects `IMG_4743` **absent** by the area rule — but with REV-36's sheet
   search in place the scenery is already outside the search area, so the large-blob ratio no longer separates it
   (measured 0.22×, not 4.6×). `IMG_4770`/`IMG_4771` are still refused (264×, 667×) and `IMG_5057 2`/`IMG_5084` by the
   spot count. Since `Auto` is the **default** mode (and the v1 → v2 migration puts every existing session on it), a
   session created today would silently take 3–8 colour blobs on those four photos instead of the standard detector's
   result. The milestone is therefore **`blocked`** rather than done, and all four verdicts are pinned by name in
   `tests/unit/cv/backing-colour.test.ts` so the divergence cannot change unnoticed.

   **What was measured on 2026-09-18** (fix round 1), to put the question to the owner precisely: every coloured pixel
   those four contribute sits in the **outer band** of the REV-36 search area. Accepted-pixel radius p10 was 101 mm
   (`IMG_4743`) and 128–133 mm (the other three) against the 150 mm search cap, at hues **31–49°** (bare wood) and
   **213°** (sky/shade); the backed photos' accepted pixels sit at radius p10 **4–12 mm**, where the holes are. The
   white-balance gains were 0.94–1.04, so this is not a neutralisation artefact — it is the board and surroundings
   around the sheet leaking through `findSheet`'s mask. Two of `IMG_4744`'s blobs land exactly on labelled holes (wood
   seen through a hole), so **no threshold on `AUTO_MIN_SPOTS` alone separates the sets** (3–8 unbacked spots against
   6–10 backed): raising it to 9 would lose four of the six backed photos.

   **The owner must say which of those four photos (if any) actually had a backing sheet.** If none did, the fix is
   *not* the spot floor: it is either a tighter sheet mask (the board around the sheet is inside the searched area) or a
   chroma/saturation floor that separates bare wood (max chroma 82–110 on these four) from a fluorescent backing
   (209–223 on the backed photos). Both are constants the spec calls provisional and §7's photo set is meant to set, so
   nothing was tuned here on a guess. `pnpm cv:eval` prints the list under "CONFIRM WITH THE OWNER".
   *(Not blocking M20: it consumes `possibleOverlap` and the declared rounds, not `Auto`'s verdict.)*
2. **`IMG_5189` yields 7 holes, not the 8 of §4's table**, measured with the same chroma ≥ 40 rule but inside the REV-36
   sheet area and after the 3×3 opening. One hole falls under the 0.08 × hole-area guard. Pinned as 7 in the unit test.
   The milestone also asks that each detection be "within one hole radius of a real hole": **no backing photo is
   labelled yet** (the labels cover the 46 unbacked reference photos; labelling the backing set is §7's human step), so
   the test checks the labels when `IMG_5189` appears in an export and, until then, against the standard detector's
   candidates — which on this photo include all 8 real holes (§1). Measured: all 7 are within **1.47 mm** (hole radius
   2.8 mm), so none of them is a fringe.
3. **§5.1's "with the 3×3 opening removed the result is still 8" does not hold on `IMG_5191`**: measured 9 (card hue) and
   11 (chroma). The size guard alone does not catch every fringe, so the opening is load-bearing rather than a second
   defence. Pinned as 9.
4. **`estimateBackingColour` has no caller in the spec.** §3 gives `BackingSheet.source: 'estimated'` and the milestone
   asks for the function, but §5 uses the neutral-chroma rule directly when there is no card, so nothing in the pipeline
   needs an estimated `ColourSignature`. It is implemented as the hue statistics of the pixels the chroma rule accepts,
   and is reported by `pnpm cv:eval` as "the colour signature used". No UI writes `source: 'estimated'` yet.
5. **`pipeline.detection` has no value for "Stage A has not run".** §3's `backing` enum is
   `detected | not-detected | forced | off`; a fresh analysis records `off` until A5 decides.
6. **`possibleOverlap` has no home in `data-model.md`.** §5.5 says a blob "is flagged `possibleOverlap: true`" and M17/M20
   consume it, so it is stored on `Shot` (`z.boolean().default(false)`, so shots written before REV-38 still read back).
   **M20 step 5 should read `shot.possibleOverlap`.**
7. **`detectBackingPresence(img, calibration)` in §4a needs two more arguments** — the template and the hole diameter —
   because it rectifies and sizes a hole exactly as A5 does. Implemented as
   `detectBackingPresence(cv, img, calibration, template, holeDiameterMm)`.
8. **"Back to pending *from A5*" has no resume point in Stage A**, so changing the backing sets `stageA` to `pending` and
   the whole stage re-runs (A4 is skipped anyway for a manual calibration). `stageB` is reset with it when it had already
   finished, so the score is rebuilt from the new shots instead of being left stale.
9. **Pairing a card photo with a target in `fixtures/private/backing/` has no convention in the spec.** `pnpm cv:eval` and
   `pnpm review:detection` read `fixtures/private/backing/cards.json` (`{"IMG_5191.jpeg": "IMG_5190.jpeg"}`); a target with
   no entry is measured with the neutral-chroma rule. The file for the owner's two orange photos was written (gitignored).
10. **§4a names only one fallback reason string** ("large coloured area"). The other two are
   `no coloured spots` (Auto saw too few) and `no backing colour showed through` (§5.6's fallback), both exported constants.
11. **`data-model.md` §2 and §8 still say `schemaVersion: 1` for `BiathlonSession`**, while backing-sheet.md §3 says
   "Schema version 1 → 2". The spec written for this milestone wins (golden rule 2: the later spec is the one this
   milestone implements), so the code and `tests/unit/domain/schemas.test.ts` use 2 — but **data-model.md §2 and its §8
   example record need the owner's edit** to match. Recorded here rather than changed, because data-model.md is not in
   this milestone's *Files*.
12. **A5's cost, for M15's measurement.** `Auto` with a card now rectifies **once** (fix round 1: the §4a probe and the
   §5 hue mask share one `Rectified`, so the warp plus `findSheet` runs once instead of twice). What remains is §5.6's
   fallback: when the colour path yields zero blobs the standard detector rectifies again, because `detectShots` owns
   its own warp (`src/lib/cv/holes.ts`, M16). Sharing that one would mean reworking `holes.ts`, which is out of scope
   here; **M15's performance budget should expect a fallback photo to cost two warps.**
13. **`Shot` carries no area, so Stage B's cap cannot rank by it.** §5.4's coloured area now reaches `capShots` in Stage
   A (`CappableShot.areaMm2`, dropped again by `withoutArea` before the analysis is stored, since data-model §4 has no
   such field). Stage B re-caps from the stored shots, where only `confidence` survives — for a colour-path shot that is
   `null`, so a re-cap after metadata falls back to the radial tie-break. Adding an area to `Shot` is a data-model
   change and was not made here.

## Completion notes
**Commands** (2026-09-18, this machine):

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck, lint (0 errors, 4 pre-existing warnings), 587 unit tests, privacy check (16 images) |
| `pnpm cv:eval` | **pass** — "all synthetic cases and reference photos pass"; the new backing section is UNVERIFIED (see below) |
| `pnpm test:e2e` | **pass** — 42 tests, mobile Chromium and mobile WebKit |
| `pnpm review:detection` | **pass** — 52 photos (46 reference + 6 backed), page written inside `fixtures/private/review/` |
| `pnpm build` | **pass** |

**The colour path is UNVERIFIED** (backing-sheet.md §7). The owner has 6 backed target photos and 1 card; §7 asks for at
least 10 backed photos with a card each, labelled. `pnpm cv:eval` therefore prints `GATE: UNVERIFIED` with the counts and
gates nothing. Measured today on the 6 photos (colour vs the standard detector, no labels to score against):

| photo | colour | overlap flags | standard | Auto |
|---|---|---|---|---|
| IMG_5189 (pink, no card) | 7 | 1 | 25 | present, 7 spots, 0.61× |
| IMG_5191 (orange, card IMG_5190) | **8** | 1 | 7 | present, 8 spots, 0.49× |
| IMG_5193 (orange, card IMG_5190) | **10** | 2 | 15 | present, 10 spots, 0.67× |
| IMG_5194 (red, no card) | 9 | 0 | 9 | present, 9 spots, 0.20× |
| IMG_5196 (red, no card) | 6 | 2 | 9 | present, 6 spots, 0.46× |
| IMG_5198 (red, no card) | 9 | 1 | 14 | present, 9 spots, 0.76× |

IMG_5191 and IMG_5193 reproduce §5's measured 8 (one overlap) and 10 exactly. The card measured **15.9° ± 2.4°**, matching
the spec's number to one decimal place.

**Deviations from the spec**, all recorded above as Open questions: `IMG_5189` gives 7 rather than 8 (2); `IMG_5191`
without the opening gives 9 rather than 8 (3); `Auto` reads 4 reference photos as backed where §4a expects 1 of them
absent (1). No constant was changed from its spec value.

**Design notes for the reviewer**
- The A5 branch is a pure function, `detectShotsWithBacking` in `src/lib/cv/backing-colour.ts`, so the whole decision
  (`none` / `coloured` / `auto` + §5.6's fallback) is unit-tested without the worker. Stage A only passes the session's
  backing down and turns the returned `DetectionRecord` into the `backing-colour-not-found` warning
  (`usedBackingFallback`: `method === 'standard'` with `backing` `forced` or `detected`).
- `rectify` grew an `rgb` option (CV_8UC3) because the colour path needs hue in the rectified square; `chroma` alone is a
  scalar. Every caller deletes it.
- **A backing-card photo is kept out of `session.photoIds`.** That one decision makes every count, screen and planner
  correct without a filter at each call site (the metadata screen, results, `Analyze N targets`, the session list badge,
  `SessionRedirect`). `isTargetPhoto` is still asserted in `planJobs`, `runStageA`, `requestAnalysis` and both screens.
- `AppSettings` keeps `schemaVersion: 1` (data-model §5 does not bump it); the two new fields carry zod defaults so rows
  written before REV-38 read back. `BiathlonSession` goes to version 2 with `upgradeSession` run on every read.
- The summary image and share payloads (M14) are not built yet; the card photo is excluded from the data they will read.

**Not done**: nothing in *In scope* was left out. The optional results note of §2 ("Holes found by backing colour") is
shown on the target card when `pipeline.detection.method === 'colour'`.

### Fix round 1 (2026-09-18, review feedback)

| # | Issue | What changed |
|---|---|---|
| 1 (major) | `Auto`'s four false positives were diagnosed but not pinned by any test, so `pnpm check` stayed green over them | All four (`IMG_4743`, `IMG_4744`, `IMG_5182`, `IMG_5184`) are now asserted **by name** in `tests/unit/cv/backing-colour.test.ts` with their measured spots and largest-blob ratio, plus a control case that four other reference photos are still absent. Open question 1 carries the new measurement (below) and the milestone's status is **`blocked`**, not done. |
| 2 (minor) | `IMG_5189` had no "within one hole radius of a real hole" check | Added. No backing photo is labelled yet, so the test uses the labels when `IMG_5189` appears in an export and the standard detector's candidates until then; measured max distance **1.47 mm** against a 2.8 mm hole radius. |
| 3 (minor) | Colour-path shots reached `capShots` with no `confidence` and no area, so the cap kept the most central marks | `backingBlobsToShots` now returns `CappableShot[]` carrying §5.4's `areaMm2`; `DetectShotsResult` and Stage A were typed through, and `withoutArea` (new, in `cap-shots.ts`) drops it again before the analysis is stored, since data-model §4's `Shot` has no area. New unit test: capping 8 colour blobs to 4 keeps the 4 **largest**, not the 4 most central. |
| 4 (minor) | The data-model.md §2/§8 `schemaVersion: 1` conflict was not recorded | Now **Open question 11**. |
| 5 (minor) | `Auto` with a card rectified the working image twice | `detectByBackingColour` was split into `withBackingView` + `reportFromView`, so the §4a probe and the §5 hue mask share one warp and one `findSheet`. The §5.6 fallback still costs a second warp inside `detectShots`; recorded for M15 as **Open question 12**. |

**What Open question 1's new measurement says** (the reviewer asked for evidence or a `blocked` status; both are here):
the coloured pixels on all four photos sit in the **outer band** of the search area (accepted-pixel radius p10 101 mm and
128–133 mm against a 150 mm cap) at wood and sky hues, while the backed photos' coloured pixels sit at radius p10 4–12 mm,
on the holes. Raising `AUTO_MIN_SPOTS` cannot fix it (3–8 unbacked spots against 6–10 backed), so no constant was moved.

**Commands re-run after the fixes** (2026-09-18): see the table at the top of these notes — all re-run and all still pass;
`npx vitest run tests/unit/cv/backing-colour.test.ts` now reports **29** tests (was 23).
