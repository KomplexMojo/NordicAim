import { Settings, Stethoscope } from 'lucide-react';
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

const ICONS: Record<MainTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  shooting: SessionsIcon,
  settings: Settings,
  diagnostics: Stethoscope,
};

/**
 * REV-47 (analysis-pipeline §1): the three main screens, one tap apart. Fixed to the bottom, clear of
 * the home indicator (`env(safe-area-inset-bottom)`), three targets of at least 44 px, each an icon
 * and a label, the active one marked. The layout (`AppShell` in `src/app/router.tsx`) pads the page so the bar
 * never covers content.
 */
export function TabBar({ active }: { active: MainTab }) {
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
