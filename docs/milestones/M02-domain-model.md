# M02: Domain model, defaults, status rules

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M01 | low | S | foundation |

## Goal
All records as zod schemas with inferred types; the biathlon profile and both templates; categorization helpers; the pure
`photoStatus` rules and reason messages.

## Read first
- `docs/spec/data-model.md` §1–§5
- `docs/spec/analysis-pipeline.md` §4
- `docs/spec/geometry-scoring.md` §1

## In scope
Schemas, types, helpers, constants, `photoStatus`, `reasonMessage`.

## Out of scope
Scoring math (M03), IndexedDB (M04), UI.

## Files
- `src/lib/domain/enums.ts`, `primitives.ts`, `session.ts`, `photo.ts`, `analysis.ts`, `settings.ts`, `categorization.ts`,
  `status.ts`, `reason-messages.ts`, `index.ts`
- `src/lib/defaults/biathlon.ts`, `templates.ts`
- `tests/unit/domain/*.test.ts`, `tests/unit/defaults/templates.test.ts`

## Steps
1. Transcribe every schema from data-model §1–§5 exactly. Export `type X = z.infer<typeof X>`. `AnalysisResult` is an interface
   plus a permissive `AnalysisResultSchema`.
2. `initialAnalysis(photoId, nowIso)` and `defaultAppSettings()` per the spec.
3. `categorization.ts`: `isCategorizationComplete`, `declaredRounds` (throws `IncompleteCategorizationError`),
   `defaultCategorization`, `emptyCategorization`.
4. `status.ts`: `photoStatus` exactly per analysis-pipeline §4 (rule order, warning append order).
5. `reason-messages.ts`: `reasonMessage(reason, { missing?: number; hintTemplate?: TemplateId })` returns the §4 table strings.
6. `defaults/*` verbatim from geometry-scoring §1, plus `getTemplate(id)` and `ringRadiusMm(n)`.
7. No browser or Node imports in `src/lib/domain`.

## Tests
- `ringDiameterMm[n] === 10.4 + 16 * (10 - n)`.
- `defaultCategorization('precision', 'both')` → rounds 5/5; `declaredRounds` both 3/2 → 5; standing with null rounds throws.
- `Shot` rejects multiplicity 0 and override-length mismatch; `Calibration` rejects axisRatio 0.2 and angleDeg 180; `BiathlonSession` parses data-model §8.
- `photoStatus`: every vector in analysis-pipeline §4. Use hand-built `result` stubs, where only `all.identified`,
  `subsets[].missing`, and `subsets[].overcount` are read (M12 re-tests with real results).
- `reasonMessage('rounds-unaccounted', { missing: 2 })` contains `2 round(s)`; `template-mismatch` with hint `sighting` contains `sighting`.

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
