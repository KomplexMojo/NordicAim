import { describe, expect, it } from 'vitest';

import { hasExplicitRole, sightingRoles } from '@/lib/domain/sighting-role';

const photo = (id: string, utc: string, role?: 'sight-in' | 'confirm' | null, template: 'sighting' | 'precision' = 'sighting') => ({
  id,
  importedAt: '2026-09-10T00:00:00.000Z',
  captureTime: { local: null, offset: null, utc, source: 'exif' as const },
  categorization: { template, sightingRole: role },
});

describe('sightingRoles (REV-67)', () => {
  it('infers by order when nothing is chosen: oldest sight-in, the rest confirm', () => {
    const roles = sightingRoles([photo('b', '2026-09-10T11:00:00Z'), photo('a', '2026-09-10T10:00:00Z'), photo('c', '2026-09-10T12:00:00Z')]);
    expect(roles.get('a')).toBe('sight-in');
    expect(roles.get('b')).toBe('confirm');
    expect(roles.get('c')).toBe('confirm');
  });

  it('a chosen role wins over order', () => {
    const roles = sightingRoles([photo('a', '2026-09-10T10:00:00Z', 'confirm'), photo('b', '2026-09-10T11:00:00Z', 'sight-in')]);
    expect(roles.get('a')).toBe('confirm');
    expect(roles.get('b')).toBe('sight-in');
  });

  it('with an explicit sight-in, every unset target is confirm; with only an explicit confirm, the oldest unset is sight-in', () => {
    const explicitSightIn = sightingRoles([photo('a', '2026-09-10T10:00:00Z'), photo('b', '2026-09-10T11:00:00Z', 'sight-in')]);
    expect(explicitSightIn.get('a')).toBe('confirm');
    const explicitConfirm = sightingRoles([photo('a', '2026-09-10T10:00:00Z'), photo('b', '2026-09-10T11:00:00Z', 'confirm')]);
    expect(explicitConfirm.get('a')).toBe('sight-in');
  });

  it('ignores precision targets and reports whether any role was chosen', () => {
    const list = [photo('p', '2026-09-10T09:00:00Z', 'confirm', 'precision'), photo('a', '2026-09-10T10:00:00Z')];
    expect(sightingRoles(list).has('p')).toBe(false);
    expect(hasExplicitRole(list)).toBe(false);
    expect(hasExplicitRole([photo('a', '2026-09-10T10:00:00Z', 'confirm')])).toBe(true);
  });
});
