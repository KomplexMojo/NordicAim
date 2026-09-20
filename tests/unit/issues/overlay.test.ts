import { describe, expect, it } from 'vitest';

import { ISSUE_OVERLAYS, issueById } from '@/lib/issues/catalog';
import { issueUnitMm, renderIssueOverlays } from '@/lib/render/issue-overlay';

describe('shooting-issue catalog (REV-74)', () => {
  it('has the two group shapes and chart items a to p, each with a region', () => {
    const ids = ISSUE_OVERLAYS.map((i) => i.id);
    expect(ids).toEqual(['tight', 'scattered', ...'abcdefghijklmnop'.split('')]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const issue of ISSUE_OVERLAYS) {
      expect(issue.regions.length).toBeGreaterThan(0);
      expect(issue.label.length).toBeGreaterThan(3);
    }
  });

  it('a tight group is a smaller circle than a scattered one', () => {
    const r = (id: string) => {
      const region = issueById(id)!.regions[0]!;
      return region.kind === 'circle' ? region.r : NaN;
    };
    expect(r('tight')).toBeLessThan(r('scattered'));
  });
});

describe('renderIssueOverlays', () => {
  const frame = { cx: 790, cy: 690, s: 6.35 };

  it('draws nothing for nothing chosen or unknown ids', () => {
    expect(renderIssueOverlays([], frame, 'precision')).toBe('');
    expect(renderIssueOverlays(['nope'], frame, 'precision')).toBe('');
  });

  it('draws the tight circle at the target centre, sized in the target’s own scale', () => {
    const svg = renderIssueOverlays(['tight'], frame, 'precision');
    const unitPx = issueUnitMm('precision') * frame.s;
    expect(svg).toContain('data-issue="tight"');
    expect(svg).toContain(`cx="790"`);
    expect(svg).toContain(`cy="690"`);
    expect(svg).toContain(`r="${Math.round(0.12 * unitPx * 1000) / 1000}"`);
  });

  it('puts +y up and rotates ellipses counter-clockwise, and scales with the frame', () => {
    const svg = renderIssueOverlays(['f'], frame, 'sighting'); // f is below the centre
    const unitPx = issueUnitMm('sighting') * frame.s;
    expect(svg).toContain(`cy="${Math.round((690 + 0.32 * unitPx) * 1000) / 1000}"`);
    const rotated = renderIssueOverlays(['j'], frame, 'precision'); // 40 degrees CCW -> SVG rotate(-40)
    expect(rotated).toContain('rotate(-40');
    const zoomedOut = renderIssueOverlays(['tight'], { ...frame, s: frame.s / 2 }, 'precision');
    expect(zoomedOut).not.toBe(renderIssueOverlays(['tight'], frame, 'precision'));
  });

  it('several issues get different colours, and letters are written', () => {
    const svg = renderIssueOverlays(['c', 'd'], frame, 'precision');
    expect(svg).toContain('#E8890C');
    expect(svg).toContain('#8B3FD9');
    expect(svg).toContain('>c<');
  });
});

