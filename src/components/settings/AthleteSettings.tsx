import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_ATHLETE_CLUB, MAX_ATHLETE_NAME } from '@/lib/domain/settings';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/provenance/key';

interface AthleteSettingsProps {
  name: string;
  club: string;
  /** The key's fingerprint (settings), or null when no key has been set. */
  fingerprint: string | null;
  /** True when this phone holds the key (false after a restore until the passphrase is entered again). */
  keyPresent: boolean;
  onSave(next: { name: string; club: string }): void;
  /** Rejects with a message for the user (too short, or wrong passphrase). */
  onSetPassphrase(passphrase: string): Promise<void>;
  onUnlock(passphrase: string): Promise<void>;
}

/**
 * REV-99/REV-100: Settings → Athlete: the name and ski club printed on every summary image, and the passphrase behind the provenance
 * stamp (docs/spec/provenance.md). The passphrase is used once to make the key and is never stored.
 */
export function AthleteSettings({ name, club, fingerprint, keyPresent, onSave, onSetPassphrase, onUnlock }: AthleteSettingsProps) {
  const [draft, setDraft] = useState({ name, club });
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const needsUnlock = fingerprint !== null && !keyPresent;

  const commit = () => {
    if (draft.name !== name || draft.club !== club) onSave(draft);
  };

  async function submit(action: (p: string) => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action(passphrase);
      setPassphrase('');
      setMessage({ tone: 'ok', text: done });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-athlete-title" data-testid="athlete-settings">
      <h2 id="settings-athlete-title" className="text-base font-semibold">
        Athlete
      </h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="athlete-name">Name</Label>
        <Input
          id="athlete-name"
          data-testid="athlete-name"
          className="h-11"
          autoComplete="name"
          maxLength={MAX_ATHLETE_NAME}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={commit}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="athlete-club">Ski club</Label>
        <Input
          id="athlete-club"
          data-testid="athlete-club"
          className="h-11"
          maxLength={MAX_ATHLETE_CLUB}
          value={draft.club}
          onChange={(e) => setDraft({ ...draft, club: e.target.value })}
          onBlur={commit}
        />
      </div>

      <p className="text-sm" data-testid="athlete-stamp">
        Key fingerprint:{' '}
        <span className="font-mono text-muted-foreground" data-testid="key-fingerprint">
          {fingerprint ?? 'not set'}
        </span>
        {needsUnlock && <span className="ml-2 text-amber-800 dark:text-amber-200">(not unlocked on this phone)</span>}
      </p>

      <div className="flex flex-col gap-1">
        <Label htmlFor="athlete-passphrase">
          {needsUnlock ? 'Enter your passphrase to unlock stamping on this phone' : fingerprint === null ? 'Passphrase' : 'New passphrase'}
        </Label>
        <Input
          id="athlete-passphrase"
          data-testid="athlete-passphrase"
          className="h-11"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-describedby="athlete-passphrase-help"
        />
        <p id="athlete-passphrase-help" className="text-xs text-muted-foreground">
          At least {MIN_PASSPHRASE_LENGTH} characters. A short or common phrase can be guessed from a stamp: use a sentence.
        </p>
      </div>
      <div className="flex gap-2">
        {needsUnlock && (
          <Button
            className="h-11 flex-1"
            data-testid="unlock-passphrase"
            disabled={busy || passphrase === ''}
            onClick={() => void submit(onUnlock, 'Unlocked. New images will carry your stamp.')}
          >
            {busy ? 'Working…' : 'Unlock'}
          </Button>
        )}
        <Button
          variant={needsUnlock ? 'outline' : 'default'}
          className="h-11 flex-1"
          data-testid="set-passphrase"
          disabled={busy || passphrase === ''}
          onClick={() => void submit(onSetPassphrase, 'Key set. New images will carry your stamp.')}
        >
          {busy ? 'Working…' : fingerprint === null ? 'Set passphrase' : 'Use as new passphrase'}
        </Button>
      </div>
      {message !== null && (
        <p className={message.tone === 'ok' ? 'text-sm text-emerald-800 dark:text-emerald-200' : 'text-sm text-destructive'} role="status" data-testid="passphrase-message">
          {message.text}
        </p>
      )}

      <Link to="/verify" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" data-testid="open-verify">
        Verify a stamp
      </Link>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Your name, club and stamp print on each summary image you build after this. Nothing is sent anywhere.</li>
        <li>The passphrase is never stored or backed up. Forget it and old stamps can no longer be checked. A new passphrase only stamps future images.</li>
        <li>The stamp shows an image was made with your key from that data. It cannot stop someone cropping it out.</li>
        <li>Anyone you give your passphrase to can also check, and make, stamps.</li>
        <li>The fingerprint makes your images recognisable as yours, and as each other's.</li>
      </ul>
    </section>
  );
}
