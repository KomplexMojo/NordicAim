/**
 * M15 step 1: a consistent charcoal header across every screen that shows the tab bar, with the app name.
 * `env(safe-area-inset-top)` padding clears the iPhone notch / Dynamic Island. It scrolls with the page
 * (not fixed), so it never needs the tab bar's bottom-padding trick.
 *
 * It carried a Home link until 2026-09-19. With the Shooting tab always on screen that was a third way
 * Home, alongside each page's own "Home" link — the owner: "we're reproducing functionality in various
 * places". Home is the tab; a screen's own link is now its parent ("All sessions", "Back to results").
 */
export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-30 flex min-h-11 items-center justify-between gap-2 bg-[var(--header)] px-4 pt-[env(safe-area-inset-top)] text-white"
      data-testid="app-header"
    >
      <span className="py-2 text-sm font-semibold">NordicAim</span>
    </header>
  );
}
