import { describe, expect, it } from 'vitest';

import { clampFrameZoom, FRAME_MAX, stepFrameZoom } from '@/lib/ui/zoom-steps';

describe('frame zoom steps (REV-97)', () => {
  it('steps by 1.5 and stays within 1 to 4', () => {
    expect(stepFrameZoom(1, 'in')).toBe(1.5);
    expect(stepFrameZoom(1, 'out')).toBe(1);
    expect(stepFrameZoom(3, 'in')).toBe(FRAME_MAX);
    expect(stepFrameZoom(2.25, 'out')).toBe(1.5);
  });
  it('clamps', () => {
    expect(clampFrameZoom(0.2)).toBe(1);
    expect(clampFrameZoom(9)).toBe(4);
  });
});
