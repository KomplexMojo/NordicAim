// REV-47 (analysis-pipeline §1): the three main screens and which one a route belongs to. Pure.

export type MainTab = 'shooting' | 'settings' | 'diagnostics';

export const MAIN_TABS: ReadonlyArray<{ id: MainTab; label: string; to: string }> = [
  { id: 'shooting', label: 'Sessions', to: '/' },
  { id: 'settings', label: 'Settings', to: '/settings' },
  { id: 'diagnostics', label: 'Diagnostics', to: '/diagnostics' },
];

/** The tab a hash-router pathname belongs to: Settings, Diagnostics, else Shooting (`/`, `/sessions/...`, `/review/...`). */
export function activeTab(pathname: string): MainTab {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  if (pathname === '/diagnostics' || pathname.startsWith('/diagnostics/')) return 'diagnostics';
  return 'shooting';
}

/** The full-screen capture screens have no tab bar: `/sessions/:sid/capture` and `/settings/backing-card`. */
export function showsTabBar(pathname: string): boolean {
  if (/^\/sessions\/[^/]+\/capture\/?$/.test(pathname)) return false;
  if (/^\/settings\/backing-card\/?$/.test(pathname)) return false;
  return true;
}
