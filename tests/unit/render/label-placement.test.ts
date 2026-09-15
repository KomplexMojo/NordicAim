import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '@/lib/defaults/templates';
import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { markerLabelLayout } from '@/lib/render/diagram-shared';
import {
  boxesOverlap,
  circleHitsBox,
  labelBox,
  placeLabels,
  type Box,
  type Circle,
  type LabelRequest,
} from '@/lib/render/label-placement';
import { analyzeTarget } from '@/lib/scoring/analyze';

const AREA: Box = { left: 0, top: 0, right: 1000, bottom: 1000 };

function request(text: string, anchor: Circle, preferred = { x: anchor.x + 10, y: anchor.y - 14 }): LabelRequest {
  return { text, sizePx: 15, color: '#000000', anchor, preferred };
}

describe('render/label-placement primitives (rendering-composite.md §3 item 11)', () => {
  it('labelBox pads the estimated text extent by 2 px', () => {
    const box = labelBox('MPI', 15, 100, 200);
    expect(box.left).toBeCloseTo(98, 6);
    expect(box.right).toBeCloseTo(100 + 3 * 0.62 * 15 + 2, 6);
    expect(box.top).toBeCloseTo(200 - 11.25 - 2, 6);
    expect(box.bottom).toBeCloseTo(200 + 3.75 + 2, 6);
  });

  it('circleHitsBox and boxesOverlap detect touching geometry', () => {
    const box: Box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(circleHitsBox({ x: 15, y: 5, r: 6 }, box)).toBe(true);
    expect(circleHitsBox({ x: 15, y: 5, r: 4 }, box)).toBe(false);
    expect(boxesOverlap(box, { left: 9, top: 9, right: 20, bottom: 20 })).toBe(true);
    expect(boxesOverlap(box, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
  });
});

describe('render/label-placement placeLabels', () => {
  it('keeps the preferred position when it is clear', () => {
    const anchor = { x: 500, y: 500, r: 9 };
    const [label] = placeLabels([request('x2', anchor)], [anchor], AREA);
    expect(label).toMatchObject({ x: 510, y: 486 });
  });

  it('moves off a shot that covers the preferred position, and the result is clear', () => {
    const anchor = { x: 500, y: 500, r: 9 };
    const blocker = { x: 520, y: 480, r: 9 };
    const [label] = placeLabels([request('x2', anchor)], [anchor, blocker], AREA);
    expect(label!.x !== 510 || label!.y !== 486).toBe(true);
    expect(circleHitsBox(anchor, label!.box)).toBe(false);
    expect(circleHitsBox(blocker, label!.box)).toBe(false);
  });

  it('does not overlap a label placed earlier', () => {
    const a = { x: 500, y: 500, r: 9 };
    const b = { x: 502, y: 530, r: 9 };
    const placed = placeLabels([request('MPI', a, { x: 518, y: 492 }), request('x3', b, { x: 518, y: 492 })], [a, b], AREA);
    expect(boxesOverlap(placed[0]!.box, placed[1]!.box)).toBe(false);
  });

  it('stays inside the area', () => {
    const anchor = { x: 995, y: 10, r: 8 };
    const [label] = placeLabels([request('x2', anchor)], [anchor], AREA);
    const { box } = label!;
    expect(box.left >= 0 && box.right <= 1000 && box.top >= 0 && box.bottom <= 1000).toBe(true);
  });

  it('is deterministic', () => {
    const anchors = [0, 1, 2, 3, 4].map((i) => ({ x: 500 + i * 6, y: 500 - i * 5, r: 8 }));
    const requests = anchors.map((a, i) => request(`x${i + 2}`, a));
    expect(placeLabels(requests, anchors, AREA)).toEqual(placeLabels(requests, anchors, AREA));
  });
});

interface ShotsFixture {
  template: 'sighting' | 'precision';
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

// Centres and scales from rendering-composite.md §3 item 5 and §4.
const LAYOUTS = [
  { fixture: 'sample-shots-sighting.json', variant: 'full', cx: 750, cy: 720, s: 8, r: 8 },
  { fixture: 'sample-shots-sighting.json', variant: 'cell', cx: 360, cy: 350, s: 300 / (SIGHTING_TEMPLATE.haloDiameterMm / 2), r: 5 },
  { fixture: 'sample-shots-precision.json', variant: 'full', cx: 790, cy: 690, s: 6.35, r: 8 },
  { fixture: 'sample-shots-precision.json', variant: 'cell', cx: 360, cy: 350, s: 300 / (PRECISION_TEMPLATE.haloDiameterMm / 2), r: 5 },
] as const;

describe('render/diagram marker labels on the golden fixtures (REV-24)', () => {
  for (const layout of LAYOUTS) {
    it(`${layout.fixture} ${layout.variant}: no label touches a shot, the MPI marker, or another label`, () => {
      const fixture = readFixture(layout.fixture);
      const result = analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots: fixture.shots });
      const mpi = result.all.mpi;
      const labels = markerLabelLayout(fixture.shots, mpi, layout.cx, layout.cy, layout.s, layout.r, layout.variant);

      const obstacles: Circle[] = fixture.shots.map((shot) => ({
        x: layout.cx + shot.xMm * layout.s,
        y: layout.cy - shot.yMm * layout.s,
        r: (shot.multiplicity > 1 ? layout.r * 1.25 : layout.r) + 1,
      }));
      if (mpi !== null) obstacles.push({ x: layout.cx + mpi.xMm * layout.s, y: layout.cy - mpi.yMm * layout.s, r: 14 });

      expect(labels.map((l) => l.text)).toContain('MPI');
      for (const label of labels) {
        for (const obstacle of obstacles) expect(circleHitsBox(obstacle, label.box)).toBe(false);
      }
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) expect(boxesOverlap(labels[i]!.box, labels[j]!.box)).toBe(false);
      }
    });
  }
});
