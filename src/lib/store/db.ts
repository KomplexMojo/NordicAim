import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';

import type { BiathlonSession } from '@/lib/domain/session';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { AppSettings } from '@/lib/domain/settings';

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
}

export type AppDb = IDBPDatabase<AsaDbSchema>;
// TxStores is `any` because callers open transactions over varying, ad-hoc subsets of stores
// (data-model §6: "prepare everything before a transaction"); idb's `store` getter type isn't
// covariant across different TxStores tuples, so a precise union would reject valid transactions.
export type AppTx = IDBPTransaction<AsaDbSchema, any, 'readwrite' | 'versionchange'>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** data-model §6: database `asa`, version 1. */
export async function openAppDb(name = 'asa'): Promise<AppDb> {
  return openDB<AsaDbSchema>(name, 1, {
    upgrade(db) {
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('by-updatedAt', 'updatedAt');
      sessions.createIndex('by-sessionDate', 'sessionDate');

      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-sessionId', 'sessionId');

      db.createObjectStore('analyses', { keyPath: 'photoId' });
      db.createObjectStore('blobs');
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
}
