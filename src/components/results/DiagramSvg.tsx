import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { diagramCellSvgKey, diagramFullSvgKey } from '@/lib/store/blob-keys';
import { injectIntoSvg } from '@/lib/render/issue-overlay';
import { getBlob } from '@/lib/store/blobs-repo';

interface DiagramSvgProps {
  photoId: string;
  variant: 'cell' | 'full';
  /** Accessible description of the diagram, e.g. "Precision target diagram". */
  label: string;
  className?: string;
  /** REV-74: an SVG fragment (from `renderIssueOverlays`) drawn over the diagram; the stored diagram is not changed. */
  overlay?: string;
}

/**
 * The stored `diagram:<pid>:cell-svg` / `diagram:<pid>:full-svg` blob (data-model §6), drawn inline so
 * it scales with the card. The SVG is produced by this app's own pure renderer (rendering-composite §2:
 * no external references, no scripts), never by anything the user supplies. `useLiveQuery` re-reads it
 * whenever the pipeline reports a change, so a re-scored target redraws itself.
 */
export function DiagramSvg({ photoId, variant, label, className, overlay = '' }: DiagramSvgProps) {
  const { ctx } = useServices();
  const key = variant === 'cell' ? diagramCellSvgKey(photoId) : diagramFullSvgKey(photoId);
  const { value: svg } = useLiveQuery(async () => {
    const blob = await getBlob(ctx.db, key);
    return blob === null ? null : blob.text();
  }, [ctx, key]);

  if (svg === undefined || svg === null) return null;

  return (
    <div
      role="img"
      aria-label={label}
      data-testid={`diagram-${variant}`}
      className={className}
      dangerouslySetInnerHTML={{ __html: injectIntoSvg(svg, overlay) }}
    />
  );
}
