import { describe, expect, it } from 'vitest';

import { summarizeDiagnostics, type DiagnosticResult } from '@/lib/diagnostics/summarize';

describe('summarizeDiagnostics', () => {
  it('counts pass/fail/n-a and formats one line per check', () => {
    const results: DiagnosticResult[] = [
      { id: 'a', label: 'A', status: 'pass', detail: 'ok' },
      { id: 'b', label: 'B', status: 'fail', detail: 'broken' },
      { id: 'c', label: 'C', status: 'n/a', detail: 'skipped' },
      { id: 'd', label: 'D', status: 'pass', detail: 'also ok' },
    ];

    const summary = summarizeDiagnostics(results);

    expect(summary.pass).toBe(2);
    expect(summary.fail).toBe(1);
    expect(summary.na).toBe(1);
    expect(summary.text).toBe(['pass a ok', 'fail b broken', 'n/a c skipped', 'pass d also ok'].join('\n'));
  });

  it('returns zero counts and empty text for no results', () => {
    const summary = summarizeDiagnostics([]);
    expect(summary).toEqual({ pass: 0, fail: 0, na: 0, text: '' });
  });

  it('counts all-fail results', () => {
    const results: DiagnosticResult[] = [
      { id: 'x', label: 'X', status: 'fail', detail: 'nope' },
    ];
    const summary = summarizeDiagnostics(results);
    expect(summary).toEqual({ pass: 0, fail: 1, na: 0, text: 'fail x nope' });
  });
});
