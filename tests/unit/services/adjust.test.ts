import { describe, expect, it, vi } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { Calibration, Categorization } from '@/lib/domain/photo';
import { mmToPx } from '@/lib/geometry/transform';
import { reprojectShots } from '@/lib/geometry/reproject';
import { onPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { runStageA, type CvApi } from '@/lib/pipeline/stage-a';
import type { ServiceContext } from '@/lib/services/context';
import {
  NoCalibrationError,
  adjustStartCalibration,
  buildGroundTruth,
  SAME_HOLE_DIAMETERS,
  markManualShots,
  reanalyze,
  redetectShots,
  saveAdjustments,
  unplacedRounds,
  type DetectShotsApi,
} from '@/lib/services/adjust';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makeCapture, makePhoto, makePrior, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';

/** The calibration Stage A measured on the 1200x1600 working image. */
const AUTO_CAL: Calibration = {
  cx: 620,
  cy: 838,
  radiusPx: 265,
  axisRatio: 0.934,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'auto',
  confidence: 0.94,
  perspective: null,
};

/** Where the user dragged it in Adjust. */
const MOVED_CAL: Calibration = { ...AUTO_CAL, cx: 600, cy: 820, radiusPx: 270 };

function autoShot(id: string, xMm: number, yMm: number): Shot {
  return {
    id,
    xMm,
    yMm,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto',
    confidence: 0.9,
    cluster: false,
    possibleOverlap: false,
  };
}

function manualShot(id: string, xMm: number, yMm: number): Shot {
  return { ...autoShot(id, xMm, yMm), source: 'manual', confidence: null };
}

interface Seeded {
  ctx: ServiceContext;
  photoId: string;
  sessionId: string;
}

async function seed(
  opts: { calibration?: Calibration | null; shots?: Shot[]; stageB?: 'pending' | 'done' } = {},
): Promise<Seeded> {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = makeSession();
  const photo = makePhoto({
    sessionId: session.id,
    capture: makeCapture({ overlayTemplate: 'precision', calibrationPriorFramePx: makePrior() }),
  });
  const analysis = makeAnalysis(
    photo.id,
    { stageA: 'done', stageB: opts.stageB ?? 'done' },
    { calibration: opts.calibration === undefined ? AUTO_CAL : opts.calibration, shots: opts.shots ?? [] },
  );

  await putSessionRecord(db, { ...session, photoIds: [photo.id], analyzeRequestedAt: '2026-09-05T23:41:00.000Z' });
  await putPhotoRecord(db, photo);
  await putAnalysisRecord(db, analysis);
  await putBlob(db, photoWorkingKey(photo.id), {
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    contentType: 'image/jpeg',
    sizeBytes: 4,
    createdAt: '2026-09-05T23:40:00.000Z',
  });

  return { ctx, photoId: photo.id, sessionId: session.id };
}

function stubDetect(shots: Shot[]) {
  const calls: Array<{ calibration: Calibration; template: string; holeDiameterMm: number }> = [];
  const api: DetectShotsApi = {
    async detectShots(workingJpeg, calibration, template, holeDiameterMm) {
      void workingJpeg;
      calls.push({ calibration, template, holeDiameterMm });
      return { shots, detection: { method: 'standard' as const, backing: 'off' as const, fallbackReason: null } };
    },
  };
  return { api, calls };
}

describe('markManualShots (M13 step 4)', () => {
  it('keeps an untouched auto shot exactly as it was stored', () => {
    const stored = autoShot('auto-1', 1.4, -0.8);
    const [kept] = markManualShots([stored], [{ ...stored }]);
    expect(kept).toEqual(stored);
    expect(kept?.source).toBe('auto');
    expect(kept?.confidence).toBe(0.9);
  });

  it('marks a moved shot manual and drops its confidence', () => {
    const stored = autoShot('auto-1', 1.4, -0.8);
    const [moved] = markManualShots([stored], [{ ...stored, xMm: 2 }]);
    expect(moved?.source).toBe('manual');
    expect(moved?.confidence).toBeNull();
  });

  it('marks a changed multiplicity or position override manual', () => {
    const stored = autoShot('auto-1', 1.4, -0.8);
    expect(markManualShots([stored], [{ ...stored, multiplicity: 2 }])[0]?.source).toBe('manual');
    expect(
      markManualShots([{ ...stored, multiplicity: 1 }], [{ ...stored, positionOverrides: ['standing'] }])[0]?.source,
    ).toBe('manual');
  });

  it('marks a new shot manual and leaves the others alone', () => {
    const stored = autoShot('auto-1', 1.4, -0.8);
    const added = autoShot('new-1', -30.1, -28.4);
    const result = markManualShots([stored], [stored, added]);
    expect(result[0]?.source).toBe('auto');
    expect(result[1]?.source).toBe('manual');
    expect(result[1]?.confidence).toBeNull();
  });
});

describe('saveAdjustments (analysis-pipeline §8)', () => {
  it('saves a moved calibration as manual, with alignment method manual and stageB pending', async () => {
    const { ctx, photoId } = await seed();

    await saveAdjustments(ctx, photoId, { calibration: MOVED_CAL });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.calibration).toEqual({ ...MOVED_CAL, source: 'manual', confidence: null });
    expect(analysis?.pipeline.alignment).toEqual({ method: 'manual', confidence: null });
    expect(analysis?.pipeline.stageB).toBe('pending');

    const photo = await getPhotoRecord(ctx.db, photoId);
    expect(photo?.status).toBe('ready');
    ctx.db.close();
  });

  it('leaves the alignment alone when only shots are saved', async () => {
    const { ctx, photoId } = await seed({ shots: [autoShot('auto-1', 1.4, -0.8)] });

    await saveAdjustments(ctx, photoId, { shots: [autoShot('auto-1', 1.4, -0.8)] });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.calibration?.source).toBe('auto');
    expect(analysis?.pipeline.alignment).toEqual({ method: 'none', confidence: null });
    expect(analysis?.pipeline.stageB).toBe('pending');
    ctx.db.close();
  });

  it('adding a shot marks only that shot manual', async () => {
    const stored = autoShot('auto-1', 1.4, -0.8);
    const { ctx, photoId } = await seed({ shots: [stored] });

    await saveAdjustments(ctx, photoId, { shots: [stored, autoShot('added', -30.1, -28.4)] });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots.map((s) => [s.id, s.source])).toEqual([
      ['auto-1', 'auto'],
      ['added', 'manual'],
    ]);
    ctx.db.close();
  });

  it('deleting a shot keeps the remaining auto shots auto', async () => {
    const a = autoShot('auto-1', 1.4, -0.8);
    const b = autoShot('auto-2', -30.1, -28.4);
    const { ctx, photoId } = await seed({ shots: [a, b] });

    await saveAdjustments(ctx, photoId, { shots: [a] });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots).toEqual([a]);
    ctx.db.close();
  });

  it('touches session.updatedAt, emits pipeline-changed and notifies the runner', async () => {
    const { ctx, photoId, sessionId } = await seed();
    const notifySpy = vi.spyOn(pipelineHooks, 'notify');
    notifySpy.mockClear();
    const events: Array<{ sessionId: string; photoId?: string }> = [];
    const unsubscribe = onPipelineChanged((d) => events.push(d));

    await saveAdjustments(ctx, photoId, { shots: [] });

    expect(events).toEqual([{ sessionId, photoId }]);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const session = await getSessionRecord(ctx.db, sessionId);
    expect(session?.updatedAt).toBe('2026-09-05T23:40:00.000Z');
    unsubscribe();
    notifySpy.mockRestore();
    ctx.db.close();
  });

  it("does not change the calibration or shots that Stage A then re-runs over (§8)", async () => {
    const manual = manualShot('m-1', -7.6, -9.4);
    const { ctx, photoId } = await seed({ shots: [] });
    await saveAdjustments(ctx, photoId, { calibration: MOVED_CAL, shots: [manual] });

    const detectCalls: unknown[] = [];
    const cv: CvApi = {
      async reviewAndAlign() {
        return {
          detection: { calibration: AUTO_CAL, confidence: 0.99, outsidePrior: false },
          sharpness: 150,
          templateHint: { template: 'precision', confidence: 0.8 },
        };
      },
      async detectShots(...args) {
        detectCalls.push(args);
        return { shots: [autoShot('auto-9', 0, 0)], detection: { method: 'standard' as const, backing: 'off' as const, fallbackReason: null } };
      },
    };

    await runStageA(ctx, photoId, cv, stubImageTools());

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.pipeline.stageA).toBe('done');
    expect(analysis?.calibration).toEqual({ ...MOVED_CAL, source: 'manual', confidence: null });
    expect(analysis?.pipeline.alignment.method).toBe('manual');
    expect(analysis?.shots).toEqual([manual]);
    expect(detectCalls).toHaveLength(0);
    ctx.db.close();
  });
});

