import type { Reason, TemplateId } from '@/lib/domain/enums';
import { reasonMessage } from '@/lib/domain/reason-messages';

interface ReasonListProps {
  reasons: Reason[];
  /** Σ subset.missing, for the `rounds-unaccounted` message. */
  missing: number;
  /** `pipeline.templateHint.template`, for the `template-mismatch` message. */
  hintTemplate: TemplateId | null;
}

/** analysis-pipeline §4: the plain-language message for every reason on the photo. */
export function ReasonList({ reasons, missing, hintTemplate }: ReasonListProps) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="reason-list">
      {reasons.map((reason) => (
        <li key={reason} data-reason={reason}>
          {reasonMessage(reason, { missing, hintTemplate: hintTemplate ?? undefined })}
        </li>
      ))}
    </ul>
  );
}
