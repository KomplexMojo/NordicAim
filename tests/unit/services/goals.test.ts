import { describe, expect, it } from 'vitest';

import { listGoals, setGoal } from '@/lib/services/goals';
import { getGoals } from '@/lib/store/goals-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';

describe('goals service (goals.md §6)', () => {
  it('setGoal appends an entry, stamped with the clock; listGoals reads it back', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-30T12:00:00.000Z' });

    const entry = await setGoal(ctx, { view: 'precision-prone', metric: 'score', value: 70 });
    expect(entry).toMatchObject({ view: 'precision-prone', metric: 'score', value: 70, setAt: '2026-09-30T12:00:00.000Z' });
    expect(await listGoals(ctx)).toEqual([entry]);

    db.close();
  });

  it('setting a goal again appends, never replaces the earlier entry', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-01T00:00:00.000Z' });
    const first = await setGoal(ctx, { view: 'confirm', metric: 'group', value: 3 });

    const ctxLater = makeTestContext(db, { nowIso: '2026-09-20T00:00:00.000Z' });
    const second = await setGoal(ctxLater, { view: 'confirm', metric: 'group', value: 2 });

    const entries = await listGoals(ctx);
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(first);
    expect(entries).toContainEqual(second);

    db.close();
  });

  it('writes in one transaction over the goals store only', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setGoal(ctx, { view: 'sight-in', metric: 'rms', value: 15 });
    const stored = await getGoals(db);
    expect(stored.entries).toHaveLength(1);
    db.close();
  });
});
