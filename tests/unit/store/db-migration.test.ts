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

async function storeNames(name: string): Promise<string[]> {
  const db = await openAppDb(name);
  const names = [...db.objectStoreNames].sort();
  db.close();
  return names;
}

describe('openAppDb migration (data-model.md §6)', () => {
  it('a fresh install gets every store, including goals', async () => {
    const name = dbName();
    expect(await storeNames(name)).toEqual(['analyses', 'blobs', 'goals', 'photos', 'secrets', 'sessions', 'settings']);
  });

  it('a v1-only database (before secrets existed) gets both secrets and goals in one upgrade', async () => {
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

    expect(await storeNames(name)).toEqual(['analyses', 'blobs', 'goals', 'photos', 'secrets', 'sessions', 'settings']);
  });

  it('a v2 database (secrets already added) gets only goals', async () => {
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

    expect(await storeNames(name)).toEqual(['analyses', 'blobs', 'goals', 'photos', 'secrets', 'sessions', 'settings']);
  });
});
