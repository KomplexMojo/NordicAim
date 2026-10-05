// M29: a small hand-built 545 Coach export, shaped like the owner's real 2026-09-28 export (coach-context-import.md §4) but made up:
// the real file is training data and stays in gitignored fixtures/private/.

export const COACH_DAY = '2026-09-28';

export interface SyntheticCoachOptions {
  day?: string;
  /** Overrides applied to the whole file object after it is built. */
  patch?: Record<string, unknown>;
}

export function syntheticCoachFile(opts: SyntheticCoachOptions = {}): Record<string, unknown> {
  const day = opts.day ?? COACH_DAY;
  const bout = (position: 'prone' | 'standing', discHits: boolean[], comboGroup: string | null, targetZone: number | null = null) => ({
    sessionDate: day,
    position,
    discHits,
    comboGroup,
    hitRate: discHits.filter(Boolean).length / 5,
    targetZone,
    race: null,
  });
  return {
    format: 'coach-context',
    formatVersion: 1,
    source: { app: '545-coach', appVersion: '0.0.0-test', exportedAt: '2026-10-01T08:00:00.000Z' },
    athleteHint: 'Test Athlete',
    range: { from: '2026-09-20', to: '2026-09-30' },
    metalSessions: [
      bout('prone', [true, true, false, true, true], 'g-1'),
      bout('standing', [true, false, false, true, true], 'g-1', 2),
      bout('prone', [true, true, true, true, true], 'g-2'),
      bout('standing', [false, true, true, true, false], 'g-2', 2),
      // Another day: never matched to a session on `day`.
      { ...bout('prone', [false, false, false, false, false], 'g-9'), sessionDate: '2026-09-21' },
    ],
    zeroAdjustments: [
      // 01:19 UTC on the 29th is still the 28th west of UTC — the day-boundary case that motivates matching by local
      // date (same shape of case as the real sample, whose own `at` values are seconds+offset, e.g. `...12.231+00:00`,
      // not this Z-suffixed made-up one; see coach-context.test.ts for a test against the real shape).
      { at: '2026-09-29T01:19:00.000Z', verticalClicks: 2, horizontalClicks: -1, note: 'after confirm' },
      { at: '2026-09-28T15:05:00.000Z', verticalClicks: 0, horizontalClicks: 1, note: null },
      { at: '2026-09-21T12:00:00.000Z', verticalClicks: -3, horizontalClicks: 0, note: null },
    ],
    windConditions: [
      { sessionDate: day, speedKph: null, direction: null, note: 'none' },
      { sessionDate: '2026-09-21', speedKph: null, direction: '3', note: 'light' },
    ],
    conventions: {
      discOrder: 'alpha, beta, charlie, delta, echo — left to right downrange',
      zeroClicks: '+ up / + right, − down / − left',
      windDirection: 'clock position wind blows FROM, facing the target: 12 headwind, 6 tailwind, 3/9 crosswind',
      windStrength: 'band only (none, light, moderate, strong) — no speed is recorded',
    },
    ...opts.patch,
  };
}

export const syntheticCoachText = (opts: SyntheticCoachOptions = {}): string => JSON.stringify(syntheticCoachFile(opts));
