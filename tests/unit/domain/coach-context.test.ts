import { describe, expect, it } from 'vitest';

import { canonicalJson, fingerprintSource, matchCoachContext, parseCoachContextText, type CoachContextFile } from '@/lib/domain/coach-context';
import { clockOf, metalBoutRows, windBadgeOf, windBandOf, zeroClicksLabel } from '@/lib/domain/coach-context-view';

import { COACH_DAY, syntheticCoachFile, syntheticCoachText } from '../../helpers/coach-context';

function parsed(text = syntheticCoachText()): CoachContextFile {
  const result = parseCoachContextText(text);
  if (!result.ok) throw new Error(result.problem);
  return result.file;
}

describe('coach-context file (coach-context-import.md §4, §5 step 3)', () => {
  it('accepts a synthetic export shaped like the real one', () => {
    const file = parsed();
    expect(file.metalSessions).toHaveLength(5);
    expect(file.zeroAdjustments).toHaveLength(3);
    expect(file.windConditions).toHaveLength(2);
    expect(file.conventions.discOrder).toContain('alpha');
  });

  it('refuses text that is not JSON, naming why', () => {
    const r = parseCoachContextText('{ not json');
    expect(r).toMatchObject({ ok: false, reason: 'not-json' });
  });

  it('refuses another format', () => {
    expect(parseCoachContextText(syntheticCoachText({ patch: { format: 'nordic-aim-backup' } }))).toMatchObject({ ok: false, reason: 'wrong-format' });
    expect(parseCoachContextText('[]')).toMatchObject({ ok: false, reason: 'wrong-format' });
  });

  it('refuses another format version, naming both versions', () => {
    const r = parseCoachContextText(syntheticCoachText({ patch: { formatVersion: 2 } }));
    expect(r).toMatchObject({ ok: false, reason: 'wrong-version' });
    if (!r.ok) expect(r.problem).toContain('version 2');
  });

  it.each([
    ['four discs', (f: Record<string, unknown>) => ((f.metalSessions as Array<Record<string, unknown>>)[0]!.discHits = [true, true, true, true])],
    ['a display-label race', (f: Record<string, unknown>) => ((f.metalSessions as Array<Record<string, unknown>>)[0]!.race = 'Mass start')],
    ['a hit rate above 1', (f: Record<string, unknown>) => ((f.metalSessions as Array<Record<string, unknown>>)[0]!.hitRate = 1.2)],
    ['a zero click with no time', (f: Record<string, unknown>) => delete (f.zeroAdjustments as Array<Record<string, unknown>>)[0]!.at],
    ['a wind record with a bad date', (f: Record<string, unknown>) => ((f.windConditions as Array<Record<string, unknown>>)[0]!.sessionDate = '28/09/2026')],
    ['no conventions', (f: Record<string, unknown>) => delete f.conventions],
  ])('refuses a record of the wrong shape: %s', (_name, mutate) => {
    const file = syntheticCoachFile();
    mutate(file);
    const r = parseCoachContextText(JSON.stringify(file));
    expect(r).toMatchObject({ ok: false, reason: 'bad-shape' });
    if (!r.ok) expect(r.problem).toMatch(/cannot read \(.+\)/);
  });

  it('reads every confirmed race name and null', () => {
    for (const race of ['sprint', 'individual', 'mass-start', 'pursuit', null]) {
      const file = syntheticCoachFile();
      (file.metalSessions as Array<Record<string, unknown>>)[0]!.race = race;
      expect(parseCoachContextText(JSON.stringify(file)).ok).toBe(true);
    }
  });

  it("reads the real export's actual `at` shape: seconds, mixed fractional-digit counts, and a +00:00 offset (not Z) — regression for the owner's 2026-10-05 upload, refused before this fix", () => {
    const file = syntheticCoachFile();
    for (const at of ['2026-09-29T01:19:12.231+00:00', '2026-09-29T01:22:12.748+00:00', '2026-09-29T01:24:12.29+00:00']) {
      (file.zeroAdjustments as Array<Record<string, unknown>>)[0]!.at = at;
      expect(parseCoachContextText(JSON.stringify(file)).ok).toBe(true);
    }
  });

  it('also accepts a minute-precision Z time and a numeric wind direction (defensive; not seen in any real export so far, §7)', () => {
    const file = syntheticCoachFile();
    (file.zeroAdjustments as Array<Record<string, unknown>>)[0]!.at = '2026-09-29T01:19Z';
    (file.windConditions as Array<Record<string, unknown>>)[0]!.direction = 9;
    expect(parseCoachContextText(JSON.stringify(file)).ok).toBe(true);
  });

  it('ignores fields it does not know, so they never reach a fingerprint', () => {
    const file = syntheticCoachFile();
    (file.metalSessions as Array<Record<string, unknown>>)[0]!.heartRate = 150;
    const withExtra = parsed(JSON.stringify(file)).metalSessions[0]!;
    expect(withExtra).not.toHaveProperty('heartRate');
    expect(fingerprintSource('metal', withExtra)).toBe(fingerprintSource('metal', parsed().metalSessions[0]!));
  });
});

