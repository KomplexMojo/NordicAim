import { useRef, useState } from 'react';

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

interface SessionOptionsProps {
  backingMode: BackingMode;
  backing: BackingSheet | null;
  /** True while a card is being measured and stored. */
  busy?: boolean;
  /** backing-sheet.md §4.3: the last card photo showed no clear colour and was not saved. */
  cardError?: boolean;
  onModeChange(next: BackingMode): void;
  onPhotographCard(): void;
  onChooseCardPhoto(file: File): void;
}

/**
 * backing-sheet.md §2. One collapsed row at the bottom of the metadata screen: a shooter who never
 * uses a backing sheet sees nothing but the row. Expanded, it holds the **Backing sheet** field and,
 * with `Coloured backing` chosen, the card's swatch and the two optional card actions.
 */
export function SessionOptions({
  backingMode,
  backing,
  busy = false,
  cardError = false,
  onModeChange,
  onPhotographCard,
  onChooseCardPhoto,
}: SessionOptionsProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-lg border">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between px-3 text-sm"
        aria-expanded={open}
        data-testid="session-options-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Session options</span>
        <span aria-hidden className="text-muted-foreground">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t p-3" data-testid="session-options-panel">
          <div className="flex flex-col gap-1">
            <Label htmlFor="backing-mode">Backing sheet</Label>
            <Select
              value={backingMode}
              onValueChange={(v) => {
                const parsed = BackingMode.safeParse(v);
                if (parsed.success) onModeChange(parsed.data);
              }}
            >
              <SelectTrigger id="backing-mode" className="w-full" data-testid="backing-mode-trigger">
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
              A brightly coloured sheet behind the target shows through every hole. Auto decides per photo.
            </p>
          </div>

          {backingMode === 'coloured' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  data-testid="backing-swatch"
                  className="inline-block size-6 shrink-0 rounded border"
                  style={{ background: backing?.colour ? swatchCss(backing.colour) : 'transparent' }}
                />
                <span data-testid="backing-source">
                  {backing?.colour
                    ? backing.source === 'card'
                      ? 'Colour from your card photo'
                      : 'Colour estimated from a target photo'
                    : 'No colour measured yet'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1"
                  disabled={busy}
                  data-testid="photograph-card"
                  onClick={onPhotographCard}
                >
                  Photograph backing card
                </Button>
                <Button
                  variant="outline"
                  className="h-11 flex-1"
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
              {cardError && (
                <p className="text-xs text-destructive" role="alert" data-testid="card-colour-error">
                  {CARD_NO_COLOUR_MESSAGE}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
