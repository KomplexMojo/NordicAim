import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { dataLabel } from '@/lib/ui/panel-labels';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { openAppDb } from '@/lib/store/db';
import { exportAllRecords, storedDataReport, type StoredDataReport } from '@/lib/store/export-browser';

/**
 * Diagnostics → "Your data": what is in the database, which records the schema rejects and why, and an
 * export of every record as JSON.
 *
 * Added 2026-09-19 after the owner lost a day's session to one unreadable record: the session list threw,
 * the home screen showed nothing and the app looked empty, so there was no way to see that the data was
 * still there, let alone get it out. Nothing here writes or deletes anything.
 *
 * It opens the database itself rather than using `ServicesProvider`: Diagnostics deliberately sits outside
 * that provider so it still runs when IndexedDB cannot be opened (see `router.tsx`), which is precisely
 * when someone needs this panel.
 */
export function DataRecovery() {
  const [report, setReport] = useState<StoredDataReport | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    openAppDb()
      .then(async (db) => {
        const next = await storedDataReport(db);
        db.close();
        if (!cancelled) setReport(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onExport(): Promise<void> {
    setBusy(true);
    try {
      const db = await openAppDb();
      const json = await exportAllRecords(db);
      db.close();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nordic-aim-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(`Could not export: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border px-4 py-1" aria-label="Your data">
      <CollapsiblePanel
        panelId="diag-data"
        title="Your data"
        summary={report === undefined ? undefined : dataLabel(report)}
        defaultOpen={failed !== null || (report?.unreadable.length ?? 0) > 0}
      >
      <div className="flex flex-col gap-3 pb-3">

      {failed !== null ? (
        <p className="text-sm" data-testid="data-failed">
          Could not read the database: {failed}
        </p>
      ) : report === undefined ? (
        <p className="text-sm text-muted-foreground">Reading…</p>
      ) : (
        <>
          <p className="text-sm" data-testid="data-counts">
            {report.sessions} session{report.sessions === 1 ? '' : 's'} · {report.photos} photo
            {report.photos === 1 ? '' : 's'} · {report.analyses} analysis
            {report.analyses === 1 ? '' : 'es'}
          </p>

          {report.unreadable.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="data-unreadable">
              <p className="text-sm font-medium">
                {report.unreadable.length} record{report.unreadable.length === 1 ? '' : 's'} could not be read. They are
                still stored, and are left alone:
              </p>
              <ul className="flex flex-col gap-1">
                {report.unreadable.map((bad) => (
                  <li key={`${bad.store}:${bad.id}`} className="break-words text-xs text-muted-foreground">
                    {bad.store}: {bad.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Button
        variant="outline"
        className="h-11"
        disabled={busy}
        onClick={() => void onExport()}
        data-testid="export-data"
      >
        {busy ? 'Exporting…' : 'Export data (JSON)'}
      </Button>
      <p className="text-xs text-muted-foreground">
        The export holds every session, photo record and analysis — including unreadable ones, exactly as stored — but not
        the photos themselves. It never leaves your phone unless you share the file.
      </p>
      </div>
      </CollapsiblePanel>
    </section>
  );
}
