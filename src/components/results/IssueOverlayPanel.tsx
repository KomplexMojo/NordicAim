import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { ISSUE_OVERLAYS, issueById } from '@/lib/issues/catalog';
import { cn } from '@/lib/utils';

interface IssueOverlayPanelProps {
  /** The chosen issue ids, in the order they were chosen. */
  selected: readonly string[];
  onChange(next: string[]): void;
  className?: string;
}

/**
 * REV-74/REV-76: toggles for the shooting issues in the coaching chart. Each one that is on draws its region over the target
 * diagram. Kept small so the diagram stays in view: one or two words each with radio-style dots, the full text on hover (and
 * in the caption for touch). On a phone the toggles are one scrolling row above the diagram; from `lg` up they are a column
 * beside it. Several can be on at once.
 */
export function IssueOverlayPanel({ selected, onChange, className }: IssueOverlayPanelProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  const active = selected.map((id) => issueById(id)).filter((issue) => issue !== undefined);
  return (
    <div className={cn('min-w-0 rounded-lg border px-3', className)} data-testid="issue-panel">
      <CollapsiblePanel
        panelId="issues"
        title="Shooting issues"
        summary={selected.length === 0 ? 'none shown' : `${selected.length} shown`}
        defaultOpen={false}
      >
        <div className="flex flex-col gap-1 pb-2">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible" aria-label="Shooting issues">
            {ISSUE_OVERLAYS.map((issue) => {
              const on = selected.includes(issue.id);
              const full = `${issue.letter !== '' ? `${issue.letter}) ` : ''}${issue.label}`;
              return (
                <li key={issue.id} className="shrink-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={full}
                    title={full}
                    data-testid={`issue-toggle-${issue.id}`}
                    onClick={() => toggle(issue.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md border px-2 text-left text-xs lg:min-h-8',
                      on ? 'border-primary bg-primary/10 font-medium' : 'border-border',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('flex size-3.5 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary' : 'border-muted-foreground')}
                    >
                      {on && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    {issue.letter !== '' && <span className="text-muted-foreground">{issue.letter}</span>}
                    {issue.short}
                  </button>
                </li>
              );
            })}
          </ul>
          <div aria-live="polite" data-testid="issue-caption" className="text-xs text-muted-foreground">
            {active.map((issue) => (
              <p key={issue.id}>{`${issue.letter !== '' ? `${issue.letter}) ` : ''}${issue.label}`}</p>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="min-h-11 self-start text-xs text-primary underline underline-offset-4 lg:min-h-8"
              data-testid="issue-clear"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
