import { describe, expect, it } from 'vitest';

import { createSession, deleteSession, getSession, listSessions, updateSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';
import { photoOriginalKey, photoThumbKey, photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

describe('createSession', () => {
  it('creates a session with sensible defaults', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    expect(session.name).toBe('Session 2026-09-05');
    expect(session.sessionDate).toBe('2026-09-05');
    expect(session.photoIds).toEqual([]);
    expect(session.analyzeRequestedAt).toBeNull();
    expect(session.artifacts).toEqual([]);
    expect(session.shares).toEqual([]);
    expect(session.notes).toBe('');
    db.close();
  });

  it('honors explicit name/sessionDate/notes', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { name: 'Range day', sessionDate: '2026-01-01', notes: 'cold' });
    expect(session.name).toBe('Range day');
    expect(session.sessionDate).toBe('2026-01-01');
    expect(session.notes).toBe('cold');
    db.close();
  });
});

describe('getSession / listSessions', () => {
  it('lists sessions ordered by updatedAt descending', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-05T00:00:00.000Z' });
    const s1 = await createSession(ctx, { name: 'first' });
    const ctx2 = makeTestContext(db, { nowIso: '2026-09-07T00:00:00.000Z' });
    const s2 = await createSession(ctx2, { name: 'second' });

    const list = await listSessions(ctx);
    expect(list.map((s) => s.id)).toEqual([s2.id, s1.id]);
    expect(await getSession(ctx, s1.id)).toEqual(s1);
    db.close();
  });
});

describe('updateSession', () => {
  it('updates fields and bumps updatedAt', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-05T00:00:00.000Z' });
    const session = await createSession(ctx);
    const ctx2 = makeTestContext(db, { nowIso: '2026-09-06T00:00:00.000Z' });
    const updated = await updateSession(ctx2, session.id, { name: 'Renamed', notes: 'x' });
    expect(updated.name).toBe('Renamed');
    expect(updated.notes).toBe('x');
    expect(updated.updatedAt).toBe('2026-09-06T00:00:00.000Z');
    expect(updated.sessionDate).toBe(session.sessionDate);
    db.close();
  });
});

describe('deleteSession', () => {
  it('cascades to photos, analyses, and every photo:<pid>:* blob, leaving 0 keys by prefix', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx);
    const photo = await ingestPhoto(
      ctx,
      {
        sessionId: session.id,
        blob: jpegBlob(),
        origin: 'import',
        originalFilename: 'a.jpg',
        clientLocal: '2026-09-05T12:00:00',
        clientOffset: '-07:00',
        capture: null,
        categorization: emptyCategorization(),
      },
      stubImageTools(),
    );

    expect(await getBlob(db, photoOriginalKey(photo.id))).not.toBeNull();

    await deleteSession(ctx, session.id);

    expect(await getSession(ctx, session.id)).toBeNull();
    expect(await getPhotoRecord(db, photo.id)).toBeNull();
    expect(await getAnalysisRecord(db, photo.id)).toBeNull();
    expect(await getBlob(db, photoOriginalKey(photo.id))).toBeNull();
    expect(await getBlob(db, photoWorkingKey(photo.id))).toBeNull();
    expect(await getBlob(db, photoThumbKey(photo.id))).toBeNull();

    const remaining = await db.getAllKeys('blobs');
    expect(remaining.filter((k) => String(k).startsWith(`photo:${photo.id}:`))).toHaveLength(0);
    db.close();
  });
});
