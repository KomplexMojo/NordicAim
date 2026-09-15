import type { AppDb } from '@/lib/store/db';
import type { ServiceContext } from '@/lib/services/context';
import { emptyCategorization } from '@/lib/domain/categorization';
import type { Categorization } from '@/lib/domain/photo';

export function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

export function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
}

export function randomBytes(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
}

export function jpegBlob(): Blob {
  return new Blob([jpegBytes().buffer as ArrayBuffer], { type: 'image/jpeg' });
}

export function completeCategorization(): Categorization {
  return { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };
}

export { emptyCategorization };

/** A ServiceContext with a fixed clock and an incrementing id generator, for deterministic tests. */
export function makeTestContext(db: AppDb, opts: { nowIso?: string } = {}): ServiceContext {
  const nowIso = opts.nowIso ?? '2026-09-05T23:40:00.000Z';
  return {
    db,
    now: () => new Date(nowIso),
    newId: () => crypto.randomUUID(),
  };
}
