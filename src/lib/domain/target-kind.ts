// REV-79: the four kinds of target the owner shoots, chosen when a photo is taken or added. A kind sets the template, the
// position, the default rounds and (for sighting) the role. Shooting both positions on one target is not offered.

import type { TemplateId } from './enums';
import type { Categorization } from './photo';
import type { SightingRole } from './sighting-role';

export const TARGET_KINDS = ['sight-in', 'confirm', 'precision-prone', 'precision-standing'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  'sight-in': 'Sight in',
  confirm: 'Confirm',
  'precision-prone': 'Precision prone',
  'precision-standing': 'Precision standing',
};

export function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === 'string' && (TARGET_KINDS as readonly string[]).includes(value);
}

export function kindTemplate(kind: TargetKind): TemplateId {
  return kind === 'sight-in' || kind === 'confirm' ? 'sighting' : 'precision';
}

/**
 * The categorization a kind stands for. A sight-in has ten rounds; a confirm typically five (the owner, 2026-09-20); a
 * precision target ten. The rounds can still be changed on the metadata screen.
 */
export function categorizationForKind(kind: TargetKind): Categorization {
  switch (kind) {
    case 'sight-in':
      return { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null, sightingRole: 'sight-in' };
    case 'confirm':
      return { template: 'sighting', position: 'prone', roundsProne: 5, roundsStanding: null, sightingRole: 'confirm' };
    case 'precision-prone':
      return { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };
    case 'precision-standing':
      return { template: 'precision', position: 'standing', roundsProne: null, roundsStanding: 10 };
  }
}

/**
 * The kind a stored categorization is. A sighting target uses `role` (its chosen or inferred `SightingRole`); a precision
 * target is prone or standing. Anything else (no template yet, or a target stored with both positions from before REV-79)
 * is `null`: nothing is shown as chosen.
 */
export function kindOfCategorization(c: Pick<Categorization, 'template' | 'position'>, role: SightingRole | null): TargetKind | null {
  if (c.template === 'sighting') return role;
  if (c.template === 'precision') {
    if (c.position === 'prone') return 'precision-prone';
    if (c.position === 'standing') return 'precision-standing';
  }
  return null;
}
