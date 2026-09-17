import { MetricsList } from '@/components/results/MetricsList';
import { ReasonList } from '@/components/results/ReasonList';
import { StatusChip } from '@/components/results/StatusChip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalysisResult } from '@/lib/domain/analysis';
import type { PhotoStatus, Reason, TemplateId } from '@/lib/domain/enums';
import { targetHeadline } from '@/lib/render/text-lines';

interface LivePreviewProps {
  result: AnalysisResult | null;
  status: PhotoStatus;
  reasons: Reason[];
  hintTemplate: TemplateId | null;
  /** `declaredRoundsOrNull(photo.categorization)`, for the `extra-candidates-dropped` message. */
  declared: number | null;
}

/**
 * M13 step 3: the score this photo would get if the edits on screen were saved — `analyzeTarget`,
 * `targetHeadline` and the `photoStatus` reasons, recomputed on every edit.
 */
export function LivePreview({ result, status, reasons, hintTemplate, declared }: LivePreviewProps) {
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
          <p className="text-sm text-muted-foreground">
            Add this target&apos;s template, position and rounds on the metadata screen to see a score here.
          </p>
        ) : (
          <MetricsList result={result} />
        )}
        <div data-testid="live-status" data-status={status}>
          <StatusChip status={status} stageA="done" stageB="done" />
        </div>
        <ReasonList
          reasons={reasons}
          missing={missing}
          hintTemplate={hintTemplate}
          declared={declared}
        />
      </CardContent>
    </Card>
  );
}
