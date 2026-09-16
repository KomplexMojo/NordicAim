import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TargetPhoto } from '@/lib/domain/photo';
import { positionLabel } from '@/lib/pipeline/stage-b';
import { targetHeadline } from '@/lib/render/text-lines';

import { DiagramSvg } from './DiagramSvg';
import { MetricsList } from './MetricsList';
import { ReasonList } from './ReasonList';
import { StatusChip } from './StatusChip';

interface TargetCardProps {
  sessionId: string;
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
  onRetry(): void;
}

function cardTitle(photo: TargetPhoto): string {
  const template = photo.categorization.template;
  const position = photo.categorization.position;
  const templateText = template === null ? 'Target' : template === 'precision' ? 'Precision' : 'Sighting';
  return position === null ? templateText : `${templateText} · ${positionLabel(position)}`;
}

/** analysis-pipeline §1 step 3: one card per photo — cell diagram, headline, metrics, status, reasons,
 * and the View / Adjust shots buttons. */
export function TargetCard({ sessionId, photo, analysis, onRetry }: TargetCardProps) {
  const result = analysis?.computed?.result ?? null;
  const missing = result === null ? 0 : result.subsets.reduce((sum, subset) => sum + subset.missing, 0);

  return (
    <Card data-testid="target-card" data-photo-id={photo.id} data-status={photo.status}>
      <CardHeader>
        <CardTitle data-testid="target-title">{cardTitle(photo)}</CardTitle>
        {result !== null && (
          <p className="text-lg font-semibold" data-testid="target-headline">
            {targetHeadline(result)}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DiagramSvg
          photoId={photo.id}
          variant="cell"
          label={`${cardTitle(photo)} diagram`}
          className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        />
        {result !== null && <MetricsList result={result} />}
        <StatusChip
          status={photo.status}
          stageA={analysis?.pipeline.stageA ?? 'pending'}
          stageB={analysis?.pipeline.stageB ?? 'pending'}
          onRetry={onRetry}
        />
        <ReasonList
          reasons={photo.reasons}
          missing={missing}
          hintTemplate={analysis?.pipeline.templateHint?.template ?? null}
        />
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 flex-1">
            <Link to={`/sessions/${sessionId}/photos/${photo.id}`} data-testid="view-target">
              View
            </Link>
          </Button>
          {/* Enabled by M13 (Adjust shots); the button is shown now so the card's layout is final. */}
          <Button variant="outline" className="h-11 flex-1" disabled data-testid="adjust-shots">
            Adjust shots
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
