import { describe, expect, it } from 'vitest';

import { reasonMessage } from '@/lib/domain/reason-messages';

describe('reasonMessage', () => {
  it("rounds-unaccounted with missing 2 contains '2 round(s)'", () => {
    expect(reasonMessage('rounds-unaccounted', { missing: 2 })).toContain('2 round(s)');
  });

  it("template-mismatch with hint 'sighting' contains 'sighting'", () => {
    expect(reasonMessage('template-mismatch', { hintTemplate: 'sighting' })).toContain('sighting');
  });

  it('target-not-found matches the spec table string', () => {
    expect(reasonMessage('target-not-found')).toBe("Couldn't find the target in this photo. Use Adjust to line it up.");
  });

  it('no-shots-found matches the spec table string', () => {
    expect(reasonMessage('no-shots-found')).toBe('No shots detected. Use Adjust to add them.');
  });

  it('too-many-shots matches the spec table string', () => {
    expect(reasonMessage('too-many-shots')).toBe('More shots found than the rounds you entered. Check the rounds or adjust shots.');
  });

  it('alignment-uncertain matches the spec table string', () => {
    expect(reasonMessage('alignment-uncertain')).toBe('Used your on-screen alignment — check the rings line up.');
  });

  it('image-blurry matches the spec table string', () => {
    expect(reasonMessage('image-blurry')).toBe('This photo looks blurry, so results may be less accurate.');
  });
});
