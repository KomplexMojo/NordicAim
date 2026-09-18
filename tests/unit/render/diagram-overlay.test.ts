import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AnalysisResult, GroupEllipse, Shot } from '@/lib/domain/analysis';
import type { CalibrationLike } from '@/lib/geometry/transform';
import { diagramOverlayLayout, groupEllipsePolyline, renderDiagramOverlaySvg } from '@/lib/render/diagram-overlay';

/** geometry-scoring §2.1's vector calibration: sighting anchor 115 mm, radius 460 px -> 8 px per mm. */
const CAL: CalibrationLike = {
  cx: 1000,
  cy: 800,
  radiusPx: 460,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 115,
};

const IMAGE = { widthPx: 1200, heightPx: 1600 };

function shot(id: string, xMm: number, yMm: number, multiplicity = 1): Shot {
  return { id, xMm, yMm, multiplicity, positionOverrides: null, source: 'manual', confidence: null, cluster: false };
}

/** Only the parts of an `AnalysisResult` the overlay reads (`all.mpi`, `all.groupEllipse`). */
function resultWith(mpi: { xMm: number; yMm: number } | null, groupEllipse: GroupEllipse | null): AnalysisResult {
  const all = { mpi, groupEllipse } as unknown as AnalysisResult['all'];
  return { engineVersion: 'test', template: 'sighting', position: 'prone', subsets: [all], all };
}

describe('diagramOverlayLayout (M17 step 2)', () => {
  it('puts a shot at (0, 0) mm on the calibration centre in px', () => {
    const layout = diagramOverlayLayout(null, [shot('a', 0, 0)], CAL, 'sighting', IMAGE);
    expect(layout.shots).toHaveLength(1);
    expect(layout.shots[0]?.x).toBeCloseTo(1000, 9);
    expect(layout.shots[0]?.y).toBeCloseTo(800, 9);
  });

  it('puts a 10 mm offset 10 x scale px away (scale = 8 px/mm)', () => {
    const layout = diagramOverlayLayout(null, [shot('a', 10, 0), shot('b', 0, 10)], CAL, 'sighting', IMAGE);
    // +x mm is +x px; +y mm is UP, which is -y px (geometry-scoring §2).
    expect(layout.shots[0]?.x).toBeCloseTo(1080, 9);
    expect(layout.shots[0]?.y).toBeCloseTo(800, 9);
    expect(layout.shots[1]?.x).toBeCloseTo(1000, 9);
    expect(layout.shots[1]?.y).toBeCloseTo(720, 9);
  });

  it('carries the image size through as the overlay box', () => {
    const layout = diagramOverlayLayout(null, [], CAL, 'sighting', IMAGE);
    expect(layout.width).toBe(1200);
    expect(layout.height).toBe(1600);
  });

  it('draws the template circles capture-overlay §3.1 defines, via templateRingPolylines', () => {
    const sighting = diagramOverlayLayout(null, [], CAL, 'sighting', IMAGE);
    expect(sighting.rings.map((ring) => ring.diameterMm)).toEqual([115, 110, 45, 40]);
    const precision = diagramOverlayLayout(
      null,
      [],
      { ...CAL, anchorDiameterMm: 112.4 },
      'precision',
      IMAGE,
    );
    expect(precision.rings.map((ring) => ring.diameterMm)).toEqual([154.4, 112.4, 74.4, 42.4, 10.4]);
    expect(precision.rings.every((ring) => ring.points.length === 96)).toBe(true);
  });

  it('sizes the shot marker from the hole diameter and the calibration ellipse', () => {
    const layout = diagramOverlayLayout(null, [shot('a', 0, 0)], { ...CAL, axisRatio: 0.5 }, 'sighting', IMAGE, 5.6);
    // 2.8 mm x 8 px/mm along the major axis, halved across the minor one.
    expect(layout.shots[0]?.rx).toBeCloseTo(22.4, 9);
    expect(layout.shots[0]?.ry).toBeCloseTo(11.2, 9);
  });

  it('draws a multi-shot marker 1.25x (rendering-composite §3 item 7)', () => {
    const layout = diagramOverlayLayout(null, [shot('a', 0, 0, 3)], CAL, 'sighting', IMAGE, 5.6);
    expect(layout.shots[0]?.rx).toBeCloseTo(22.4 * 1.25, 9);
  });

  it('places the MPI through mmToPx and leaves it null with no result', () => {
    expect(diagramOverlayLayout(null, [], CAL, 'sighting', IMAGE).mpi).toBeNull();
    const layout = diagramOverlayLayout(resultWith({ xMm: 10, yMm: 5 }, null), [], CAL, 'sighting', IMAGE);
    expect(layout.mpi?.x).toBeCloseTo(1080, 9);
    expect(layout.mpi?.y).toBeCloseTo(760, 9);
  });

  it('samples the group ellipse as a 96-point closed polyline', () => {
    const ellipse: GroupEllipse = { cxMm: 0, cyMm: 0, rxMm: 10, ryMm: 5, angleDeg: 0 };
    const layout = diagramOverlayLayout(resultWith(null, ellipse), [], CAL, 'sighting', IMAGE);
    expect(layout.groupEllipse).toHaveLength(96);
    // t = 0 is the +x semi-major end: 10 mm right of the centre.
    expect(layout.groupEllipse?.[0]?.x).toBeCloseTo(1080, 9);
    expect(layout.groupEllipse?.[0]?.y).toBeCloseTo(800, 9);
    // t = 90 deg is the semi-minor end: 5 mm up, i.e. 40 px up in image space.
    expect(layout.groupEllipse?.[24]?.x).toBeCloseTo(1000, 9);
    expect(layout.groupEllipse?.[24]?.y).toBeCloseTo(760, 9);
  });

  it('rotates the group ellipse anticlockwise in target space', () => {
    const ellipse: GroupEllipse = { cxMm: 0, cyMm: 0, rxMm: 10, ryMm: 5, angleDeg: 90 };
    const points = groupEllipsePolyline(ellipse, CAL, 4);
    // The semi-major axis now points +y (up in mm) -> 80 px up in image space.
    expect(points[0]?.x).toBeCloseTo(1000, 9);
    expect(points[0]?.y).toBeCloseTo(720, 9);
  });
});

