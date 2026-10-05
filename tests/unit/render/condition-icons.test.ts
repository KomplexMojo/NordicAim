import { describe, expect, it } from 'vitest';

import { renderLightingIcon, renderSeasonIcon, renderWindGlyph, renderWindIcon, windLabel } from '@/lib/render/condition-icons';

describe('condition icons (REV-108)', () => {
  it('each season and each lighting has its own named icon', () => {
    const seasons = (['winter', 'spring', 'summer', 'fall'] as const).map((s) => renderSeasonIcon(s, 0, 0));
    expect(new Set(seasons).size).toBe(4);
    expect(seasons[0]).toContain('data-season="winter"');
    expect(seasons[3]).toContain('<title>Fall</title>');
    const lights = (['daylight', 'night', 'artificial', 'mixed'] as const).map((l) => renderLightingIcon(l, 0, 0));
    expect(new Set(lights).size).toBe(4);
    expect(lights[1]).toContain('data-lighting="night"');
    expect(lights[2]).toContain('<title>Artificial light</title>');
  });

  it('unknown lighting has no icon', () => {
    expect(renderLightingIcon('unknown', 0, 0)).toBe('');
  });
});

describe('windage badge (M29, REV-159, coach-context-import.md §6)', () => {
  it.each(['none', 'light', 'moderate', 'strong'] as const)('%s with no known direction: its own glyph, lying flat, no arrowhead', (band) => {
    const svg = renderWindIcon({ band, clock: null }, 956, 38);
    expect(svg).toContain(`data-wind="${band}"`);
    expect(svg).toContain('data-wind-clock="unknown"');
    expect(svg).toContain('transform="translate(956 38)"');
    expect(svg).not.toContain('rotate(');
    expect(svg).not.toMatch(/L31 /);
  });

  it('each band draws a different glyph: calm rings, then one, two and three streamlines', () => {
    const glyphs = (['none', 'light', 'moderate', 'strong'] as const).map((band) => renderWindGlyph({ band, clock: null }));
    expect(new Set(glyphs).size).toBe(4);
    expect(glyphs[0]).toContain('<circle');
    expect(glyphs.slice(1).map((g) => (g.match(/q5 -3 10 0/g) ?? []).length)).toEqual([1, 2, 3]);
  });

  it.each([
    ['light', 3, 180],
    ['moderate', 9, 0],
    ['strong', 12, 90],
    ['light', 6, 270],
    ['moderate', 1, 120],
  ] as const)('%s from %i o\'clock points where it blows to (rotate %i), with arrowheads', (band, clock, rotation) => {
    const svg = renderWindIcon({ band, clock }, 0, 0);
    expect(svg).toContain(`data-wind-clock="${clock}"`);
    if (rotation === 0) expect(svg).not.toContain('rotate(');
    else expect(svg).toContain(`rotate(${rotation} 22 22)`);
    expect(svg).toMatch(/L31 /);
    expect(svg).toContain(`<title>Wind: ${band}, from ${clock} o'clock</title>`);
  });

  it('names what it shows in words', () => {
    expect(windLabel({ band: 'none', clock: null })).toBe('Wind: none (calm)');
    expect(windLabel({ band: 'strong', clock: null })).toBe('Wind: strong, direction not recorded');
  });
});
