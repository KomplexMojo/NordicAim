import { describe, expect, it } from 'vitest';

import {
  calibrationPriorFromOverlay,
  containTransform,
  coverTransform,
  cssToFrame,
  frameToCss,
  overlayCircles,
  overlayLayout,
  renderOverlaySvg,
  type Size,
} from '@/lib/capture/overlay';
import { scaleCalibration } from '@/lib/geometry/transform';

const container: Size = { w: 390, h: 844 };
const frame: Size = { w: 1080, h: 1920 };
const FRACTION = 0.85;

describe('capture/overlay: overlayCircles', () => {
  it('sighting: 115 anchor, 110 guide, 45 ring, 40 guide', () => {
    const spec = overlayCircles('sighting');
    expect(spec.outerDiameterMm).toBe(115);
    expect(spec.anchorDiameterMm).toBe(115);
    expect(spec.circles).toEqual([
      { diameterMm: 115, style: 'anchor' },
      { diameterMm: 110, style: 'guide' },
      { diameterMm: 45, style: 'ring' },
      { diameterMm: 40, style: 'guide' },
    ]);
  });

  it('precision: 154.4/74.4/42.4/10.4 ring, 112.4 anchor', () => {
    const spec = overlayCircles('precision');
    expect(spec.outerDiameterMm).toBe(154.4);
    expect(spec.anchorDiameterMm).toBe(112.4);
    expect(spec.circles).toEqual([
      { diameterMm: 154.4, style: 'ring' },
      { diameterMm: 112.4, style: 'anchor' },
      { diameterMm: 74.4, style: 'ring' },
      { diameterMm: 42.4, style: 'ring' },
      { diameterMm: 10.4, style: 'ring' },
    ]);
  });
});

describe('capture/overlay: viewfinder transforms (capture-overlay.md §3.4)', () => {
  it('coverTransform', () => {
    const t = coverTransform(container, frame);
    expect(t.k).toBeCloseTo(0.439583, 3);
    expect(t.ox).toBeCloseTo(-42.375, 3);
    expect(t.oy).toBeCloseTo(0, 3);
  });

  it('cssToFrame({195, 422}) under cover', () => {
    const t = coverTransform(container, frame);
    const p = cssToFrame({ x: 195, y: 422 }, t);
    expect(p.x).toBeCloseTo(540, 3);
    expect(p.y).toBeCloseTo(960, 3);
  });

  it('cssToFrame({0, 0}) under cover', () => {
    const t = coverTransform(container, frame);
    const p = cssToFrame({ x: 0, y: 0 }, t);
    expect(p.x).toBeCloseTo(96.398, 3);
    expect(p.y).toBeCloseTo(0, 3);
  });

  it('frameToCss({1080, 1920}) under cover', () => {
    const t = coverTransform(container, frame);
    const p = frameToCss({ x: 1080, y: 1920 }, t);
    expect(p.x).toBeCloseTo(432.375, 3);
    expect(p.y).toBeCloseTo(844, 3);
  });

  it('containTransform', () => {
    const t = containTransform(container, frame);
    expect(t.k).toBeCloseTo(0.361111, 3);
    expect(t.ox).toBeCloseTo(0, 3);
    expect(t.oy).toBeCloseTo(75.333, 3);
  });

  it('frameToCss({540, 960}) under contain', () => {
    const t = containTransform(container, frame);
    const p = frameToCss({ x: 540, y: 960 }, t);
    expect(p.x).toBeCloseTo(195, 3);
    expect(p.y).toBeCloseTo(422, 3);
  });

  it('round trips: cssToFrame(frameToCss(p)) === p, for both transforms', () => {
    for (const t of [coverTransform(container, frame), containTransform(container, frame)]) {
      const framePoints = [
        { x: 0, y: 0 },
        { x: 1080, y: 1920 },
        { x: 540, y: 960 },
        { x: 123.4, y: 987.6 },
      ];
      for (const fp of framePoints) {
        const roundTrip = cssToFrame(frameToCss(fp, t), t);
        expect(roundTrip.x).toBeCloseTo(fp.x, 6);
        expect(roundTrip.y).toBeCloseTo(fp.y, 6);
      }
    }
  });
});

