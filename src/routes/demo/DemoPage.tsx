import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { RestorePlan } from '@/lib/backup/restore';
import { writeReminderDismissal } from '@/lib/backup/reminder-dismissal-browser';
import { verifyBackupFile, type VerifiedBackup } from '@/lib/backup/verify';
import { planBackupRestore, restoreBackup } from '@/lib/services/backup';
import { listSessions } from '@/lib/services/sessions';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; backup: VerifiedBackup; plan: RestorePlan } | { status: 'done' };

/**
 * Route `#/demo`: a link anyone can open to see Nordic Aim with its screens already full — fake sessions,
 * a fake Goals history and a fake Board of other signed shooters, built by `scripts/generate-fake-dataset.ts`
 * and bundled as a static same-origin asset at `public/demo/nordic-aim-fake-dataset.json`. Nothing is written
 * until the visitor taps "Load demo data": this reuses the exact verify -> plan -> restore pipeline Settings ->
 * Backup uses for a real backup file, so a demo load is held to the same checks (schema, and every Board
 * submission's Ed25519 signature) as restoring any other file.
 */
export function DemoPage() {
  const { ctx, imageTools, renderTools } = useServices();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}demo/nordic-aim-fake-dataset.json`);
        if (!response.ok) throw new Error(`Could not load the demo file (${response.status}).`);
        const result = await verifyBackupFile(await response.blob());
        if (cancelled) return;
        if (!result.ok) {
          setLoad({ status: 'error', message: result.problem });
          return;
        }
        const plan = await planBackupRestore(ctx, result.backup);
        if (!cancelled) setLoad({ status: 'ready', backup: result.backup, plan });
      } catch (err) {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function onLoad() {
    if (load.status !== 'ready') return;
    setBusy(true);
    try {
      const report = await restoreBackup(ctx, load.backup, load.plan, 'keep', {
        makeWorkingImages: imageTools.makeWorkingImages,
        svgToPng: renderTools.svgToPng,
      });
      // The demo's fake sessions were never really backed up; don't nag a visitor to back them up.
      const sessions = (await listSessions(ctx)).length;
      writeReminderDismissal({ atMs: ctx.now().getTime(), sessions });
      setLoad({ status: 'done' });
      toast.success(
        `Demo data loaded: ${load.backup.file.manifest.counts.sessions} sessions` +
          (report.goals > 0 ? `, a goals history` : '') +
          (report.boardShooters > 0 ? `, and ${report.boardShooters} Board shooters` : '') +
          '.',
      );
      navigate('/');
    } catch (err) {
      toast.error(`Could not load the demo data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const alreadyLoaded =
    load.status === 'ready' &&
    load.plan.sessions.new === 0 &&
    load.plan.sessions.different === 0 &&
    load.plan.photos.new === 0 &&
    load.plan.photos.different === 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-3xl">
      <h1 className="text-xl font-semibold">Demo data</h1>
      <p className="text-sm text-muted-foreground">
        This loads a made-up season into Nordic Aim on <strong>this device</strong> — fake sessions, a fake goals history and a fake Board
        full of other (fictional, signed) shooters and clubs — so you can see every screen populated. Nothing leaves this device and
        nothing happens until you tap the button below.
      </p>
      <a
        href="https://github.com/KomplexMojo/NordicAim"
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 w-fit items-center text-sm text-primary underline underline-offset-4"
      >
        Read more about Nordic Aim
      </a>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground" role="status">Checking the demo file…</p>}

      {load.status === 'error' && (
        <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4" role="alert" data-testid="demo-error">
          <p className="text-sm text-destructive">{load.message}</p>
          <Button className="h-11" variant="outline" onClick={() => navigate('/')}>
            Back to Sessions
          </Button>
        </section>
      )}

      {load.status === 'ready' && (
        <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="demo-preview">
          {alreadyLoaded ? (
            <p className="text-sm">This demo data already looks loaded on this device. Loading again changes nothing that matches.</p>
          ) : (
            <p className="text-sm">
              Adds <strong>{load.backup.file.manifest.counts.sessions}</strong> sessions and{' '}
              <strong>{load.backup.file.manifest.counts.photos}</strong> target photos, a fake goals history, and a fake Board of other
              shooters. Anything already on this device that matches is left as it is.
            </p>
          )}
          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={busy} data-testid="demo-load" onClick={() => void onLoad()}>
              {busy ? 'Loading…' : 'Load demo data'}
            </Button>
            <Button className="h-11" variant="outline" disabled={busy} onClick={() => navigate('/')}>
              Not now
            </Button>
          </div>
        </section>
      )}

      {load.status === 'done' && <p className="text-sm text-muted-foreground" role="status">Loaded. Taking you to Sessions…</p>}
    </main>
  );
}
