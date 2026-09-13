# M20: Garmin demo provider, tagging, suggestions, load (optional)

| Depends on | Tier | Size | Track | Design todo |
|---|---|---|---|---|
| M10, M17 | low | M | **optional** | garmin-auth-provider (demo), workflow-link-activity, harness-align |

> Only do this milestone if the owner asks for the Garmin track.

## Goal
Behind `ASA_ENABLE_GARMIN=1`, a session can tag Garmin activities (demo data for now), get suggestions from
capture times, set the primary activity, and show combined load beside the shooting metrics.

## Read first
- `docs/spec/garmin-optional.md` §1–§3, §5 (non-live routes), §6, §7
- `docs/spec/data-model.md` §2 (`GarminLink`)
- `fixtures/reference/demo-garmin-activities.json`

## In scope
Feature flag plumbing, provider interface, demo provider, provider registry (demo only), alignment, load
aggregation, routes, Activities UI, `GarminLoadCard`, and composite activity lines (already spec'd in
rendering §5).

## Out of scope
Live login and MCP (M21), description writing (M21).

## Files
- `src/lib/garmin/feature.ts` (`garminEnabled()`, `assertGarminEnabled()` → 404 `feature_disabled`)
- `src/lib/garmin/types.ts`, `type-labels.ts`, `normalize.ts`, `demo/demo-provider.ts`, `registry.ts`
- `src/lib/garmin/alignment.ts`, `src/lib/harness/load.ts`
- Routes: `/api/garmin/status`, `/api/garmin/demo`, `/api/garmin/activities`,
  `/api/sessions/[sessionId]/garmin` (PUT), `/garmin/suggestions` (GET), `/garmin/load` (GET)
- `src/components/garmin/ActivitiesTab.tsx`, `GarminLoadCard.tsx`, `GarminConnectBanner.tsx`
- `tests/unit/garmin/*.test.ts`, `tests/unit/harness/load.test.ts`, `tests/e2e/garmin-demo.spec.ts`

## Steps
1. Feature flag: every Garmin route calls `assertGarminEnabled()` first. The client learns the flag from
   `GET /api/garmin/status` (which returns `{ enabled: false, mode: 'off' }` with 200 when disabled; the only
   exception to the 404 rule).
2. Types, labels, and `normalizeGarminLocal` per §2 (with vectors).
3. Demo provider per §3. The registry keeps `mode` ('off' | 'demo' | 'live') on `globalThis`; M21 adds live.
4. `suggestActivities` per §6 and `aggregateLoad` per §7.
5. Suggestions route: capture locals from session photos (non-null `captureTime.local`); date range = min
   date − 1 to max date + 1 (≤ 31 days); returns §6 output plus the activity summaries.
6. PUT `/garmin`: validate that every `activityId` is from the provider (fetch the range around each start) and
   that `primaryActivityId` is in `activities`.
7. Load route: `getActivity` for each tagged activity → `aggregateLoad` → `{ load, activities }`.
8. **Activities tab** (a new session tab, only when enabled):
   - banner "Suggested from your capture times: …" with **Apply** (tags suggested ids with `addedBy: 'suggestion'`, primary = `primaryId`)
   - a date picker defaulting to the session date
   - a list with checkboxes (type label, `HH:mm`, duration, distance) and a primary radio among checked items
   - remove chips.
   - Re-run suggestions when the photo count changes (compare counts in client state).
9. `GarminLoadCard` in the Harness tab: duration h:mm, distance km (1 dp), calories, training load, avg/max HR,
   TE aerobic/anaerobic.
10. The composite analysis band activity line appears automatically when `session.garmin` has activities
    (verify, don't re-implement).

## Tests
- Unit: every vector in garmin-optional §2, §6, §7.
- Unit: with the flag off, the routes return 404 `feature_disabled` (except status).
- E2E (flag on via Playwright `webServer.env`):
  1. seeded demo (photos at 2026-09-05 16:56 and 2026-08-24 19:30)
  2. switch to demo mode
  3. Activities tab shows suggestions; Apply → the session has tagged activities and a primary
  4. the Harness tab load card shows `1:45` for the 09-05-only scenario (seed a session with only the precision
     photo for this test)
  5. building the composite includes `Activities:`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Two sample photos on different days in one session gives a wide date range; that's fine for suggestions.
- Garmin local-time strings use a space separator; capture locals use `T`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
