# M03: Scoring engine

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | M | cv-scoring, groups-moa |

## Goal
A pure, fully tested scoring library covering:
- unit expansion
- precision touch-rule scoring and sighting zones
- group metrics and MOA/MRAD
- the `both` split and missing/over-count modes
- the `analyzeTarget` orchestrator.

It must reproduce the owner's example diagrams exactly.

## Read first
- `docs/spec/geometry-scoring.md` (all)
- `docs/spec/data-model.md` §4 (`AnalysisResult`)
- `fixtures/reference/sample-shots-precision.json`, `sample-shots-sighting.json`

## In scope
`src/lib/scoring/*`, `src/lib/geometry/transform.ts` (`mmToPx`, `pxToMm`, `scaleCalibration`).

## Out of scope
Rendering, storage, UI, CV.

## Files
- `src/lib/geometry/transform.ts`
- `src/lib/scoring/units.ts`: `expandUnits(shots)`
- `src/lib/scoring/precision.ts`: `scoreRing(radialMm, profile)`, `precisionScore(units, declared)`
- `src/lib/scoring/sighting.ts`: `zoneFor(radialMm, position, profile)`, `sightingOutcome(units, declared, position)`
- `src/lib/scoring/groups.ts`: `mpi`, `extremeSpread`, `meanRadius`, `groupEllipse`, `angular`, `mpiOffset`, `sightCorrection`
- `src/lib/scoring/split.ts`: `assignPositions(units, categorization, shots)`
- `src/lib/scoring/missing.ts`
- `src/lib/scoring/analyze.ts`: `ENGINE_VERSION`, `analyzeTarget`
- `src/lib/scoring/format.ts`: `fmtMm` (1 dp), `fmtAngle` (2 dp), `fmtAvg` (1 dp)
- `tests/unit/scoring/*.test.ts`, `tests/unit/geometry/transform.test.ts`

## Steps
1. Transforms per spec §2.1, plus `scaleCalibration` (capture-overlay §3.3). If M04 already created
   `scaleCalibration`, keep that one and add tests.
2. `expandUnits`: k units per shot, `unitIndex` 0..k−1, `radialMm = Math.hypot(x, y)`.
3. `scoreRing` and `zoneFor` with `EPS = 1e-9` inclusive comparisons (spec §4, §5).
4. Group metrics per spec §6. ES uses **distinct** coordinates; the ellipse uses the closed form, with the angle
   normalised to [0, 180).
5. `assignPositions` per spec §7 (exact sort and tie-break, then overrides).
6. Missing modes per spec §8, per subset; build `all` per the spec.
7. `analyzeTarget`: validate completeness → expand → assign → `subsets` (single position: one; both: `[prone, standing]`) +
   `all`; fill `precision` or `sighting`. For the sighting `all` of a `both` target, `zoneDiameterMm` is `null`.

## Tests (every vector in the spec, exact values and tolerances)
- §2.1 transform vectors, including 90°/0.5, plus a random round-trip property test (seeded PRNG inside the test).
- §4 ring vectors; §5 zone vectors.
- §6 ES, angular (25 / 27.7 / 41.9 / 14.5444), ellipse vectors, sight-correction example.
- §7 split vector; §8.1 precision modes (92 / 77 / 84.0); §8.2 sighting modes (hits 4 / 2 / 3.333333, MPIs).
- Over-count: declared 3, identified 5 → `warnings: ['overcount']`, all modes equal the identified values.
- **Golden parity** (§9): load both fixture JSONs and assert every `expected` value; re-categorize sighting as
  standing → hits 10.
- `scaleCalibration` vector from capture-overlay §3.4.
- Coverage ≥ 95% lines for `src/lib/scoring` and `src/lib/geometry`.

## Acceptance
```bash
pnpm check
pnpm vitest run --coverage tests/unit/scoring tests/unit/geometry
```

## Pitfalls
- `radialMm` is measured from the **target centre**, not the MPI.
- Multiplicity never changes ES.
- Pessimistic sighting units are always **misses**.
- No `Date.now()` or `Math.random()` in `src`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
