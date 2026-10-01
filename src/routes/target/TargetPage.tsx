
import { suggestSeason } from '@/lib/domain/season';
import { PencilLine } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { backToFrom } from '@/lib/app/nav';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { ObservedPatterns } from '@/components/results/ObservedPatterns';
import { PhotoSection } from '@/components/target/PhotoSection';
import { DiagramSvg } from '@/components/results/DiagramSvg';
import { ReasonList } from '@/components/results/ReasonList';
import { StatusChip } from '@/components/results/StatusChip';
import { ZoomFrame } from '@/components/ui/zoom-frame';
import { Card, CardContent } from '@/components/ui/card';
import { useServices } from '@/lib/app/services';
import { GoalChecksCard } from '@/components/goals/GoalChecks';
import { loadSessionGoalChecks } from '@/lib/services/goals';
import { useLiveQuery } from '@/lib/app/use-live-query';
import type { AnalysisResult, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import type { TargetPhoto } from '@/lib/domain/photo';
import { positionLabel } from '@/lib/pipeline/stage-b';
import { plainLine, shotsFoundLine, targetHeadline } from '@/lib/render/text-lines';
import { reconcileReasonContext } from '@/lib/scoring/reconcile-shots';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { missLabel } from '@/lib/ui/panel-labels';

import { Row, SubsetSection } from '@/components/target/SubsetSection';

interface TargetData {
  pid: string;
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
}

async function loadTarget(ctx: ReturnType<typeof useServices>['ctx'], pid: string): Promise<TargetData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  return {
    pid,
    photo,
    analysis: await getAnalysisRecord(ctx.db, pid),
  };
}

/** Route `#/sessions/:sid/photos/:pid` (analysis-pipeline §1): the full diagram, every metric from the
 * `AnalysisResult`, the photo's own metadata, and the working photo. */
export function TargetPage() {
  const { sid = '', pid = '' } = useParams();
  const location = useLocation();
  // Issue #72: opened from Patterns or Analysis, the back link returns to that view; otherwise to the session's results.
  const back = backToFrom(location.state, sid);
  const { ctx } = useServices();
  const { value: data } = useLiveQuery(() => loadTarget(ctx, pid), [ctx, pid]);
  const { value: goals } = useLiveQuery(() => loadSessionGoalChecks(ctx, sid), [ctx, sid]);

  if (data === undefined) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  if (data === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Target not found.</p>
        <Link to={`/sessions/${sid}/results`} className="text-primary underline underline-offset-4">
          Back to results
        </Link>
      </main>
    );
  }

  const { photo, analysis } = data;
  const result: AnalysisResult | null = analysis?.computed?.result ?? null;
  const missing = result === null ? 0 : result.subsets.reduce((sum, subset) => sum + subset.missing, 0);
  const warnings = analysis?.pipeline.warnings ?? [];
  const template = photo.categorization.template;
  const position = photo.categorization.position;
  // Matches `withCharacteristics`'s own resolution for the `all` subset: a `both` target's combined subset is
  // judged by neither position, same as unset.
  const allSubsetPosition = position === 'prone' || position === 'standing' ? position : null;
  // REV-148: a precision target shows its position's goal checks (the session's own result there).
  const goalView = template === 'precision' && allSubsetPosition !== null ? (`precision-${allSubsetPosition}` as const) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link to={back.path} className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4" data-testid="target-back">
          {back.label}
        </Link>
        <Link
          to={`/sessions/${sid}/metadata?photo=${pid}`}
          className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium"
          data-testid="target-edit-metadata"
        >
          <PencilLine className="size-5 shrink-0" aria-hidden="true" />
          Edit type, rounds, lighting
        </Link>
      </header>

      <h1 className="text-xl font-semibold" data-testid="target-detail-title">
        {template === 'precision' ? 'Precision' : template === 'sighting' ? 'Sighting' : 'Target'}
        {position !== null ? ` · ${positionLabel(position)}` : ''}
      </h1>
      {result !== null && (
        <>
          <p className="tabular-score text-lg" data-testid="target-headline">
            {targetHeadline(result)}
          </p>
          {/* REV-49 (M24, issue #6): "hit" and "found" never share a sentence. */}
          <p className="text-sm text-muted-foreground" data-testid="shots-found-line">
            {shotsFoundLine(result)}
          </p>
          {plainLine(result) !== null && (
            <p className="text-sm" data-testid="plain-line">
              {plainLine(result)}
            </p>
          )}
        </>
      )}

      <StatusChip
        status={photo.status}
        stageA={analysis?.pipeline.stageA ?? 'pending'}
        stageB={analysis?.pipeline.stageB ?? 'pending'}
      />
      <ReasonList
        reasons={photo.reasons}
        missing={missing}
        hintTemplate={analysis?.pipeline.templateHint?.template ?? null}
        declared={declaredRoundsOrNull(photo.categorization)}
        reconcile={
          analysis === null
            ? null
            : reconcileReasonContext(analysis.shots, photo.categorization, analysis.pipeline.detection.method)
        }
      />

      <ZoomFrame>
        <DiagramSvg
          photoId={photo.id}
          variant="full"
          label="Full target diagram"
          className="[&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:w-full lg:[&>svg]:max-h-[calc(100dvh-8rem)] lg:[&>svg]:w-auto"
        />
      </ZoomFrame>

      {result !== null && (
        <ObservedPatterns
          characteristics={result.all.characteristics}
          scope="Worked out from this target's shots when its analysis was saved."
          missLabel={missLabel(allSubsetPosition)}
        />
      )}

      {goalView !== null && (
        <GoalChecksCard goals={goals} views={[goalView]} note="This session's result against the goals set when it was created." testId="target-goals" />
      )}

      {result !== null && (
        <div className="flex flex-col gap-4">
          {result.subsets.map((subset) => (
            <SubsetSection key={subset.key} subset={subset} />
          ))}
          {/* For a `both` target the combined subset carries its own group and score (geometry-scoring §7). */}
          {result.position === 'both' && <SubsetSection subset={result.all} />}
        </div>
      )}

      <Card data-testid="photo-facts">
        <CardContent>
          <CollapsiblePanel panelId="photo-facts" title="Photo" summary={photo.captureTime.local ?? undefined} defaultOpen={false}>
          <div className="flex flex-col pb-2 text-sm">
          <Row label="Captured" value={`${photo.captureTime.local ?? '—'} (${photo.captureTime.source})`} />
          <Row label="Lighting" value={photo.lighting} />
          <Row label="Season" value={photo.season ?? suggestSeason(photo.captureTime.local ?? photo.importedAt) ?? '—'} />
          <Row label="Notes" value={photo.notes ?? '—'} />
          <Row
            label="Alignment"
            value={
              `${analysis?.pipeline.alignment.method ?? 'none'}` +
              (analysis?.pipeline.alignment.confidence != null
                ? ` (${analysis.pipeline.alignment.confidence.toFixed(2)})`
                : '')
            }
          />
          <Row label="Warnings" value={warnings.length === 0 ? 'none' : warnings.join(', ')} />
          </div>
          </CollapsiblePanel>
        </CardContent>
      </Card>

      <PhotoSection photo={photo} analysis={analysis} />
    </main>
  );
}
