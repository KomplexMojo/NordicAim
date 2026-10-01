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
    const first = await setGoal(ctx, { view: 'precision-standing', metric: 'group', value: 3 });

    const ctxLater = makeTestContext(db, { nowIso: '2026-09-20T00:00:00.000Z' });
    const second = await setGoal(ctxLater, { view: 'precision-standing', metric: 'group', value: 2 });

    const entries = await listGoals(ctx);
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(first);
    expect(entries).toContainEqual(second);

    db.close();
  });

  it('refuses to write a view or metric that is not goal-able, but keeps reading old ones', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await db.put('goals', {
      schemaVersion: 1,
      key: 'app',
      entries: [{ id: '11111111-1111-4111-8111-111111111111', view: 'confirm', metric: 'mpiX', value: 1, setAt: '2026-09-29T12:00:00.000Z' }],
    });

    // @ts-expect-error -- Confirm is not a GoalView; the runtime check matters for any untyped caller.
    await expect(setGoal(ctx, { view: 'confirm', metric: 'score', value: 70 })).rejects.toThrow();
    // @ts-expect-error -- MPI is not a GoalMetric.
    await expect(setGoal(ctx, { view: 'precision-prone', metric: 'mpiX', value: 1 })).rejects.toThrow();

    await setGoal(ctx, { view: 'precision-prone', metric: 'score', value: 70 });
    expect(await listGoals(ctx)).toHaveLength(2);
    db.close();
  });

  it('writes in one transaction over the goals store only', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setGoal(ctx, { view: 'precision-prone', metric: 'rms', value: 15 });
    const stored = await getGoals(db);
    expect(stored.entries).toHaveLength(1);
    db.close();
  });
});
