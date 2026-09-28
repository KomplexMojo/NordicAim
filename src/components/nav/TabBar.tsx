import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router';

import { MAIN_TABS, type MainTab } from '@/lib/app/nav';
import { cn } from '@/lib/utils';

/** REV-111/112: the Sessions tab's icon: a camera. */
function SessionsIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 8h4l1.6-2.5h6.8L17 8h4v12H3z" />
      <circle cx="12" cy="13.5" r="3.8" />
    </svg>
  );
}

/** REV-123: Analysis, a rising line on axes (moved from the header by REV-136). */
function AnalysisIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4v16h16" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

/** REV-109: Patterns, a scatter of shots in a ring (moved from the header by REV-136). */
function PatternsIcon({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICONS: Record<MainTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  shooting: SessionsIcon,
  analysis: AnalysisIcon,
  patterns: PatternsIcon,
};

/**
 * REV-47 (analysis-pipeline §1), REV-136: the three main screens (Sessions, Analysis, Patterns), one tap apart. Fixed to the bottom, clear of
 * the home indicator (`env(safe-area-inset-bottom)`), three targets of at least 44 px, each an icon
 * and a label, the active one marked (none on Settings and Diagnostics, which the header's gear opens). The layout (`AppShell` in `src/app/router.tsx`) pads the page so the bar
 * never covers content.
 */
export function TabBar({ active }: { active: MainTab | null }) {
  return (
    <nav
      aria-label="Main"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {MAIN_TABS.map((tab) => {
          const Icon = ICONS[tab.id];
          const isActive = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`tab-${tab.id}`}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs',
                  isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
