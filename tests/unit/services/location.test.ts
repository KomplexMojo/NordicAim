// REV-158: no stored photo keeps where it was taken — not on import, and not for photos stored before.

import { describe, expect, it } from 'vitest';

import { readExif } from '@/lib/media/exif';
import { ingestPhoto } from '@/lib/services/ingest';
import { countPhotosWithLocation, removeLocation, removeStoredLocations } from '@/lib/services/location';
import { createSession } from '@/lib/services/sessions';
import { photoOriginalKey } from '@/lib/store/blob-keys';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { heicWithGps, jpegWithGps } from '../../helpers/exif-files';
import { completeCategorization, makeTestContext } from '../../helpers/fixtures';
import { makePhoto, makeSession } from '../../helpers/records';
import { stubImageTools } from '../../helpers/stub-image-tools';

const storedExif = async (db: Awaited<ReturnType<typeof openTestDb>>, photoId: string) =>
  readExif(new Uint8Array(await (await getBlob(db, photoOriginalKey(photoId)))!.arrayBuffer()));

describe('import', () => {
  it('keeps the file without its location, the record without coordinates, and the capture time from the photo', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const bytes = jpegWithGps();
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' }),
        origin: 'import',
        originalFilename: 'IMG_0001.JPG',
        clientLocal: '2026-10-03T09:00:00',
        clientOffset: '+02:00',
        capture: null,
        categorization: completeCategorization(),
      },
      stubImageTools(),
    );
    expect(photo).toMatchObject({ locationRemoved: true, exif: { gps: null, gpsImgDirection: null, gpsPresent: true } });
    expect(photo.captureTime).toMatchObject({ source: 'exif', local: '2026-09-26T13:20:05' });
    expect((await storedExif(db, photo.id))?.gpsPresent).toBe(false);
    expect(await countPhotosWithLocation(ctx)).toBe(0);
    db.close();
  });
});

describe('photos stored before', () => {
  it('each has its location taken out once; a pipeline change to the record in between is kept', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = makeSession();
    await putSessionRecord(db, session);
    const jpeg = makePhoto({ sessionId: session.id, originalFormat: 'jpeg', status: 'analyzed' });
    const heic = makePhoto({ sessionId: session.id, originalFormat: 'heic' });
    for (const [p, bytes, type] of [[jpeg, jpegWithGps(), 'image/jpeg'], [heic, heicWithGps(), 'image/heic']] as const) {
      await putPhotoRecord(db, { ...p, exif: { ...(await readExif(bytes))! } });
      await putBlob(db, photoOriginalKey(p.id), { bytes: bytes.slice().buffer as ArrayBuffer, contentType: type, sizeBytes: bytes.byteLength, createdAt: '2026-09-26T11:00:00.000Z' });
    }
    expect(await countPhotosWithLocation(ctx)).toBe(2);

    expect(await removeStoredLocations(ctx)).toEqual({ removed: 2, failed: 0 });
    for (const p of [jpeg, heic]) {
      expect((await storedExif(db, p.id))?.gpsPresent).toBe(false);
      const record = (await getPhotoRecord(db, p.id))!;
      expect(record).toMatchObject({ locationRemoved: true, exif: { gps: null } });
    }
    expect((await getPhotoRecord(db, jpeg.id))!.status).toBe('analyzed');
    expect(await countPhotosWithLocation(ctx)).toBe(0);
    expect(await removeStoredLocations(ctx)).toEqual({ removed: 0, failed: 0 });
    db.close();
  });
});

describe('removeLocation', () => {
  it('a file it cannot parse is kept only when no location can be read from it', async () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 99]);
    expect(new Uint8Array(await removeLocation(plain, 'jpeg'))).toEqual(plain);
  });
});
