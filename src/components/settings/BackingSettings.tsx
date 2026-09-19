import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BACKING_MODE_LABEL,
  BackingMode,
  CARD_NO_COLOUR_MESSAGE,
  swatchCss,
  type BackingSheet,
} from '@/lib/domain/backing';

const MODE_OPTIONS = BackingMode.options;

interface BackingSettingsProps {
  backingMode: BackingMode;
  backing: BackingSheet | null;
  /** True while a chosen card photo is being measured. */
  busy?: boolean;
  /** backing-sheet.md §4.3: the last card photo showed no clear colour and nothing was stored. */
  cardError?: boolean;
  onModeChange(next: BackingMode): void;
  onPhotographCard(): void;
  onChooseCardPhoto(file: File): void;
  onClear(): void;
}

/**
 * backing-sheet.md §2 (REV-48): the Settings screen's **Backing sheet** section — the mode for every
 * session, the colour measured from a card photo (shown as a swatch drawn from the signature itself),
 * and Clear. Changing any of it re-runs nothing.
 */
export function BackingSettings({
  backingMode,
  backing,
  busy = false,
  cardError = false,
  onModeChange,
  onPhotographCard,
  onChooseCardPhoto,
  onClear,
}: BackingSettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const colour = backing?.colour ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="settings-backing-title">
      <h2 id="settings-backing-title" className="text-base font-semibold">
        Backing sheet
      </h2>

      <div className="flex flex-col gap-1">
        <Label htmlFor="backing-mode">Backing</Label>
        <Select
          value={backingMode}
          onValueChange={(v) => {
            const parsed = BackingMode.safeParse(v);
            if (parsed.success) onModeChange(parsed.data);
          }}
        >
          <SelectTrigger id="backing-mode" className="h-11 w-full" data-testid="backing-mode-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {BACKING_MODE_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          A brightly coloured sheet behind the target shows through every hole. Auto decides per photo. Applies to
          every session; photos already analyzed keep their results until you re-analyze them.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          data-testid="backing-swatch"
          className="inline-block size-6 shrink-0 rounded border"
          style={{ background: colour ? swatchCss(colour) : 'transparent' }}
        />
        <span data-testid="backing-source">
          {colour
            ? backing?.source === 'card'
              ? 'Colour from your card photo'
              : 'Colour estimated from a target photo'
            : 'No colour measured yet'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-11"
          disabled={busy}
          data-testid="photograph-card"
          onClick={onPhotographCard}
        >
          Photograph backing card
        </Button>
        <Button
          variant="outline"
          className="h-11"
          disabled={busy}
          data-testid="choose-card-photo"
          onClick={() => fileRef.current?.click()}
        >
          Choose card photo
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        data-testid="card-photo-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file === undefined) return;
          onChooseCardPhoto(file);
        }}
      />
      {colour && (
        <Button variant="ghost" className="h-11" disabled={busy} data-testid="clear-backing" onClick={onClear}>
          Clear
        </Button>
      )}
      {cardError && (
        <p className="text-xs text-destructive" role="alert" data-testid="card-colour-error">
          {CARD_NO_COLOUR_MESSAGE}
        </p>
      )}
    </section>
  );
}
