# M02: Domain model and defaults

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M01 | low | S | scaffold (sport defaults) |

## Goal
All records exist as zod schemas with inferred types, plus the biathlon profile, both template definitions, the
categorization helpers, and `nextStatus`.

## Read first
- `docs/spec/data-model.md` §1–§5
- `docs/spec/geometry-scoring.md` §1

## In scope
Schemas, types, helpers, profile and template constants.

## Out of scope
Scoring math (M03), IndexedDB (M04), UI.

## Files
- `src/lib/domain/enums.ts`, `primitives.ts`, `session.ts`, `photo.ts`, `analysis.ts`, `settings.ts`, `categorization.ts`, `index.ts`
- `src/lib/defaults/biathlon.ts`, `src/lib/defaults/templates.ts`
- `tests/unit/domain/*.test.ts`, `tests/unit/defaults/templates.test.ts`

## Steps
1. Transcribe every schema from data-model §1–§5 exactly (names and constraints). Export `type X = z.infer<typeof X>`.
2. `AnalysisResult` stays a TypeScript interface (data-model §4) with a permissive
   `AnalysisResultSchema = z.custom<AnalysisResult>(v => typeof v === 'object' && v !== null)`.
3. `categorization.ts`: `isCategorizationComplete`, `declaredRounds` (throws `IncompleteCategorizationError`, exported),
   `defaultCategorization`, and `nextStatus` exactly per data-model §3.
4. `defaults/biathlon.ts` and `defaults/templates.ts` verbatim from geometry-scoring §1, plus `getTemplate(id)` and
   `ringRadiusMm(n)`.
5. `defaultAppSettings()` per data-model §5.
6. `src/lib/domain` must not import browser or Node APIs.

## Tests
- `ringDiameterMm[n] === 10.4 + 16 * (10 - n)` for n = 1…10.
- `defaultCategorization('precision', 'both')` → `{ template: 'precision', position: 'both', roundsProne: 5, roundsStanding: 5 }`.
- `declaredRounds` with both 3/2 → 5; standing with `roundsStanding: null` throws.
- `Shot` rejects multiplicity 0 and override-length mismatch; `Calibration` rejects axisRatio 0.2 and angleDeg 180.
- `BiathlonSession` parses data-model §8.
- `nextStatus` with hand-built minimal `result` stubs (only `all.identified`, `subsets[].missing`, and `subsets[].overcount`
  are read), a complete categorization, and a non-null calibration unless stated:
  - identified 10 & missing 0 → `reviewed`
  - missing 1 & accepted null → `calibrated`
  - missing 1 & accepted 1 → `reviewed`
  - missing 3 & accepted 1 → `calibrated`
  - overcount 1 & accepted 5 → `calibrated`
  - identified 0 → `calibrated`
  - result null → `calibrated`
  - calibration null → `categorized`
  - incomplete categorization → `uncategorized`
  (M10 re-tests against real `analyzeTarget` output.)

## Acceptance
```bash
pnpm check
```

## Pitfalls
- Don't add fields that aren't in the spec.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
