# M21: Session review, suggested holes and double punches

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16, M17 | high | L | optional correction · receive analysis |

## Goal
Give the app user the corrections the owner can make on the review page (`pnpm review:detection`), without copying that page's
job of *rating the detector*. Three owner decisions of 2026-09-18:

1. **REV-40 — suggested holes.** Detection measures every candidate it discards. The plausible few are offered in Adjust as
   hollow dashed markers; one tap makes a manual shot. This is the measured answer to a recall gap that no threshold can close:
   on the owner's 41 targets the suggestion rule surfaces a median of 3 per photo and contains 22 of the 30 real holes the filters
   discarded, and accepting them all reaches **83.3% recall with precision unchanged at 94.7%**.
2. **REV-41 — double punches.** A hole materially wider than 5.6 mm ± 5% offers a one-tap "2 shots". 13 of 41 rated targets have
   one, and it is scoring error the detection numbers never show.
3. **REV-42 — a review pass.** A route that walks a session's photos, needing attention first, with the existing Adjust surface
   embedded.

## Read first
- `docs/milestones/M13-adjust-shots.md` Steps 1–4 (ImageStage, modes, ShotInspector, Save)
- `docs/milestones/M17-place-and-compare.md` Step 1 (the parked-marker tray this sits beside) and Step 2 (`diagram-overlay.ts`)
- `docs/spec/analysis-pipeline.md` §4 (`photoStatus`), §6 (the worker boundary), §8 (never overwrite user edits)
- `docs/spec/geometry-scoring.md` §2 (`mmToPx`, `pxToMm`), §8 (`missing`)
- `docs/DESIGN-REVISIONS.md` 2026-09-18 (REV-40 to REV-42 and the measurements behind them)

## In scope
A `suggestions` field on the worker's detect result, a suggestion layer and a double-punch prompt in Adjust, and a session review
route that reuses Adjust.

## Out of scope
Detection itself (M16) — **no threshold in `holes.ts` changes**; the backing sheet (M19); declared-round reconciliation (M20);
the summary image (M14). **Not brought across from the review page:** quality ratings, alignment ratings, comments, and any
ratings export. Nothing new is sent anywhere; there are no runtime network calls.

## Files
- `src/lib/cv/suggestions.ts` (pure: the suggestion rule and ranking over `RejectedCandidate[]`)
- `src/lib/cv/multiplicity.ts` (pure: `suggestedMultiplicity(widthMm, holeDiameterMm)`)
- `src/workers/cv.worker.ts`, `src/workers/cv-client.ts` (`DetectShotsResult` gains `suggestions`)
- `src/components/adjust/SuggestionLayer.tsx`, changes to `ImageStage.tsx`, `ShotInspector.tsx`, `AdjustPage.tsx`
- `src/routes/review/ReviewPage.tsx`, a route in `src/app/router.tsx`
- `src/lib/services/review.ts` (pure ordering helper + the service call)
- `tests/unit/cv/suggestions.test.ts`, `tests/unit/cv/multiplicity.test.ts`, `tests/unit/services/review.test.ts`,
  `tests/e2e/review.spec.ts`, additions to `tests/e2e/adjust.spec.ts`

## Steps

1. **Carry the discarded candidates across the worker boundary.** `detectShotCandidates` already returns
   `rejected: RejectedCandidate[]` with every feature and a `reason`; `DetectShotsResult` currently returns only `shots`
   (analysis-pipeline §6). Add `suggestions: ShotCandidate[]`, chosen by a new pure `suggestShots(rejected, holeDiameterMm)`:
   - keep only `reason` of `'glyph' | 'paper' | 'mark-score'` — `'area'`, `'numeral'` and `'outside-sheet'` are never offered
     (noise, a masked printed numeral, and off-sheet holes respectively);
   - require `radialMm <= SUGGEST_RADIAL_MAX_MM` (60), `elongation <= SUGGEST_ELONGATION_MAX` (6) and
     `strokeRadiusMm >= SUGGEST_STROKE_MIN_MM` (0.70);
   - rank by `score − 0.004 × radialMm − 0.03 × elongation`, take the best `SUGGEST_MAX` (3).
   These five constants go in `src/lib/cv/constants.ts` with the measurement that set them. **Suggestions are derived**: never
   written to IndexedDB, never part of `analysis.shots`, absent from scoring and from every diagram.
