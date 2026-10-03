// REV-156: the sentence under the range and season controls.

import { describe, expect, it } from 'vitest';

import { showingSentence } from '@/lib/patterns/showing';

describe('showingSentence', () => {
  it('reads the range and the season as one choice', () => {
    expect(showingSentence('last', 'all', 1)).toBe('Showing your latest session.');
    expect(showingSentence('last', 'winter', 1)).toBe('Showing your latest winter session.');
    expect(showingSentence('5', 'winter', 5)).toBe('Showing your last 5 winter sessions.');
    expect(showingSentence('all', 'all', 12)).toBe('Showing all 12 of your sessions.');
  });

  it('says so when there are fewer sessions than the range asks for', () => {
    expect(showingSentence('10', 'summer', 4)).toBe('Showing all 4 of your summer sessions.');
    expect(showingSentence('5', 'all', 1)).toBe('Showing your only session.');
  });

  it('empty: names the season that left nothing, and says nothing extra without one', () => {
    expect(showingSentence('5', 'fall', 0)).toBe('No fall sessions here yet.');
    expect(showingSentence('5', 'all', 0)).toBeNull();
  });
});