describe('renderDiagramOverlaySvg (M17 step 2)', () => {
  const result = resultWith({ xMm: 0, yMm: 0 }, { cxMm: 0, cyMm: 0, rxMm: 10, ryMm: 5, angleDeg: 0 });
  const svg = renderDiagramOverlaySvg(result, [shot('a', 0, 0), shot('b', 10, 0)], CAL, 'sighting', IMAGE, 5.6);

  it('uses the image size as its viewBox so it lines up with the photo', () => {
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('viewBox="0 0 1200 1600"');
  });

  it('draws one element per ring, shot, ellipse and MPI', () => {
    expect(svg.split('class="overlay-ring"').length - 1).toBe(4);
    expect(svg.split('class="overlay-shot"').length - 1).toBe(2);
    expect(svg).toContain('class="overlay-group-ellipse"');
    expect(svg).toContain('class="overlay-mpi"');
  });

  it('puts the shot markers at the mmToPx positions', () => {
    expect(svg).toContain('data-shot-id="a" cx="1000" cy="800"');
    expect(svg).toContain('data-shot-id="b" cx="1080" cy="800"');
  });

  it('omits the ellipse and the MPI when there is no result', () => {
    const bare = renderDiagramOverlaySvg(null, [], CAL, 'sighting', IMAGE);
    expect(bare).not.toContain('overlay-group-ellipse');
    expect(bare).not.toContain('overlay-mpi');
  });
});

describe('the overlay module is pure (AGENTS: pure/adapter split)', () => {
  it('never touches the DOM', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/lib/render/diagram-overlay.ts', import.meta.url)),
      'utf-8',
    );
    // Comments are allowed to name what the module avoids; only the code is scanned.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['window', 'document', 'navigator', 'canvas', 'Date.now', 'Math.random']) {
      expect({ forbidden, present: code.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });
});
