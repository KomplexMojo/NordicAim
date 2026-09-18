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

## Completion notes
_(fill in when done)_
