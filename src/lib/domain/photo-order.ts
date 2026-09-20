// REV-68, REV-90: the one order targets are listed in. Pure.

import { chronological, type Orderable } from './chronological';
import type { TargetPhoto } from './photo';
import { sightingRoles } from './sighting-role';
import { kindOfCategorization, TARGET_KINDS } from './target-kind';

export { chronological };

type KindOrderable = Orderable & { categorization: Pick<TargetPhoto['categorization'], 'template' | 'position' | 'sightingRole'> };

/**
 * Sight in, Confirm, Precision prone, Precision standing, then anything not yet categorised, each in capture order,
 * however the photos were added (camera, import, in any order). The sighting role is the effective one (chosen or
 * inferred). The input is not modified.
 */
export function orderedByKind<T extends KindOrderable>(photos: T[]): T[] {
  const roles = sightingRoles(photos);
  const rank = (p: T): number => {
    const kind = kindOfCategorization(p.categorization, roles.get(p.id) ?? null);
    return kind === null ? TARGET_KINDS.length : TARGET_KINDS.indexOf(kind);
  };
  return [...photos].sort((a, b) => rank(a) - rank(b) || chronological(a, b));
}
