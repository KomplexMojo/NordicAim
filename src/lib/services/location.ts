// REV-158: a photo never keeps where it was taken. On import the location is taken out of the file before it is stored
// (`ingestPhoto`); photos stored before that, or restored from an older backup, are done here, once each.

import type { ExifMeta, TargetPhoto } from '@/lib/domain/photo';
import { readExif } from '@/lib/media/exif';
import type { ImageFormat } from '@/lib/media/format';
import { LocationNotRemovedError, stripLocation } from '@/lib/media/strip-location';
import { photoOriginalKey } from '@/lib/store/blob-keys';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord, listPhotoRecords, putPhotoRecord } from '@/lib/store/photos-repo';

import type { ServiceContext } from './context';

/** The record's EXIF without the coordinates and compass heading (`gpsPresent` still says whether the photo had them). */
export function withoutLocation(exif: ExifMeta | null): ExifMeta | null {
  return exif === null ? null : { ...exif, gps: null, gpsImgDirection: null };
}

/**
 * The file with its location taken out, checked by reading it back. A file whose metadata cannot be changed safely is kept
 * as it is only when no location can be read from it at all; otherwise this throws `LocationNotRemovedError`.
 */
export async function removeLocation(bytes: Uint8Array, format: ImageFormat): Promise<ArrayBuffer> {
  let stripped: Uint8Array;
  try {
    stripped = stripLocation(bytes, format);
  } catch (err) {
    if (!(err instanceof LocationNotRemovedError) || (await readExif(bytes))?.gpsPresent === true) throw err;
    stripped = bytes.slice();
  }
  if ((await readExif(stripped))?.gpsPresent === true) throw new LocationNotRemovedError('it is still there after removing it');
  return stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength) as ArrayBuffer;
}

export interface LocationPass {
  /** Photos whose stored file had its location taken out by this pass. */
  removed: number;
  /** Photos whose file could not be changed safely; they keep their location and are tried again next time. */
  failed: number;
}

let running: Promise<LocationPass> | null = null;

/**
 * Takes the location out of every stored photo that still may hold one (`locationRemoved` not true). One photo at a time:
 * the file is read and changed before its transaction, and the record is read again inside it, so a pipeline update in
 * between is kept. Calls made while a pass is running share it.
 */
export function removeStoredLocations(ctx: ServiceContext): Promise<LocationPass> {
  running ??= pass(ctx).finally(() => {
    running = null;
  });
  return running;
}

async function pass(ctx: ServiceContext): Promise<LocationPass> {
  const result: LocationPass = { removed: 0, failed: 0 };
  const todo = (await listPhotoRecords(ctx.db)).filter((p) => p.locationRemoved !== true);
  for (const photo of todo) {
    const original = await getBlob(ctx.db, photoOriginalKey(photo.id));
    let kept: ArrayBuffer | null = null;
    if (original !== null) {
      try {
        kept = await removeLocation(new Uint8Array(await original.arrayBuffer()), photo.originalFormat);
      } catch (err) {
        if (!(err instanceof LocationNotRemovedError)) throw err;
        result.failed += 1;
        continue;
      }
    }
    const tx = ctx.db.transaction(['photos', 'blobs'], 'readwrite');
    const fresh: TargetPhoto | null = await getPhotoRecord(tx, photo.id);
    if (fresh !== null) {
      if (kept !== null && original !== null) {
        await putBlob(tx, photoOriginalKey(photo.id), { bytes: kept, contentType: original.type, sizeBytes: kept.byteLength, createdAt: ctx.now().toISOString() });
      }
      await putPhotoRecord(tx, { ...fresh, exif: withoutLocation(fresh.exif), locationRemoved: true });
    }
    await tx.done;
    if (kept !== null) result.removed += 1;
  }
  return result;
}

/** How many stored photos may still hold their location (the backup dialog says so when any do). */
export async function countPhotosWithLocation(ctx: ServiceContext): Promise<number> {
  return (await listPhotoRecords(ctx.db)).filter((p) => p.locationRemoved !== true).length;
}
