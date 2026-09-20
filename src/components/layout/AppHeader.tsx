import { Link, useLocation } from 'react-router';

import { brandMotif } from '@/lib/render/brand-mark';

/**
 * M15 step 1: a consistent charcoal header across every screen that shows the tab bar, with the app mark and name on the left (REV-109)
 * and Patterns, an icon with its title, on the right. `env(safe-area-inset-top)` padding clears the iPhone notch / Dynamic Island. It
 * scrolls with the page (not fixed), so it never needs the tab bar's bottom-padding trick.
 *
 * It carried a Home link until 2026-09-19. With the Shooting tab always on screen that was a third way Home, alongside each page's own
 * "Home" link: Home is the tab; a screen's own link is now its parent ("All sessions", "Back to results").
 */
export function AppHeader() {
  const onPatterns = useLocation().pathname === '/patterns';
  return (
    <header
      className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 bg-[var(--header)] px-4 pt-[env(safe-area-inset-top)] text-white"
      data-testid="app-header"
    >
      <span className="flex items-center gap-2 py-2">
        <svg
          viewBox="0 0 100 100"
          className="size-8 shrink-0"
          aria-hidden="true"
          data-testid="app-mark"
          dangerouslySetInnerHTML={{ __html: brandMotif(0, 0, 100) }}
        />
        <span className="text-base font-semibold">NordicAim</span>
      </span>
      <Link
        to="/patterns"
        className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-xs hover:bg-white/10"
        aria-current={onPatterns ? 'page' : undefined}
        data-testid="open-patterns"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="14" cy="9" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
        <span className={onPatterns ? 'font-semibold underline underline-offset-2' : ''}>Patterns</span>
      </Link>
    </header>
  );
}
