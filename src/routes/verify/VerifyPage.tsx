import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { verifySessionStamp, type VerifyResult } from '@/lib/services/provenance';
import { listSessionsWithProblems } from '@/lib/services/sessions';

/** Route `#/verify` (docs/spec/provenance.md §4): does this passphrase make the stamp printed on a summary image? */
export function VerifyPage() {
  const { ctx } = useServices();
  const { value } = useLiveQuery(() => listSessionsWithProblems(ctx), [ctx]);
  const sessions = value?.sessions ?? [];
  const [sessionId, setSessionId] = useState('');
  const [stamp, setStamp] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const chosen = sessionId === '' ? (sessions[0]?.id ?? '') : sessionId;

  async function onVerify() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await verifySessionStamp(ctx, chosen, stamp, passphrase));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-3xl">
      <Link to="/settings" className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4">
        Settings
      </Link>
      <h1 className="text-xl font-semibold">Verify a stamp</h1>
      <p className="text-sm text-muted-foreground">
        Choose the session the summary image came from, type the stamp printed at the foot of the image, and enter the passphrase. The app
        checks that this key made that stamp for that image&apos;s data. Nothing leaves the phone.
      </p>

      <div className="flex flex-col gap-1">
        <Label htmlFor="verify-session">Session</Label>
        <select
          id="verify-session"
          data-testid="verify-session"
          className="h-11 rounded-md border border-input bg-background px-2 text-sm"
          value={chosen}
          onChange={(e) => setSessionId(e.target.value)}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.sessionDate}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="verify-stamp">Stamp</Label>
        <Input id="verify-stamp" data-testid="verify-stamp" className="h-11 font-mono" placeholder="9F2C41AB-3D7E90B1C2A4" autoCapitalize="characters" value={stamp} onChange={(e) => setStamp(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="verify-passphrase">Passphrase</Label>
        <Input id="verify-passphrase" data-testid="verify-passphrase" className="h-11" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </div>
      <Button className="h-11" data-testid="verify-run" disabled={busy || chosen === '' || stamp.trim() === '' || passphrase === ''} onClick={() => void onVerify()}>
        {busy ? 'Checking…' : 'Verify'}
      </Button>

      {result !== null && (
        <section className="flex flex-col gap-2 rounded-lg border p-4" data-testid="verify-result" data-status={result.status} role="status">
          {result.status === 'match' && (
            <>
              <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-200">Made with this key from this data</h2>
              {result.summary !== null && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="verify-summary">
                  <dt className="text-muted-foreground">Athlete</dt>
                  <dd>{result.summary.name || '(no name)'}</dd>
                  <dt className="text-muted-foreground">Club</dt>
                  <dd>{result.summary.club || '(none)'}</dd>
                  <dt className="text-muted-foreground">Session</dt>
                  <dd>{result.summary.sessionDate}</dd>
                  <dt className="text-muted-foreground">Scoring rule</dt>
                  <dd>{result.summary.scoringRule}</dd>
                  {result.summary.targets.map((t) => (
                    <div key={t.slot} className="contents">
                      <dt className="text-muted-foreground">{t.slot}</dt>
                      <dd>
                        gauge {t.gauge} · centre {t.centre} · visible {t.visible}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Compare these with the image. The stamp covers all of them, the source photos and the shot positions.</p>
            </>
          )}
          {result.status === 'no-match' && <h2 className="text-base font-semibold text-destructive">Does not match</h2>}
          {result.status === 'no-match' && <p className="text-sm text-muted-foreground">No stored image of this session has that stamp under this key. It was edited, made with another key, or is from another session.</p>}
          {result.status === 'wrong-passphrase' && <h2 className="text-base font-semibold text-destructive">That passphrase does not match this key</h2>}
          {result.status === 'no-key-set' && <h2 className="text-base font-semibold text-destructive">No key is set on this phone (Settings → Athlete)</h2>}
        </section>
      )}
    </main>
  );
}
