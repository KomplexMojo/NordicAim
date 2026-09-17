import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { DiagramSvg } from '@/components/results/DiagramSvg';
import { ReasonList } from '@/components/results/ReasonList';
import { StatusChip } from '@/components/results/StatusChip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import type { AnalysisResult, SubsetResult, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import type { TargetPhoto } from '@/lib/domain/photo';
import { positionLabel } from '@/lib/pipeline/stage-b';
import { targetHeadline } from '@/lib/render/text-lines';
import { formatAngular, formatFractionalScore, formatMm } from '@/lib/scoring/format';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';

interface TargetData {
  pid: string;
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
}

async function loadTarget(ctx: ReturnType<typeof useServices>['ctx'], pid: string): Promise<TargetData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  return { pid, photo, analysis: await getAnalysisRecord(ctx.db, pid) };
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

/** geometry-scoring §5/§8.2: the sighting zone outcome, plus the modes when rounds are unaccounted. */
function SightingZones({ subset }: { subset: SubsetResult }) {
  const sighting = subset.sighting;
  if (sighting === null) return null;
  return (
    <div className="flex flex-col text-sm" data-testid="zone-table">
      <Row label="Zone" value={sighting.zoneDiameterMm === null ? 'mixed' : `${sighting.zoneDiameterMm} mm`} />
      <Row label="Hits" value={String(sighting.hits)} />
      <Row label="Clean (inside the guide)" value={String(sighting.clean)} />
      <Row label="Misses" value={String(sighting.misses)} />
      {subset.missing > 0 && (
        <>
          <Row label="Pessimistic hits" value={String(sighting.range.pessimistic.hits)} />
          <Row label="Averaged hits" value={formatFractionalScore(sighting.range.averaged.hits)} />
          <Row label="Optimistic hits" value={String(sighting.range.optimistic.hits)} />
        </>
      )}
    </div>
  );
}

function SubsetSection({ subset }: { subset: SubsetResult }) {
  const angular = subset.extremeSpreadAngular;
  const offset = subset.mpiOffset;
  const precision = subset.precision;
  return (
    <Card data-testid="subset-section" data-subset={subset.key}>
      <CardHeader>
        <CardTitle>{subsetTitle(subset)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col text-sm">
          <Row label="Shots identified" value={`${subset.identified} of ${subset.declared}`} />
          <Row label="Rounds not found" value={String(subset.missing)} />
          {subset.overcount > 0 && <Row label="Shots over the declared rounds" value={String(subset.overcount)} />}
          <Row label="Group size (extreme spread)" value={`${formatMm(subset.extremeSpreadMm)} mm`} />
          <Row
            label="Angular size @ 50 m"
            value={`${formatAngular(angular?.moa ?? null)} MOA · ${formatAngular(angular?.mrad ?? null)} MRAD`}
          />
          <Row label="Mean radius" value={`${formatMm(subset.meanRadiusMm)} mm`} />
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
              {subset.missing > 0 && (
                <Row
                  label="Range"
                  value={
                    `pessimistic ${precision.range.pessimistic} · ` +
                    `averaged ${formatFractionalScore(precision.range.averaged)} · ` +
                    `optimistic ${precision.range.optimistic}`
                  }
                />
              )}
            </>
          )}
        </div>
        {precision !== null ? <PrecisionTally subset={subset} /> : <SightingZones subset={subset} />}
      </CardContent>
    </Card>
  );
}

function WorkingPhoto({ photoId }: { photoId: string }) {
  const { ctx } = useServices();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getBlob(ctx.db, photoWorkingKey(photoId)).then(
      (blob) => {
        if (cancelled || blob === null) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        // No working image stored (e.g. a record restored without blobs) — nothing to show.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ctx, photoId]);

  if (url === null) return <p className="text-sm text-muted-foreground">No photo stored for this target.</p>;
  return <img src={url} alt="The photo this analysis was made from" className="w-full rounded-lg" data-testid="working-photo" />;
}

/** Route `#/sessions/:sid/photos/:pid` (analysis-pipeline §1): the full diagram, every metric from the
 * `AnalysisResult`, the photo's own metadata, and the working photo. */
export function TargetPage() {
  const { sid = '', pid = '' } = useParams();
  const { ctx } = useServices();
  const { value: data } = useLiveQuery(() => loadTarget(ctx, pid), [ctx, pid]);
  const [zoomed, setZoomed] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8">
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
        <p className="text-lg font-semibold" data-testid="target-headline">
          {targetHeadline(result)}
        </p>
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
      />

      <div className={zoomed ? 'max-h-[70vh] overflow-auto' : ''}>
        <DiagramSvg
          photoId={photo.id}
          variant="full"
          label="Full target diagram"
          className={
            zoomed
              ? 'w-[1200px] max-w-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-full'
              : '[&>svg]:block [&>svg]:h-auto [&>svg]:w-full'
          }
        />
      </div>
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
        <CardHeader>
          <CardTitle>Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col text-sm">
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
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="h-11"
        data-testid="toggle-working-photo"
        onClick={() => setShowPhoto(!showPhoto)}
      >
        {showPhoto ? 'Hide the photo' : 'Show the photo'}
      </Button>
      {showPhoto && <WorkingPhoto photoId={photo.id} />}
    </main>
  );
}
