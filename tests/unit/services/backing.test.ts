// backing-sheet.md §2, §3, §4 (REV-38, REV-48). The Settings backing and hole size (changing either
// re-runs nothing), measuring a card (whose photo is not kept), and the exclusions an old card photo
// still carries until the migration removes it.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { BackingSheet } from '@/lib/domain/backing';
import { planJobs } from '@/lib/pipeline/plan';
import { measureBackingCard } from '@/lib/services/backing-card';
import { ingestPhoto } from '@/lib/services/ingest';
import { requestAnalysis } from '@/lib/services/photos';
import { createSession, deleteSession } from '@/lib/services/sessions';
import {
  InvalidHoleDiameterError,
  clearBacking,
  resetHoleDiameterMm,
  setBacking,
  setBackingMode,
  setHoleDiameterMm,
} from '@/lib/services/settings';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord, listPhotoRecords, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';
import type { RgbaImage } from '@/lib/media/format';

import { openTestDb } from '../../helpers/db';
import { completeCategorization, emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { makeAnalysis, makePhoto, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';

const ORANGE: BackingSheet['colour'] = {
  hueDeg: 15.9,
  hueSpreadDeg: 2.4,
  satP10: 0.73,
  valP10: 0.85,
  samples: 70610,
};

function colouredBacking(cardPhotoId: string | null = null): BackingSheet {
  return { kind: 'coloured', source: 'card', cardPhotoId, colour: ORANGE };
}

/** A flat coloured RgbaImage, so `backingColourFromCard` measures a real hue without decoding a JPEG. */
function flatRgba(r: number, g: number, b: number, size = 32): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width: size, height: size };
}

function autoShot(id: string): Shot {
  return {
    id,
    xMm: 1,
    yMm: 2,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto',
    confidence: 0.9,
    cluster: false,
    possibleOverlap: false,
  };
}

describe('Settings backing (REV-48, backing-sheet.md §2)', () => {
  it('a new session carries no backing of its own', async () => {
    const db = await openTestDb();
    const session = await createSession(makeTestContext(db));
    expect(session.schemaVersion).toBe(3);
    expect(session).not.toHaveProperty('backingMode');
    expect(session).not.toHaveProperty('backing');
    db.close();
  });

  it('changing the setting marks nothing pending, not even auto-only photos', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    await putSessionRecord(db, session);
    const photo = makePhoto({ sessionId: session.id, categorization: completeCategorization() });
    await putPhotoRecord(db, photo);
    const analysis = { ...makeAnalysis(photo.id, { stageA: 'done', stageB: 'done' }), shots: [autoShot('auto-1')] };
    await putAnalysisRecord(db, analysis);

    await setBackingMode(ctx, 'coloured');
    await setBacking(ctx, colouredBacking());
    await clearBacking(ctx);
    await setHoleDiameterMm(ctx, 7);
    await resetHoleDiameterMm(ctx);

    expect(await getAnalysisRecord(db, photo.id)).toEqual(analysis);
    expect((await getPhotoRecord(db, photo.id))?.status).toBe(photo.status);
    const jobs = planJobs([(await getSessionRecord(db, session.id))!], [photo], [analysis]);
    expect(jobs).toEqual([]);
    db.close();
  });

  it('stores the mode and backing, never with a card photo id; Clear keeps the mode', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setBackingMode(ctx, 'coloured');
    await setBacking(ctx, colouredBacking('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    let settings = await getSettings(db);
    expect(settings.backingMode).toBe('coloured');
    expect(settings.backing).toEqual(colouredBacking(null));

    await clearBacking(ctx);
    settings = await getSettings(db);
    expect(settings.backingMode).toBe('coloured');
    expect(settings.backing).toBeNull();
    db.close();
  });
});

