import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration, Categorization } from '@/lib/domain/photo';
import { defaultAppSettings } from '@/lib/domain/settings';
import { runStageA, type CvApi } from '@/lib/pipeline/stage-a';
import { shouldRerunStageA } from '@/lib/pipeline/template-change';
import { updatePhotoMetadata } from '@/lib/services/photos';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makeCapture, makePhoto, makePrior, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';

// REV-57 / issue #10: changing a photo's template re-runs alignment and detection, unless something is manual.

const CAL: Calibration = {
  cx: 600, cy: 800, radiusPx: 250, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 115,
  source: 'auto', confidence: 0.9, perspective: null,
};
const shot = (id: string, source: Shot['source']): Shot => ({
  id, xMm: 1, yMm: 1, multiplicity: 1, positionOverrides: null, source, confidence: null, cluster: false, possibleOverlap: false,
});
const cat = (template: TemplateId | null): Categorization => ({ template, position: 'prone', roundsProne: 10, roundsStanding: null });

function analysis(over: { calibration?: Calibration | null; shots?: Shot[]; stageA?: 'pending' | 'running' | 'done' | 'error' }) {
  return makeAnalysis('p', { stageA: over.stageA ?? 'done', stageB: 'done' }, { calibration: over.calibration ?? CAL, shots: over.shots ?? [shot('a', 'auto')] });
}

describe('shouldRerunStageA (analysis-pipeline §5, REV-57)', () => {
  it('re-runs when the template changes on an all-auto photo whose Stage A has finished', () => {
    expect(shouldRerunStageA(cat('precision'), cat('sighting'), analysis({}))).toBe(true);
    expect(shouldRerunStageA(cat(null), cat('sighting'), analysis({}))).toBe(true); // an import choosing its template
  });

  it('does not when the template is unchanged or cleared', () => {
    expect(shouldRerunStageA(cat('sighting'), cat('sighting'), analysis({}))).toBe(false);
    expect(shouldRerunStageA(cat('sighting'), cat(null), analysis({}))).toBe(false);
  });

  it('never re-derives anything the owner made: a manual calibration or a manual shot blocks it', () => {
    expect(shouldRerunStageA(cat('precision'), cat('sighting'), analysis({ calibration: { ...CAL, source: 'manual' } }))).toBe(false);
    expect(shouldRerunStageA(cat('precision'), cat('sighting'), analysis({ shots: [shot('a', 'auto'), shot('m', 'manual')] }))).toBe(false);
  });

  it('only from a finished Stage A: pending reads the new template itself, running is caught on commit, error is retried by hand', () => {
    for (const stageA of ['pending', 'running', 'error'] as const) {
      expect(shouldRerunStageA(cat('precision'), cat('sighting'), analysis({ stageA }))).toBe(false);
    }
  });
});

async function seed(opts: { analyzeRequested: boolean; analysis: ReturnType<typeof analysis>; template?: TemplateId | null }) {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = makeSession();
  const photo = makePhoto({
    sessionId: session.id,
    capture: makeCapture({ overlayTemplate: 'precision', calibrationPriorFramePx: makePrior() }),
    categorization: cat(opts.template === undefined ? 'precision' : opts.template),
  });
  await putSessionRecord(db, { ...session, photoIds: [photo.id], analyzeRequestedAt: opts.analyzeRequested ? '2026-09-05T23:41:00.000Z' : null });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, { ...opts.analysis, photoId: photo.id });
  await putBlob(db, photoWorkingKey(photo.id), {
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer, contentType: 'image/jpeg', sizeBytes: 4, createdAt: '2026-09-05T23:40:00.000Z',
  });
  return { db, ctx, photo };
}

