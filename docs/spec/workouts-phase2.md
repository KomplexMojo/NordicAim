# Spec: Phase 2 workouts from Apple Health (Capacitor)

> **Phase 2 only.** Nothing here is built in Phase 1. Before M21 starts, a high-tier agent or the owner re-validates
> the plugin choice (§5) and updates this spec.

Garmin Connect writes workouts into Apple Health as `HKWorkout` records (not Garmin training load or Body Battery).
Inside the Capacitor app, a HealthKit plugin reads them, so the session gets workout context **without any Garmin login**.

## 1. Data model additions (schemaVersion 2)

```ts
export const WorkoutRef = z.object({
  workoutId: z.string().min(1),            // HealthKit UUID
  activityType: z.string(),                // e.g. 'running', 'crossCountrySkiing', 'walking', 'cycling'
  sourceName: z.string().nullable(),       // e.g. 'Connect'
  startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  durationSec: z.number().nonnegative(),
  distanceM: z.number().nonnegative().nullable(),
  energyKcal: z.number().nonnegative().nullable(),
  avgHr: z.number().positive().nullable(),
  maxHr: z.number().positive().nullable(),
  addedBy: z.enum(['user', 'suggestion']),
});
export const SessionWorkouts = z.object({ items: z.array(WorkoutRef), primaryWorkoutId: z.string().nullable() });
// BiathlonSession v2 = v1 + { schemaVersion: 2, workouts: SessionWorkouts | null }
```

Migration: IndexedDB version 2 upgrade sets `schemaVersion: 2, workouts: null` on every session. Backup import
accepts `formatVersion` 1 (migrating sessions) and 2.

## 2. Provider interface

```ts
export interface WorkoutProvider {
  readonly kind: 'healthkit' | 'demo';
  isAvailable(): Promise<boolean>;
  requestAuthorization(): Promise<'granted' | 'denied'>;   // read: workouts, heart rate, distance, active energy
  listWorkouts(startDate: string, endDate: string): Promise<WorkoutRef[]>; // inclusive local dates; addedBy ignored
}
```

The demo provider reads `fixtures/reference/demo-workouts.json`.

## 3. Suggestions (pure, `src/lib/workouts/suggest.ts`)

```ts
export function suggestWorkouts(captureLocals: string[] /* "YYYY-MM-DDTHH:mm:ss" */, workouts: WorkoutRef[]):
  { scored: Array<{ workoutId: string; score: number; reasons: string[] }>; suggestedIds: string[]; primaryId: string | null };
```

All times are local wall clock, converted to minutes with naive UTC arithmetic. `start` = `startLocal`;
`end = start + durationSec`; `wStart` = min capture, `wEnd` = max capture; `captureDays` = the capture dates.

Per workout:
1. `sameDay` = `captureDays` has the start date or the end date; if not → 0, `different-day`.
2. `end ≤ wStart`: gap = (wStart − end) min; score = max(0, 1 − gap/240); `ended-before-capture`.
3. `start ≥ wEnd`: gap = (start − wEnd) min; score = 0.5 × max(0, 1 − gap/60); `started-after-capture`.
4. Else score 1; `overlaps-capture`.

Selection:
- The initial set is score ≥ 0.5.
- **Chain**: repeatedly add a `sameDay` workout whose interval gap to any member is ≤ 90 min (`chained`).
- `suggestedIds` is sorted by start.
- **Primary** = the suggested workout with the latest start ≤ `wEnd`, else the highest score.
- With no captures, nothing is suggested.

**Vectors** (`demo-workouts.json`):
- Captures `["2026-09-05T16:56:03"]`: demo-1001 → 0; demo-1002 → 0.72479; demo-1003 → 0.96646; demo-1004 → 0.38375
  (chained); demo-1005 → 0 `different-day`. suggestedIds `[demo-1002, demo-1003, demo-1004]`, primary `demo-1003`. ±1e-4.
- Captures `["2026-08-24T19:30:09"]`: demo-0901 → 0.81188; demo-0902 → 0.97854; suggested `[demo-0901, demo-0902]`,
  primary `demo-0902`.

## 4. Load aggregation (pure, `src/lib/harness/load.ts`)

```ts
export function aggregateLoad(items: WorkoutRef[]): { count: number; durationSec: number; distanceM: number;
  energyKcal: number; avgHr: number | null; maxHr: number | null };
```

Sums skip nulls. `avgHr` = Σ(avgHr × durationSec) / Σ durationSec over items that have avgHr; `maxHr` is the maximum.
**Vector** (demo-1002, 1003, 1004): count 3, durationSec 6300, distanceM 26000, energyKcal 1360, avgHr 150.476 ±1e-3,
maxHr 182.

Composite analysis-band line (Phase 2): `Workouts: <label> <HH:mm> (<min> min) · …`, inserted before the Notes line.

## 5. Plugin selection criteria (M21, re-validate first)

No official Capacitor plugin covers HealthKit, so choose a community plugin that:
1. supports the Capacitor major version in use;
2. has had a release within the last 6 months;
3. reads `HKWorkout` start/end/type/source, total distance, active energy, and heart-rate statistics for a time range;
4. has an OSI licence (MIT/Apache-2.0).

If none qualifies, write a small local Capacitor plugin (Swift, `HKSampleQuery` for workouts +
`HKStatisticsQuery` for heart rate). Record the decision in M21 Completion notes.
Info.plist: `NSHealthShareUsageDescription`. Capability: HealthKit.
