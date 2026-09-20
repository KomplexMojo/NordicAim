import { MetricsList } from '@/components/results/MetricsList';
import { ReasonList } from '@/components/results/ReasonList';
import { StatusChip } from '@/components/results/StatusChip';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalysisResult } from '@/lib/domain/analysis';
import type { PhotoStatus, Reason, TemplateId } from '@/lib/domain/enums';
import { targetHeadline } from '@/lib/render/text-lines';
import type { ReconcileReasonContext } from '@/lib/scoring/reconcile-shots';

interface LivePreviewProps {
  result: AnalysisResult | null;
  status: PhotoStatus;
  reasons: Reason[];
  hintTemplate: TemplateId | null;
  /** `declaredRoundsOrNull(photo.categorization)`, for the `extra-candidates-dropped` message. */
  declared: number | null;
  /** REV-39 (M20): the numbers the reconciliation reasons name; null while the categorization is incomplete. */
  reconcile: ReconcileReasonContext | null;
  /** REV-94: the shots or alignment on screen differ from what is saved. */
  modified?: boolean;
}

/**
 * M13 step 3: the score this photo would get if the edits on screen were saved — `analyzeTarget`,
 * `targetHeadline` and the `photoStatus` reasons, recomputed on every edit.
 */
export function LivePreview({ result, status, reasons, hintTemplate, declared, reconcile, modified = false }: LivePreviewProps) {
  const missing = result === null ? 0 : result.subsets.reduce((sum, subset) => sum + subset.missing, 0);

  return (
    <Card data-testid="live-preview">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        {result !== null && (
          <p className="text-lg font-semibold" data-testid="live-headline">
            {targetHeadline(result)}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {result === null ? (
          reconcile === null && (
            <p className="text-sm text-muted-foreground">
              Add this target&apos;s template, position and rounds on the metadata screen to see a score here.
            </p>
          )
        ) : (
          <MetricsList result={result} />
        )}
        <div data-testid="live-status" data-status={modified ? 'modified' : status}>
          {modified ? (
            <Badge className="bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-50">Modified: not saved</Badge>
          ) : (
            <StatusChip status={status} stageA="done" stageB="done" />
          )}
        </div>
        <ReasonList
          reasons={reasons}
          missing={missing}
          hintTemplate={hintTemplate}
          declared={declared}
          reconcile={reconcile}
        />
      </CardContent>
    </Card>
  );
}
