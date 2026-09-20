import { describe, expect, it } from 'vitest';

import {
  SessionNotFoundError,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  previewSessionDeletion,
  updateSession,
} from '@/lib/services/sessions';
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

describe('deleteSession (REV-61)', () => {
  const ingest = (ctx: ReturnType<typeof makeTestContext>, sessionId: string) =>
    ingestPhoto(
      ctx,
      {
        sessionId,
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

  it('previews the counts it then deletes, and leaves another session untouched', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const doomed = await createSession(ctx, { name: 'Doomed' });
    const kept = await createSession(ctx, { name: 'Kept' });
    const a = await ingest(ctx, doomed.id);
    const b = await ingest(ctx, doomed.id);
    const other = await ingest(ctx, kept.id);

    const preview = await previewSessionDeletion(ctx, doomed.id);
    expect(preview).toMatchObject({ name: 'Doomed', readable: true, photos: 2 });
    expect(await getSession(ctx, doomed.id)).not.toBeNull();

    const report = await deleteSession(ctx, doomed.id);
    expect(report).toEqual(preview);

    for (const id of [a.id, b.id]) {
      expect(await getPhotoRecord(db, id)).toBeNull();
      expect(await getAnalysisRecord(db, id)).toBeNull();
    }
    expect(await getSession(ctx, kept.id)).not.toBeNull();
    expect(await getPhotoRecord(db, other.id)).not.toBeNull();
    expect(await getAnalysisRecord(db, other.id)).not.toBeNull();
    expect(await getBlob(db, photoOriginalKey(other.id))).not.toBeNull();
    db.close();
  });

  it('removes a session record that no longer parses, and its photos', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { name: 'Broken' });
    const photo = await ingest(ctx, session.id);
    const stored = await db.get('sessions', session.id);
    await db.put('sessions', { ...stored, createdAt: 'not a date', photoIds: 'nonsense' } as never);

    const preview = await previewSessionDeletion(ctx, session.id);
    expect(preview.readable).toBe(false);
    expect(preview.photos).toBe(1);

    await deleteSession(ctx, session.id);
    expect(await db.get('sessions', session.id)).toBeUndefined();
    expect(await getPhotoRecord(db, photo.id)).toBeNull();
    expect(await getBlob(db, photoOriginalKey(photo.id))).toBeNull();
    db.close();
  });

  it('throws SessionNotFoundError for a session that is not there', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    await expect(deleteSession(ctx, 'nope')).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(previewSessionDeletion(ctx, 'nope')).rejects.toBeInstanceOf(SessionNotFoundError);
    db.close();
  });
});
