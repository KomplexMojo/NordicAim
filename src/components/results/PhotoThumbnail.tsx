import { useEffect, useState } from 'react';

import { useServices } from '@/lib/app/services';
import { photoThumbKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';

interface PhotoThumbnailProps {
  photoId: string;
  alt: string;
  className?: string;
}

/**
 * The photo's stored thumbnail (`photo:<pid>:thumb`, data-model §6). M20: a rejected target has no
 * score and so no diagram, and its card shows the photo in the diagram's place. Renders nothing when
 * the thumbnail is missing.
 */
export function PhotoThumbnail({ photoId, alt, className }: PhotoThumbnailProps) {
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
        // No thumbnail stored: the card simply shows no image.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ctx, photoId]);

  if (url === null) return null;
  return <img src={url} alt={alt} data-testid="target-photo" className={className} />;
}
