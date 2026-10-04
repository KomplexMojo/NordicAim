import { ViewMark } from '@/components/patterns/ViewMark';
import { kindsLabel, rowMarks, type SessionKinds } from '@/lib/sessions/kinds';

/**
 * Issue #73 (REV-139): a Home row's target kinds as the app's own marks (REV-130), in the fixed kind order. Up to four targets
 * get one mark each; past that, one mark per kind with its count. A target with no kind yet is a neutral dot. The count and
 * the kinds are read out in the label.
 */
export function SessionKindMarks({ kinds, targets }: { kinds: SessionKinds; targets: number }) {
  const marks = rowMarks(kinds);
  const label = kindsLabel(kinds, targets);
  if (marks.length === 0) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground" data-testid="session-kinds" aria-label={label}>
        No targets
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1" role="img" aria-label={label} title={label} data-testid="session-kinds">
      {marks.map((m, i) => (
        <span key={i} className="flex items-center gap-0.5" data-testid="session-kind-mark" data-kind={m.kind ?? 'none'} data-count={m.count}>
          {m.kind === null ? (
            <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/50" aria-hidden="true" />
          ) : (
            <ViewMark kind={m.kind} className="size-5" />
          )}
          {m.count > 1 && (
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              ×{m.count}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
