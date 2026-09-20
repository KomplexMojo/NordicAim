import { describe, expect, it } from 'vitest';

import { renderLightingIcon, renderSeasonIcon } from '@/lib/render/condition-icons';

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
