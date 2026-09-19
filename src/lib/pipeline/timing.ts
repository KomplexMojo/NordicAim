// analysis-pipeline §9 (M15): in-memory record of per-job pipeline durations, shown on the results
// screen when the URL has `?debug=1`. Browser-only (uses `performance.now()`), but it is a plain state
// module — no DOM access — so it is safe to import from anywhere in `src/lib/pipeline`.

export interface JobTiming {
  kind: 'A' | 'B';
  photoId: string;
  ms: number;
}

/** Keep more than the 10 shown in the UI so a slow older job isn't lost the moment a fast one runs. */
const MAX_TIMINGS = 50;

const timings: JobTiming[] = [];

export function recordTiming(timing: JobTiming): void {
  timings.push(timing);
  if (timings.length > MAX_TIMINGS) timings.shift();
}

/** The most recent `count` timings, oldest first. Defaults to the 10 the results screen shows. */
export function getRecentTimings(count = 10): JobTiming[] {
  return timings.slice(-count);
}

/** Tests only. */
export function resetTimingsForTests(): void {
  timings.length = 0;
}
