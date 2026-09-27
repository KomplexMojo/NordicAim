import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BUILD_SHA } from '@/lib/app/build-info';
import { useServices } from '@/lib/app/services';
import { buildTrendsImage, EmptyTrendsError } from '@/lib/composite/trends-build';
import { PATTERN_RANGE_LABEL, type PatternRange } from '@/lib/patterns/collect';
import { shareArtifact } from '@/lib/share/share-browser';

interface TrendsImageCardProps {
  range: PatternRange;
}

/**
 * analysis.md §5 (REV-124): the coach image for the screen's range. **Make coach image** builds and stores it and shows a
 * preview; **Share** then hands that stored PNG to the share sheet. Two taps, because iOS only opens the share sheet
 * directly inside a tap, and building the image takes longer than that allows.
 */
export function TrendsImageCard({ range }: TrendsImageCardProps) {
  const { ctx, renderTools } = useServices();
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
      const { artifact, png } = await buildTrendsImage(ctx, range, renderTools, BUILD_SHA);
      setImage({ png, url: URL.createObjectURL(png), createdAt: artifact.createdAt });
    } catch (err) {
      toast.error(err instanceof EmptyTrendsError ? 'No shots in this range yet.' : `Could not make the image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (image === null) return;
    try {
      const date = image.createdAt.slice(0, 10);
      await shareArtifact(image.png, `nordicaim-trends-${date}.png`, 'Shooting trends');
    } catch (err) {
      toast.error(`Could not share: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card data-testid="trends-image-card">
      <CardHeader>
        <CardTitle className="text-base">Coach image</CardTitle>
        <p className="text-xs text-muted-foreground">
          One image with the four Patterns drawings and these trends for {PATTERN_RANGE_LABEL[range].toLowerCase()}, stamped with
          your athlete details. Nothing is sent anywhere until you share it.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button className="h-11" variant={image === null ? 'default' : 'outline'} disabled={busy} data-testid="make-trends-image" onClick={() => void onMake()}>
          {busy ? 'Making the image…' : image === null ? 'Make coach image' : 'Make it again'}
        </Button>
        {image !== null && (
          <>
            <img src={image.url} alt="Coach image preview" className="w-full rounded border" data-testid="trends-image-preview" />
            <Button className="h-11" data-testid="share-trends-image" onClick={() => void onShare()}>
              Share
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
