// data-model.md §6: `openAppDb`'s `upgrade` callback must give a database at ANY older version every store it's
// missing, not just the newest one — the cascading `if (oldVersion < N)` shape this guards, as opposed to the two
// early-return branches it replaced (correct only by accident, since there were exactly two versions before goals.md
// added a third).

import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

import { openAppDb } from '@/lib/store/db';

let counter = 0;
function dbName(): string {
  counter += 1;
  return `asa-migration-test-${counter}-${Date.now()}`;
}

/** Every store at database version 5 (M29 added `coachContext`). */
const ALL_STORES = ['analyses', 'blobs', 'board', 'coachContext', 'goals', 'photos', 'secrets', 'sessions', 'settings'];

async function storeNames(name: string): Promise<string[]> {
  const db = await openAppDb(name);
  const names = [...db.objectStoreNames].sort();
  db.close();
  return names;
}

describe('openAppDb migration (data-model.md §6)', () => {
  it('a fresh install gets every store, including goals, board and coachContext', async () => {
    const name = dbName();
    expect(await storeNames(name)).toEqual(ALL_STORES);
  });

  it('a v1-only database (before secrets existed) gets secrets, goals and board in one upgrade', async () => {
    const name = dbName();
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('analyses', { keyPath: 'photoId' });
        db.createObjectStore('blobs');
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
    v1.close();

    expect(await storeNames(name)).toEqual(ALL_STORES);
  });

  it('a v2 database (secrets already added) gets goals and board', async () => {
    const name = dbName();
    const v2 = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('analyses', { keyPath: 'photoId' });
        db.createObjectStore('blobs');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('secrets', { keyPath: 'key' });
      },
    });
    v2.close();

    expect(await storeNames(name)).toEqual(ALL_STORES);
  });

  it('a v4 database (board already added) gets coachContext, keyed by sessionId, and keeps its rows', async () => {
    const name = dbName();
    const v4 = await openDB(name, 4, {
      upgrade(db) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('analyses', { keyPath: 'photoId' });
        db.createObjectStore('blobs');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('secrets', { keyPath: 'key' });
        db.createObjectStore('goals', { keyPath: 'key' });
        db.createObjectStore('board', { keyPath: 'key' });
      },
    });
    await v4.put('goals', { key: 'app', entries: [] });
    v4.close();

    const db = await openAppDb(name);
    expect([...db.objectStoreNames].sort()).toEqual(ALL_STORES);
    expect(db.transaction('coachContext').store.keyPath).toBe('sessionId');
    expect(await db.get('goals', 'app')).toEqual({ key: 'app', entries: [] });
    db.close();
  });
});
