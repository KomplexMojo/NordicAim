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

- **`format.ts` has no spec'd signature.** geometry-scoring.md §8.1 states only one display rule ("averaged... may
  be fractional; display with 1 decimal"). The milestone lists `format.ts` under Files but the spec gives it no
  function names or signatures. Implemented a minimal `formatFractionalScore(value): string` covering that one
  stated rule, documented as intentionally minimal; later UI milestones may need more and should extend this file
  rather than duplicate its logic. Non-blocking — nothing else in the milestone depends on it.
- **`all` subset semantics for a `both` target when precision/sighting missing-mode ranges are combined vs. the
  subset's own overcount/missing fields.** §8 states, generically, that `missing`/`overcount`/`warnings` are
  computed per subset from that subset's own `declared`/`identified`, and separately (§8.1/§8.2) that the `all`
  subset's precision/sighting *range* modes are the sum (precision) or union-placement (sighting) of the prone and
  standing subset values. I implemented both literally: `all.missing`/`all.overcount`/`all.warnings` are computed
  directly from `declared = roundsProne + roundsStanding` vs. the combined identified-unit count (independent of
  whether either individual sub-position over- or under-counted), while `all.precision.range` /
  `all.sighting.range` are the sum/union of the prone and standing subsets' *already-computed* (and possibly
  overcount-overridden) range values, per the literal spec text. These two computations could diverge only in an
  edge case (one sub-position over-counts while the other under-counts by the same amount, so the combined
  declared/identified balance shows no overcount even though a sub-position did). No test vector in the spec
  exercises this combination; the golden fixtures are both single-position. Non-blocking — flagging in case a
  later milestone's UI or a real-world "both" session surfaces it and the owner has a different expectation.
- **Sighting over-count range override formula can produce a negative `misses`.** Applying the general
  `misses: declared - hits` formula (§8.2) under an over-count (`hits` = identified-only hit count, which can
  exceed `declared`) yields a negative number rather than 0. The spec doesn't clamp this anywhere, so I left it
  un-clamped for consistency with the stated formula rather than inventing a clamp. Non-blocking.
