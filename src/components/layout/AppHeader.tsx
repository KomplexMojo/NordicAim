import { Link, useLocation } from 'react-router';

/**
 * M15 step 1: a consistent charcoal header across every screen that shows the tab bar. Shows the app
 * name and, everywhere but Home, a Home link. `env(safe-area-inset-top)` padding clears the iPhone
 * notch / Dynamic Island. It scrolls with the page (not fixed), so it never needs the tab bar's
 * bottom-padding trick.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  return (
    <header
      className="sticky top-0 z-30 flex min-h-11 items-center justify-between gap-2 bg-[var(--header)] px-4 pt-[env(safe-area-inset-top)] text-white"
      data-testid="app-header"
    >
      <span className="py-2 text-sm font-semibold">Nordic Aim</span>
      {!isHome && (
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-sm text-white underline underline-offset-4"
          data-testid="app-header-home"
        >
          Home
        </Link>
      )}
    </header>
  );
}