describe('redetectShots (M13 step 5)', () => {
  it('replaces the auto shots, keeps the manual ones and sets stageB pending', async () => {
    const manual = manualShot('m-1', -7.6, -9.4);
    const { ctx, photoId } = await seed({ shots: [manual, autoShot('auto-1', 1.4, -0.8)] });
    const { api, calls } = stubDetect([autoShot('auto-1', 2, -1), autoShot('auto-2', -11, -13.4)]);

    await redetectShots(ctx, photoId, api);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots.map((s) => [s.id, s.source, s.xMm])).toEqual([
      ['m-1', 'manual', -7.6],
      ['auto-1', 'auto', 2],
      ['auto-2', 'auto', -11],
    ]);
    expect(analysis?.pipeline.stageB).toBe('pending');
    // The stored calibration, the photo's template and the profile hole size reach the worker.
    expect(calls[0]?.calibration).toEqual(AUTO_CAL);
    expect(calls[0]?.template).toBe('precision');
    expect(calls[0]?.holeDiameterMm).toBe(5.6);
    ctx.db.close();
  });

  it('renames a detected shot whose id collides with a kept manual one', async () => {
    const { ctx, photoId } = await seed({ shots: [manualShot('auto-1', -7.6, -9.4)] });
    const { api } = stubDetect([autoShot('auto-1', 2, -1)]);

    await redetectShots(ctx, photoId, api);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots.map((s) => s.id)).toEqual(['auto-1', 'auto-1-2']);
    ctx.db.close();
  });

  it('refuses to run without a calibration', async () => {
    const { ctx, photoId } = await seed({ calibration: null });
    const { api } = stubDetect([]);

    await expect(redetectShots(ctx, photoId, api)).rejects.toBeInstanceOf(NoCalibrationError);
    ctx.db.close();
  });
});

