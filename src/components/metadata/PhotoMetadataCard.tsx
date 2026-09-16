import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useServices } from '@/lib/app/services';
import type { Lighting } from '@/lib/domain/enums';
import { isCategorizationComplete } from '@/lib/domain/categorization';
import type { Categorization, TargetPhoto } from '@/lib/domain/photo';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import { photoThumbKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';

import { LightingField } from './LightingField';
import { RoundsFields } from './RoundsFields';
import { StageAProgress } from './StageAProgress';
import { TemplatePositionFields } from './TemplatePositionFields';

const NOTES_DEBOUNCE_MS = 600;

interface PhotoMetadataCardProps {
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
  onCategorizationChange(categorization: Categorization): void;
  onLightingChange(lighting: Lighting): void;
  onNotesChange(notes: string | null): void;
  onRemove(): void;
}

function useThumbnailUrl(photoId: string): string | null {
  const { ctx } = useServices();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getBlob(ctx.db, photoThumbKey(photoId)).then(
      (blob) => {
        if (cancelled || blob === null) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        // No thumbnail (e.g. a fixture without blobs) — the card just skips the image.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ctx, photoId]);

  return url;
}

/** One card per photo (analysis-pipeline §1 step 2): thumbnail, Stage A progress, template/position, rounds,
 * lighting, notes, and Remove photo (confirm). */
export function PhotoMetadataCard({
  photo,
  analysis,
  onCategorizationChange,
  onLightingChange,
  onNotesChange,
  onRemove,
}: PhotoMetadataCardProps) {
  const thumbUrl = useThumbnailUrl(photo.id);
  // Lazily seeded from the record; the parent list keys this card by `photo.id`, so switching photos remounts it
  // (and re-seeds this state) instead of needing an effect to resync it.
  const [notes, setNotes] = useState(photo.notes ?? '');

  useEffect(() => {
    if (notes === (photo.notes ?? '')) return;
    const timer = setTimeout(() => onNotesChange(notes.trim() === '' ? null : notes), NOTES_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const complete = isCategorizationComplete(photo.categorization);

  return (
    <Card data-testid="photo-metadata-card" data-photo-id={photo.id}>
      <CardHeader className="flex-row items-center gap-3">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="Target photo thumbnail"
            className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-foreground/10"
          />
        ) : (
          <div className="size-16 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
        )}
        <div className="flex flex-1 flex-col gap-1">
          <StageAProgress stageA={analysis?.pipeline.stageA ?? 'pending'} error={analysis?.pipeline.error ?? null} />
          {!complete && (
            <span className="text-xs text-muted-foreground" data-testid="photo-incomplete-hint">
              Set template, position, and rounds to continue.
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TemplatePositionFields categorization={photo.categorization} onChange={onCategorizationChange} />
        <RoundsFields categorization={photo.categorization} idPrefix={photo.id} onChange={onCategorizationChange} />
        <LightingField
          idPrefix={photo.id}
          value={photo.lighting}
          suggestion={photo.lightingSuggestion}
          onChange={onLightingChange}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${photo.id}-notes`}>Notes</Label>
          <Textarea
            id={`${photo.id}-notes`}
            value={notes}
            placeholder="Optional"
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-11 self-start text-destructive" data-testid="remove-photo-button">
              Remove photo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove this photo?</DialogTitle>
              <DialogDescription>This deletes the photo and any analysis for it. This can't be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton>
              <DialogClose asChild>
                <Button variant="destructive" data-testid="confirm-remove-photo" onClick={onRemove}>
                  Remove photo
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
