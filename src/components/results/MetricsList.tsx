import type { AnalysisResult, MpiOffset, SubsetResult } from '@/lib/domain/analysis';
import { formatAngular, formatFractionalScore, formatMm } from '@/lib/scoring/format';

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

/**
 * Steps §3: "the range line `Range: pessimistic … · averaged … · optimistic …` when missing > 0".
 * Precision reports scores; sighting reports hits (geometry-scoring §8.1/§8.2).
 */
function rangeLine(result: AnalysisResult): string | null {
  const subset = result.all;
  if (subset.missing === 0) return null;
  if (result.template === 'precision') {
    const range = subset.precision!.range;
    return (
      `Range: pessimistic ${range.pessimistic} · averaged ${formatFractionalScore(range.averaged)} · ` +
      `optimistic ${range.optimistic}`
    );
  }
  const range = subset.sighting!.range;
  return (
    `Range: pessimistic ${range.pessimistic.hits} · averaged ${formatFractionalScore(range.averaged.hits)} · ` +
    `optimistic ${range.optimistic.hits} hits`
  );
}

/** analysis-pipeline §1 step 3: the result card's key metrics — group size, MPI offset, per-position
 * lines for a `both` target, and the score range when rounds are unaccounted for. */
export function MetricsList({ result }: MetricsListProps) {
  const range = rangeLine(result);
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="metrics-list">
      <li data-metric="group-size">{groupSizeLine(result.all)}</li>
      <li data-metric="mpi-offset">MPI offset: {mpiOffsetText(result.all.mpiOffset)}</li>
      {result.position === 'both' &&
        result.subsets.map((subset) => (
          <li key={subset.key} data-metric={`subset-${subset.key}`}>
            {subsetLine(subset)}
          </li>
        ))}
      {range !== null && <li data-metric="range" data-testid="range-line">{range}</li>}
    </ul>
  );
}
