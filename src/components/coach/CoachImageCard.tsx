import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyCoachImageError, type TrendsArtifact } from '@/lib/composite/coach-store';
import { shareArtifact } from '@/lib/share/share-browser';

interface CoachImageCardProps {
  /** Test ids: `<prefix>-image-card`, `make-<prefix>-image`, `<prefix>-image-preview`, `share-<prefix>-image`. */
  testIdPrefix: string;
  description: ReactNode;
  /** Builds and stores the image (`buildTrendsImage` and its Patterns and Goals siblings). */
  make(): Promise<{ artifact: TrendsArtifact; png: Blob }>;
  /** The shared file is `<fileStem>-<date>.png`. */
  fileStem: string;
  shareTitle: string;
  /** What the toast says when there is nothing to draw. */
  emptyMessage: string;
  /** Errors other than `EmptyCoachImageError` that also mean "nothing to draw". */
  isEmpty?: (err: unknown) => boolean;
}

/**
 * analysis.md §5 (REV-124), patterns.md §7 and goals.md §9 (REV-163): a coach image card. **Make coach image** builds and
 * stores it and shows a preview; **Share** then hands that stored PNG to the share sheet. Two taps, because iOS only opens
 * the share sheet directly inside a tap, and building the image takes longer than that allows.
 */
export function CoachImageCard({ testIdPrefix, description, make, fileStem, shareTitle, emptyMessage, isEmpty }: CoachImageCardProps) {
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ png: Blob; url: string; createdAt: string } | null>(null);

  useEffect(() => {
    if (image === null) return;
    const { url } = image;
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function onMake() {
    setBusy(true);
    try {
      const { artifact, png } = await make();
      setImage({ png, url: URL.createObjectURL(png), createdAt: artifact.createdAt });
    } catch (err) {
      const empty = err instanceof EmptyCoachImageError || isEmpty?.(err) === true;
      toast.error(empty ? emptyMessage : `Could not make the image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (image === null) return;
    try {
      const date = image.createdAt.slice(0, 10);
      await shareArtifact(image.png, `${fileStem}-${date}.png`, shareTitle);
    } catch (err) {
      toast.error(`Could not share: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card data-testid={`${testIdPrefix}-image-card`}>
      <CardHeader>
        <CardTitle className="text-base">Coach image</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button className="h-11" variant={image === null ? 'default' : 'outline'} disabled={busy} data-testid={`make-${testIdPrefix}-image`} onClick={() => void onMake()}>
          {busy ? 'Making the image…' : image === null ? 'Make coach image' : 'Make it again'}
        </Button>
        {image !== null && (
          <>
            <img src={image.url} alt="Coach image preview" className="w-full rounded border" data-testid={`${testIdPrefix}-image-preview`} />
            <Button className="h-11" data-testid={`share-${testIdPrefix}-image`} onClick={() => void onShare()}>
              Share
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
