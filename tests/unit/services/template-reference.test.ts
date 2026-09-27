import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { Calibration } from '@/lib/domain/photo';
import { defaultAppSettings } from '@/lib/domain/settings';
import {
  prepareTemplateReference,
  restoreDefaultReference,
  saveTemplateReference,
  UnsupportedReferenceImageError,
  type PreparedReference,
  type ReferenceTools,
} from '@/lib/services/template-reference';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { referenceImageKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';

// template-reference.md §3, §4, §7 (M26, REV-121).

const CAL: Calibration = { cx: 758, cy: 762, radiusPx: 646, axisRatio: 0.993, angleDeg: 8.6, anchorDiameterMm: 115, source: 'auto', confidence: 0.97, perspective: null };
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]).buffer;

function tools(result: Awaited<ReturnType<ReferenceTools['cv']['makeReference']>>): ReferenceTools & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    imageTools: {
      makeWorkingImages: async () => ({
        working: new Blob([JPEG_MAGIC], { type: 'image/jpeg' }),
        thumb: new Blob([]),
        originalSize: { widthPx: 4284, heightPx: 5712 },
        workingSize: { widthPx: 2250, heightPx: 3000, scaleFromOriginal: 0.525 },
      }),
    },
    cv: {
      makeReference: async (...args: unknown[]) => {
        calls.push(args);
        return result;
      },
    } as ReferenceTools['cv'],
  };
}

const shot = (source: Shot['source']): Shot => ({
  id: crypto.randomUUID(), xMm: 1, yMm: 1, multiplicity: 1, positionOverrides: null, source, confidence: null, cluster: false, possibleOverlap: false,
});

async function seed() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  await putSettings(db, defaultAppSettings());
  const session = makeSession();
  const sighting = { template: 'sighting' as const, position: 'prone' as const, roundsProne: 10, roundsStanding: null };
  const plain = makePhoto({ sessionId: session.id, categorization: sighting, status: 'analyzed' });
  const manualShot = makePhoto({ sessionId: session.id, categorization: sighting, status: 'analyzed' });
  const manualCal = makePhoto({ sessionId: session.id, categorization: sighting, status: 'analyzed' });
  const running = makePhoto({ sessionId: session.id, categorization: sighting, status: 'processing' });
  const precision = makePhoto({ sessionId: session.id, status: 'analyzed' });
  const photos = [plain, manualShot, manualCal, running, precision];
  await putSessionRecord(db, { ...session, photoIds: photos.map((p) => p.id) });
  for (const p of photos) await putPhotoRecord(db, p);
  const done = { stageA: 'done' as const, stageB: 'done' as const };
  await putAnalysisRecord(db, makeAnalysis(plain.id, done, { calibration: CAL, shots: [shot('auto')] }));
  await putAnalysisRecord(db, makeAnalysis(manualShot.id, done, { calibration: CAL, shots: [shot('auto'), shot('manual')] }));
  await putAnalysisRecord(db, makeAnalysis(manualCal.id, done, { calibration: { ...CAL, source: 'manual' }, shots: [shot('auto')] }));
  await putAnalysisRecord(db, makeAnalysis(running.id, { stageA: 'running', stageB: 'pending' }, { calibration: null, shots: [] }));
  await putAnalysisRecord(db, makeAnalysis(precision.id, done, { calibration: CAL, shots: [shot('auto')] }));
  return { db, ctx, plain, manualShot, manualCal, running, precision };
}

const PREPARED: PreparedReference = {
  template: 'sighting', bytes: JPEG_BYTES, sha256: 'b'.repeat(64), widthPx: 1516, heightPx: 1516, calibration: CAL, holesFound: 0,
};

describe('prepareTemplateReference (§3)', () => {
  it('makes the working image, asks the worker for the row\'s template, and hashes the result', async () => {
    const t = tools({ status: 'ok', jpeg: JPEG_BYTES, widthPx: 1516, heightPx: 1516, calibration: CAL, holesFound: 2 });
    const result = await prepareTemplateReference(new Blob([JPEG_MAGIC]), 'sighting', 3.3, t);
    expect(t.calls[0]?.slice(1)).toEqual(['sighting', 3.3]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.prepared).toMatchObject({ template: 'sighting', widthPx: 1516, heightPx: 1516, calibration: CAL, holesFound: 2 });
    expect(result.prepared.sha256).toBe(createHash('sha256').update(new Uint8Array(JPEG_BYTES)).digest('hex'));
  });

  it('passes a refusal straight back', async () => {
    const t = tools({ status: 'refused', reason: 'wrong-template' });
    expect(await prepareTemplateReference(new Blob([JPEG_MAGIC]), 'precision', 5.6, t)).toEqual({ status: 'refused', reason: 'wrong-template' });
  });

  it('rejects a file that is not an image', async () => {
    const t = tools({ status: 'refused', reason: 'no-disc' });
    await expect(prepareTemplateReference(new Blob([new Uint8Array([1, 2, 3, 4])]), 'sighting', 5.6, t)).rejects.toBeInstanceOf(UnsupportedReferenceImageError);
    expect(t.calls).toHaveLength(0);
  });
});

describe('saveTemplateReference and restoreDefaultReference (§4, §7)', () => {
  it('stores the image and the settings entry together', async () => {
    const { db, ctx } = await seed();
    const { settings } = await saveTemplateReference(ctx, PREPARED);
    expect(settings.templateReferences.sighting).toMatchObject({ template: 'sighting', sha256: 'b'.repeat(64), widthPx: 1516, calibration: CAL });
    expect(settings.templateReferences.precision).toBeNull();
    expect((await getSettings(db)).templateReferences.sighting?.capturedAt).toBe(ctx.now().toISOString());
    const blob = await getBlob(db, referenceImageKey('sighting'));
    expect(blob?.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array(JPEG_BYTES));
    db.close();
  });

  it('re-runs Stage A only on that template\'s finished photos with nothing manual', async () => {
    const { db, ctx, plain, manualShot, manualCal, running, precision } = await seed();
    const { rerun } = await saveTemplateReference(ctx, PREPARED);
    expect(rerun).toBe(1);
    const a = async (id: string) => (await getAnalysisRecord(db, id))!.pipeline;
    expect(await a(plain.id)).toMatchObject({ stageA: 'pending', stageB: 'pending' });
    expect(await a(manualShot.id)).toMatchObject({ stageA: 'done', stageB: 'done' });
    expect(await a(manualCal.id)).toMatchObject({ stageA: 'done', stageB: 'done' });
    expect(await a(running.id)).toMatchObject({ stageA: 'running' });
    expect(await a(precision.id)).toMatchObject({ stageA: 'done', stageB: 'done' });
    db.close();
  });

  it('never touches shots or calibration when it re-runs', async () => {
    const { db, ctx, plain } = await seed();
    const before = await getAnalysisRecord(db, plain.id);
    await saveTemplateReference(ctx, PREPARED);
    const after = await getAnalysisRecord(db, plain.id);
    expect(after?.shots).toEqual(before?.shots);
    expect(after?.calibration).toEqual(before?.calibration);
    db.close();
  });

  it('Restore default deletes the image and the entry, and re-runs the same photos', async () => {
    const { db, ctx } = await seed();
    await saveTemplateReference(ctx, PREPARED);
    const { settings, rerun } = await restoreDefaultReference(ctx, 'sighting');
    expect(settings.templateReferences.sighting).toBeNull();
    expect(await getBlob(db, referenceImageKey('sighting'))).toBeNull();
    // The one re-runnable photo is already pending from the save, so nothing more is re-run.
    expect(rerun).toBe(0);
    db.close();
  });
});
