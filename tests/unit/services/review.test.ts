// M21 Tests: the review ordering (step 4), Confirm's "did anything change", the review service, and
// that suggestions stay derived — never in `analysis.shots`, never stored (steps 1-2).

import { describe, expect, it, vi } from 'vitest';

import type { ShotCandidate } from '@/lib/cv/holes';
import { shotFromSuggestion } from '@/lib/cv/suggestions';
import { TargetAnalysis, type Shot } from '@/lib/domain/analysis';
import type { Calibration, TargetPhoto } from '@/lib/domain/photo';
import { saveAdjustments, type DetectShotsApi } from '@/lib/services/adjust';
import { loadDetectionAids } from '@/lib/services/detection-aids';
import { adjustSavePatch, hasAdjustEdits, loadReviewPhotos, reviewOrder } from '@/lib/services/review';
import { initialAnalysis } from '@/lib/domain/analysis';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { putBlob } from '@/lib/store/blobs-repo';
import { putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';

const CAL: Calibration = {
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

function at(id: string, utc: string | null, status: TargetPhoto['status'], importedAt = '2026-09-05T23:40:00.000Z') {
  return makePhoto({ id, status, importedAt, captureTime: { local: null, offset: null, utc, source: utc === null ? 'import-time' : 'exif' } });
}

function shot(id: string, xMm: number, yMm: number, source: Shot['source'] = 'auto'): Shot {
  return { id, xMm, yMm, multiplicity: 1, positionOverrides: null, source, confidence: source === 'auto' ? 0.9 : null, cluster: false, possibleOverlap: false };
}

describe('reviewOrder (M21 step 4)', () => {
  it('puts the one needs-attention photo first', () => {
    const photos = [
      at('a', '2026-09-05T10:00:00.000Z', 'analyzed'),
      at('b', '2026-09-05T10:05:00.000Z', 'analyzed'),
      at('c', '2026-09-05T10:10:00.000Z', 'needs-attention'),
    ];
    expect(reviewOrder(photos).map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('within a group follows the one target order: Sight in, Confirm, Precision prone, Precision standing (REV-90)', () => {
    const kind = (id: string, utc: string, template: 'sighting' | 'precision', position: 'prone' | 'standing', role?: 'sight-in' | 'confirm') => {
      const p = at(id, utc, 'analyzed');
      return { ...p, categorization: { ...p.categorization, template, position, ...(role ? { sightingRole: role } : {}) } };
    };
    const photos = [
      kind('stand', '2026-09-05T08:00:00.000Z', 'precision', 'standing'),
      kind('prone', '2026-09-05T09:00:00.000Z', 'precision', 'prone'),
      kind('confirm', '2026-09-05T10:00:00.000Z', 'sighting', 'prone', 'confirm'),
      kind('sight', '2026-09-05T11:00:00.000Z', 'sighting', 'prone', 'sight-in'),
    ];
    expect(reviewOrder(photos).map((p) => p.id)).toEqual(['sight', 'confirm', 'prone', 'stand']);
  });

  it('orders equal statuses by capture time, whatever the input order', () => {
    const photos = [
      at('late', '2026-09-05T12:00:00.000Z', 'analyzed'),
      at('early', '2026-09-05T09:00:00.000Z', 'analyzed'),
      at('mid', '2026-09-05T10:30:00.000Z', 'analyzed'),
    ];
    expect(reviewOrder(photos).map((p) => p.id)).toEqual(['early', 'mid', 'late']);
    expect(reviewOrder([...photos].reverse()).map((p) => p.id)).toEqual(['early', 'mid', 'late']);
  });

  it('sorts within the needs-attention group by capture time too', () => {
    const photos = [
      at('n2', '2026-09-05T11:00:00.000Z', 'needs-attention'),
      at('ok', '2026-09-05T08:00:00.000Z', 'analyzed'),
      at('n1', '2026-09-05T10:00:00.000Z', 'needs-attention'),
    ];
    expect(reviewOrder(photos).map((p) => p.id)).toEqual(['n1', 'n2', 'ok']);
  });

  it('puts a photo with no capture time last in its group, then orders by import time and id', () => {
    const photos = [
      at('none-b', null, 'analyzed', '2026-09-05T09:00:00.000Z'),
      at('none-a', null, 'analyzed', '2026-09-05T09:00:00.000Z'),
      at('none-first', null, 'analyzed', '2026-09-05T08:00:00.000Z'),
      at('timed', '2026-09-05T23:00:00.000Z', 'analyzed'),
    ];
    expect(reviewOrder(photos).map((p) => p.id)).toEqual(['timed', 'none-first', 'none-a', 'none-b']);
  });

  it('is pure: no clock, and the input array is left alone', () => {
    const spy = vi.spyOn(Date, 'now');
    const photos = [at('b', '2026-09-05T10:05:00.000Z', 'analyzed'), at('a', '2026-09-05T10:00:00.000Z', 'analyzed')];
    const copy = [...photos];
    reviewOrder(photos);
    expect(photos).toEqual(copy);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('hasAdjustEdits (M21 step 4: Confirm saves only when there are edits)', () => {
  const start = { calibration: CAL, shots: [shot('auto-1', 1, 2), shot('auto-2', -3, 4)] };

  it('is false for an untouched draft', () => {
    expect(hasAdjustEdits(start, { calibration: { ...CAL }, shots: start.shots.map((s) => ({ ...s })) })).toBe(false);
  });

  it('is true for a moved alignment, an added, deleted, moved or re-counted shot', () => {
    expect(hasAdjustEdits(start, { calibration: { ...CAL, cx: 621 }, shots: start.shots })).toBe(true);
    expect(hasAdjustEdits(start, { calibration: CAL, shots: [...start.shots, shot('m', 9, 9, 'manual')] })).toBe(true);
    expect(hasAdjustEdits(start, { calibration: CAL, shots: start.shots.slice(1) })).toBe(true);
    expect(hasAdjustEdits(start, { calibration: CAL, shots: [{ ...start.shots[0]!, xMm: 1.5 }, start.shots[1]!] })).toBe(true);
    expect(hasAdjustEdits(start, { calibration: CAL, shots: [{ ...start.shots[0]!, multiplicity: 2 }, start.shots[1]!] })).toBe(true);
  });
});

const OK = crypto.randomUUID();
const BAD = crypto.randomUUID();

async function seedSession() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = makeSession();
  const ok = at(OK, '2026-09-05T10:00:00.000Z', 'analyzed');
  const bad = at(BAD, '2026-09-05T10:30:00.000Z', 'needs-attention');
  const card = makePhoto({ origin: 'backing-card' as TargetPhoto['origin'], status: 'analyzed' });
  for (const p of [ok, bad, card]) await putPhotoRecord(db, { ...p, sessionId: session.id });
  await putSessionRecord(db, { ...session, photoIds: [ok.id, bad.id] });
  for (const p of [ok, bad]) {
    await putAnalysisRecord(db, makeAnalysis(p.id, { stageA: 'done', stageB: 'done' }, { calibration: CAL, shots: [shot('auto-1', 1, 2)] }));
    await putBlob(db, photoWorkingKey(p.id), {
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
      contentType: 'image/jpeg',
      sizeBytes: 4,
      createdAt: '2026-09-05T23:40:00.000Z',
    });
  }
  return { ctx, sessionId: session.id };
}

describe('loadReviewPhotos (M21 step 4)', () => {
  it("returns the session's target photos in review order, without a backing card", async () => {
    const { ctx, sessionId } = await seedSession();
    const photos = await loadReviewPhotos(ctx, sessionId);
    expect(photos?.map((p) => p.id)).toEqual([BAD, OK]);
  });

  it('is null for a session that does not exist', async () => {
    const { ctx } = await seedSession();
    expect(await loadReviewPhotos(ctx, 'missing')).toBeNull();
  });
});

describe('suggestions stay derived (M21 steps 1-2, Pitfalls)', () => {
  const suggestion: ShotCandidate = {
    xMm: 30,
    yMm: -10,
    radialMm: Math.hypot(30, 10),
    surface: 'paper',
    score: 0.9,
    areaMm2: 25,
    elongation: 1.4,
    strokeRadiusMm: 1.1,
    coreContrast: 50,
    surround: 0.1,
    cluster: false,
    confidence: 0.9,
    multiplicity: 1,
  };

  function stub(): DetectShotsApi {
    return {
      async detectShots() {
        return {
          shots: [shot('auto-9', 50, 50)],
          detection: { method: 'standard' as const, backing: 'off' as const, fallbackReason: null },
          suggestions: [suggestion],
          holeWidths: [{ xMm: 1, yMm: 2, widthMm: 11 }],
        };
      },
    };
  }

  it('loadDetectionAids returns the suggestions and widths and writes nothing', async () => {
    const { ctx } = await seedSession();
    const before = await getAnalysisRecord(ctx.db, OK);
    const aids = await loadDetectionAids(ctx, OK, stub());
    expect(aids?.suggestions).toEqual([suggestion]);
    expect(aids?.holeWidths).toEqual([{ xMm: 1, yMm: 2, widthMm: 11 }]);
    expect(aids?.calibration).toEqual(CAL);
    // The detected shots it also returned are ignored: the stored record is byte-for-byte unchanged.
    expect(await getAnalysisRecord(ctx.db, OK)).toEqual(before);
  });

  it('loadDetectionAids is null with no stored alignment to measure against', async () => {
    const { ctx } = await seedSession();
    const analysis = (await getAnalysisRecord(ctx.db, OK))!;
    await putAnalysisRecord(ctx.db, { ...analysis, calibration: null });
    expect(await loadDetectionAids(ctx, OK, stub())).toBeNull();
  });

  it('never reach analysis.shots until tapped; a tapped one is stored as one manual shot, and nothing else', async () => {
    const { ctx } = await seedSession();
    const stored = (await getAnalysisRecord(ctx.db, OK))!;
    // Saving without tapping: the suggestion is nowhere in the record.
    await saveAdjustments(ctx, OK, { shots: stored.shots });
    const untouched = (await getAnalysisRecord(ctx.db, OK))!;
    expect(untouched.shots).toEqual(stored.shots);
    expect(JSON.stringify(untouched)).not.toContain('suggestion');

    // Tapping it: one manual shot of multiplicity 1 at its position.
    const tapped = shotFromSuggestion(suggestion, 'tapped-1');
    await saveAdjustments(ctx, OK, { shots: [...stored.shots, tapped] });
    const saved = (await getAnalysisRecord(ctx.db, OK))!;
    expect(saved.shots).toHaveLength(2);
    expect(saved.shots[1]).toMatchObject({ id: 'tapped-1', xMm: 30, yMm: -10, multiplicity: 1, source: 'manual' });
    expect(saved.shots[0]).toEqual(stored.shots[0]);
  });

  it('a stored analysis round-trips through its schema without any suggestion field', async () => {
    const { ctx } = await seedSession();
    const stored = (await getAnalysisRecord(ctx.db, OK))!;
    expect(TargetAnalysis.parse(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(Object.keys(stored)).not.toContain('suggestions');
    expect(Object.keys(stored.pipeline)).not.toContain('suggestions');
  });
});

describe('adjustSavePatch: Save confirms what is on screen (owner report 2026-09-19)', () => {
  const guess: Calibration = {
    cx: 600, cy: 800, radiusPx: 250, axisRatio: 1, angleDeg: 0, anchorDiameterMm: 112.4,
    source: 'overlay', confidence: null, perspective: null,
  };
  const shots: Shot[] = [];

  function analysisWith(method: 'overlay' | 'cv' | 'manual') {
    const base = initialAnalysis('p1', '2026-09-19T00:00:00.000Z');
    return { calibration: guess, pipeline: { ...base.pipeline, alignment: { method, confidence: null } } };
  }

  it('sends the unmoved alignment when the stored one was only an overlay guess (rule 9)', () => {
    expect(adjustSavePatch(analysisWith('overlay'), { ...guess }, shots).calibration).toBeDefined();
  });

  it('does not send an unmoved alignment that was measured', () => {
    expect(adjustSavePatch(analysisWith('cv'), { ...guess }, shots).calibration).toBeUndefined();
  });

  it('sends a moved alignment, and one where none was stored', () => {
    expect(adjustSavePatch(analysisWith('cv'), { ...guess, cx: 610 }, shots).calibration).toBeDefined();
    expect(adjustSavePatch({ ...analysisWith('cv'), calibration: null }, guess, shots).calibration).toBeDefined();
  });

  it('once saved, the alignment is manual, so rule 9 no longer holds the photo at needs-attention', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    const photo = makePhoto({ sessionId: session.id, status: 'needs-attention' });
    await putSessionRecord(db, { ...session, photoIds: [photo.id] });
    await putPhotoRecord(db, photo);
    await putAnalysisRecord(
      db,
      makeAnalysis(photo.id, { stageA: 'done', stageB: 'done', alignment: { method: 'overlay', confidence: null } }, {
        calibration: guess,
        shots: [shot('auto-1', 1, 2)],
      }),
    );
    const before = (await getAnalysisRecord(db, photo.id))!;

    // The owner fixes a shot but never touches the rings, then saves.
    const edited = [{ ...before.shots[0]!, xMm: 1.5 }];
    await saveAdjustments(ctx, photo.id, adjustSavePatch(before, before.calibration!, edited));

    const saved = (await getAnalysisRecord(db, photo.id))!;
    expect(saved.pipeline.alignment.method).toBe('manual');
    expect(saved.calibration?.source).toBe('manual');
    db.close();
  });
});
