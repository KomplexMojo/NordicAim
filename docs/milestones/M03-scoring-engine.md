# M03: Scoring engine

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M02 | low | M | cv-scoring, groups-moa |

## Goal
A pure, fully tested scoring library: unit expansion, precision touch-rule scoring, sighting zones, group
metrics, MOA/MRAD, the `both` split, missing and over-count modes, and the `analyzeTarget` orchestrator.
It must reproduce the owner's example diagrams exactly.

## Read first
- `docs/spec/geometry-scoring.md` (all)
- `docs/spec/data-model.md` §4 (`AnalysisResult`)
- `fixtures/reference/sample-shots-precision.json`, `sample-shots-sighting.json`

## In scope
`src/lib/scoring/*` and `src/lib/geometry/transform.ts` (including `scaleCalibration`).

## Out of scope
Rendering, I/O, UI, CV.

## Files
- `src/lib/geometry/transform.ts`: `mmToPx`, `pxToMm`, `scaleCalibration`
- `src/lib/scoring/units.ts`: `expandUnits(shots)`
- `src/lib/scoring/precision.ts`: `scoreRing(radialMm, profile)`, `precisionScore(units, declared)`
- `src/lib/scoring/sighting.ts`: `zoneFor(radialMm, position, profile)`, `sightingOutcome(units, declared, zone)`
- `src/lib/scoring/groups.ts`: `mpi`, `extremeSpread`, `meanRadius`, `groupEllipse`, `angular`, `mpiOffset`, `sightCorrection`
- `src/lib/scoring/split.ts`: `assignPositions(units, categorization, shots)`
- `src/lib/scoring/missing.ts`: precision and sighting mode functions
- `src/lib/scoring/analyze.ts`: `ENGINE_VERSION`, `analyzeTarget`
- `src/lib/scoring/format.ts`: `fmtMm` (1 dp), `fmtAngle` (2 dp), `fmtAvg` (1 dp)
- `tests/unit/scoring/*.test.ts`, `tests/unit/geometry/transform.test.ts`

## Steps
1. Implement the transforms (spec §2.1), including the random round-trip property test (seeded PRNG in the
   test, not in src).
2. `expandUnits`: for each shot, k units with `unitIndex` 0..k−1 and `radialMm = Math.hypot(x, y)`.
3. `scoreRing` and `zoneFor` with `EPS = 1e-9` inclusive comparisons (spec §4, §5).
4. Group metrics (spec §6). ES iterates over **distinct** coordinates. The ellipse uses the closed-form eigen
   solution. Normalise the angle to [0, 180).
5. `assignPositions` (spec §7) with the exact sort and tie-break, then apply `positionOverrides`.
6. Missing modes (spec §8) per subset; build the `all` subset per the spec rules.
7. `analyzeTarget`: validate completeness, expand, assign, and build `subsets` (single position → one subset;
   both → `[prone, standing]`) plus `all`. Fill `precision` or `sighting` by template. For the sighting
   `all` subset of a `both` target, `zoneDiameterMm` is `null`.

## Tests (every vector in the spec, exact values and tolerances)
- §2.1 transform vectors (including the 90° / 0.5 case) and the property test.
- §4 ring table vectors; §5 zone vectors.
- §6: ES, angular (25 / 27.7 / 41.9 / 14.5444), both ellipse vectors, sight-correction example.
- §7 split vector (D#0, D#1 standing).
- §8.1 precision modes (92 / 77 / 84.0); §8.2 sighting modes (hits 4 / 2 / 3.333333, MPIs).
- Over-count: declared 3, identified 5 → `warnings: ['overcount']`, all modes equal identified.
- **Golden parity** (§9): load both fixture JSONs and assert every `expected` value. Also re-categorize the
  sighting fixture as `standing` → hits 10.
- Coverage: `pnpm vitest run --coverage tests/unit/scoring tests/unit/geometry` → ≥ 95% lines for
  `src/lib/scoring` and `src/lib/geometry`.

## Acceptance
```bash
pnpm check
pnpm vitest run --coverage tests/unit/scoring tests/unit/geometry
```

## Pitfalls
- `radialMm` is measured from the **target centre**, not the MPI.
- ES must not count duplicate coordinates; multiplicity never changes ES.
- Pessimistic sighting units always count as **misses**, even if the worst identified unit was a hit.
- No `Date.now()` or `Math.random()` in `src`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