describe('fingerprint source (§5 step 6)', () => {
  it('is the same whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }));
  });

  it('carries the record kind, so different kinds never share one', () => {
    const wind = parsed().windConditions[0]!;
    expect(fingerprintSource('wind', wind)).not.toBe(fingerprintSource('metal', wind as never));
  });
});

describe('matching a file to a session date (§5 step 4)', () => {
  it('keeps every metal bout and wind record of that date, and zero clicks by their local date', () => {
    const file = parsed();
    const match = matchCoachContext(file, COACH_DAY, (utc) => (utc.startsWith('2026-09-29T01') ? COACH_DAY : utc.slice(0, 10)));
    expect(match.metal).toHaveLength(4);
    expect(match.wind).toHaveLength(1);
    expect(match.zero.map((z) => z.at)).toEqual(['2026-09-29T01:19:00.000Z', '2026-09-28T15:05:00.000Z']);
  });

  it('matches nothing for a date the file does not hold', () => {
    const match = matchCoachContext(parsed(), '2026-08-01', (utc) => utc.slice(0, 10));
    expect(match).toEqual({ metal: [], zero: [], wind: [] });
  });
});

describe('what the image shows (§6)', () => {
  it('one row per bout, grouped by combo group (first appearance) then position, file order within', () => {
    const file = syntheticCoachFile();
    const metal = parsed(
      JSON.stringify({
        ...file,
        metalSessions: [
          { ...(file.metalSessions as object[])[1]!, comboGroup: 'B', discHits: [true, false, false, false, false] },
          { ...(file.metalSessions as object[])[0]!, comboGroup: 'A', discHits: [true, true, false, false, false] },
          { ...(file.metalSessions as object[])[1]!, comboGroup: 'A', discHits: [true, true, true, false, false] },
          { ...(file.metalSessions as object[])[0]!, comboGroup: 'B', discHits: [true, true, true, true, false] },
          { ...(file.metalSessions as object[])[0]!, comboGroup: null, discHits: [true, true, true, true, true] },
          { ...(file.metalSessions as object[])[1]!, comboGroup: 'A', discHits: [false, false, false, false, false] },
        ],
      }),
    ).metalSessions;
    const rows = metalBoutRows(metal);
    expect(rows.map((r) => [r.group, r.position, r.hits])).toEqual([
      ['Combo 1', 'prone', 4],
      ['', 'standing', 1],
      ['Combo 2', 'prone', 2],
      ['', 'standing', 3],
      ['', 'standing', 0],
      ['No combo', 'prone', 5],
    ]);
  });

  it('three standing bouts are three rows, not one tally', () => {
    const bout = parsed().metalSessions[1]!;
    expect(metalBoutRows([bout, bout, bout])).toHaveLength(3);
  });

  it.each(['none', 'light', 'moderate', 'strong'] as const)('reads the %s band from the note', (band) => {
    expect(windBandOf({ sessionDate: COACH_DAY, speedKph: null, direction: null, note: ` ${band.toUpperCase()} ` })).toBe(band);
  });

  it('a note that is not a band name, or none at all, is no band', () => {
    expect(windBandOf({ sessionDate: COACH_DAY, speedKph: 12, direction: null, note: 'gusty' })).toBeNull();
    expect(windBandOf({ sessionDate: COACH_DAY, speedKph: null, direction: null, note: null })).toBeNull();
  });

  it.each([
    [3, 3],
    ['9', 9],
    ["12 o'clock", 12],
    ['6:00', 6],
    [0, null],
    [13, null],
    [2.5, null],
    ['NW', null],
    [null, null],
  ] as const)('clock position %j → %j', (direction, clock) => {
    expect(clockOf(direction)).toBe(clock);
  });

  it('the badge comes from the first wind record with a known band; calm has no direction', () => {
    const w = (note: string | null, direction: string | number | null = '3') => ({ sessionDate: COACH_DAY, speedKph: null, direction, note });
    expect(windBadgeOf([])).toBeNull();
    expect(windBadgeOf([w('gusty')])).toBeNull();
    expect(windBadgeOf([w('gusty'), w('moderate', 9), w('strong')])).toEqual({ band: 'moderate', clock: 9 });
    expect(windBadgeOf([w('none', 9)])).toEqual({ band: 'none', clock: null });
    expect(windBadgeOf([w('light', null)])).toEqual({ band: 'light', clock: null });
  });

  it('zero clicks read as net movement in words', () => {
    expect(zeroClicksLabel({ verticalClicks: 2, horizontalClicks: -1 })).toBe('2 up · 1 left');
    expect(zeroClicksLabel({ verticalClicks: -3, horizontalClicks: 0 })).toBe('3 down');
    expect(zeroClicksLabel({ verticalClicks: 0, horizontalClicks: 0 })).toBe('no change');
  });
});
