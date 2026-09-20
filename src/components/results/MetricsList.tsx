import type { AnalysisResult, MpiOffset, SubsetResult } from '@/lib/domain/analysis';
import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { formatAngular, formatMm } from '@/lib/scoring/format';
import { metricsLabel } from '@/lib/ui/panel-labels';

interface MetricsListProps {
  result: AnalysisResult;
}

/** rendering-composite §3 item 10 formats: mm 1 dp, MOA/MRAD 2 dp, unavailable `—`. */
function groupSizeLine(subset: SubsetResult): string {
  const angular = subset.extremeSpreadAngular;
  return (
    `Group size: ${formatMm(subset.extremeSpreadMm)} mm · ` +
    `${formatAngular(angular?.moa ?? null)} MOA · ${formatAngular(angular?.mrad ?? null)} MRAD`
  );
}

function mpiOffsetText(offset: MpiOffset | null): string {
  if (offset === null) return '—';
  const xDir = offset.xMm >= 0 ? 'R' : 'L';
  const yDir = offset.yMm >= 0 ? 'U' : 'D';
  return `${formatMm(Math.abs(offset.xMm))} mm ${xDir} · ${formatMm(Math.abs(offset.yMm))} mm ${yDir}`;
}

function subsetLine(subset: SubsetResult): string {
  const label = subset.key === 'prone' ? 'Prone' : 'Standing';
  const angular = subset.extremeSpreadAngular;
  return (
    `${label}: ES ${formatMm(subset.extremeSpreadMm)} mm · ${formatAngular(angular?.moa ?? null)} MOA · ` +
    `MPI ${mpiOffsetText(subset.mpiOffset)}`
  );
}

/** analysis-pipeline §1 step 3: the result card's key metrics — group size, MPI offset, and per-position
 * lines for a `both` target. REV-39 (M20): there is no score range any more; missed rounds are in the
 * definite headline. */
export function MetricsList({ result }: MetricsListProps) {
  return (
    <CollapsiblePanel panelId="metrics" title="Group details" summary={metricsLabel(result)} defaultOpen>
    <ul className="flex flex-col gap-1 text-sm" data-testid="metrics-list">
      <li data-metric="group-size">{groupSizeLine(result.all)}</li>
      <li data-metric="mpi-offset">MPI offset: {mpiOffsetText(result.all.mpiOffset)}</li>
      {result.position === 'both' &&
        result.subsets.map((subset) => (
          <li key={subset.key} data-metric={`subset-${subset.key}`}>
            {subsetLine(subset)}
          </li>
        ))}
    </ul>
    </CollapsiblePanel>
  );
}
