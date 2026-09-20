import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { IssueOverlayPanel } from '@/components/results/IssueOverlayPanel';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { PhotoSection } from '@/components/target/PhotoSection';
import { DiagramSvg } from '@/components/results/DiagramSvg';
import { ReasonList } from '@/components/results/ReasonList';
import { StatusChip } from '@/components/results/StatusChip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import type { AnalysisResult, SubsetResult, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import type { TargetPhoto } from '@/lib/domain/photo';
import { positionLabel } from '@/lib/pipeline/stage-b';
import { diagramFullFrame } from '@/lib/render/diagram';
import { renderIssueOverlays } from '@/lib/render/issue-overlay';
import { shotsFoundLine, targetHeadline } from '@/lib/render/text-lines';
import { formatAngular, formatMm } from '@/lib/scoring/format';
import { reconcileReasonContext } from '@/lib/scoring/reconcile-shots';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { getSettings } from '@/lib/store/settings-repo';

interface TargetData {
  pid: string;
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
  holeDiameterMm: number;
}

async function loadTarget(ctx: ReturnType<typeof useServices>['ctx'], pid: string): Promise<TargetData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  const settings = await getSettings(ctx.db);
  return {
    pid,
    photo,
    analysis: await getAnalysisRecord(ctx.db, pid),
    holeDiameterMm: settings.profileOverrides.holeDiameterMm,
  };
}

function subsetTitle(subset: SubsetResult): string {
  if (subset.key === 'prone') return 'Prone';
  if (subset.key === 'standing') return 'Standing';
  return 'All shots';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/** rendering-composite §3 item 9: the RESULTS tally, rows n = 10…0, `x<count>` or `-`. */
function PrecisionTally({ subset }: { subset: SubsetResult }) {
  const precision = subset.precision;
  if (precision === null) return null;
  const rings = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <table className="w-full text-sm" data-testid="tally-table">
      <caption className="sr-only">Shots per ring</caption>
      <thead>
        <tr>
          <th className="text-left font-medium text-muted-foreground">Ring</th>
          <th className="text-right font-medium text-muted-foreground">Shots</th>
        </tr>
      </thead>
      <tbody>
        {rings.map((ring) => {
          const count = precision.tally[ring] ?? 0;
          return (
            <tr key={ring} data-testid={`tally-row-${ring}`}>
              <td className="py-0.5">{ring}</td>
              <td className="py-0.5 text-right">{count > 0 ? `x${count}` : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** geometry-scoring §5/§8.2: the sighting zone outcome. Misses include rounds that were not found (REV-39). */
function SightingZones({ subset }: { subset: SubsetResult }) {
  const sighting = subset.sighting;
  if (sighting === null) return null;
  return (
    <div className="flex flex-col text-sm" data-testid="zone-table">
      <Row label="Zone" value={sighting.zoneDiameterMm === null ? 'mixed' : `${sighting.zoneDiameterMm} mm`} />
      <Row label="Hits" value={String(sighting.hits)} />
      <Row label="Clean (inside the guide)" value={String(sighting.clean)} />
      <Row label="Misses" value={String(sighting.misses)} />
    </div>
  );
}

/** What a collapsed metrics card still says: the score, or the hits and misses. */
function subsetSummary(subset: SubsetResult): string {
  if (subset.precision !== null) return `${subset.precision.identifiedTotal} / ${subset.precision.maxPossible}`;
  if (subset.sighting !== null) return `${subset.sighting.hits} hits · ${subset.sighting.misses} misses`;
  return `${subset.identified} of ${subset.declared} shots`;
}

function SubsetSection({ subset }: { subset: SubsetResult }) {
  const angular = subset.extremeSpreadAngular;
  const offset = subset.mpiOffset;
  const precision = subset.precision;
  return (
    <Card data-testid="subset-section" data-subset={subset.key}>
      <CardContent>
        <CollapsiblePanel panelId={`subset-${subset.key}`} title={subsetTitle(subset)} summary={subsetSummary(subset)} defaultOpen>
        <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col text-sm">
          <Row label="Shots identified" value={`${subset.identified} of ${subset.declared}`} />
          <Row label="Rounds scored as miss" value={String(subset.missing)} />
          {subset.overcount > 0 && <Row label="Shots over the declared rounds" value={String(subset.overcount)} />}
          <Row label="Group size (extreme spread)" value={`${formatMm(subset.extremeSpreadMm)} mm`} />
          <Row
            label="Angular size @ 50 m"
            value={`${formatAngular(angular?.moa ?? null)} MOA · ${formatAngular(angular?.mrad ?? null)} MRAD`}
          />
          <Row label="Precision (mean radius from group centre)" value={`${formatMm(subset.meanRadiusMm)} mm`} />
          <Row label="Accuracy (RMS distance from bullseye)" value={`${formatMm(subset.accuracyRmseMm ?? null)} mm`} />
          <Row
            label="MPI"
            value={
              subset.mpi === null ? '—' : `${formatMm(subset.mpi.xMm)} mm x · ${formatMm(subset.mpi.yMm)} mm y`
            }
          />
          <Row
            label="MPI offset"
            value={
              offset === null
                ? '—'
                : `${formatMm(Math.abs(offset.xMm))} mm ${offset.xMm >= 0 ? 'R' : 'L'} · ` +
                  `${formatMm(Math.abs(offset.yMm))} mm ${offset.yMm >= 0 ? 'U' : 'D'}`
            }
          />
          {precision !== null && (
            <>
              <Row label="Total" value={`${precision.identifiedTotal} / ${precision.maxPossible}`} />
              <Row label="X count" value={String(precision.xCount)} />
            </>
          )}
        </div>
        {precision !== null ? <PrecisionTally subset={subset} /> : <SightingZones subset={subset} />}
        </div>
        </CollapsiblePanel>
      </CardContent>
    </Card>
  );
}

/** Route `#/sessions/:sid/photos/:pid` (analysis-pipeline §1): the full diagram, every metric from the
 * `AnalysisResult`, the photo's own metadata, and the working photo. */
export function TargetPage() {
  const { sid = '', pid = '' } = useParams();
  const { ctx } = useServices();
  const { value: data } = useLiveQuery(() => loadTarget(ctx, pid), [ctx, pid]);
  const [zoomed, setZoomed] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

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
  // REV-74: the chosen shooting-issue regions, drawn over the diagram at the same scale the diagram used.
  const issueOverlay =
    template === null || analysis === null
      ? ''
      : renderIssueOverlays(issues, diagramFullFrame(template, analysis.shots), template);
  const position = photo.categorization.position;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-5xl">
      <header className="flex items-center justify-between gap-2">
        <Link
          to={`/sessions/${sid}/results`}
          className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          Back to results
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

      <div className={zoomed ? 'max-h-[70vh] overflow-auto' : ''}>
        <DiagramSvg
          photoId={photo.id}
          variant="full"
          label="Full target diagram"
          overlay={issueOverlay}
          className={
            zoomed
              ? 'w-[1200px] max-w-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-full'
              : '[&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:w-full lg:[&>svg]:max-h-[calc(100dvh-8rem)] lg:[&>svg]:w-auto'
          }
        />
      </div>
      <IssueOverlayPanel selected={issues} onChange={setIssues} />

      <Button variant="outline" className="h-11" data-testid="zoom-toggle" onClick={() => setZoomed(!zoomed)}>
        {zoomed ? 'Fit to width' : 'Zoom in'}
      </Button>

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

      <PhotoSection photo={photo} analysis={analysis} holeDiameterMm={data.holeDiameterMm} />
    </main>
  );
}
