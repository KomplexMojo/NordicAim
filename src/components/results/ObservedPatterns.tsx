import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import type { Characteristics } from '@/lib/scoring/characteristics';

const one = (v: number | null, unit: string): string => (v === null ? '—' : `${v.toFixed(1)} ${unit}`);

/**
 * REV-88: what the group of shots looks like, and the potential shooting issues that look matches. Shown on a target's screen (worked out
 * when its analysis is saved) and on Patterns (worked out over the whole set of shots on screen). The rules are provisional
 * (`docs/spec/shooting-issues.md`), so the wording is 'potential', not a verdict.
 */
export function ObservedPatterns({ characteristics, scope }: { characteristics: Characteristics | null | undefined; scope: string }) {
  if (characteristics === null || characteristics === undefined || characteristics.n === 0) return null;
  const c = characteristics;
  const found = c.issues.length;
  return (
    <div className="rounded-lg border px-3" data-testid="observed-patterns">
      <CollapsiblePanel
        panelId="observed"
        title="Observed patterns"
        summary={!c.enough ? `need ${5} shots` : found === 0 ? 'no issues' : `${found} potential ${found === 1 ? 'issue' : 'issues'}`}
        defaultOpen
      >
        <div className="flex flex-col gap-2 pb-3 text-sm">
          <p className="text-xs text-muted-foreground">{scope}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="characteristics">
            <dt className="text-muted-foreground">Group size (grouping)</dt>
            <dd>
              {one(c.esMoa, 'MOA')} · {one(c.esMm, 'mm')}
            </dd>
            <dt className="text-muted-foreground">Mean radius (precision)</dt>
            <dd>
              {one(c.meanRadiusMoa, 'MOA')} · {one(c.meanRadiusMm, 'mm')}
            </dd>
            <dt className="text-muted-foreground">Centre off the bullseye (accuracy)</dt>
            <dd>{one(c.offsetMoa, 'MOA')}</dd>
            <dt className="text-muted-foreground">RMS from the bullseye</dt>
            <dd>{one(c.accuracyMm, 'mm')}</dd>
            <dt className="text-muted-foreground">Shape</dt>
            <dd>{c.shape ?? '—'}</dd>
            <dt className="text-muted-foreground">Flyers</dt>
            <dd>{c.flyers}</dd>
            <dt className="text-muted-foreground">Outside the black</dt>
            <dd>{c.outsideShare === null ? '—' : `${Math.round(c.outsideShare * 100)}%`}</dd>
          </dl>
          {c.enough && (
            <ul className="flex flex-col gap-1" data-testid="potential-issues">
              {c.issues.length === 0 && <li className="text-xs text-muted-foreground">No potential issues found.</li>}
              {c.issues.map((issue) => (
                <li key={issue.id} data-testid={`issue-${issue.id}`} className="rounded border px-2 py-1">
                  <span className="font-medium">{issue.label}</span>
                  <span className="block text-xs text-muted-foreground">{issue.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {!c.enough && <p className="text-xs text-muted-foreground">Patterns are only looked for from 5 shots.</p>}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
