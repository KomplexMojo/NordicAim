import { describe, expect, it } from 'vitest';

import { defaultGoalsStore } from '@/lib/domain/goals';
import { getGoals, putGoals } from '@/lib/store/goals-repo';

import { openTestDb } from '../../helpers/db';

describe('goals-repo (goals.md §2)', () => {
  it('returns defaultGoalsStore when no row is stored', async () => {
    const db = await openTestDb();
    expect(await getGoals(db)).toEqual(defaultGoalsStore());
    db.close();
  });

  it('round-trips a goals row', async () => {
    const db = await openTestDb();
    const store = {
      ...defaultGoalsStore(),
      entries: [{ id: '11111111-1111-4111-8111-111111111111', view: 'confirm' as const, metric: 'group' as const, value: 2.5, setAt: '2026-09-30T00:00:00.000Z' }],
    };
    await putGoals(db, store);
    expect(await getGoals(db)).toEqual(store);
    db.close();
  });
});
