// analysis-pipeline §1 (the target screen): one subset's metrics card — the precision tally or the sighting zones, collapsed to
// its score — and the label/value row the screen's other cards use. Split out of `TargetPage.tsx` (issue #24).

import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { tallyRows } from '@/lib/scoring/tally';
import { Card, CardContent } from '@/components/ui/card';
import type { SubsetResult } from '@/lib/domain/analysis';
import { formatAngular, formatMm } from '@/lib/scoring/format';

function subsetTitle(subset: SubsetResult): string {
  if (subset.key === 'prone') return 'Prone';
  if (subset.key === 'standing') return 'Standing';
  return 'All shots';
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/**
 * REV-84: the RESULTS tally as a compact grid, one small cell per ring: the ring, how many shots are on it, and the points they add
 * (ring × shots). Rings with no shots are dimmed. The total under it is the sum of the cells.
 */
function PrecisionTally({ subset }: { subset: SubsetResult }) {
  const precision = subset.precision;
  if (precision === null) return null;
  const { rows, total } = tallyRows(precision.tally);
  return (
    <div data-testid="tally-table" role="group" aria-label="Shots per ring and the points they add">
      <ul className="grid grid-cols-3 gap-1 text-xs sm:grid-cols-4 lg:grid-cols-6">
        {rows.map(({ ring, shots, points }) => (
          <li
            key={ring}
            data-testid={`tally-row-${ring}`}
            className={`flex items-baseline justify-between gap-1 rounded border px-2 py-1 tabular-nums ${shots === 0 ? 'text-muted-foreground opacity-60' : ''}`}
          >
            <span className="font-semibold">{ring}</span>
            <span>{shots === 0 ? '–' : `x${shots}`}</span>
            <span className="min-w-6 text-right">{shots === 0 ? '' : `= ${points}`}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground" data-testid="tally-total">
        Sum of the rings: {total}
        {total !== precision.identifiedTotal ? ` (scored ${precision.identifiedTotal})` : ''}
      </p>
    </div>
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

export function SubsetSection({ subset }: { subset: SubsetResult }) {
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
