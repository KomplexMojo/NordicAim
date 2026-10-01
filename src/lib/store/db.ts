import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';

import type { BiathlonSession } from '@/lib/domain/session';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { AppSettings } from '@/lib/domain/settings';
import type { GoalsStore } from '@/lib/domain/goals';
import type { BoardStore } from '@/lib/leaderboard/store-schema';

export interface StoredBlob {
  bytes: ArrayBuffer;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AsaDbSchema extends DBSchema {
  sessions: {
    key: string;
    value: BiathlonSession;
    indexes: { 'by-updatedAt': string; 'by-sessionDate': string };
  };
  photos: {
    key: string;
    value: TargetPhoto;
    indexes: { 'by-sessionId': string };
  };
  analyses: {
    key: string;
    value: TargetAnalysis;
  };
  blobs: {
    key: string;
    value: StoredBlob;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  /** REV-100: the derived provenance key (never the passphrase). Not included in a backup. */
  secrets: {
    key: string;
    value: { key: string; keyB64: string };
  };
  /** goals.md §2: the append-only goal log, one row. */
  goals: {
    key: string;
    value: GoalsStore;
  };
  /** leaderboard.md §6 (issue #42): submissions received from other shooters, one row. Database version 4. */
  board: {
    key: string;
    value: BoardStore;
  };
}

export type AppDb = IDBPDatabase<AsaDbSchema>;
// TxStores is `any` because callers open transactions over varying, ad-hoc subsets of stores
// (data-model §6: "prepare everything before a transaction"); idb's `store` getter type isn't
// covariant across different TxStores tuples, so a precise union would reject valid transactions.
export type AppTx = IDBPTransaction<AsaDbSchema, any, 'readwrite' | 'versionchange'>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * data-model §6: database `asa`, version 4 (REV-100 added `secrets` at 2; goals.md §2 added `goals` at 3; leaderboard.md §6 added
 * `board` at 4).
 *
 * Cascading `if (oldVersion < N)` blocks, never an early return: `upgrade` fires once per open with whatever
 * version the database actually has, so a database opened for the first time in a while (still at 0, 1, or 2) must
 * get every store it's missing in that one pass, not just the newest one.
 */
export async function openAppDb(name = 'asa'): Promise<AppDb> {
  return openDB<AsaDbSchema>(name, 4, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('by-updatedAt', 'updatedAt');
        sessions.createIndex('by-sessionDate', 'sessionDate');

        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-sessionId', 'sessionId');

        db.createObjectStore('analyses', { keyPath: 'photoId' });
        db.createObjectStore('blobs');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('secrets', { keyPath: 'key' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('goals', { keyPath: 'key' });
      }
      if (oldVersion < 4) {
        db.createObjectStore('board', { keyPath: 'key' });
      }
    },
  });
}