describe('re-projection on save (REV-46)', () => {
  it('keeps an auto shot auto when it only followed a re-alignment, and stores it on its hole', async () => {
    const stored = autoShot('auto-1', 12, -6);
    const { ctx, photoId } = await seed({ shots: [stored] });
    // What the Adjust screen hands back after the user dragged the rings: the shot re-projected onto them.
    const onScreen = reprojectShots([stored], AUTO_CAL, MOVED_CAL);

    await saveAdjustments(ctx, photoId, { calibration: MOVED_CAL, shots: onScreen });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const saved = analysis!.shots[0]!;
    expect(saved.source).toBe('auto');
    expect(saved.confidence).toBe(0.9);
    // Same image pixel as before the re-alignment: the hole did not move.
    const was = mmToPx(stored, AUTO_CAL);
    const now = mmToPx(saved, analysis!.calibration!);
    expect(now.x).toBeCloseTo(was.x, 6);
    expect(now.y).toBeCloseTo(was.y, 6);
    ctx.db.close();
  });

  it('still marks a shot manual when the user also dragged it', async () => {
    const stored = autoShot('auto-1', 12, -6);
    const { ctx, photoId } = await seed({ shots: [stored] });
    const [followed] = reprojectShots([stored], AUTO_CAL, MOVED_CAL);

    await saveAdjustments(ctx, photoId, {
      calibration: MOVED_CAL,
      shots: [{ ...followed!, xMm: followed!.xMm + 1.5 }],
    });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis!.shots[0]!.source).toBe('manual');
    ctx.db.close();
  });

  it('re-projects the stored shots even when Save is given no shots', async () => {
    const stored = autoShot('auto-1', 12, -6);
    const { ctx, photoId } = await seed({ shots: [stored] });

    await saveAdjustments(ctx, photoId, { calibration: MOVED_CAL });

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const was = mmToPx(stored, AUTO_CAL);
    const now = mmToPx(analysis!.shots[0]!, analysis!.calibration!);
    expect(now.x).toBeCloseTo(was.x, 6);
    expect(now.y).toBeCloseTo(was.y, 6);
    ctx.db.close();
  });
});

describe('reanalyze (REV-46)', () => {
  it('detects against the alignment on screen, not the one stored before', async () => {
    const { ctx, photoId } = await seed({ shots: [autoShot('auto-1', 1, 1)] });
    const { api, calls } = stubDetect([autoShot('d-1', 20, 20)]);

    await reanalyze(ctx, photoId, { calibration: MOVED_CAL, shots: reprojectShots([autoShot('auto-1', 1, 1)], AUTO_CAL, MOVED_CAL) }, api);

    expect(calls[0]?.calibration).toMatchObject({ cx: MOVED_CAL.cx, cy: MOVED_CAL.cy, radiusPx: MOVED_CAL.radiusPx });
    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.calibration?.source).toBe('manual');
    // The follow-only auto shot was replaced by the fresh detection, not kept alongside it.
    expect(analysis?.shots.map((s) => s.id)).toEqual(['d-1']);
    expect(analysis?.pipeline.stageB).toBe('pending');
    ctx.db.close();
  });

  it("keeps the user's shot and drops a detection of the same hole", async () => {
    const mine = manualShot('m-1', 10, 10);
    const { ctx, photoId } = await seed({ shots: [mine] });
    const nearlySame = 0.5 * SAME_HOLE_DIAMETERS * 5.6;
    const { api } = stubDetect([autoShot('d-1', 10 + nearlySame, 10), autoShot('d-2', -30, 5)]);

    await reanalyze(ctx, photoId, { shots: [mine] }, api);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots.map((s) => [s.id, s.source])).toEqual([
      ['m-1', 'manual'],
      ['d-2', 'auto'],
    ]);
    ctx.db.close();
  });

  it('keeps a genuinely overlapping second hole next to a manual shot', async () => {
    const mine = manualShot('m-1', 10, 10);
    const { ctx, photoId } = await seed({ shots: [mine] });
    // Just outside the same-hole tolerance: holes that overlap, but two shots.
    const apart = SAME_HOLE_DIAMETERS * 5.6 + 0.2;
    const { api } = stubDetect([autoShot('d-1', 10 + apart, 10)]);

    await reanalyze(ctx, photoId, { shots: [mine] }, api);

    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(analysis?.shots.map((s) => s.id)).toEqual(['m-1', 'd-1']);
    ctx.db.close();
  });
});

