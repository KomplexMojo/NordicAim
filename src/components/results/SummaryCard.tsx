import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { latestArtifact } from '@/lib/composite/build';
import { isSummaryPending } from '@/lib/composite/scheduler-browser';
import { recordShare } from '@/lib/services/shares';
import { shareArtifact } from '@/lib/share/share-browser';

import { AttachInGarminCard } from './AttachInGarminCard';

interface SummaryCardProps {
  sessionId: string;
  sessionName: string;
}

/** A filesystem/URL-safe slug for the share filename (rendering-composite.md §7 step 2). */
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'session';
}

/**
 * rendering-composite.md §5-§7, milestone M14 step 5: the session summary image at the top of the
 * results screen — the latest `CompositeArtifact`, a Share button, and the "Attach in Garmin Connect"
 * steps. The image and PNG blob are loaded ahead of time (`useLiveQuery`/`latestArtifact`) so Share can
 * call `navigator.share` directly inside the tap handler (§7 pitfall).
 */
export function SummaryCard({ sessionId, sessionName }: SummaryCardProps) {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => latestArtifact(ctx, sessionId), [ctx, sessionId]);
  const pending = isSummaryPending(sessionId);
  const [sharing, setSharing] = useState(false);

  // Computed during render (not in an effect, so there is nothing to set state from asynchronously);
  // the effect below only ever revokes it.
  const imageUrl = useMemo(() => (value == null ? null : URL.createObjectURL(value.png)), [value]);
  useEffect(() => {
    return () => {
      if (imageUrl !== null) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function handleShare(): Promise<void> {
    if (value === undefined || value === null) return;
    setSharing(true);
    try {
      const fileName = `${slugify(sessionName)}-shooting-analysis.png`;
      const method = await shareArtifact(value.png, fileName, `Shooting analysis — ${sessionName}`);
      if (method !== 'cancelled') {
        await recordShare(ctx, sessionId, value.artifact.id, method);
      }
    } catch (err) {
      toast.error(`Could not share: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSharing(false);
    }
  }

  return (
    <Card data-testid="summary-card">
      <CardHeader>
        <CardTitle>Session summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!loading && value === null && (
          <p className="text-sm text-muted-foreground" data-testid="summary-empty">
            {pending ? 'Updating summary…' : 'Your summary image appears once a target is analyzed.'}
          </p>
        )}

        {value != null && imageUrl !== null && (
          <>
            <div className="relative">
              <img
                src={imageUrl}
                width={value.artifact.widthPx}
                height={value.artifact.heightPx}
                alt={`Session summary image for ${sessionName}`}
                data-testid="summary-image"
                className="block h-auto w-full rounded-md"
              />
              {pending && (
                <p
                  className="absolute inset-x-0 bottom-0 rounded-b-md bg-background/80 py-1 text-center text-xs text-muted-foreground"
                  data-testid="summary-updating"
                >
                  Updating summary…
                </p>
              )}
            </div>
            <Button className="h-11" onClick={() => void handleShare()} disabled={sharing} data-testid="summary-share">
              Share
            </Button>
            <AttachInGarminCard />
          </>
        )}
      </CardContent>
    </Card>
  );
}
