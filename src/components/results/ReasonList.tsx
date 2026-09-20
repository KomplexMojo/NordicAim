import type { Reason, TemplateId } from '@/lib/domain/enums';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { reasonMessage } from '@/lib/domain/reason-messages';
import type { ReconcileReasonContext } from '@/lib/scoring/reconcile-shots';
import { reasonsLabel } from '@/lib/ui/panel-labels';

interface ReasonListProps {
  reasons: Reason[];
  /** Σ subset.missing, for the `rounds-unaccounted` message. */
  missing: number;
  /** `pipeline.templateHint.template`, for the `template-mismatch` message. */
  hintTemplate: TemplateId | null;
  /**
   * `declaredRoundsOrNull(photo.categorization)` (geometry-scoring §7), for the
   * `extra-candidates-dropped` message (M16 step 5). It comes from the categorization rather than
   * from `result.all.declared` because §4 rule 4 shows this reason in the `ready` state, while
   * `analysis.computed` is still null.
   */
  declared: number | null;
  /**
   * REV-39 (M20): the numbers the `too-many-holes`, `double-punch-assumed` and `rounds-scored-as-miss`
   * messages name (`reconcileReasonContext`); null while the categorization is incomplete.
   */
  reconcile?: ReconcileReasonContext | null;
}

/** analysis-pipeline §4: the plain-language message for every reason on the photo. */
export function ReasonList({ reasons, missing, hintTemplate, declared, reconcile = null }: ReasonListProps) {
  const messages = reasons.map((reason) =>
    reasonMessage(reason, {
      missing,
      hintTemplate: hintTemplate ?? undefined,
      declared: declared ?? undefined,
      ...(reconcile ?? {}),
    }),
  );
  const summary = reasonsLabel(messages);
  if (summary === null) return null;
  return (
    <CollapsiblePanel panelId="reasons" title="Notes" summary={summary} defaultOpen>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="reason-list">
        {reasons.map((reason, i) => (
          <li key={reason} data-reason={reason}>
            {messages[i]}
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}
