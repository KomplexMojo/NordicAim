# M20: Declared rounds are fact

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16, M19 | high | M | generate analysis (scoring) |

## Goal
The rounds the shooter enters are **fact**, and the analysis reconciles what it found against them instead of guessing (REV-39):
- **Clearly more holes than rounds → reject the target.** Something is wrong (wrong target, wrong round count, a neighbour's shots);
  don't score it.
- **Fewer holes than rounds → look for double punches first** (common), **then count the rest as misses** (also common — shooting the
  wrong target, especially when sighting in). The score is definite, not a range.

## Read first
- `docs/DESIGN-REVISIONS.md` REV-39 (and REV-18, REV-28, REV-29, which it amends)
- `docs/spec/geometry-scoring.md` §7, §8
- `docs/spec/analysis-pipeline.md` §2 (A5, B2), §4, §8
- `docs/spec/backing-sheet.md` §5 (the colour path's `possibleOverlap` evidence)
- `docs/milestones/M16-detection-accuracy.md` Step 5 (`capShots`) and *Rework* R4

## In scope
A pure reconciliation step between detection and scoring, the reject rule, double-punch inference, misses in scoring, reasons and
status, and the results/summary presentation of all three outcomes.

## Out of scope
Detection itself (M16, M19). The Adjust screen beyond relabelling parked markers and the **off target** control (below).

## Steps
1. **Pure `reconcileRounds(found: FoundHole[], declared: number, evidence): Reconciliation`** in `src/lib/scoring/reconcile.ts`, run per
   subset after detection and before `analyzeTarget`. It replaces `capShots` as the decision point (REV-28's cap becomes one branch).
   `FoundHole` carries its position, confidence, `confident: boolean` (step 2), and overlap evidence (coloured-area ratio to the photo's
   median single hole on the colour path; area ratio and elongation along the tear on the standard path).
2. **Confident holes.** On the colour path (M19) every found hole is confident — it measured 0 false marks on the owner's backing
   photos. On the standard path, `confident` requires `confidence ≥ CONFIDENT_HOLE_MIN`, a constant **measured on the owner's labelled
   holes** (M16 R4) at a precision of at least 0.98; if no value reaches that precision, the standard path has **no** confident holes and
   the reject rule never fires there (only the cap below applies). Record the measured value either way.
3. **Too many — reject.** If `confident > declared + REJECT_MARGIN` → outcome `rejected`: no score is computed or shown, status
   `needs-attention`, reason `too-many-holes`. `REJECT_MARGIN` is **0** (owner, 2026-09-17: the declared count is fact; **confirmed**: "1 extra is fine, keep rejection at any excess"). The shots are kept
   so the owner can inspect them in Adjust.
4. **A few low-confidence extras — cap.** If `found > declared` but `confident ≤ declared + REJECT_MARGIN`: keep every confident hole,
   fill up to `declared` with the best non-confident ones (REV-28's ranking), drop the rest, warning `extra-candidates-dropped` (unchanged).
5. **Too few — double punches, then misses.** Let `short = declared − found`.
   1. Rank found holes by overlap evidence, strongest first. A hole qualifies when its evidence clears `DOUBLE_PUNCH_MIN_RATIO`
      (start 1.8 × the median single-hole area on the colour path; measure the standard path's equivalent on labelled holes).
   2. Give qualifying holes one extra shot each, in rank order, until `short` is used up or none qualify. A hole may take a **third** shot
      only if its evidence clears `2 × DOUBLE_PUNCH_MIN_RATIO` and short remains after every qualifying hole has two.
      Inferred shots are ordinary auto shots at the hole's position (same ring value), recorded as `inferred: 'double-punch'`.
   3. Whatever is still short is **misses**: `missesAssumed = short` after step 2. Reason `rounds-scored-as-miss`.
   - `found = declared` → nothing inferred, nothing missed; overlap evidence is ignored (every round is accounted for).
6. **Scoring with misses** (amends geometry-scoring §8): a miss scores **0** on precision and is a **miss** on sighting. The headline is
   the definite total, e.g. `68 / 100 · 1 miss`; the optimistic / pessimistic / averaged range is **no longer shown** for automatic
   analyses (REV-18's range presentation is superseded; keep the functions only if something else still uses them, else delete).
7. **Reasons, status, presentation** (analysis-pipeline §4):
   - `too-many-holes` — "Found N clear holes but you entered D rounds. This may be the wrong target or the wrong round count." →
     `needs-attention`; the card shows the photo and this message instead of a score; the target is **excluded** from the summary image.
   - `double-punch-assumed` — "N hole(s) look like two shots through the same hole." → note only, status unaffected.
   - `rounds-scored-as-miss` — "N round(s) weren't found and are scored as misses." → note only, status `analyzed`.
8. **Owner overrides win.** Manual shots and manual multiplicity (analysis-pipeline §8) are never altered by reconciliation. In Adjust
   (M17) the parked markers for `missesAssumed` are labelled **Scored as miss** — dragging one onto a hole turns that miss into a shot.
   Removing an inferred double reverts that round to a miss. Changing the declared rounds re-runs reconciliation.

## Tests
- `reconcileRounds` vectors, colour path:
  - declared 10, 15 confident → `rejected`, reason `too-many-holes`, no score.
  - declared 10, 11 confident → `rejected` (margin 0).
  - declared 10, 10 found, two with ratio 2.2 → no inference (every round accounted for); IMG_5193's two long tears must not become doubles.
  - declared 10, 8 found, one at ratio 2.23 → 1 double inferred, 1 miss; IMG_5191-shaped case (9 real shots on 8 holes, declared 10) → 1 double, 1 miss.
  - declared 10, 7 found, none qualifying → 3 misses.
- Standard path: a hole below `CONFIDENT_HOLE_MIN` never triggers rejection; 12 found / 10 declared with 9 confident → capped to 10, warning.
- Scoring: declared 10, rings [10, 9, 9, 8] + 1 double on the 9 + 5 misses → total 45 / 100 · 5 misses; sighting misses count as misses.
- A manual multiplicity is untouched; a manual shot added in Adjust reduces `missesAssumed` by one.
- A rejected target is absent from the summary image slots.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste `CONFIDENT_HOLE_MIN` and `DOUBLE_PUNCH_MIN_RATIO` with the measurements behind them into Completion notes.
**Human (owner):** for at least 10 labelled targets with known round counts (including a double punch, a shot on the wrong target and a
neighbour's shot), confirm the outcome — rejected, doubles, misses — matches what happened.

## Pitfalls
- Don't infer doubles when every round is already accounted for: long tears look like overlaps.
- Rejection is per subset for a `both` target; say which position was rejected.
- A rejected target keeps its shots and photo — rejection withholds a score, it doesn't discard data.

## Open questions

1. **RESOLVED 2026-09-18 by REV-43.** The owner: *"If a round is on the paper off the scoring area, treat it as a ring-zero
   unit."* The deciding distinction is **whether a position exists**, not whether the round scored:
   - a hole **on the paper, outside the scoring area** is a **ring-zero unit at its measured position**, and enters the group
     metrics (geometry-scoring §6) like any other located shot — nothing about it is invented;
   - a declared round with **no hole found anywhere** stays an **assumed miss** (step 5.3) and enters no group metric, because
     it has no position.

   This milestone must therefore check three things rather than assume them:
   - **does a shot beyond ring 1 already score 0** under geometry-scoring §7, or does the ring lookup need an explicit
     outside-the-rings case? Verify; do not change the ring maths without saying so;
   - a ring-zero unit **counts as identified**, so it reduces `missing` and must never also be counted as an assumed miss;
   - **sighting sheets score by zone, not ring** — confirm the equivalent: a hole on the paper outside the outermost zone is a
     located unit that misses the zone tally but still enters the group metrics.

2. **This milestone owns the *off target* control** (moved from M17, which delivered everything else). Under REV-43 its
   meaning is now narrow: a paper hole outside the rings needs no control at all — it is simply a detected shot that scores
   zero — so the control means only *"this round is not in this photo"*, which is step 5.3's assumed miss. Deliver it as that
   single concept on the parked-marker tray, alongside step 8's *Scored as miss* label.
   **Delivered (M20):** the tray is headed *Scored as miss*; each marker reads "not found in this photo (off target), so it is
   scored as a miss". Leaving a marker there is the off-target answer; dragging it onto a hole makes it a shot.

3. **Status rule 7a is evaluated before rule 6, not after rule 7 (spec order conflict, non-blocking).** Step 3 says a rejected
   target has "no score computed", so `computed` is null — and in the spec's position rule 6 (`result === null` →
   `no-shots-found`) would always fire first. `photoStatus` checks `too-many-holes` right after rule 5, and analysis-pipeline §4
   now says so. Owner: confirm, or say if a rejected target should carry a hidden result instead.
4. **`rounds-unaccounted` is suppressed when `rounds-scored-as-miss` is present (non-blocking).** §4 rule 10 would otherwise
   report both, and the `rounds-unaccounted` message still says "score shown as a range", which is no longer true. It can now
   only appear on a result stored before M20 that Stage B has not re-scored. The message text was left as the spec states it.
5. **Standard path: no double punches are inferred (measured, non-blocking).** Step 5.1 asks for the standard path's
   `DOUBLE_PUNCH_MIN_RATIO` equivalent. Measured on the owner's labels (below), no area, area-ratio or elongation threshold
   separates the 13 multi-shot holes from the 219 single ones better than about 1 : 8, so `DOUBLE_PUNCH_MIN_RATIO_STANDARD` is
   `null` and a short standard-path count is all misses. M21 (REV-41) offers doubles to the user instead. Owner: confirm.
6. **A `both` target with one rejected subset withholds the whole target's score (non-blocking).** The reconciliation runs per
   subset and the `too-many-holes` message names the position ("Prone: Found 8 clear holes…"), but no partial score is shown for
   the other position: §7 gives the standing subset the outermost holes, so extra holes can only ever land in `prone` (and a
   neighbour's outlying holes would have been assigned to `standing`), which makes the other subset's score untrustworthy too.
7. **Inferred doubles are stored as the auto shot's `multiplicity` plus `inferred: 'double-punch'`, not as a second shot
   record (interpretation, non-blocking).** "Ordinary auto shots at the hole's position" — the extra unit is an auto unit at the
   same position with the same ring. Using the multiplicity is what makes step 8 hold: the owner removes an inferred double by
   setting the hole to 1 in the Inspector, which saves the shot as `manual`, and reconciliation never re-infers once the owner
   has edited. A separate record removed in Adjust would leave no trace, and the next Stage B would infer it again.
8. **Owner edits freeze inference (interpretation).** While every shot is `auto`, reconciliation starts afresh on every run
   (so changing the declared rounds re-reconciles). Once any shot is `manual`, stored multiplicities are kept and nothing new
   is inferred; the cap and the reject rule still apply to the `auto` shots, with the owner's units counted as fixed.
9. **A candidate dropped by the cap is gone for good** (unchanged from M16): if the owner later raises the declared rounds, the
   dropped candidate is not recovered unless Re-analyze runs. `extra-candidates-dropped` stays sticky for the same reason.
10. **Data model additions:** `Shot.overlapRatio?: number` and `Shot.inferred?: 'double-punch'` (optional, so every stored shot
    still reads), recorded in data-model §4 alongside the M19 `possibleOverlap` field the spec had not listed. `PrecisionScore.range`
    and `SightingOutcome.range` were **deleted** (step 6: nothing else used them), and geometry-scoring §8.1/§8.2,
    rendering-composite §3/§4/§5 and analysis-pipeline §1/§2/§4 were updated to match.
11. **The summary-image test** ("a rejected target is absent from the summary image slots") cannot be written yet:
    `selectDefaultSlots` is M14's. The precondition is tested here (a rejected target is never `analyzed`), rendering-composite §5
    now states the exclusion, and the test was added to M14's Tests list.

## Completion notes

Implemented by the `milestone-implementer` agent (orchestrated run), 2026-09-18. Not committed; Status left `in-progress` for
the reviewer and finalizer.

### Commands

| Command | Result |
|---|---|
| `pnpm check` | **pass** — typecheck clean, lint 0 errors (the 4 pre-existing warnings), **680 unit tests in 67 files**, privacy check passed (16 images) |
| `pnpm cv:eval` | **pass (exit 0)** — labelled gate recall 74.3% (floor 72.0%), precision 92.9% (floor 85.0%); new *Confident holes* section (below); backing gate UNVERIFIED as before (0 labelled backing photos) |
| `pnpm test:e2e` | **pass** — 46/46 on mobile-chromium and mobile-webkit |
| **Human (owner)** | the 10-target outcome check in *Acceptance*; iPhone look at a rejected card. **Not done by the agent** |

### Measured constants

**`CONFIDENT_HOLE_MIN = 0.94`** (standard path; every colour-path hole is confident). Measured by `pnpm cv:eval` on the owner's
labelled holes (`ground-truth-holes-v2.json`, 35 gated photos) with the pipeline's own A4 (REV-44) and A5: 255 detections, 237 of
them real.

| confidence ≥ | detections | false | precision | share of real holes |
|---|---|---|---|---|
| 0.50 | 234 | 18 | 92.3% | 91.1% |
| 0.70 | 153 | 9 | 94.1% | 60.8% |
| 0.80 | 126 | 5 | 96.0% | 51.1% |
| 0.85 | 101 | 3 | 97.0% | 41.4% |
| 0.90 | 51 | 1 | 98.0% | 21.1% |
| **0.94** | **22** | **0** | **100.0%** | 9.3% |
| 0.97 | 14 | 0 | 100.0% | 5.9% |

Precision is not monotonic: it first reaches 0.98 at 0.883 (68/69) but drops to 0.962 at 0.935, where the last false detection
sits (0.93506). The lowest threshold with precision ≥ 0.98 **at it and every threshold above** is 0.9377; 0.94 is that, rounded
up. Consequence: on the standard path only ~9% of real holes are confident, so the reject rule there fires only on holes the
detector is nearly certain of (no gated photo had a confident false detection); the cap handles the rest, as step 2 anticipates.

**`DOUBLE_PUNCH_MIN_RATIO = 1.8`** (colour path, the milestone's start value). Coloured-area ratios to the photo's median blob,
measured on `fixtures/private/backing/` with the REV-44 alignment:

| photo | ratios, largest first | known |
|---|---|---|
| IMG_5189 | 2.18, 1.25, 1.04, 1.00, … | 9 shots on 8 holes (one double) |
| IMG_5191 | 2.11, 1.12, 1.02, 1.00, … | 9 shots on 8 holes (one double) |
| IMG_5193 | 2.19, 1.88, 1.42, … | 10 rounds, 10 holes: two long tears, suppressed because every round is accounted for |
| IMG_5194 | 1.45, 1.09, … | — |
| IMG_5196 | 2.95, 2.20, 1.00, … | — |
| IMG_5198 | 3.44, 1.36, … | — |

The known doubles read 2.11-2.18 against ≤ 1.25 for every other hole on those photos, so 1.8 holds; the third-shot bar (3.6) is
not reached by any known case. Still provisional until the ≥ 10 labelled backing photos of backing-sheet §7 exist.

**`DOUBLE_PUNCH_MIN_RATIO_STANDARD = null`** — measured (Open question 5): the owner's comments name 13 multi-shot holes
(`#N` mapped to detections by re-running the v2 review page's ranking at its recorded calibration; 11 of the 15 commented photos
reproduced the page's detection count exactly, and only those were used). Blob area / photo median ≥ 1.8 catches 2 of 13 doubles and 25 of 219 singles;
area / nominal hole ≥ 3 catches 7/13 and 69/219; elongation ≥ 2.3 catches 5/13 and 78/219. Nothing separates them.

### What was built

- **`src/lib/scoring/reconcile.ts`** — `reconcileRounds(found, declared, evidence)` with `FoundHole`, `RoundsEvidence`,
  `Reconciliation`, and the constants `REJECT_MARGIN` (0), `CONFIDENT_HOLE_MIN`, `DOUBLE_PUNCH_MIN_RATIO`,
  `DOUBLE_PUNCH_MIN_RATIO_STANDARD`. Outcomes `rejected` / `capped` / `exact` / `short`; the cap uses REV-28's ranking
  (`ranked`, now exported from `cap-shots.ts`).
- **`src/lib/scoring/reconcile-shots.ts`** — `reconcileShots` (per subset via §7's `assignPositions`; manual units fixed; owner
  edits freeze inference), `mergeReconcileWarnings` (keeps other warnings, `extra-candidates-dropped` sticky),
  `missingRounds`, `reconcileReasonContext` (re-derives N/D for the messages; reconciliation is idempotent over what it stored).
- **Detection** records `overlapRatio` on every auto shot: colour path = coloured area / median blob (`backing-colour.ts`);
  standard path = blob area / median candidate (`holes.ts`).
- **Stage A / B** call `reconcileShots` in place of `capShots` (Stage A only when the categorization is complete; Stage B only
  when there is a calibration). A rejected target stores every shot, `computed: null`, and no diagrams.
- **Scoring** (`missing.ts`, `analyze.ts`): definite scores; the range and `formatFractionalScore` are deleted. Sighting `misses`
  now includes missing rounds.
- **Status / reasons**: three new `Reason`/`Warning` values in §4's order, rule 7a (before rule 6), rule 10 suppression, and the
  three messages (with the position named for a `both` target).
- **Presentation**: headline `68 / 100 · 1 miss · X 1`; footer `Total: … · 1 miss` with no `Range:` line; caption and diagram
  total definite; the results card shows the photo (`PhotoThumbnail.tsx`) and the reason instead of a diagram for a rejected
  target; TargetPage lost its range rows; the Adjust tray is labelled **Scored as miss** and is the *off target* control
  ("not in this photo"); the Inspector notes an assumed double and clears `inferred` when the owner changes the count; the Adjust
  live preview runs the same reconciliation as Stage B.
- **`cv:eval`**: a *Confident holes* section reports the precision curve and flags if `CONFIDENT_HOLE_MIN` ever drops below 0.98.

### Tests added or changed

`tests/unit/scoring/reconcile.test.ts` (every colour-path vector in the milestone, IMG_5193's tears, IMG_5191's measured ratios,
the third-shot rule, the standard-path "below `CONFIDENT_HOLE_MIN` never rejects" and "12 found / 9 confident → capped to 10"
vectors), `reconcile-shots.test.ts` (manual multiplicity untouched, a manual shot reduces `missesAssumed` by one, removing an
inferred double reverts it to a miss, declared-rounds change re-reconciles, `both` names the rejected position, REV-43's three
checks), the M20 scoring vector (`45 / 100 · 5 misses · X 0`, sighting misses) in `text-lines.test.ts`, status/reason vectors,
Stage A/B rejection and double-punch cases, and a synthetic colour-path sheet reconciled end to end. `missing.test.ts` now tests
definite scores; the range vectors are gone with the range. e2e expectations updated for the definite headline and messages.

### REV-43 checks (Open question 1)

- A shot beyond ring 1 already scores 0 under geometry-scoring §4 (`scoreRing(80.01)` and `scoreRing(120)` → 0); the ring maths
  is unchanged.
- A ring-zero unit counts as identified: it reduces `missing`, is never also an assumed miss, is tallied in `tally[0]` and enters
  the MPI (tested).
- Sighting: a hole outside the outermost zone is a located `miss` that still enters the group metrics (ES tested); an assumed miss
  enters none.

### For the reviewer

- Spec edits (all marked M20): geometry-scoring §8 (rewritten: definite scoring, §8.3 reconciliation), data-model §4,
  analysis-pipeline §1/§2/§4, rendering-composite §3/§4/§5, backing-sheet §5.4/§5.7. M14's Tests gained the summary-slot case.
- Open questions 3-11 record every interpretation; none blocks a later milestone.

