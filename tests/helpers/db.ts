import { openAppDb, type AppDb } from '@/lib/store/db';

let counter = 0;

/** Opens a fresh in-memory (fake-indexeddb) database with a unique name per call. */
export async function openTestDb(): Promise<AppDb> {
  counter += 1;
  return openAppDb(`asa-test-${counter}-${Date.now()}`);
}
