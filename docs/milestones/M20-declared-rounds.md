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
Detection itself (M16, M19). The Adjust screen beyond relabelling parked markers (M17).

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
_(add here)_

## Completion notes
_(fill in when done)_
