import { describe, expect, it } from 'vitest';

import { orderedByKind } from '@/lib/domain/photo-order';

type Position = 'prone' | 'standing' | 'both' | null;
const p = (id: string, template: 'sighting' | 'precision' | null, utc: string | null, position: Position = null, sightingRole?: 'sight-in' | 'confirm') => ({
  id,
  importedAt: '2026-09-10T00:00:00.000Z',
  captureTime: { local: null, offset: null, utc, source: 'exif' as const },
  categorization: { template, position, ...(sightingRole ? { sightingRole } : {}) },
});

describe('orderedByKind (REV-68, REV-90)', () => {
  it('Sight in, Confirm, Precision prone, Precision standing, then uncategorised, each in capture order', () => {
    const input = [
      p('stand-late', 'precision', '2026-09-10T14:00:00Z', 'standing'),
      p('prone-late', 'precision', '2026-09-10T13:00:00Z', 'prone'),
      p('confirm', 'sighting', '2026-09-10T11:00:00Z', 'prone', 'confirm'),
      p('none', null, '2026-09-10T08:00:00Z'),
      p('prone-early', 'precision', '2026-09-10T09:00:00Z', 'prone'),
      p('sight', 'sighting', '2026-09-10T12:00:00Z', 'prone', 'sight-in'),
      p('stand-early', 'precision', '2026-09-10T07:00:00Z', 'standing'),
    ];
    expect(orderedByKind(input).map((x) => x.id)).toEqual(['sight', 'confirm', 'prone-early', 'prone-late', 'stand-early', 'stand-late', 'none']);
    expect(input[0]!.id).toBe('stand-late'); // input not modified
  });

  it('infers the roles of unmarked sighting targets: the oldest is Sight in', () => {
    const input = [p('b', 'sighting', '2026-09-10T11:00:00Z', 'prone'), p('a', 'sighting', '2026-09-10T10:00:00Z', 'prone')];
    expect(orderedByKind(input).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
