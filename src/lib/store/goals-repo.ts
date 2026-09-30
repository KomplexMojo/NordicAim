import { defaultGoalsStore, GoalsStore } from '@/lib/domain/goals';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

/** Returns `defaultGoalsStore()` if no row is stored yet (goals.md §2). */
export async function getGoals(dbOrTx: Executor): Promise<GoalsStore> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('goals').get('app') : await dbOrTx.get('goals', 'app');
  if (raw == null) return defaultGoalsStore();
  const parsed = GoalsStore.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('goals', 'app', parsed.error);
  return parsed.data;
}

export async function putGoals(dbOrTx: Executor, goals: GoalsStore): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('goals').put(goals);
  else await dbOrTx.put('goals', goals);
}
