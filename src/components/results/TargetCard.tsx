import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import type { TargetPhoto } from '@/lib/domain/photo';
import { positionLabel } from '@/lib/pipeline/stage-b';
import { shotsFoundLine, targetHeadline } from '@/lib/render/text-lines';
import { reconcileReasonContext } from '@/lib/scoring/reconcile-shots';

import { SightingRoleField } from '@/components/metadata/SightingRoleField';
import type { SightingRole } from '@/lib/domain/sighting-role';
import { DiagramSvg } from './DiagramSvg';
import { MetricsList } from './MetricsList';
import { PhotoThumbnail } from './PhotoThumbnail';
import { ReasonList } from './ReasonList';
import { StatusChip } from './StatusChip';

interface TargetCardProps {
  sessionId: string;
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
  onRetry(): void;
  /** REV-67: the sighting target's effective role, or null for any other target. */
  role?: SightingRole | null;
  onRoleChange?(next: SightingRole): void;
}

function cardTitle(photo: TargetPhoto): string {
  const template = photo.categorization.template;
  const position = photo.categorization.position;
  const templateText = template === null ? 'Target' : template === 'precision' ? 'Precision' : 'Sighting';
  return position === null ? templateText : `${templateText} · ${positionLabel(position)}`;
}

/** analysis-pipeline §1 step 3: one card per photo — cell diagram, headline, metrics, status, reasons,
 * and the View / Adjust shots buttons. */
export function TargetCard({ sessionId, photo, analysis, onRetry, role = null, onRoleChange }: TargetCardProps) {
  const result = analysis?.computed?.result ?? null;
  const missing = result === null ? 0 : result.subsets.reduce((sum, subset) => sum + subset.missing, 0);
  // REV-39 (M20): a rejected target (too many holes for the declared rounds) carries no score, so the
  // card shows the photo and the reason instead of a diagram.
  const rejected = photo.reasons.includes('too-many-holes');
  const reconcile =
    analysis === null ? null : reconcileReasonContext(analysis.shots, photo.categorization, analysis.pipeline.detection.method);

  return (
    <Card data-testid="target-card" data-photo-id={photo.id} data-status={photo.status}>
      <CardHeader>
        <CardTitle data-testid="target-title">{cardTitle(photo)}</CardTitle>
        {result !== null && !rejected && (
          <>
            <p className="tabular-score text-lg" data-testid="target-headline">
              {targetHeadline(result)}
            </p>
            {/* REV-49 (M24, issue #6): "hit" and "found" never share a sentence — a separate line
                directly under the headline. */}
            <p className="text-sm text-muted-foreground" data-testid="shots-found-line">
              {shotsFoundLine(result)}
            </p>
          </>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* REV-73: the picture opens the target (view and adjust are one screen); there are no View / Adjust buttons. */}
        <Link
          to={`/sessions/${sessionId}/photos/${photo.id}`}
          className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="view-target"
          aria-label={`Open ${cardTitle(photo)}`}
        >
          {rejected ? (
            <PhotoThumbnail photoId={photo.id} alt={`${cardTitle(photo)} photo`} className="block h-auto w-full rounded-md" />
          ) : (
            <DiagramSvg
              photoId={photo.id}
              variant="cell"
              label={`${cardTitle(photo)} diagram`}
              className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            />
          )}
        </Link>
        {role !== null && onRoleChange !== undefined && <SightingRoleField role={role} onChange={onRoleChange} />}
        {result !== null && !rejected && <MetricsList result={result} />}
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
          declared={declaredRoundsOrNull(photo.categorization)}
          reconcile={reconcile}
        />
      </CardContent>
    </Card>
  );
}
