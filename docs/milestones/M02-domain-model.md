# M02: Domain model and defaults

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M01 | low | S | scaffold (sport defaults) |

## Goal
All persisted and exchanged shapes exist as zod schemas with inferred types, plus the biathlon profile and
the two template definitions, so later milestones import rather than invent.

## Read first
- `docs/spec/data-model.md` §1–§5
- `docs/spec/geometry-scoring.md` §1

## In scope
Schemas, types, categorization helpers, profile and template constants.

## Out of scope
Scoring math (M03), file I/O (M04), UI.

## Files
- `src/lib/domain/enums.ts`, `primitives.ts`, `session.ts`, `photo.ts`, `analysis.ts`, `config.ts`,
  `categorization.ts`, `index.ts` (re-exports)
- `src/lib/defaults/biathlon.ts`, `src/lib/defaults/templates.ts`
- `tests/unit/domain/*.test.ts`, `tests/unit/defaults/templates.test.ts`

## Steps
1. Transcribe every schema from data-model §1–§5 exactly, with the same names and constraints. Export
   `type X = z.infer<typeof X>`.
2. `AnalysisResult` stays a TypeScript `interface` (spec §4) plus a permissive `AnalysisResultSchema =
   z.custom<AnalysisResult>(v => typeof v === 'object' && v !== null)`, so the cache validates cheaply.
3. `primitives.ts` regexes: `LocalDateTime` `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$`; `LocalDate`
   `^\d{4}-\d{2}-\d{2}$`; `Offset` `^[+-]\d{2}:\d{2}$`; `UtcIso` = `z.string().datetime()`.
4. `categorization.ts`: `isCategorizationComplete`, `declaredRounds`, `defaultCategorization`, `nextStatus`
   exactly per data-model §3. `declaredRounds` throws `IncompleteCategorizationError` (export the class).
5. `defaults/biathlon.ts` and `defaults/templates.ts`: copy from geometry-scoring §1 verbatim. Add
   `getTemplate(id)` and `ringRadiusMm(n)` (= `ringDiameterMm[n] / 2`).
6. `defaultAppConfig()` in `config.ts` per data-model §5.

## Tests
- Every `ringDiameterMm[n] === 10.4 + 16 * (10 - n)` for n = 1…10.
- `defaultCategorization('precision', 'both')` → `{ template: 'precision', position: 'both', roundsProne: 5, roundsStanding: 5 }`.
- `declaredRounds({ … position: 'both', roundsProne: 3, roundsStanding: 2 })` → 5; `position: 'standing'`
  with `roundsStanding: null` throws.
- `Shot` rejects multiplicity 0, and rejects `positionOverrides` whose length ≠ multiplicity.
- `BiathlonSession` parses the example JSON in data-model §8.
- `Calibration` rejects `axisRatio` 0.2 and `angleDeg` 180.
- `nextStatus` with hand-built minimal `result` stubs (only `all.identified` and `subsets[].missing` /
  `subsets[].overcount` are read), using a complete categorization and a non-null calibration unless stated:
  identified 10 & missing 0 → `reviewed`; missing 1 & accepted null → `calibrated`; missing 1 & accepted 1 →
  `reviewed`; missing 3 & accepted 1 → `calibrated`; overcount 1 & accepted 5 → `calibrated`; identified 0 →
  `calibrated`; result null → `calibrated`; calibration null → `categorized`; incomplete categorization →
  `uncategorized`. (M11 re-tests this against real `analyzeTarget` output.)

## Acceptance
```bash
pnpm check
```

## Pitfalls
- Don't add fields that aren't in the spec. Ask under Open questions instead.
- Keep `src/lib/domain` free of Node imports (it's used in client components too).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
