// goals.md §6: the Goals screen's one write. Read-modify-write of the single goals row, in one transaction that
// only awaits IndexedDB calls (data-model §6).

import { GoalLogEntry, GoalMetric, GoalView, type GoalsStore } from '@/lib/domain/goals';
import { getGoals, putGoals } from '@/lib/store/goals-repo';

import type { ServiceContext } from './context';

export async function listGoals(ctx: ServiceContext): Promise<GoalLogEntry[]> {
  return (await getGoals(ctx.db)).entries;
}

/**
 * Appends a new goal-log entry (goals.md §2): never edits or deletes an existing one, so the log is the full
 * history of what this (view, metric) pair's goal has ever been.
 */
export async function setGoal(
  ctx: ServiceContext,
  input: { view: GoalView; metric: GoalMetric; value: number },
): Promise<GoalLogEntry> {
  const entry = GoalLogEntry.parse({
    id: ctx.newId(),
    view: GoalView.parse(input.view),
    metric: GoalMetric.parse(input.metric),
    value: input.value,
    setAt: ctx.now().toISOString(),
  });
  const tx = ctx.db.transaction('goals', 'readwrite');
  const store: GoalsStore = await getGoals(tx);
  await putGoals(tx, { ...store, entries: [...store.entries, entry] });
  await tx.done;
  return entry;
}
