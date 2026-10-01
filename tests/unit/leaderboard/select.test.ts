// leaderboard.md §4 (issue #42): the submission is the best 5 per position, of all time; fewer than 5 is not a submission.

import { describe, expect, it } from 'vitest';

import type { CorrectionCheck } from '@/lib/leaderboard/score';
import { compareTargets, previewSubmission, SUBMISSION_SIZE, type MyBoardTarget } from '@/lib/leaderboard/select';

function target(id: string, percent: number, over: { x?: number; group?: number | null; date?: string; position?: 'prone' | 'standing'; edited?: boolean; flagged?: boolean } = {}): MyBoardTarget {
  const final = { percent, xCount: over.x ?? 0, groupMm: over.group === undefined ? 20 : over.group };
  const check: CorrectionCheck = { edited: over.edited ?? false, auto: null, final, deltaPoints: null, flagged: over.flagged ?? false };
  return {
    photoId: id,
    sessionId: `s-${id}`,
    sessionDate: over.date ?? '2026-09-01',
    position: over.position ?? 'prone',
    declared: 10,
    finalShots: [],
    autoShots: null,
    check,
  };
}

describe('compareTargets: score, then X, then the smaller group, then the earlier date', () => {
  it('orders ties ISSF-style', () => {
    const list = [
      target('late', 80, { x: 2, group: 30, date: '2026-09-10' }),
      target('wide', 80, { x: 2, group: 40 }),
      target('xs', 80, { x: 3, group: 50 }),
      target('best', 90),
      target('early', 80, { x: 2, group: 30, date: '2026-09-02' }),
      target('nogroup', 80, { x: 2, group: null }),
    ];
    expect([...list].sort(compareTargets).map((t) => t.photoId)).toEqual(['best', 'xs', 'early', 'late', 'wide', 'nogroup']);
  });
});

describe('previewSubmission', () => {
  const many = [55, 90, 70, 85, 60, 95, 80].map((p, i) => target(`p${i}`, p, { date: `2026-0${(i % 9) + 1}-01` }));

  it('takes the best 5 of all time, whatever their dates, and averages them', () => {
    const preview = previewSubmission(many, 'prone');
    expect(SUBMISSION_SIZE).toBe(5);
    expect(preview.targets.map((t) => t.check.final.percent)).toEqual([95, 90, 85, 80, 70]);
    expect(preview).toMatchObject({ complete: true, available: 7, average: 84, edited: false, flagged: false });
  });

  it('only counts its own position, and is not a submission below 5', () => {
    const standing = [target('a', 80, { position: 'standing' }), target('b', 70, { position: 'standing' }), target('c', 60, { position: 'standing' })];
    const preview = previewSubmission([...many, ...standing], 'standing');
    expect(preview).toMatchObject({ complete: false, available: 3 });
    expect(preview.targets).toHaveLength(3);
  });

  it('nothing at all: no targets and no average', () => {
    expect(previewSubmission([], 'prone')).toMatchObject({ targets: [], available: 0, complete: false, average: null });
  });

  it('carries the edited and flagged marks of any target in the 5, which are not skipped', () => {
    const list = [...many.slice(0, 4), target('fixed', 99, { edited: true, flagged: true })];
    const preview = previewSubmission(list, 'prone');
    expect(preview.targets[0]?.photoId).toBe('fixed');
    expect(preview).toMatchObject({ edited: true, flagged: true, complete: true });
  });
});