2. **Show them in Adjust (REV-40).** A `SuggestionLayer` draws each one in image px (`mmToPx`) as a hollow marker with a dashed
   stroke, clearly not a shot — it must not read as something the app already counted. Tapping one creates a shot at its
   `xMm/yMm` with `source: 'manual'` and `multiplicity: 1`, and removes it from the layer. A control hides the layer entirely;
   when there are none, nothing is shown and nothing is said. Suggestions do not appear on the results screen or any diagram —
   only inside Adjust, where a person is deciding.
3. **Offer the double punch (REV-41).** Add pure `suggestedMultiplicity(widthMm, holeDiameterMm)`: below
   `holeDiameterMm × (1 + HOLE_DIAMETER_TOLERANCE)` it returns 1; beyond that it returns the whole number of hole widths that
   fit, capped at the Inspector's 20. Where it exceeds 1, `ShotInspector` shows one tap — "looks like N shots" — that sets
   `multiplicity` and marks the shot `manual`. It is **only ever a prompt**: automatic detection still stores multiplicity 1
   (REV-28), and a shot the user has already set is never re-proposed.
4. **The review route (REV-42).** `#/review/:sessionId` walks the session's photos:
   - order: `needs-attention` first (analysis-pipeline §4), then the rest, each group by capture time — a pure, tested helper;
   - each step embeds the Adjust surface (import the components; **do not fork them**), with a header "Photo 3 of 8", the
     target's headline score, and **Confirm** / **Skip**;
   - Confirm saves through the existing `saveAdjustments` when there are edits and moves on; with no edits it only moves on;
   - a final step lists what changed and links back to results;
   - entered from the session's results screen; leaving mid-way loses nothing, because each Confirm saves as it goes.
5. Re-run `pnpm cv:eval`. Detection numbers **must not move** — no threshold changed. Report the suggestion rule's yield
   (how many suggestions, and how many land within 0.8 hole diameters of a labelled hole) so the rule can be re-measured later.

## Tests
- `suggestShots`: a candidate rejected for `area` is never suggested; one at 75 mm radial is dropped; one at 55 mm with
  elongation 5 and stroke 0.9 is kept; 10 eligible candidates return the 3 best by rank; ties are ordered deterministically.
- `suggestedMultiplicity`: 5.6 mm → 1; 5.8 mm (inside ±5%) → 1; 11 mm → 2; 60 mm → 20 (the cap).
- Review ordering: three photos, one `needs-attention` → it comes first; equal statuses order by capture time; pure, no `Date.now()`.
- Adjust: tapping a suggestion adds one `manual` shot with `multiplicity` 1 and removes that suggestion; suggestions never reach
  `analysis.shots`; a stored analysis round-trips without them.
- E2E (both projects): open Adjust on a demo target with a suggestion → tap it → the live score changes → Save → the shot
  persists as `manual`. Walk a two-photo session review end to end and assert the order and that Confirm advances.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm cv:eval   # recall and precision unchanged from M16's recorded numbers
