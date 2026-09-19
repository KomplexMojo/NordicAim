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

  it('extra-candidates-dropped names the declared rounds (M16 step 5)', () => {
    expect(reasonMessage('extra-candidates-dropped', { declared: 10 })).toBe(
      'Some detected marks were ignored because you fired 10 rounds.',
    );
  });

  it('alignment-uncertain matches the spec table string', () => {
    expect(reasonMessage('alignment-uncertain')).toBe('Used your on-screen alignment — check the rings line up.');
  });

  it('image-blurry matches the spec table string', () => {
    expect(reasonMessage('image-blurry')).toBe('This photo looks blurry, so results may be less accurate.');
  });
});

describe('reasonMessage: REV-39 reasons (M20, analysis-pipeline §4)', () => {
  it('too-many-holes names the clear holes and the declared rounds', () => {
    expect(reasonMessage('too-many-holes', { holesFound: 15, rejectedDeclared: 10 })).toBe(
      'Found 15 clear holes but you entered 10 rounds. This may be the wrong target or the wrong round count.',
    );
  });

  it('too-many-holes says which position was rejected on a both target', () => {
    expect(reasonMessage('too-many-holes', { holesFound: 8, rejectedDeclared: 5, rejectedPosition: 'prone' })).toBe(
      'Prone: Found 8 clear holes but you entered 5 rounds. This may be the wrong target or the wrong round count.',
    );
  });

  it('double-punch-assumed', () => {
    expect(reasonMessage('double-punch-assumed', { doublePunches: 1 })).toBe(
      '1 hole(s) look like two shots through the same hole.',
    );
  });

  it('rounds-scored-as-miss', () => {
    expect(reasonMessage('rounds-scored-as-miss', { missesAssumed: 2 })).toBe(
      "2 round(s) weren't found and are scored as misses.",
    );
  });
});