- **`angular(27.7)` and `angular(41.9)` MOA fixture values are slightly off from the exact math, by more than the
  spec's own default 1e-6 test tolerance.** geometry-scoring.md §1 (top of file) states tests default to 1e-6
  unless a vector states otherwise; §6's vectors for these two give MOA to 6 decimals (`1.904507`, `2.880834`)
  with no explicit wider tolerance of their own. Computing `angular` by hand from the stated formula
  (`rad = 2*atan(sizeMm/(2*distanceMm))`, `moa = rad*(180/π)*60`) gives `1.9045116623044323` for 27.7 mm and
  `2.88083162533056` for 41.9 mm — differing from the spec's stated values by ≈4.66e-6 and ≈2.35e-6 respectively,
  both over the 1e-6 default. (MRAD for the same two vectors is exact to ≈1.5e-8 and ≈4.9e-8, well inside 1e-6, so
  MRAD is tested at the default in `tests/unit/scoring/groups.test.ts`.) I tested MOA for these two vectors at an
  explicit ±5e-6 (`toBeCloseTo(x, 5)`, stated in the test's own comment) rather than the 1e-6 default, since 1e-6
  would fail against the correct computed value. This is a genuine mismatch between the spec's rounded fixture
  numbers and the true math (the engine's `angular` is correct — verified against the closed-form formula), not an
  engine bug; flagging for the owner to correct the spec's stated MOA digits for these two vectors if precision
  matters there. Non-blocking for this milestone — `angular(25)` (which the spec does give an explicit ±1e-5 MOA
  tolerance for) and the golden §9 MPI/ES vectors are all tested to their stated (or the 1e-6 default) tolerance.
- **Pessimistic sighting tie-break when multiple units share the largest `radialMm`.** §8.2 states the optimistic
  placement's tie-break explicitly ("smallest radialMm... ties: first by sort order of §7") but says nothing about
  ties for the pessimistic placement's "largest radialMm" unit. I applied the same §7 sort-order convention
  (radialMm descending, shotId ascending, unitIndex ascending) and took the first unit among ties — i.e., among
  units tied for the largest radialMm, the one with the smallest shotId is used, mirroring how optimistic breaks
  its own ties. This is the natural symmetric reading but isn't stated by the spec; a different tie rule (e.g.
  largest shotId) is equally consistent with the text. Covered by
  `tests/unit/scoring/missing.test.ts` ("pessimistic tie-break..."). Non-blocking; ties at different coordinates
  only matter when >1 identified unit shares the exact same (rounded) largest radialMm.
- **Top-level `SightingOutcome.misses` (the field alongside `hits`/`clean`, not the per-mode `range.*.misses`) has
  no formula in the spec.** data-model.md §4's `SightingOutcome` type declares `misses: number` but geometry-
  scoring.md §8.2 only defines `misses` inside each range mode (`declared - hits`). I implemented the top-level
  field as identified-only (`units.length - hits`, i.e. count of identified misses among identified units) rather
  than `declared - hits`, since it sits next to `hits`/`clean` (both identified-only counts) rather than inside
  `range`. rendering-composite.md's sighting row 6 (`Scored (<positionLabel>): <hits> hit / <misses> miss`) will
  display this value directly, so the choice is user-visible whenever a subset has missing rounds (the `all`
  subset for a `both` target sums per-subset identified-only misses the same way, in `combineSightingOutcomes`).
  Non-blocking — no test vector in the spec exercises a subset with `missing > 0` for this specific field — but
  flagging since it's a real behavioral choice, not just a display nuance.

## Completion notes

- Implemented `src/lib/geometry/transform.ts` (`mmToPx`, `pxToMm`, `scaleCalibration`) and the full scoring engine
  under `src/lib/scoring/`: `units.ts` (`expandUnits`), `precision.ts` (`scoreRing`), `sighting.ts` (`zoneFor`),
  `groups.ts` (`mpi`, `extremeSpread`, `meanRadius`, `groupEllipse`, `angular`, `mpiOffset`), `split.ts`
  (`assignPositions`), `missing.ts` (missing/over-count handling and the `both`-target `all`-subset combination for
  both templates), `analyze.ts` (`ENGINE_VERSION`, `analyzeTarget`), `format.ts` (minimal display helper, see Open
  questions).
- `groups.ts`/`missing.ts` re-export the `Angular`/`GroupEllipse`/`MpiOffset`/`PrecisionScore`/`SightingModeOutcome`/
  `SightingOutcome` types already defined in `src/lib/domain/analysis.ts` (M02) instead of redeclaring them, so the
  engine's output is structurally identical to the spec's `AnalysisResult` shape.
- `IncompleteCategorizationError`, `declaredRounds`, and `isCategorizationComplete` are reused from M02's
  `src/lib/domain/categorization.ts` rather than reimplemented.
- Tests added: `tests/unit/geometry/transform.test.ts` (§2.1 vectors, the 90°/0.5 vector, a seeded 100-point
  round-trip property test, and the capture-overlay §3.4 `scaleCalibration` vector) and
  `tests/unit/scoring/{units,precision,sighting,groups,split,missing,analyze,format}.test.ts` — every vector in the
  milestone's Tests section, including both golden-parity fixtures (§9.1 precision, §9.2 sighting with the
  standing-recategorization case), the ring/zone boundary tables, the ES/angular/ellipse vectors, the §7 split
  vector, the §8.1 (92/77/84.0) and §8.2 missing-mode vectors, and the over-count vector (declared 3, identified 5
  → `warnings: ['overcount']`).
### Fix round 1 (reviewer findings addressed)

An independent reviewer found the golden §9.1 MPI test and the §6 angular MRAD tests were checked at a much
looser tolerance than the spec's stated/default values, that several minor judgment calls (format.ts's whole-
number display rule, the pessimistic sighting tie-break, `scoreRing`/`assignPositions` parameter shapes, the
top-level `SightingOutcome.misses` meaning) were made without being recorded, and that the §9.2 golden test
skipped an expected field. Fixed:

1. **§9.1 MPI precision (major).** `tests/unit/scoring/analyze.test.ts` now asserts
   `subset.mpi!.xMm`/`yMm` with `toBeCloseTo(-14.49, 6)` / `toBeCloseTo(-18.55, 6)` — tighter than the spec's
   stated ±1e-6 and the fixture's `tolerances.mpi: 1e-6` — instead of the previous `toBeCloseTo(x, 2)` (±0.005).
   Still passes: the engine's MPI is correct to ≈1.8e-15.
