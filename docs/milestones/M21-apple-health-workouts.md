# M21: Apple Health workouts (Phase 2)

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M20 | **high** | L | garmin-auth-provider (superseded) → workouts; workflow-link-activity; harness-align |

> **Phase 2 outline.** Re-plan first: re-validate the plugin choice with `docs/spec/workouts-phase2.md` §5 and update the spec
> and this file with exact APIs.

## Goal
In the native app, a session shows the workouts from that outing (Garmin workouts synced into Apple Health), suggested
automatically from capture times. The primary workout is set, workout load appears beside shooting metrics in the harness,
and the composite analysis band lists the workouts.

## Read first
- `docs/spec/workouts-phase2.md` (all)
- `fixtures/reference/demo-workouts.json`
- `docs/spec/data-model.md` §2, §6 (for the v2 migration)

## In scope
Data model v2 + IndexedDB migration + backup formatVersion 2, `WorkoutProvider` (HealthKit + demo), `suggestWorkouts`,
`aggregateLoad`, Workouts tab, harness load card, composite line.

## Out of scope
Garmin training load or Body Battery (not in Apple Health); writing anything to Apple Health.

## Outline of steps
1. Plugin decision per spec §5 (or a small local Swift plugin). Record it in Completion notes.
2. HealthKit capability and `NSHealthShareUsageDescription`; an authorization flow with a clear explanation screen.
3. Schema v2 + DB upgrade + backup import migration (spec §1), with tests.
4. Pure `suggestWorkouts` and `aggregateLoad` with all spec vectors.
5. **Workouts** tab (native only; hidden on web): suggestion banner with **Apply**, list with checkboxes, primary selection.
6. Harness `WorkoutLoadCard`; composite `Workouts:` line (spec §4).
7. The demo provider is available on web and in tests so e2e can cover the UI.

## Acceptance (to refine at re-plan)
- All spec vectors pass; e2e with the demo provider passes.
- **Human:** on the iPhone, authorize Health → today's Garmin workouts appear with correct times → suggestions match →
  load card values match Apple Health.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
