// REV-68: the order targets are listed in. Pure.

import type { TargetPhoto } from './photo';

type Orderable = Pick<TargetPhoto, 'id' | 'importedAt' | 'captureTime'> & { categorization: Pick<TargetPhoto['categorization'], 'template'> };

/** Oldest first by capture time (null last), then import time, then id: a total order. */
export function chronological(a: Orderable, b: Orderable): number {
  const au = a.captureTime.utc;
  const bu = b.captureTime.utc;
  if (au !== bu) {
    if (au === null) return 1;
    if (bu === null) return -1;
    return au < bu ? -1 : 1;
  }
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const GROUP: Record<string, number> = { sighting: 0, precision: 1 };

/**
 * Sighting targets first, then precision, then any not yet categorised, each group in capture order — however the photos
 * were added (camera, import, in any order). The input is not modified.
 */
export function groupedByTemplate<T extends Orderable>(photos: T[]): T[] {
  const rank = (p: T): number => GROUP[p.categorization.template ?? ''] ?? 2;
  return [...photos].sort((a, b) => rank(a) - rank(b) || chronological(a, b));
}
