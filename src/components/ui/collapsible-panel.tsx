import { ChevronDown } from 'lucide-react';
import { useId, useSyncExternalStore, type ReactNode } from 'react';

import { readPanelOpen, subscribePanels, writePanelOpen } from '@/lib/ui/panel-state';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  /** Stable key the open/closed choice is remembered under; every panel with the same id shares it. */
  panelId: string;
  /** Always visible: what the panel is, and, collapsed, the one fact that matters. */
  title: string;
  summary?: string;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Issue #14: a block of on-screen review text the user can minimise. The whole label row is the button
 * (≥ 44 px), and the choice sticks on this device. Never wrap a diagram, a headline score or a needs-attention state.
 */
export function CollapsiblePanel({ panelId, title, summary, defaultOpen, className, children }: CollapsiblePanelProps) {
  const open = useSyncExternalStore(
    subscribePanels,
    () => readPanelOpen(panelId, defaultOpen),
    () => defaultOpen,
  );
  const bodyId = useId();
  return (
    <div className={className} data-testid={`panel-${panelId}`} data-open={open}>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => writePanelOpen(panelId, !open)}
        data-testid={`panel-toggle-${panelId}`}
      >
        <span className="min-w-0">
          <span className="font-medium">{title}</span>
          {summary !== undefined && !open && (
            <span className="ml-2 text-muted-foreground" data-testid={`panel-summary-${panelId}`}>
              {summary}
            </span>
          )}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