describe('Hole size (data-model §5)', () => {
  it('stores 2-12 mm and resets to 5.6', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setHoleDiameterMm(ctx, 7.62);
    expect((await getSettings(db)).profileOverrides.holeDiameterMm).toBe(7.62);
    await resetHoleDiameterMm(ctx);
    expect((await getSettings(db)).profileOverrides.holeDiameterMm).toBe(5.6);
    db.close();
  });

  it('rejects a size outside 2-12 mm and stores nothing', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await expect(setHoleDiameterMm(ctx, 1.5)).rejects.toBeInstanceOf(InvalidHoleDiameterError);
    await expect(setHoleDiameterMm(ctx, 12.5)).rejects.toBeInstanceOf(InvalidHoleDiameterError);
    expect(await db.get('settings', 'app')).toBeUndefined();
    db.close();
  });
});

describe('measureBackingCard (backing-sheet.md §4, REV-48)', () => {
  it('measures the card and stores its colour in settings, keeping no photo', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setBackingMode(ctx, 'auto');
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0xff, 0x6a, 0x1f); } });

    const result = await measureBackingCard(ctx, jpegBlob(), imageTools);

    expect(result.colour).not.toBeNull();
    const settings = await getSettings(db);
    expect(settings.backing).toEqual({ kind: 'coloured', source: 'card', cardPhotoId: null, colour: result.colour });
    expect(result.settings).toEqual(settings);
    // The mode is left as the user set it (Auto uses the card colour when there is one, §4a).
    expect(settings.backingMode).toBe('auto');
    expect(await listPhotoRecords(db)).toEqual([]);
    db.close();
  });

  it('stores nothing when the card shows no clear colour (§4.3)', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await setBacking(ctx, colouredBacking());
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0x9a, 0x9a, 0x9a); } });

    const result = await measureBackingCard(ctx, jpegBlob(), imageTools);

    expect(result).toEqual({ colour: null, settings: null });
    expect((await getSettings(db)).backing).toEqual(colouredBacking(null));
    expect(await listPhotoRecords(db)).toEqual([]);
    db.close();
  });
});

describe('a card photo is never a target (backing-sheet.md §3)', () => {
  async function seedWithCard() {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const imageTools = stubImageTools();
    const target = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: null,
        clientLocal: '2026-09-05T23:40:00',
        clientOffset: '+02:00',
        capture: null,
        categorization: completeCategorization(),
      },
      imageTools,
    );
    const cardPhoto = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'backing-card',
        originalFilename: null,
        clientLocal: '2026-09-05T23:40:00',
        clientOffset: '+02:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      imageTools,
    );
    return { db, ctx, session, target, cardPhoto };
  }

  it('stays out of session.photoIds, so every count and screen skips it', async () => {
    const { db, session, target, cardPhoto } = await seedWithCard();
    const stored = await getSessionRecord(db, session.id);
    expect(stored?.photoIds).toEqual([target.id]);
    expect((await listPhotosBySession(db, session.id)).map((p) => p.id).sort()).toEqual([target.id, cardPhoto.id].sort());
    db.close();
  });

  it('is never planned for Stage A or Stage B', async () => {
    const { db, session, target, cardPhoto } = await seedWithCard();
    const photos = await listPhotosBySession(db, session.id);
    const analyses = [
      (await getAnalysisRecord(db, target.id))!,
      (await getAnalysisRecord(db, cardPhoto.id))!,
    ];
    const jobs = planJobs([(await getSessionRecord(db, session.id))!], photos, analyses);
    expect(jobs).toEqual([{ kind: 'A', photoId: target.id }]);
    db.close();
  });

  it('is skipped by "Analyze N targets"', async () => {
    const { db, ctx, session, cardPhoto } = await seedWithCard();
    await requestAnalysis(ctx, session.id);
    // The card's lighting is never "confirmed", because it is not part of the analysis.
    expect((await getPhotoRecord(db, cardPhoto.id))?.lightingConfirmed).toBe(false);
    db.close();
  });

  it('is deleted with its session', async () => {
    const { db, ctx, session } = await seedWithCard();
    await deleteSession(ctx, session.id);
    expect(await listPhotoRecords(db)).toEqual([]);
    db.close();
  });
});
