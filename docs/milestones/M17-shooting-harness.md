# M17: Shooting harness

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M10 | low | M | harness-align (shooting side; workouts in Phase 2) |

## Goal
Per-session and cross-session shooting metrics on the phone: precision score per position, sighting hit rates, group size
(MOA), MPI drift, and lighting breakdown.

## Read first
- `docs/spec/data-model.md` §4
- `docs/spec/geometry-scoring.md` §6, §8

## In scope
Pure summarisers, a loader service, the session Harness tab, and route `/harness`.

## Out of scope
Workout load (Phase 2, M21), goals.

## Files
- `src/lib/harness/shooting.ts` (pure: `summarizeTarget`, `summarizeSession`, `trend`)
- `src/lib/services/harness.ts` (`loadShootingSummaries(ctx, fromDate, toDate)`)
- `src/components/harness/SessionHarness.tsx`, `TrendChart.tsx` (hand-rolled SVG), `MpiScatter.tsx`
- `src/routes/harness/HarnessPage.tsx`
- `tests/unit/harness/shooting.test.ts`, `tests/e2e/harness.spec.ts`

## Steps
1. `summarizeTarget(photo, result)` per subset:
   - precision: `scorePer10Shots = range.averaged / declared × 10`
   - sighting: `hitRate = range.averaged.hits / declared`
   - plus `esMoa`, `mpiOffsetMm`, `lighting`, `captureUtc`.
   Reviewed photos only.
2. `summarizeSession`: per template × position means (ignore nulls), MPI mean for sighting prone/standing, counts, lighting counts.
3. `trend(sessions)`: chronological points.
4. `loadShootingSummaries`: sessions with `sessionDate` in range (default last 90 days), using cached `analysis.computed.result`
   (recompute if `engineVersion` differs).
5. **Harness tab**: metric cards (Prone precision /10 shots, Standing precision, Prone hit rate, Standing hit rate, ES MOA),
   an MPI scatter (±30 mm), lighting chips.
6. `/harness`: trend lines (precision prone/standing, hit rate prone/standing), a date range, a sessions table.

## Tests
- `summarizeTarget` on the precision fixture → prone `scorePer10Shots` **72.0**; declared 5 with averaged 41 → **82.0**.
- Sighting fixture → prone `hitRate` **0.9**; `esMoa` 1.9032 ±0.0005.
- Both fixtures in one session → the counts and means above; `trend` ordered by date.
- E2E: demo → Harness tab shows `72.0` and `90%`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- `scorePer10Shots` normalises to a 10-shot card (its /100 total), so short bouts compare fairly.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
