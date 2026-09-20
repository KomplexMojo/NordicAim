// REV-67: which sighting target is the initial sight-in and which is the confirm. Pure.

import type { TargetPhoto } from './photo';
import { chronological } from './photo-order';

export type SightingRole = 'sight-in' | 'confirm';

type RoleInput = Pick<TargetPhoto, 'id' | 'importedAt' | 'captureTime'> & {
  categorization: Pick<TargetPhoto['categorization'], 'template' | 'sightingRole'>;
};

/**
 * The effective role of every sighting target in ONE session: the owner's choice where there is one, else inferred: if
 * nothing is explicitly `sight-in`, the oldest unset target is `sight-in`; every other unset target is `confirm`.
 */
export function sightingRoles(photos: RoleInput[]): Map<string, SightingRole> {
  const sighting = photos.filter((p) => p.categorization.template === 'sighting').sort(chronological);
  const roles = new Map<string, SightingRole>();
  const hasExplicitSightIn = sighting.some((p) => p.categorization.sightingRole === 'sight-in');
  let firstUnsetTaken = hasExplicitSightIn;
  for (const p of sighting) {
    const chosen = p.categorization.sightingRole ?? null;
    if (chosen !== null) {
      roles.set(p.id, chosen);
    } else if (!firstUnsetTaken) {
      roles.set(p.id, 'sight-in');
      firstUnsetTaken = true;
    } else {
      roles.set(p.id, 'confirm');
    }
  }
  return roles;
}

/** True when the owner has chosen at least one sighting role in this set. */
export function hasExplicitRole(photos: RoleInput[]): boolean {
  return photos.some((p) => p.categorization.template === 'sighting' && (p.categorization.sightingRole ?? null) !== null);
}
