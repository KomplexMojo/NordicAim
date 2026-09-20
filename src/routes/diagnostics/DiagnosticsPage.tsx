import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { DataRecovery } from '@/components/diagnostics/DataRecovery';
import { Button } from '@/components/ui/button';
import { runDiagnostics } from '@/lib/diagnostics/checks-browser';
import { summarizeDiagnostics, type DiagnosticResult } from '@/lib/diagnostics/summarize';

function statusVariant(status: DiagnosticResult['status']): 'default' | 'destructive' | 'secondary' {
  if (status === 'pass') return 'default';
  if (status === 'fail') return 'destructive';
  return 'secondary';
}

export function DiagnosticsPage() {
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void runDiagnostics().then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = results ? summarizeDiagnostics(results) : null;

  async function copyReport() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Diagnostics</h1>
      </div>

      {/* Always shown, including when the checks themselves fail: this is how a stuck database is seen and exported. */}
      <DataRecovery />

      {!results && <p>Running checks…</p>}

      {results && summary && (
        <>
          <p className="text-sm text-muted-foreground">
            {summary.pass} pass · {summary.fail} fail · {summary.na} n/a
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-2">Check</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1">Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b" data-check-id={r.id} data-status={r.status}>
                  <td className="py-1 pr-2 font-mono">{r.id}</td>
                  <td className="py-1 pr-2">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="py-1 text-muted-foreground">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button type="button" onClick={() => void copyReport()}>
            {copied ? 'Copied!' : 'Copy report'}
          </Button>
        </>
      )}
    </main>
  );
}
