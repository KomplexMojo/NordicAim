import { describe, expect, it } from 'vitest';

import { GLOSSARY } from '@/lib/glossary';
import { angular } from '@/lib/scoring/groups';

describe('glossary (REV-66)', () => {
  it('has unique terms, each with a meaning', () => {
    const terms = GLOSSARY.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
    for (const e of GLOSSARY) expect(e.means.length).toBeGreaterThan(10);
  });

  it('covers every acronym the app shows', () => {
    const terms = GLOSSARY.map((e) => e.term);
    for (const t of ['MOA', 'MRAD', 'MPI', 'ES', 'RMS', 'LR', 'X', 'GPS', 'EXIF', 'JSON', 'PNG', 'HEIC', 'MB']) expect(terms).toContain(t);
  });

  it('states the true angular sizes it quotes', () => {
    // 1 MOA ≈ 14.5 mm and 1 MRAD = 50 mm at 50 m; 1 MOA ≈ 0.291 MRAD.
    expect(angular(14.5444, 50_000)!.moa).toBeCloseTo(1, 3);
    expect(angular(50, 50_000)!.mrad).toBeCloseTo(1, 3);
    expect(angular(14.5444, 50_000)!.mrad).toBeCloseTo(0.291, 3);
  });

  it('names the three scoring rules, each with its icon (REV-91)', () => {
    const icons = GLOSSARY.filter((e) => e.icon !== undefined).map((e) => e.icon);
    expect(icons).toEqual(['gauge', 'centre', 'visible']);
  });
});
