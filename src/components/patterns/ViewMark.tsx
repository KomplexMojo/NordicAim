import { renderPatternViewMark, renderPositionSilhouette, VIEW_MARK_VIEWBOX } from '@/lib/render/diagram-marks';

export type MarkKind = 'sight-in' | 'confirm' | 'precision-prone' | 'precision-standing' | 'prone' | 'standing';

/**
 * REV-130: the small mark a target kind carries on its results card (REV-79, REV-86) — the sight-in scatter, the confirm scope
 * sight, the prone or standing bar — for use beside the kind's name on a button or a heading. Decorative: the name beside it
 * is the label.
 */
export function ViewMark({ kind, className = 'size-5' }: { kind: MarkKind; className?: string }) {
  const svg = kind === 'prone' || kind === 'standing' ? renderPositionSilhouette(kind) : renderPatternViewMark(kind);
  return (
    <svg
      viewBox={VIEW_MARK_VIEWBOX}
      className={`${className} shrink-0`}
      aria-hidden="true"
      data-testid="view-mark"
      data-kind={kind}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
