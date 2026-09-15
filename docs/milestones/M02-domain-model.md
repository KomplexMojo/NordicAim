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
- `reasonMessage('template-mismatch', ctx)` with no `hintTemplate` — the §4 table shows
  `<sighting/precision>`, implying `hintTemplate` is always supplied by the caller. Implemented a
  literal `'sighting/precision'` fallback for the no-`hintTemplate` case since the spec doesn't say
  what to render then; non-blocking (M09/M12, the actual callers, always pass a hint).
- `ringRadiusMm(n)` isn't given a signature/return unit in the spec beyond "plus `getTemplate(id)` and
  `ringRadiusMm(n)`" in the Steps. Implemented as `PRECISION_TEMPLATE.ringDiameterMm[n] / 2` (mm),
  matching the ring-diameter formula the milestone asks to test. Non-blocking; M03/M05 (the consumers)
  can adjust if the scoring spec needs a different shape.

## Completion notes
- Implemented `src/lib/domain/{enums,primitives,session,photo,analysis,settings,categorization,status,
  reason-messages,index}.ts` and `src/lib/defaults/{biathlon,templates}.ts` per data-model.md §1–§5 and
  geometry-scoring.md §1, transcribed verbatim (constants, field names, validation ranges).
- `AnalysisResultSchema` is a permissive zod wrapper (`z.custom<SubsetResult>()` for `subsets`/`all`)
  per the milestone's "interface plus a permissive `AnalysisResultSchema`" instruction — it validates
  the record's top-level shape without re-deriving every scoring invariant, which belongs to M03.
- `photoStatus` implements analysis-pipeline.md §4 rule order 1–8 exactly, with warnings appended in
  the fixed order `alignment-uncertain, image-blurry, template-mismatch` (filtered from whatever order
  `pipeline.warnings` happens to store).
- Tests added: `tests/unit/domain/{categorization,schemas,status,reason-messages,analysis,settings}.test.ts`
  and `tests/unit/defaults/templates.test.ts` — covering every vector and test case named in the
  milestone's Tests section (ring diameter formula, `defaultCategorization`/`declaredRounds` cases
  including the both-3/2→5 and standing-with-null-rounds-throws cases, `Shot`/`Calibration` rejection
  cases, `BiathlonSession` parsing the data-model §8 example, all 9 `photoStatus` vectors from §4, and
  the two named `reasonMessage` cases) plus a few incidental tests (`initialAnalysis`,
  `defaultAppSettings`) for coverage of steps 1–2.
- Commands run: `pnpm typecheck` (pass), `pnpm lint` (pass, 0 errors / 3 pre-existing warnings in
  `src/components/ui/*` unrelated to this milestone), `pnpm test` (42/42 pass across 8 files),
  `pnpm check:privacy` (pass), `pnpm check` (pass, runs all of the above).
- No browser/Node imports were added to `src/lib/domain` (only `zod` and intra-`domain` imports).
