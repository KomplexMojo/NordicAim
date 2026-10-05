import { metalBoutRows, windBadgeOf, zeroClicksLabel } from '@/lib/domain/coach-context-view';
import type { MetalContext, WindContext, ZeroAdjustment } from '@/lib/domain/coach-context';
import { renderCoachPreviewSvg } from '@/lib/render/coach-preview';

/** "HH:MM" on this phone's clock for a zero click's UTC time. */
function localTime(utc: string): string {
  const d = new Date(utc);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * coach-context-import.md §5 step 5 (M29, REV-159): the matched 545 Coach records drawn as the summary image will show them (§6) —
 * the windage badge and one disc row per metal bout — plus the zero clicks, which only this list shows.
 */
export function CoachPreview({ metal, zero, wind }: { metal: MetalContext[]; zero: ZeroAdjustment[]; wind: WindContext[] }) {
  const picture = renderCoachPreviewSvg({ wind: windBadgeOf(wind), metal: metalBoutRows(metal) });
  return (
    <div className="flex flex-col gap-3" data-testid="coach-preview">
      <p className="text-sm" data-testid="coach-preview-counts">
        {plural(metal.length, 'metal bout')} · {plural(zero.length, 'zero adjustment')} · {plural(wind.length, 'wind record')}
      </p>
      {picture !== null && (
        <div
          className="w-full overflow-hidden rounded-md border border-border [&>svg]:h-auto [&>svg]:w-full"
          role="img"
          aria-label="Metal bouts and wind as the summary image will show them"
          data-testid="coach-preview-picture"
          dangerouslySetInnerHTML={{ __html: picture.svg }}
        />
      )}
      {wind.length > 0 && windBadgeOf(wind) === null && (
        <p className="text-xs text-muted-foreground" data-testid="coach-preview-wind-unknown">
          The wind record does not name a strength (none, light, moderate or strong), so the summary image shows no wind badge.
        </p>
      )}
      {zero.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Zero adjustments</p>
          <ul className="flex flex-col gap-1 text-sm" data-testid="coach-preview-zero">
            {zero.map((z, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-muted-foreground">{localTime(z.at)}</span>
                <span>{zeroClicksLabel(z)}</span>
                {z.note !== null && z.note.trim() !== '' && <span className="text-muted-foreground">{z.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