2. **§6 angular MRAD precision (minor).** `tests/unit/scoring/groups.test.ts`'s `angular(27.7)` and
   `angular(41.9)` vectors now assert `mrad` with `toBeCloseTo(x, 6)` (the spec's stated default), tightened
   from `toBeCloseTo(x, 3)`. Still passes: the real mrad values are within ≈5e-8 of the spec's stated numbers.
   The `moa` assertions for these two vectors are **not** tightened to the default — see the new Open question
   below explaining why (the spec's own fixture numbers are ≈4.66e-6 / ≈2.35e-6 off from the true math, over the
   1e-6 default), and the ±5e-6 tolerance actually used is now stated explicitly in the test's own comment and
   name, and in the deviations list below.
3. **`format.ts` whole-number display rule (minor).** Changed `formatFractionalScore` to always render 1 decimal
   (`(72).toFixed(1) === '72.0'`) rather than dropping the decimal for integers, matching the spec §8.1 vector's
   literal text ("averaged 84.0") instead of an invented whole-number special case. `format.test.ts` updated to
   match.
4. **Pessimistic sighting tie-break (minor).** `pointsForMode` in `missing.ts` now sorts by radialMm **descending**
   (largest first) with the §7 tie-break (shotId ascending, then unitIndex ascending) and takes the *first* unit
   for the pessimistic placement, instead of sorting ascending and taking the *last* — which previously picked the
   **largest** shotId among ties rather than the smallest. Added a dedicated tie-break test in `missing.test.ts`.
   Documented as a judgment call (not spec-stated) in the new Open question below.
5. **`scoreRing`/`assignPositions` call shapes (minor).** `scoreRing`'s second parameter now defaults to
   `BIATHLON_50M.holeDiameterMm`, so `scoreRing(radialMm)` — the spec §4 call form — works; a test for the default
   was added to `precision.test.ts`. `assignPositions`'s third parameter is renamed `overrides` (from `shots`) to
   match spec §7's naming, with a comment explaining why it's still typed `Shot[]` rather than a bare overrides
   map (an override is looked up per-unit by `shotId` + `unitIndex`, so the shot id has to travel with it).
   `EPS` is no longer declared twice: `sighting.ts` now imports (and re-exports) `EPS` from `precision.ts` instead
   of redeclaring `1e-9`.
6. **§9.2 golden test missing an expected field (minor).** `analyze.test.ts`'s §9.2 test now also asserts
   `subset.missing` to be `0`, per the spec's "identified 10; missing 0" (§9.2 doesn't state it as a separate
   sentence but §9.1's parallel line does, and identified=declared=10 implies missing=0 for both).
7. **Undisclosed deviations in Completion notes (minor).** This section (and the Open questions above) now lists
   every tolerance actually used that is looser than the spec's stated/default value, not just the two judgment
   calls previously listed.

### Commands run (fix round 1)

- `pnpm typecheck` — pass.
- `pnpm lint` — pass (0 errors; 3 pre-existing warnings in `src/components/ui/{badge,button,toggle}.tsx`,
  unrelated to this milestone).
- `pnpm test` — pass, 129/129 tests across 17 files (127 previously + the 2 new tests: the pessimistic tie-break
  vector in `missing.test.ts` and the `scoreRing` default-parameter vector in `precision.test.ts`).
- `pnpm check:privacy` — pass (11 images).
- `pnpm check` — pass (all four of the above, run together).
- `pnpm vitest run --coverage tests/unit/scoring tests/unit/geometry` — pass, 87/87 tests. Reading
  `coverage/coverage-final.json` directly per file under `src/lib/scoring/` and `src/lib/geometry/`: `scoring`
  231/232 statements (99.57%), `geometry` 29/29 (100%) — every file at 100% except `groups.ts` (67/68, one
  defensive/unreachable branch). Well above the required ≥95% lines for both directories.
- `grep -rnE "Date|Math\.random|fetch\(|window|document|navigator" src/lib/scoring src/lib/geometry` — no matches
  (determinism and the pure/adapter split hold).
- Hand-verified (node, the stated §6/§4 formulas): `angular(27.7)` = `{moa: 1.9045116623044323, mrad:
  0.553999985830712}`; `angular(41.9)` = `{moa: 2.88083162533056, mrad: 0.8379999509599658}` — confirms the moa
  mismatch and mrad match described in the Open questions above and in item 2 of this fix round.

### Deviations from stated tolerances (all disclosed, all documented above and in Open questions)

- `angular(27.7)` and `angular(41.9)` **MOA** are tested at ±5e-6 (`toBeCloseTo(x, 5)`), looser than the spec's
  1e-6 default, because the spec's own stated fixture values are ≈4.66e-6 / ≈2.35e-6 off from the value the
  stated formula actually produces. This is a spec-fixture/true-math mismatch, not an engine defect (see Open
  questions). Every other numeric vector in this milestone — including the §9.1 golden MPI (now ±1e-6), the
  §6 MRAD vectors for the same two units (now ±1e-6), and `angular(25)` (tested at the spec's own explicit ±1e-5
  moa tolerance) — is tested at its stated tolerance or the 1e-6 default.
- Two behavioral judgment calls, not tolerance loosening but worth restating here: the pessimistic sighting
  tie-break (item 4 above) and the top-level `SightingOutcome.misses` formula (identified-only, not
  `declared - hits`) are both spec-silent choices, documented in the Open questions section above rather than
  guessed at silently.
- Did not touch anything outside `src/lib/scoring/*`, `src/lib/geometry/transform.ts`, and their tests. Did not
  commit, push, or change Status beyond `in-progress` (orchestration overrides).
