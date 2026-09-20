import { describe, expect, it } from 'vitest';

import { medalFor } from '@/lib/scoring/medal';
import { renderScoreStar, renderSightingRoleSymbol } from '@/lib/render/diagram-shared';

describe('medalFor (REV-80)', () => {
  it('above 90 is gold, 80 to 90 silver, 70 up to 80 bronze, below 70 plain (REV-81)', () => {
    expect(medalFor(100, 100)).toBe('gold');
    expect(medalFor(91, 100)).toBe('gold');
    expect(medalFor(90, 100)).toBe('silver');
    expect(medalFor(80, 100)).toBe('silver');
    expect(medalFor(79, 100)).toBe('bronze');
    expect(medalFor(70, 100)).toBe('bronze');
    expect(medalFor(69, 100)).toBe('plain');
    expect(medalFor(0, 100)).toBe('plain');
  });

  it('a shorter target is judged by its share of the maximum', () => {
    expect(medalFor(46, 50)).toBe('gold');
    expect(medalFor(40, 50)).toBe('silver');
    expect(medalFor(35, 50)).toBe('bronze');
    expect(medalFor(34, 50)).toBe('plain');
    expect(medalFor(5, 0)).toBe('plain');
  });
});

describe('the marks (REV-79, REV-80)', () => {
  it('the star carries its medal and the score inside it', () => {
    const svg = renderScoreStar(664, 56, 84, 100);
    expect(svg).toContain('data-medal="silver"');
    expect(svg).toContain('>84<');
    expect(renderScoreStar(0, 0, 95, 100)).toContain('data-medal="gold"');
    expect(renderScoreStar(0, 0, 72, 100)).toContain('data-medal="bronze"');
    expect(renderScoreStar(0, 0, 60, 100)).toContain('data-medal="plain"');
  });

  it('sight-in is a black disc with a scatter of holes, confirm a black disc with a plus', () => {
    const sightIn = renderSightingRoleSymbol('sight-in');
    const confirm = renderSightingRoleSymbol('confirm');
    expect(sightIn).toContain('data-role="sight-in"');
    expect((sightIn.match(/fill="#FFFFFF"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sightIn).not.toContain('<line');
    expect(confirm).toContain('data-role="confirm"');
    expect((confirm.match(/<line/g) ?? []).length).toBe(4);
  });
});