describe('capture/overlay: overlayLayout (capture-overlay.md §3.4)', () => {
  it('precision at fraction 0.85', () => {
    const layout = overlayLayout(container, 'precision', FRACTION);
    expect(layout.centerCss).toEqual({ x: 195, y: 422 });
    expect(layout.outerRadiusCss).toBeCloseTo(165.75, 3);
    expect(layout.mmToCss).toBeCloseTo(2.147021, 3);
    expect(layout.anchorRadiusCss).toBeCloseTo(120.663, 3);
  });

  it('sighting at fraction 0.85', () => {
    const layout = overlayLayout(container, 'sighting', FRACTION);
    expect(layout.outerRadiusCss).toBeCloseTo(165.75, 3);
    expect(layout.mmToCss).toBeCloseTo(2.882609, 3);
    expect(layout.anchorRadiusCss).toBeCloseTo(165.75, 3);
    expect(layout.maskHoleRadiusCss).toBeCloseTo(179.01, 3);
  });

  it('sighting at fraction 0.5: outerRadiusCss 97.5', () => {
    const layout = overlayLayout(container, 'sighting', 0.5);
    expect(layout.outerRadiusCss).toBeCloseTo(97.5, 3);
  });

  it('throws RangeError outside [0.5, 0.95]', () => {
    expect(() => overlayLayout(container, 'sighting', 0.49)).toThrow(RangeError);
    expect(() => overlayLayout(container, 'sighting', 0.951)).toThrow(RangeError);
    expect(() => overlayLayout(container, 'sighting', 0.5)).not.toThrow();
    expect(() => overlayLayout(container, 'sighting', 0.95)).not.toThrow();
  });
});

describe('capture/overlay: calibrationPriorFromOverlay (capture-overlay.md §3.4)', () => {
  it('precision', () => {
    const cal = calibrationPriorFromOverlay(container, frame, 'precision', FRACTION);
    expect(cal.cx).toBeCloseTo(540, 3);
    expect(cal.cy).toBeCloseTo(960, 3);
    expect(cal.radiusPx).toBeCloseTo(274.493, 3);
    expect(cal.anchorDiameterMm).toBe(112.4);
    expect(cal.axisRatio).toBe(1);
    expect(cal.angleDeg).toBe(0);
    expect(cal.source).toBe('overlay');
    expect(cal.confidence).toBeNull();
  });

  it('sighting', () => {
    const cal = calibrationPriorFromOverlay(container, frame, 'sighting', FRACTION);
    expect(cal.cx).toBeCloseTo(540, 3);
    expect(cal.cy).toBeCloseTo(960, 3);
    expect(cal.radiusPx).toBeCloseTo(377.062, 3);
    expect(cal.anchorDiameterMm).toBe(115);
  });

  it('scaleCalibration on the precision prior halves cx/cy/radiusPx', () => {
    const cal = calibrationPriorFromOverlay(container, frame, 'precision', FRACTION);
    const scaled = scaleCalibration(cal, 0.5);
    expect(scaled.cx).toBeCloseTo(270, 3);
    expect(scaled.cy).toBeCloseTo(480, 3);
    expect(scaled.radiusPx).toBeCloseTo(137.2465, 3);
  });
});

describe('capture/overlay: renderOverlaySvg (capture-overlay.md §4)', () => {
  function countClass(svg: string, cls: string): number {
    const re = new RegExp(`class="${cls}"`, 'g');
    return (svg.match(re) ?? []).length;
  }

  it('precision: 1 overlay-anchor, 4 overlay-ring, 1 overlay-mask', () => {
    const layout = overlayLayout(container, 'precision', FRACTION);
    const svg = renderOverlaySvg(layout, 'precision', container);
    expect(countClass(svg, 'overlay-anchor')).toBe(1);
    expect(countClass(svg, 'overlay-ring')).toBe(4);
    expect(countClass(svg, 'overlay-guide')).toBe(0);
    expect(countClass(svg, 'overlay-mask')).toBe(1);
    expect(countClass(svg, 'overlay-tick')).toBe(4);
    expect(countClass(svg, 'overlay-cross')).toBe(2);
    expect(countClass(svg, 'overlay-halo')).toBe(5);
  });

  it('sighting: 1 overlay-anchor, 1 overlay-ring, 2 overlay-guide', () => {
    const layout = overlayLayout(container, 'sighting', FRACTION);
    const svg = renderOverlaySvg(layout, 'sighting', container);
    expect(countClass(svg, 'overlay-anchor')).toBe(1);
    expect(countClass(svg, 'overlay-ring')).toBe(1);
    expect(countClass(svg, 'overlay-guide')).toBe(2);
    expect(countClass(svg, 'overlay-mask')).toBe(1);
    expect(countClass(svg, 'overlay-tick')).toBe(4);
    expect(countClass(svg, 'overlay-halo')).toBe(4);
  });

  it('snapshot at 390x844, fraction 0.85 (precision)', () => {
    const layout = overlayLayout(container, 'precision', FRACTION);
    const svg = renderOverlaySvg(layout, 'precision', container);
    expect(svg).toMatchSnapshot();
  });

  it('snapshot at 390x844, fraction 0.85 (sighting)', () => {
    const layout = overlayLayout(container, 'sighting', FRACTION);
    const svg = renderOverlaySvg(layout, 'sighting', container);
    expect(svg).toMatchSnapshot();
  });
});
