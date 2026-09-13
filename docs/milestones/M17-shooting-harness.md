# M17: Shooting harness

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M11 | low | M | harness-align (shooting side; Garmin load added in M20) |

## Goal
Per-session and cross-session shooting metrics: precision score per position, sighting hit rates, group size
(MOA), MPI drift, lighting breakdown. Works with no Garmin data.

## Read first
- `docs/spec/data-model.md` §4 (`AnalysisResult`), §7 (harness route)
- `docs/spec/geometry-scoring.md` §6, §8
- `docs/PLAN.md` E13

## In scope
Pure summarisers, harness API, session Harness tab, `/harness` overview page.

## Out of scope
Garmin load (M20 adds a card), goals and targets.

## Files
- `src/lib/harness/shooting.ts` (pure): `summarizeTarget(photo, result)`, `summarizeSession(items)`, `trend(sessions)`
- `src/app/api/harness/shooting/route.ts`
- `src/components/harness/SessionHarness.tsx`, `TrendChart.tsx` (hand-rolled SVG line chart, no chart library)
- `src/app/harness/page.tsx`
- `tests/unit/harness/shooting.test.ts`, `tests/e2e/harness.spec.ts`

## Steps
1. `summarizeTarget`: per subset (prone/standing):
   - precision: `scorePer10Shots = range.averaged / declared × 10`, so a 10-shot card's value equals its /100
     total, rounded to 1 dp at display only
   - sighting: `hitRate = range.averaged.hits / declared`
   - plus `esMoa`, `mpiOffsetMm`, `lighting`, `captureUtc`.
   Only reviewed photos count.
2. `summarizeSession`: per template × position means (ignore nulls): `scorePer10Shots`, `sightingHitRate`,
   `esMoaMean`; `mpiMean` (mean of MPI offsets) for sighting prone and standing; target counts; lighting counts.
3. `trend(sessions)`: chronological points `{ sessionId, sessionDate, metrics }`.
4. `GET /api/harness/shooting?from=YYYY-MM-DD&to=YYYY-MM-DD` (default last 90 days) → `{ sessions: SessionSummary[] }`.
5. Session **Harness** tab:
   - metric cards (Prone precision /10, Standing precision /10, Prone hit rate, Standing hit rate, ES MOA)
   - an MPI scatter for sighting targets (small SVG, mm axes ±30)
   - lighting chips.
6. `/harness`: `TrendChart` lines for the precision per10 (prone and standing) and sighting hit rate
   (prone and standing); a date-range selector; a table of sessions.
7. Leave a clearly marked slot `<GarminLoadCard/>` placeholder, rendered only when
   `session.garmin && featureEnabled` (M20 implements it).

## Tests (use the golden fixtures)
- `summarizeTarget` on the precision fixture → prone `scorePer10Shots` **72.0**.
- A standing subset with declared 5 and averaged total 41 → `scorePer10Shots` **82.0**.
- Sighting fixture → prone `hitRate` 0.9; `esMoa` 1.9032 ±0.0005.
- A session with both fixtures → the counts and means above.
- `trend` orders by sessionDate.
- E2E: seeded demo → Harness tab shows `72.0` and `90%`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- `scorePer10Shots` normalises to a 10-shot card (its /100 total), so short bouts compare fairly with full cards.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
