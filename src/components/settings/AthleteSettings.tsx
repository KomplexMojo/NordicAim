import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_ATHLETE_CLUB, MAX_ATHLETE_NAME } from '@/lib/domain/settings';

interface AthleteSettingsProps {
  name: string;
  club: string;
  onSave(next: { name: string; club: string }): void;
}

/**
 * REV-99: Settings → Athlete: the name and ski club that will print on the summary image beside the provenance stamp (#41).
 * The stamp's key fingerprint is shown here once a passphrase exists.
 */
export function AthleteSettings({ name, club, onSave }: AthleteSettingsProps) {
  const [draft, setDraft] = useState({ name, club });
  const commit = () => {
    if (draft.name !== name || draft.club !== club) onSave(draft);
  };
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
        Key fingerprint: <span className="font-mono text-muted-foreground">not set</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Stored only on this phone, and in a backup you create. Nothing is sent anywhere. Once the stamp is built, your name, club and key
        fingerprint will print on the summary image.
      </p>
    </section>
  );
}
