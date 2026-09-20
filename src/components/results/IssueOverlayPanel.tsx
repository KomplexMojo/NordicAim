import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { Button } from '@/components/ui/button';
import { ISSUE_OVERLAYS } from '@/lib/issues/catalog';

interface IssueOverlayPanelProps {
  /** The chosen issue ids, in the order they were chosen. */
  selected: readonly string[];
  onChange(next: string[]): void;
}

/**
 * REV-74: toggles for the shooting issues in the coaching chart. Each one that is on draws its region over the target diagram
 * beside it, so a group's shape can be compared with the pattern each fault produces. Collapsible, closed by default.
 */
export function IssueOverlayPanel({ selected, onChange }: IssueOverlayPanelProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="rounded-lg border px-3" data-testid="issue-panel">
      <CollapsiblePanel
        panelId="issues"
        title="Shooting issues"
        summary={selected.length === 0 ? 'none shown' : `${selected.length} shown`}
        defaultOpen={false}
      >
        <div className="flex flex-col gap-1 pb-3">
          <p className="text-xs text-muted-foreground">
            Turn one on to draw the area where that fault usually puts shots over the diagram.
          </p>
          <ul className="flex flex-col gap-1">
            {ISSUE_OVERLAYS.map((issue) => {
              const on = selected.includes(issue.id);
              return (
                <li key={issue.id}>
                  <Button
                    type="button"
                    variant={on ? 'default' : 'outline'}
                    className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left text-sm"
                    aria-pressed={on}
                    data-testid={`issue-toggle-${issue.id}`}
                    onClick={() => toggle(issue.id)}
                  >
                    {issue.letter !== '' && <span className="mr-2 font-semibold">{issue.letter})</span>}
                    {issue.label}
                  </Button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <Button type="button" variant="ghost" className="h-11" data-testid="issue-clear" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
