import { describe, expect, it } from 'vitest';

import { groupedByTemplate } from '@/lib/domain/photo-order';

const p = (id: string, template: 'sighting' | 'precision' | null, utc: string | null) => ({
  id,
  importedAt: '2026-09-10T00:00:00.000Z',
  captureTime: { local: null, offset: null, utc, source: 'exif' as const },
  categorization: { template },
});

describe('groupedByTemplate (REV-68)', () => {
  it('groups sighting then precision then uncategorised, each in capture order, whatever the input order', () => {
    const input = [
      p('prec-late', 'precision', '2026-09-10T13:00:00Z'),
      p('sight-late', 'sighting', '2026-09-10T12:00:00Z'),
      p('none', null, '2026-09-10T08:00:00Z'),
      p('prec-early', 'precision', '2026-09-10T09:00:00Z'),
      p('sight-early', 'sighting', '2026-09-10T10:00:00Z'),
    ];
    expect(groupedByTemplate(input).map((x) => x.id)).toEqual(['sight-early', 'sight-late', 'prec-early', 'prec-late', 'none']);
    expect(input[0]!.id).toBe('prec-late'); // input not modified
  });
});
