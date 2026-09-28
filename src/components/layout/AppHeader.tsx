import { Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { inSettings } from '@/lib/app/nav';
import { brandMotif } from '@/lib/render/brand-mark';

/**
 * M15 step 1: a consistent charcoal header across every screen that shows the tab bar, with the app mark and name on the left (REV-109)
 * and **Settings** at the right, a gear with its title under it (REV-136: where people expect it; Analysis and Patterns moved to the
 * tab bar, and Diagnostics is opened from Settings). `env(safe-area-inset-top)` padding clears the iPhone notch / Dynamic Island. It
 * scrolls with the page (not fixed), so it never needs the tab bar's bottom-padding trick.
 *
 * It carried a Home link until 2026-09-19. With the Sessions tab always on screen that was a third way Home, alongside each page's own
 * "Home" link: Home is the tab; a screen's own link is now its parent ("All sessions", "Back to results").
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const onSettings = inSettings(pathname);
  return (
    <header
      className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 bg-[var(--header)] px-4 pt-[env(safe-area-inset-top)] text-white"
      data-testid="app-header"
    >
      <Link to="/" className="flex min-h-11 items-center gap-2 py-2" aria-label="NordicAim: back to sessions" data-testid="app-home-link">
        <svg
          viewBox="0 0 100 100"
          className="size-8 shrink-0"
          aria-hidden="true"
          data-testid="app-mark"
          dangerouslySetInnerHTML={{ __html: brandMotif(0, 0, 100) }}
        />
        <span className="text-base font-semibold">NordicAim</span>
      </Link>
      <Link
        to="/settings"
        className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-xs hover:bg-white/10"
        aria-current={onSettings ? 'page' : undefined}
        data-testid="open-settings"
      >
        <Settings aria-hidden className="size-6" strokeWidth={1.8} />
        <span className={onSettings ? 'font-semibold underline underline-offset-2' : ''}>Settings</span>
      </Link>
    </header>
  );
}
