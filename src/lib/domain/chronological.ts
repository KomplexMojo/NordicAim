// Oldest-first ordering of target photos. Pure.

import type { TargetPhoto } from './photo';

export type Orderable = Pick<TargetPhoto, 'id' | 'importedAt' | 'captureTime'> & { categorization: Pick<TargetPhoto['categorization'], 'template'> };

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
