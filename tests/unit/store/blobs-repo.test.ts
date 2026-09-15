import { describe, expect, it } from 'vitest';

import { getBlob, putBlob, deleteBlob, deleteByPrefix } from '@/lib/store/blobs-repo';
import type { StoredBlob } from '@/lib/store/db';

import { openTestDb } from '../../helpers/db';

function stored(bytes: Uint8Array, contentType = 'image/jpeg'): StoredBlob {
  return { bytes: bytes.buffer as ArrayBuffer, contentType, sizeBytes: bytes.byteLength, createdAt: '2026-09-05T00:00:00.000Z' };
}

describe('blobs-repo', () => {
  it('round-trips blob bytes', async () => {
    const db = await openTestDb();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await putBlob(db, 'photo:p1:original', stored(bytes));
    const blob = await getBlob(db, 'photo:p1:original');
    expect(blob).not.toBeNull();
    const got = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(got)).toEqual([1, 2, 3, 4]);
    expect(blob!.type).toBe('image/jpeg');
    db.close();
  });

  it('returns null for a missing key', async () => {
    const db = await openTestDb();
    expect(await getBlob(db, 'photo:nope:original')).toBeNull();
    db.close();
  });

  it('deletes a single blob', async () => {
    const db = await openTestDb();
    await putBlob(db, 'photo:p1:original', stored(new Uint8Array([1])));
    await deleteBlob(db, 'photo:p1:original');
    expect(await getBlob(db, 'photo:p1:original')).toBeNull();
    db.close();
  });

  it('deleteByPrefix removes only matching keys, leaving 0 keys by prefix', async () => {
    const db = await openTestDb();
    await putBlob(db, 'photo:p1:original', stored(new Uint8Array([1])));
    await putBlob(db, 'photo:p1:working', stored(new Uint8Array([2])));
    await putBlob(db, 'photo:p1:thumb', stored(new Uint8Array([3])));
    await putBlob(db, 'photo:p2:original', stored(new Uint8Array([4])));

    await deleteByPrefix(db, 'photo:p1:');

    expect(await getBlob(db, 'photo:p1:original')).toBeNull();
    expect(await getBlob(db, 'photo:p1:working')).toBeNull();
    expect(await getBlob(db, 'photo:p1:thumb')).toBeNull();
    expect(await getBlob(db, 'photo:p2:original')).not.toBeNull();

    const remainingKeys = await db.getAllKeys('blobs');
    expect(remainingKeys.filter((k) => String(k).startsWith('photo:p1:'))).toHaveLength(0);
    db.close();
  });
});
