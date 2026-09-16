import { describe, expect, it } from 'vitest';

import { planJobs } from '@/lib/pipeline/plan';

import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';

const INCOMPLETE = { template: 'precision' as const, position: null, roundsProne: null, roundsStanding: null };

describe('planJobs (analysis-pipeline §5)', () => {
  it('queues an A job per photo whose Stage A is unfinished, ordered by importedAt', () => {
    const session = makeSession();
    const p1 = makePhoto({ sessionId: session.id, importedAt: '2026-09-05T23:40:00.000Z' });
    const p2 = makePhoto({ sessionId: session.id, importedAt: '2026-09-05T23:45:00.000Z' });

    const jobs = planJobs(
      [session],
      [p2, p1],
      [makeAnalysis(p1.id, { stageA: 'pending' }), makeAnalysis(p2.id, { stageA: 'running' })],
    );

    expect(jobs).toEqual([
      { kind: 'A', photoId: p1.id },
      { kind: 'A', photoId: p2.id },
    ]);
  });

  it('does not queue Stage B while the session has no analyzeRequestedAt', () => {
    const session = makeSession();
    const photo = makePhoto({ sessionId: session.id });
    const analysis = makeAnalysis(photo.id, { stageA: 'done', stageB: 'pending' });

    expect(planJobs([session], [photo], [analysis])).toEqual([]);
  });

  it('queues Stage B once analysis has been requested', () => {
    const session = makeSession({ analyzeRequestedAt: '2026-09-06T00:01:00.000Z' });
    const photo = makePhoto({ sessionId: session.id });
    const analysis = makeAnalysis(photo.id, { stageA: 'done', stageB: 'pending' });

    expect(planJobs([session], [photo], [analysis])).toEqual([{ kind: 'B', photoId: photo.id }]);
  });

  it('does not queue Stage B when the categorization is incomplete', () => {
    const session = makeSession({ analyzeRequestedAt: '2026-09-06T00:01:00.000Z' });
    const photo = makePhoto({ sessionId: session.id, categorization: INCOMPLETE });
    const analysis = makeAnalysis(photo.id, { stageA: 'done', stageB: 'pending' });

    expect(planJobs([session], [photo], [analysis])).toEqual([]);
  });

  it('puts every A job before every B job', () => {
    const session = makeSession({ analyzeRequestedAt: '2026-09-06T00:01:00.000Z' });
    const ready = makePhoto({ sessionId: session.id, importedAt: '2026-09-05T23:40:00.000Z' });
    const fresh = makePhoto({ sessionId: session.id, importedAt: '2026-09-05T23:50:00.000Z' });

    const jobs = planJobs(
      [session],
      [ready, fresh],
      [makeAnalysis(ready.id, { stageA: 'done', stageB: 'pending' }), makeAnalysis(fresh.id, { stageA: 'pending' })],
    );

    expect(jobs).toEqual([
      { kind: 'A', photoId: fresh.id },
      { kind: 'B', photoId: ready.id },
    ]);
  });

  it('ignores photos with no analysis record and finished stages', () => {
    const session = makeSession({ analyzeRequestedAt: '2026-09-06T00:01:00.000Z' });
    const orphan = makePhoto({ sessionId: session.id });
    const done = makePhoto({ sessionId: session.id });

    expect(planJobs([session], [orphan, done], [makeAnalysis(done.id, { stageA: 'done', stageB: 'done' })])).toEqual([]);
  });
});
