import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import { defaultAppSettings } from '@/lib/domain/settings';
import { rescoreAll } from '@/lib/services/rescore';
import { InvalidVisibleHoleDiameterError, setScoringRule, setVisibleHoleDiameterMm } from '@/lib/services/settings';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';

// REV-56: changing the scoring rule re-scores every stored session, and never touches shots or alignment.

const shot = (id: string, source: Shot['source']): Shot => ({
  id, xMm: 7.05, yMm: 0, multiplicity: 1, positionOverrides: null, source, confidence: null, cluster: false, possibleOverlap: false,
});

async function seed() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  await putSettings(db, defaultAppSettings());
  const session = makeSession();
  const done = makePhoto({ sessionId: session.id, status: 'analyzed' });
  const running = makePhoto({ sessionId: session.id, status: 'processing' });
  const noAnalysis = makePhoto({ sessionId: session.id, status: 'needs-metadata' });
  await putSessionRecord(db, { ...session, photoIds: [done.id, running.id, noAnalysis.id] });
  for (const p of [done, running, noAnalysis]) await putPhotoRecord(db, p);
  const calibration = { cx: 600, cy: 800, radiusPx: 250, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 112.4, source: 'manual' as const, confidence: null, perspective: null };
  const shots = [shot('auto-1', 'auto'), shot('m-1', 'manual')];
  await putAnalysisRecord(db, makeAnalysis(done.id, { stageA: 'done', stageB: 'done' }, { calibration, shots }));
  await putAnalysisRecord(db, makeAnalysis(running.id, { stageA: 'running', stageB: 'pending' }, { calibration: null, shots: [] }));
  return { db, ctx, done, running, noAnalysis, calibration, shots };
}

describe('rescoreAll (REV-56)', () => {
  it('sends finished analyses back to Stage B, and only those', async () => {
    const { db, ctx, done, running } = await seed();
    const report = await rescoreAll(ctx);
    expect(report).toEqual({ photos: 1, sessions: 1 });
    expect((await getAnalysisRecord(db, done.id))?.pipeline.stageB).toBe('pending');
    // Still running: untouched, and it will read the new rule when its own Stage B runs.
    expect((await getAnalysisRecord(db, running.id))?.pipeline.stageA).toBe('running');
    db.close();
  });

  it('never touches shots or calibration, so nothing corrected by hand can be lost', async () => {
    const { db, ctx, done, calibration, shots } = await seed();
    await rescoreAll(ctx);
    const after = await getAnalysisRecord(db, done.id);
    expect(after?.shots).toEqual(shots);
    expect(after?.calibration).toEqual(calibration);
    expect(after?.shots.filter((s) => s.source === 'manual')).toHaveLength(1);
    db.close();
  });

  it('puts the photo back to ready, so the card no longer shows a stale score', async () => {
    const { db, ctx, done } = await seed();
    await rescoreAll(ctx);
    expect((await getPhotoRecord(db, done.id))?.status).toBe('ready');
    db.close();
  });
});

describe('changing the scoring setting (REV-56)', () => {
  it('a rule that changes the effective hole size re-scores', async () => {
    const { db, ctx, done } = await seed();
    const change = await setScoringRule(ctx, 'centre');
    expect(change.settings.scoringRule).toBe('centre');
    expect(change.rescored).toEqual({ photos: 1, sessions: 1 });
    expect((await getAnalysisRecord(db, done.id))?.pipeline.stageB).toBe('pending');
    db.close();
  });

  it('choosing the rule already in force changes nothing', async () => {
    const { db, ctx, done } = await seed();
    const change = await setScoringRule(ctx, 'gauge');
    expect(change.rescored).toBeNull();
    expect((await getAnalysisRecord(db, done.id))?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('the visible hole size re-scores only while the visible rule is in force', async () => {
    const { db, ctx, done } = await seed();
    // Under gauge the visible size is not used, so changing it must not disturb stored scores.
    expect((await setVisibleHoleDiameterMm(ctx, 4.0)).rescored).toBeNull();
    expect((await getAnalysisRecord(db, done.id))?.pipeline.stageB).toBe('done');

    await setScoringRule(ctx, 'visible'); // 4.0 mm now differs from gauge's 5.6, so this re-scores
    await putAnalysisRecord(db, { ...(await getAnalysisRecord(db, done.id))!, pipeline: { ...(await getAnalysisRecord(db, done.id))!.pipeline, stageB: 'done' } });
    expect((await setVisibleHoleDiameterMm(ctx, 3.5)).rescored).toEqual({ photos: 1, sessions: 1 });
    db.close();
  });

  it('refuses a visible size outside 2-5.6 mm and stores nothing', async () => {
    const { db, ctx } = await seed();
    await expect(setVisibleHoleDiameterMm(ctx, 9)).rejects.toBeInstanceOf(InvalidVisibleHoleDiameterError);
    expect((await getSettings(db)).visibleHoleDiameterMm).toBe(4.5);
    db.close();
  });
});
