# M03: Scoring engine

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M02 | low | M | generate analysis |

## Goal
A pure, fully tested scoring library covering:
- unit expansion
- precision touch-rule scoring and sighting zones
- group metrics and MOA/MRAD
- the `both` split and missing/over-count modes
- `analyzeTarget`.

It must reproduce the owner's example diagrams exactly.

## Read first
- `docs/spec/geometry-scoring.md` (all, except the post-MVP sight-correction hint)
- `docs/spec/data-model.md` §4 (`AnalysisResult`)
- `fixtures/reference/sample-shots-precision.json`, `sample-shots-sighting.json`

## In scope
`src/lib/scoring/*`, `src/lib/geometry/transform.ts` (`mmToPx`, `pxToMm`, `scaleCalibration`).

## Out of scope
The sight-correction hint (backlog B8), rendering, storage, UI, CV.

## Files
- `src/lib/geometry/transform.ts`
- `src/lib/scoring/units.ts`, `precision.ts`, `sighting.ts`, `groups.ts` (`mpi`, `extremeSpread`, `meanRadius`, `groupEllipse`,
  `angular`, `mpiOffset`), `split.ts`, `missing.ts`, `analyze.ts` (`ENGINE_VERSION`, `analyzeTarget`), `format.ts`
- `tests/unit/scoring/*.test.ts`, `tests/unit/geometry/transform.test.ts`

## Steps
1. Transforms per spec §2.1 and `scaleCalibration` (capture-overlay §3.3).
2. `expandUnits`: k units per shot; `radialMm = Math.hypot(x, y)`.
3. `scoreRing` and `zoneFor` with `EPS = 1e-9` inclusive comparisons (spec §4, §5).
4. Group metrics per spec §6 (ES over distinct coordinates; closed-form ellipse; angle in [0, 180)).
5. `assignPositions` per spec §7.
6. Missing modes per spec §8 per subset; `all` per the spec.
7. `analyzeTarget` per spec §10.

## Tests (every vector, exact values and tolerances)
- §2.1 transforms, including 90°/0.5, plus a seeded random round-trip property test.
- §4 ring vectors; §5 zone vectors.
- §6 ES, angular (25 / 27.7 / 41.9 / 14.5444), ellipse vectors.
- §7 split; §8.1 precision modes (92 / 77 / 84.0); §8.2 sighting modes.
- Over-count: declared 3, identified 5 → `warnings: ['overcount']`.
- **Golden parity** (§9) for both fixtures; the sighting fixture as standing → hits 10.
- `scaleCalibration` vector (capture-overlay §3.4).
- Coverage ≥ 95% lines for `src/lib/scoring` and `src/lib/geometry`.

## Acceptance
```bash
pnpm check
pnpm vitest run --coverage tests/unit/scoring tests/unit/geometry
```

## Pitfalls
- `radialMm` is measured from the target centre.
- Multiplicity never changes ES.
- Pessimistic sighting units are always misses.
- No `Date.now()` or `Math.random()` in `src`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
