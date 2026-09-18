// backing-sheet.md §2, §3, §4, §5 (REV-38). The session's backing: inheriting the last choice,
// changing it (which re-queues detection), the card photo, and the exclusions a card photo carries.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { BackingSheet } from '@/lib/domain/backing';
import { planJobs } from '@/lib/pipeline/plan';
import { addBackingCard } from '@/lib/services/backing-card';
import { ingestPhoto } from '@/lib/services/ingest';
import { deletePhoto, requestAnalysis } from '@/lib/services/photos';
import { createSession, deleteSession, setSessionBacking } from '@/lib/services/sessions';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord, listPhotoRecords, listPhotosBySession, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';
import { defaultAppSettings } from '@/lib/domain/settings';
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

describe('createSession inherits the last backing (backing-sheet.md §2)', () => {
  it('copies AppSettings.lastBackingMode and lastBacking onto a new session', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await putSettings(db, {
      ...defaultAppSettings(),
      lastBackingMode: 'coloured',
      lastBacking: colouredBacking(null),
    });

    const session = await createSession(ctx);
    expect(session.backingMode).toBe('coloured');
    expect(session.backing).toEqual(colouredBacking(null));
    db.close();
  });

  it('defaults to Auto with no backing when nothing was chosen before', async () => {
    const db = await openTestDb();
    const session = await createSession(makeTestContext(db));
    expect(session.backingMode).toBe('auto');
    expect(session.backing).toBeNull();
    db.close();
  });
});

describe('setSessionBacking (backing-sheet.md §2, §5)', () => {
  it('re-queues Stage A for auto-only photos and leaves a photo with a manual shot alone', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    await putSessionRecord(db, session);

    const autoPhoto = makePhoto({ sessionId: session.id, categorization: completeCategorization() });
    const manualPhoto = makePhoto({ sessionId: session.id, categorization: completeCategorization() });
    await putPhotoRecord(db, autoPhoto);
    await putPhotoRecord(db, manualPhoto);
    await putAnalysisRecord(db, {
      ...makeAnalysis(autoPhoto.id, { stageA: 'done', stageB: 'done' }),
      shots: [autoShot('auto-1')],
    });
    await putAnalysisRecord(db, {
      ...makeAnalysis(manualPhoto.id, { stageA: 'done', stageB: 'done' }),
      shots: [{ ...autoShot('manual-1'), source: 'manual', confidence: null }],
    });

    await setSessionBacking(ctx, session.id, { backingMode: 'coloured', backing: colouredBacking() });

    const auto = await getAnalysisRecord(db, autoPhoto.id);
    expect(auto?.pipeline.stageA).toBe('pending');
    expect(auto?.pipeline.stageB).toBe('pending');
    const manual = await getAnalysisRecord(db, manualPhoto.id);
    expect(manual?.pipeline.stageA).toBe('done');
    expect(manual?.pipeline.stageB).toBe('done');
    db.close();
  });

  it('does not re-queue anything when the backing has not actually changed', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const backing = colouredBacking();
    const session = makeSession({ backingMode: 'coloured', backing });
    await putSessionRecord(db, session);
    const photo = makePhoto({ sessionId: session.id, categorization: completeCategorization() });
    await putPhotoRecord(db, photo);
    await putAnalysisRecord(db, { ...makeAnalysis(photo.id, { stageA: 'done', stageB: 'done' }), shots: [autoShot('auto-1')] });

    await setSessionBacking(ctx, session.id, { backingMode: 'coloured', backing: { ...backing } });

    expect((await getAnalysisRecord(db, photo.id))?.pipeline.stageA).toBe('done');
    db.close();
  });

  it('remembers the choice as the app default, never with a card photo id', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    await putSessionRecord(db, session);

    await setSessionBacking(ctx, session.id, {
      backingMode: 'coloured',
      backing: colouredBacking('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    });

    const settings = await getSettings(db);
    expect(settings.lastBackingMode).toBe('coloured');
    expect(settings.lastBacking?.cardPhotoId).toBeNull();
    expect(settings.lastBacking?.colour).toEqual(ORANGE);
    // ...while the session keeps its own card.
    expect((await getSessionRecord(db, session.id))?.backing?.cardPhotoId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    db.close();
  });
});

describe('addBackingCard (backing-sheet.md §4)', () => {
  it('measures the card, stores it as a backing-card photo and points the session at it', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0xff, 0x6a, 0x1f); } });

    const result = await addBackingCard(
      ctx,
      { sessionId: session.id, blob: jpegBlob(), originalFilename: 'card.jpg', clientLocal: '2026-09-05T23:40:00', clientOffset: '+02:00' },
      imageTools,
    );

    expect(result.photo).not.toBeNull();
    expect(result.photo!.origin).toBe('backing-card');
    expect(result.colour).not.toBeNull();
    const stored = await getSessionRecord(db, session.id);
    expect(stored?.backing).toEqual({
      kind: 'coloured',
      source: 'card',
      cardPhotoId: result.photo!.id,
      colour: result.colour,
    });
    // backing-sheet.md §3: a card photo is not one of the session's targets.
    expect(stored?.photoIds).toEqual([]);
    db.close();
  });

  it('stores nothing when the card shows no clear colour (§4.3)', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0x9a, 0x9a, 0x9a); } });

    const result = await addBackingCard(
      ctx,
      { sessionId: session.id, blob: jpegBlob(), originalFilename: null, clientLocal: '2026-09-05T23:40:00', clientOffset: '+02:00' },
      imageTools,
    );

    expect(result).toEqual({ photo: null, colour: null });
    expect(await listPhotoRecords(db)).toEqual([]);
    expect((await getSessionRecord(db, session.id))?.backing).toBeNull();
    db.close();
  });

  it('replacing a card removes the previous card photo', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0xff, 0x6a, 0x1f); } });
    const input = {
      sessionId: session.id,
      blob: jpegBlob(),
      originalFilename: null,
      clientLocal: '2026-09-05T23:40:00',
      clientOffset: '+02:00',
    };

    const first = await addBackingCard(ctx, input, imageTools);
    const second = await addBackingCard(ctx, input, imageTools);

    expect(await getPhotoRecord(db, first.photo!.id)).toBeNull();
    expect(await getPhotoRecord(db, second.photo!.id)).not.toBeNull();
    expect((await getSessionRecord(db, session.id))?.backing?.cardPhotoId).toBe(second.photo!.id);
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

  it('deleting the card photo clears the session pointer to it', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const imageTools = stubImageTools({ async toRgba() { return flatRgba(0xff, 0x6a, 0x1f); } });
    const { photo } = await addBackingCard(
      ctx,
      { sessionId: session.id, blob: jpegBlob(), originalFilename: null, clientLocal: '2026-09-05T23:40:00', clientOffset: '+02:00' },
      imageTools,
    );

    await deletePhoto(ctx, photo!.id);

    const stored = await getSessionRecord(db, session.id);
    expect(stored?.backing?.cardPhotoId).toBeNull();
    expect(stored?.backing?.colour).not.toBeNull();
    db.close();
  });
});
