import { useRef, useState, type ChangeEvent } from 'react';

import { AthleteAvatar } from '@/components/athlete/AthleteAvatar';
import { Button } from '@/components/ui/button';
import { makeAthletePicture } from '@/lib/media/athlete-picture-browser';

interface AthletePicturePickerProps {
  picture: string | null;
  /** For the initials shown without a picture. */
  name: string;
  /** Saves the new picture, or null to remove it. */
  onChange(picture: string | null): Promise<void>;
}

/**
 * REV-157 (issue #99): Settings → Athlete's picture. The camera or a photo from the library, cut to its centre square and kept
 * small, with no photo metadata. It goes on the Board inside the submissions you share; without one the Board shows initials.
 */
export function AthletePicturePicker({ picture, name, onChange }: AthletePicturePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      await onChange(await next());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file !== undefined) void run(() => makeAthletePicture(file));
  }

  return (
    <div className="flex flex-col gap-2" data-testid="athlete-picture">
      <span className="text-sm font-medium">Picture</span>
      <div className="flex items-center gap-3">
        <AthleteAvatar picture={picture} name={name} className="size-16 text-lg" testId="athlete-picture-preview" />
        <div className="flex flex-1 gap-2">
          <Button variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => input.current?.click()} data-testid="athlete-picture-choose">
            {busy ? 'Working…' : picture === null ? 'Add picture' : 'Change'}
          </Button>
          {picture !== null && (
            <Button variant="outline" className="h-11" disabled={busy} onClick={() => void run(async () => null)} data-testid="athlete-picture-remove">
              Remove
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="athlete-picture-input" />
      <p className="text-xs text-muted-foreground">
        Optional. It goes on the Board with each submission you share; without one, the Board shows your initials. Only a small
        square copy is kept, with no location.
      </p>
      {error !== null && (
        <p className="text-sm text-destructive" role="status" data-testid="athlete-picture-error">
          {error}
        </p>
      )}
    </div>
  );
}
