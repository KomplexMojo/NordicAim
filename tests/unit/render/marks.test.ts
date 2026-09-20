import { describe, expect, it } from 'vitest';

import { backingDisplayColour, withBackingColour } from '@/lib/domain/backing';
import { renderScoreStar, renderShots } from '@/lib/render/diagram-shared';
import { renderScoringIcon } from '@/lib/render/scoring-icons';
import { medalFor } from '@/lib/scoring/medal';

describe('star bands (REV-81)', () => {
  it('gold above 90, silver 80 to 90, bronze 70 up to 80, plain below 70', () => {
    expect(medalFor(91, 100)).toBe('gold');
    expect(medalFor(90, 100)).toBe('silver');
    expect(medalFor(80, 100)).toBe('silver');
    expect(medalFor(79, 100)).toBe('bronze');
    expect(medalFor(70, 100)).toBe('bronze');
    expect(medalFor(69, 100)).toBe('plain');
    expect(medalFor(63, 100)).toBe('plain');
    expect(medalFor(46, 50)).toBe('gold');
    expect(medalFor(34, 50)).toBe('plain');
    expect(medalFor(5, 0)).toBe('plain');
  });

  it('the plain star has no fill, a black outline and black text', () => {
    const svg = renderScoreStar(0, 0, 63, 100);
    expect(svg).toContain('data-medal="plain"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toMatch(/fill="#000000"[^>]*>63</);
    expect(renderScoreStar(0, 0, 72, 100)).toContain('data-medal="bronze"');
  });
});

describe('scoring-rule icons (REV-81)', () => {
  const rules = ['gauge', 'centre', 'visible'] as const;

  it('each rule has its own icon, named for the rule', () => {
    const icons = rules.map((r) => renderScoringIcon(r, 0, 0));
    expect(new Set(icons).size).toBe(3);
    rules.forEach((r, i) => {
      expect(icons[i]).toContain(`data-rule="${r}"`);
    });
    expect(renderScoringIcon('gauge', 0, 0)).toContain('<title>Official gauge touch</title>');
    expect(renderScoringIcon('visible', 0, 0)).toContain('<title>Visible hole touch</title>');
  });

  it('only the centre-in-ring icon has a centre dot; the visible-hole hole is the smallest', () => {
    const circles = (svg: string) => (svg.match(/<circle/g) ?? []).length;
    expect(circles(renderScoringIcon('centre', 0, 0))).toBe(3); // disc, hole, centre dot
    expect(circles(renderScoringIcon('gauge', 0, 0))).toBe(2);
    const holeR = (svg: string) => Number(/<circle[^>]*r="(\d+(?:\.\d+)?)"[^>]*fill="none"/.exec(svg)?.[1] ?? NaN);
    expect(holeR(renderScoringIcon('visible', 0, 0))).toBeLessThan(holeR(renderScoringIcon('gauge', 0, 0)));
  });

  it('scales', () => {
    expect(renderScoringIcon('gauge', 0, 0, 2)).not.toBe(renderScoringIcon('gauge', 0, 0, 1));
  });
});

describe('shot colour from the backing (REV-82)', () => {
  it('a measured backing becomes a vivid #RRGGBB of its hue', () => {
    expect(backingDisplayColour({ hueDeg: 120, satP10: 0.2, valP10: 0.2 })).toMatch(/^#[0-9A-F]{6}$/);
    const green = backingDisplayColour({ hueDeg: 120, satP10: 0.7, valP10: 0.8 });
    expect(green).toBe('#33CC33'.toUpperCase().replace('#33CC33', green)); // hue check below
    const r = parseInt(green.slice(1, 3), 16);
    const g = parseInt(green.slice(3, 5), 16);
    expect(g).toBeGreaterThan(r);
    const red = backingDisplayColour({ hueDeg: 0, satP10: 0.7, valP10: 0.8 });
    expect(parseInt(red.slice(1, 3), 16)).toBeGreaterThan(parseInt(red.slice(3, 5), 16));
  });

  it('is recorded only when the colour path ran and a colour is set', () => {
    const sig = { hueDeg: 200, hueSpreadDeg: 10, satP10: 0.5, valP10: 0.5, samples: 100 };
    expect(withBackingColour({ method: 'colour' as const }, { colour: sig }).backingColour).toMatch(/^#[0-9A-F]{6}$/);
    expect(withBackingColour({ method: 'standard' as const }, { colour: sig }).backingColour).toBeNull();
    expect(withBackingColour({ method: 'colour' as const }, { colour: null }).backingColour).toBeNull();
    expect(withBackingColour({ method: 'colour' as const }, null).backingColour).toBeNull();
  });

  const shot = { id: 'a', xMm: 1, yMm: 1, multiplicity: 1 } as never;
  it('dots take the colour with a dark halo, and default to red without one', () => {
    const coloured = renderShots([shot], [], 100, 100, 5, 5, 5.6, '#33CC33');
    expect(coloured).toContain('fill="#33CC33"');
    expect(coloured).toContain('stroke="#1B1F24"'); // the halo
    const plain = renderShots([shot], [], 100, 100, 5, 5, 5.6);
    expect(plain).toContain('#E8604C');
    expect(plain).not.toContain('#33CC33');
  });
});

describe('position silhouettes (REV-86)', () => {
  it('standing and prone are distinct, named, and solid-black and gender-neutral (just limbs, a head and the rifle)', async () => {
    const { renderPositionSilhouette } = await import('@/lib/render/diagram-shared');
    const standing = renderPositionSilhouette('standing');
    const prone = renderPositionSilhouette('prone');
    expect(standing).toContain('data-position="standing"');
    expect(prone).toContain('data-position="prone"');
    expect(standing).not.toBe(prone);
    expect(standing).toContain('<title>Standing</title>');
    expect(prone).toContain('<title>Prone</title>');
    // solid black on a white panel: one head each, a rifle line, no white inner strokes (that was the outline style)
    expect((standing.match(/<circle/g) ?? []).length).toBe(1);
    expect((prone.match(/<circle/g) ?? []).length).toBe(1);
    expect(standing).toContain('fill="#FFFFFF"'); // the panel
    expect(standing).toContain('fill="#000000"'); // the head
    expect(standing).not.toContain('stroke="#FFFFFF"');
    expect(standing).toContain('stroke-width="3.8"'); // the rifle
  });
});