```
**Human (owner):** on the iPhone, review a real session end to end; confirm a suggested hole and a double punch, and that a
target with no suggestions shows no extra interface.

## Pitfalls
- A suggestion is **not** a detection. If one is ever counted, stored, scored or drawn on a diagram before the user taps it,
  precision silently collapses — that is exactly the 37.9% the measurement rejected.
- Adjust is the only editor. Forking `ImageStage` for the review route means two places to fix every future bug.
- mm is +y up, image px is +y down; convert only through `mmToPx`/`pxToMm`.
- Suggestions are recomputed, never persisted, so the pipeline can never overwrite a user's decision (analysis-pipeline §8).

## Open questions
1. **Does confirming a photo need to be recorded?** Step 4's Confirm with no edits changes nothing, so re-entering review shows
   the photo again as if untouched. Marking it reviewed would need a field on the photo or analysis (data-model §4), which is a
   storage decision and not one to guess. Either add it deliberately or accept that review is stateless.
2. **Where does the review route start from?** M12's results screen is specified without it; adding an entry point touches that
   screen's layout, which the owner has seen on the phone.
3. Suggestion constants are measured on 41 photos from one camera and one range. They should be re-measured when the sample set
   grows, particularly `SUGGEST_RADIAL_MAX_MM`, which encodes where this owner's misses happen to fall.

Raised during implementation (2026-09-19):

4. **Answered provisionally for Q1 and Q2 — review is stateless, entered from results.** No field was added (Q1): re-entering
   the review walks every photo again. The entry point (Q2) is a **Review session** link on the results screen, between the
   target cards and *Edit metadata*, shown only when the session has targets. Owner: confirm both on the phone.
5. **The milestone's `60 mm → 20` vector contradicts its own rule (non-blocking).** Step 3 says "the whole number of hole widths
   that fit, capped at 20"; 60 / 5.6 = 10.7, so no reading of that rule reaches the cap at 60 mm (the cap needs ≥ 112 mm). The rule
   is implemented as `ceil(width / holeDiameter)` beyond the tolerance — ceil, not floor or round, because it is the only reading
   that satisfies the milestone's `11 mm → 2` vector *and* REV-41's "materially wider than 5.6 mm ± 5% offers 2 shots" (with
   round, 5.9–8.3 mm would propose 1). The test asserts `60 mm → 11` and tests the cap at 113 mm and 500 mm. Owner: confirm, or
   give the intended formula.
6. **Where a hole's width comes from is not specified, and on the standard path no measurement tried works (non-blocking,
   owner decision).** `suggestedMultiplicity(widthMm, …)` needs a width per shot; a stored `Shot` has none. Measured on the
   owner's labelled holes (`pnpm cv:eval`, 237 matched detections, nearly all single shots): the blob's equivalent diameter reads
   p10 4.8 / p50 6.3 / p90 10.3 mm and **64.6 % read wider than one shot**; the moment-ellipse major axis reads wider on 94 %; the
   inscribed diameter never exceeds one shot. Any of them would put "looks like 2 shots" on most holes — M20 Open question 5
   found the same for its area ratio. So the **standard path supplies no width and shows no prompt**; the **colour path**
   (backing-sheet §5.4, the coloured area *is* the opening) supplies its equivalent-disc diameter. The prompt, the pure rule and
   the Inspector wiring are complete and tested; only the width source is withheld. This means the owner check "confirm a double
   punch" can only be done on a **backed** target today. Owner: accept colour-path-only, or name a width measurement to try.
7. **`DetectShotsResult` also gains `holeWidths` (non-blocking).** Step 1 names only `suggestions`; the widths for step 3 have to
   cross the same worker boundary, so they ride on the same result. Both are derived and ignored by Stage A. analysis-pipeline §1
   (route table) and §6 (worker result) were updated to match.
8. **The colour path offers no suggestions (non-blocking).** It discards no candidates (backing-sheet §5 merges coloured blobs), so
   `suggestions` is `[]` whenever holes were found by colour. The rule was measured on the standard path only.
9. **Adjust asks the worker for the suggestions each time it opens (non-blocking).** Suggestions are never stored, so Adjust
   re-runs `detectShots` against the stored alignment in the background (its shots are ignored). Suggestions appear a moment after
   the page; on iPhone this is one A5 run per open (M15 budget). A photo with no stored alignment (`target-not-found`) gets none.
10. **Two interpretations in the Adjust layer (non-blocking).** (a) A suggestion is hidden while any shot on screen lies within
    `SAME_HOLE_DIAMETERS` (0.8 hole diameters, analysis-pipeline §8) of it — that is how a tapped one disappears, and deleting that
    shot brings it back; it also hides suggestions the user already placed by hand. (b) "A shot the user has already set is never
    re-proposed" is read as: no prompt on a `manual` shot, nor on one whose multiplicity was changed on screen in this visit.
11. **Refactor to embed Adjust (non-blocking).** Step 4 forbids forking Adjust, and the editor's state lived in `AdjustPage`. It
    now lives in `src/components/adjust/useAdjustDraft.ts` (state, preview, suggestions) and `AdjustSurface.tsx` (the editor
    UI); `AdjustPage` and `ReviewPage` each wrap them with their own actions. Behaviour of the Adjust route is unchanged (all 12
    existing Adjust e2e runs pass). Two helper files are outside the *Files* list: `src/lib/services/detection-aids.ts` (the
    worker call for Adjust) and those two components; `reprojectShots` became generic so suggestions re-project with the
    alignment like shots (REV-46).
12. **The review's headline is the live draft's** (`targetHeadline` of the Adjust preview), so it moves as the user edits; a
    target with no result shows "No score yet".

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-19. Per the orchestration overrides this milestone
was **not** committed or pushed, and its Status is left `in-progress`.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (the same 4 pre-existing warnings), **759 unit tests in 76 files** (41 new in 3 files; was 718 in 73), privacy check passed (16 images) |
| `pnpm test:e2e` | **pass** — 56/56 (28 per project), including the new `review.spec.ts` and the new M21 test in `adjust.spec.ts` |
| `pnpm cv:eval` | **pass** — detection unchanged: every per-photo TP/FP/FN row identical to the run before the change (only the timing column differs); gated all **74.3 % / 92.9 %** (237/18/82), pre-M18 A4 row **76.2 % / 93.8 %** (M16's recorded numbers) |

### Suggestion rule yield (step 5, reported by `pnpm cv:eval`, never gated)

On the 35 gated photos: **59 suggestions** (median 2 per photo, max 3); **34** (57.6 %) land within 0.8 hole diameters of a
labelled hole; **30** labelled holes no detection found have a suggestion on them. Accepting every real suggestion would take
recall **74.3 % → 83.7 %** with precision **93.7 %** by position-matching (REV-40 measured 83.3 % / 94.7 % from the owner's own
per-candidate ratings — same direction; the labels here are the owner's approximate taps). No threshold in `holes.ts` changed.

### What was built

- **Step 1** — `src/lib/cv/suggestions.ts`: `suggestShots(rejected, holeDiameterMm)` (reasons glyph/paper/mark-score only;
  radial ≤ 60, elongation ≤ 6, stroke ≥ 0.70; rank `score − 0.004·radial − 0.03·elongation`; best 3; ties by radial, x, y),
  plus `visibleSuggestions` and `shotFromSuggestion`. Constants in `src/lib/cv/constants.ts` with the measurement. The worker's
  `detectShots` result gains `suggestions` (and `holeWidths`, Open question 7) via `detectShotsWithBacking`; `holes.ts` only gained
  `shotsFromReport` (extracted, no logic change). Stage A ignores both.
- **Step 2** — `SuggestionLayer.tsx`: hollow dashed pink rings (no fill, dot or number) drawn under the shots; a tap (not a drag)
  makes a manual multiplicity-1 shot; a **Hide/Show N suggested holes** control appears only when there are suggestions; nothing
  on results or any diagram. `src/lib/services/detection-aids.ts` asks the worker when Adjust opens and after Re-analyze.
- **Step 3** — `src/lib/cv/multiplicity.ts`: `suggestedMultiplicity`, `HOLE_DIAMETER_TOLERANCE = 0.05`, `doublePunchProposal`,
  `measuredWidthMm`, `equivalentDiameterMm`; `ShotInspector` shows **Looks like N shots**, which sets the multiplicity and marks
  the shot manual (Open questions 5 and 6).
- **Step 4** — `#/review/:sessionId` (`src/routes/review/ReviewPage.tsx`): order fixed at entry from `reviewOrder`
  (needs-attention first, each group by `captureTime.utc` ascending with null last, then `importedAt`, then id); "Photo N of M",
  the live headline, the embedded Adjust editor, **Confirm** (saves through `saveAdjustments` only when `hasAdjustEdits` says the
  draft differs from where it started) and **Skip**; a final step listing each photo as *Changes saved* / *Confirmed, no changes* /
  *Skipped* with **See results**. Entry: **Review session** on the results screen.

### Tests added

`tests/unit/cv/suggestions.test.ts` (13), `tests/unit/cv/multiplicity.test.ts` (15), `tests/unit/services/review.test.ts` (13),
`tests/e2e/review.spec.ts` (1 × 2 projects), one new test in `tests/e2e/adjust.spec.ts` (× 2). The demo's seeded alignment
yields no suggestion on either sheet, so the Adjust e2e moves the precision alignment 80 px down first (measured in Node to make
the detector discard three ring-sized marks inside 60 mm) — it tests the mechanics, not what the marks are. Existing stubs of
`detectShots` in three unit files gained `suggestions: [], holeWidths: []`.

### For the reviewer

Open questions 5 (the 60 mm vector) and 6 (no standard-path width) are the substantive deviations. The Adjust refactor
(Open question 11) moved code rather than changing it; the diff of `AdjustPage.tsx` is mostly deletion.

