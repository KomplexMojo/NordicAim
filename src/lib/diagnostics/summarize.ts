export type DiagnosticStatus = 'pass' | 'fail' | 'n/a';

export interface DiagnosticResult {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

export interface DiagnosticsSummary {
  pass: number;
  fail: number;
  na: number;
  text: string;
}

export function summarizeDiagnostics(results: DiagnosticResult[]): DiagnosticsSummary {
  let pass = 0;
  let fail = 0;
  let na = 0;
  for (const r of results) {
    if (r.status === 'pass') pass += 1;
    else if (r.status === 'fail') fail += 1;
    else na += 1;
  }
  const text = results.map((r) => `${r.status} ${r.id} ${r.detail}`).join('\n');
  return { pass, fail, na, text };
}