describe('buildGroundTruth (M13 step 7)', () => {
  it('exports the calibration, the shots and the working image size, and nothing else', async () => {
    const shots = [manualShot('m-1', 1.4, -0.8)];
    const { ctx, photoId } = await seed({ shots });
    const photo = await getPhotoRecord(ctx.db, photoId);
    const analysis = await getAnalysisRecord(ctx.db, photoId);

    const payload = buildGroundTruth(photo!, analysis!);

    expect(Object.keys(payload).sort()).toEqual(['calibration', 'imageSize', 'shots']);
    expect(payload.calibration).toEqual(AUTO_CAL);
    expect(payload.shots).toEqual(shots);
    expect(payload.imageSize).toEqual({ widthPx: 1200, heightPx: 1600 });
    ctx.db.close();
  });
});

describe('adjustStartCalibration', () => {
  it('uses the stored calibration when there is one', async () => {
    const { ctx, photoId } = await seed();
    const photo = await getPhotoRecord(ctx.db, photoId);
    const analysis = await getAnalysisRecord(ctx.db, photoId);
    expect(adjustStartCalibration(photo!, analysis!)).toEqual(AUTO_CAL);
    ctx.db.close();
  });

  it('falls back to the capture prior scaled into working px', async () => {
    const { ctx, photoId } = await seed({ calibration: null });
    const photo = await getPhotoRecord(ctx.db, photoId);
    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const start = adjustStartCalibration(photo!, analysis!);
    expect([start.cx, start.cy, start.radiusPx]).toEqual([600, 800, 280]);
    ctx.db.close();
  });

  it('falls back to a centred disc of the template anchor size when there is no prior either', async () => {
    const { ctx, photoId } = await seed({ calibration: null });
    const photo = await getPhotoRecord(ctx.db, photoId);
    const analysis = await getAnalysisRecord(ctx.db, photoId);
    const start = adjustStartCalibration({ ...photo!, capture: null }, analysis!);
    expect(start).toEqual({
      cx: 600,
      cy: 800,
      radiusPx: 420,
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: 112.4,
      source: 'manual',
      confidence: null,
      perspective: null,
    });
    ctx.db.close();
  });
});

describe('unplacedRounds (M17 step 1, REV-29)', () => {
  const precision10: Categorization = {
    template: 'precision',
    position: 'prone',
    roundsProne: 10,
    roundsStanding: null,
  };

  it('parks one marker per declared round with no hole: 10 declared, 8 identified -> 2', () => {
    const shots = Array.from({ length: 8 }, (_, i) => autoShot(`a${i}`, i, 0));
    expect(unplacedRounds(precision10, shots)).toBe(2);
  });

  it('counts units, not holes: a x3 hole accounts for three rounds', () => {
    const shots = [{ ...autoShot('a0', 0, 0), multiplicity: 3 }, autoShot('a1', 5, 0)];
    expect(unplacedRounds(precision10, shots)).toBe(6);
  });

  it('is 0 once every round is placed, which is what hides the tray', () => {
    const shots = Array.from({ length: 10 }, (_, i) => autoShot(`a${i}`, i, 0));
    expect(unplacedRounds(precision10, shots)).toBe(0);
  });

  it('never goes negative when there are more units than declared rounds', () => {
    const shots = Array.from({ length: 12 }, (_, i) => autoShot(`a${i}`, i, 0));
    expect(unplacedRounds(precision10, shots)).toBe(0);
  });

  it('sums both positions for a `both` target', () => {
    const both: Categorization = {
      template: 'precision',
      position: 'both',
      roundsProne: 5,
      roundsStanding: 5,
    };
    expect(unplacedRounds(both, [autoShot('a0', 0, 0)])).toBe(9);
  });

  it('parks nothing while the categorization is still incomplete', () => {
    const incomplete: Categorization = {
      template: 'precision',
      position: null,
      roundsProne: null,
      roundsStanding: null,
    };
    expect(unplacedRounds(incomplete, [])).toBe(0);
  });
});