describe('updatePhotoMetadata queues Stage A on a template change (REV-57)', () => {
  it('queues Stage A and Stage B, before or after Analyze was requested', async () => {
    for (const analyzeRequested of [false, true]) {
      const { db, ctx, photo } = await seed({ analyzeRequested, analysis: analysis({}) });
      await updatePhotoMetadata(ctx, photo.id, { categorization: cat('sighting') });
      const after = await getAnalysisRecord(db, photo.id);
      expect(after?.pipeline.stageA).toBe('pending');
      expect(after?.pipeline.stageB).toBe('pending');
      db.close();
    }
  });

  it('leaves Stage A alone when only the rounds change', async () => {
    const { db, ctx, photo } = await seed({ analyzeRequested: true, analysis: analysis({}) });
    await updatePhotoMetadata(ctx, photo.id, { categorization: { ...cat('precision'), roundsProne: 8 } });
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.pipeline.stageA).toBe('done');
    expect(after?.pipeline.stageB).toBe('pending'); // still re-scored
    db.close();
  });

  it('only re-scores when a shot is manual, and touches neither the shots nor the alignment', async () => {
    const shots = [shot('a', 'auto'), shot('m', 'manual')];
    const { db, ctx, photo } = await seed({ analyzeRequested: true, analysis: analysis({ shots }) });
    await updatePhotoMetadata(ctx, photo.id, { categorization: cat('sighting') });
    const after = await getAnalysisRecord(db, photo.id);
    expect(after?.pipeline.stageA).toBe('done');
    expect(after?.pipeline.stageB).toBe('pending');
    expect(after?.shots).toEqual(shots);
    expect(after?.calibration).toEqual(CAL);
    db.close();
  });
});

function stubCv(onReview?: () => Promise<void>) {
  const reviewed: Array<TemplateId | null> = [];
  const api: CvApi = {
    async reviewAndAlign(_jpeg, _prior, templateHint) {
      reviewed.push(templateHint);
      await onReview?.();
      return { detection: null, sharpness: 500, templateHint: null };
    },
    async detectShots() {
      return { shots: [], detection: { method: 'standard', backing: 'off', fallbackReason: null }, suggestions: [], holeWidths: [] };
    },
  };
  return { api, reviewed };
}

describe('runStageA aligns against the owner\'s template (REV-57)', () => {
  it('passes the chosen template, not only the capture overlay\'s', async () => {
    // The overlay said precision; the owner corrected it to sighting.
    const { db, ctx, photo } = await seed({ analyzeRequested: false, analysis: analysis({ stageA: 'pending' }), template: 'sighting' });
    await putSettings(db, defaultAppSettings());
    const { api, reviewed } = stubCv();
    await runStageA(ctx, photo.id, api, stubImageTools());
    expect(reviewed).toEqual(['sighting']);
    db.close();
  });

  it('falls back to the overlay template while none is chosen', async () => {
    const { db, ctx, photo } = await seed({ analyzeRequested: false, analysis: analysis({ stageA: 'pending' }), template: null });
    await putSettings(db, defaultAppSettings());
    const { api, reviewed } = stubCv();
    await runStageA(ctx, photo.id, api, stubImageTools());
    expect(reviewed).toEqual(['precision']);
    db.close();
  });

  it('a template changed WHILE it runs queues one more run when it commits, then settles', async () => {
    const { db, ctx, photo } = await seed({ analyzeRequested: false, analysis: analysis({ stageA: 'pending' }), template: 'precision' });
    await putSettings(db, defaultAppSettings());
    const first = stubCv(async () => {
      // The owner changes the template mid-run: Stage A is `running`, so the service cannot queue it.
      await updatePhotoMetadata(ctx, photo.id, { categorization: cat('sighting') });
      expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageA).toBe('running');
    });
    await runStageA(ctx, photo.id, first.api, stubImageTools());
    expect(first.reviewed).toEqual(['precision']); // the run used what it started with
    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageA).toBe('pending'); // queued once

    const second = stubCv();
    await runStageA(ctx, photo.id, second.api, stubImageTools());
    expect(second.reviewed).toEqual(['sighting']); // the next run reads the stored template
    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageA).toBe('done'); // and settles: no loop
    expect((await getPhotoRecord(db, photo.id))?.categorization.template).toBe('sighting');
    db.close();
  });
});
