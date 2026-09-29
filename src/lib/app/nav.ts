// REV-47 (analysis-pipeline §1), REV-136: the three main screens on the tab bar, which one a route belongs to, and the header's
// Settings control. Pure.

export type MainTab = 'shooting' | 'analysis' | 'patterns';

export const MAIN_TABS: ReadonlyArray<{ id: MainTab; label: string; to: string }> = [
  { id: 'shooting', label: 'Sessions', to: '/' },
  { id: 'analysis', label: 'Analysis', to: '/analysis' },
  { id: 'patterns', label: 'Patterns', to: '/patterns' },
];

/** Settings and the Diagnostics screen reached from it (REV-136): the header's gear is marked there, and no tab is. */
export function inSettings(pathname: string): boolean {
  return /^\/(settings|diagnostics)(\/|$)/.test(pathname);
}

/**
 * The tab a hash-router pathname belongs to: Analysis, Patterns, none on Settings and Diagnostics, else Sessions
 * (`/`, `/sessions/...`, `/review/...`).
 */
export function activeTab(pathname: string): MainTab | null {
  if (inSettings(pathname)) return null;
  if (pathname === '/analysis' || pathname.startsWith('/analysis/')) return 'analysis';
  if (pathname === '/patterns' || pathname.startsWith('/patterns/')) return 'patterns';
  return 'shooting';
}

/**
 * The full-screen capture screens have no tab bar: `/sessions/:sid/capture`, `/settings/backing-card` and
 * `/settings/template-sheet/:template` (REV-121).
 */
export function showsTabBar(pathname: string): boolean {
  if (/^\/sessions\/[^/]+\/capture\/?$/.test(pathname)) return false;
  if (/^\/settings\/backing-card\/?$/.test(pathname)) return false;
  if (/^\/settings\/template-sheet\/[^/]+\/?$/.test(pathname)) return false;
  return true;
}

/**
 * Issue #72 (REV-140): where a target screen opened from Patterns or Analysis goes back to. Carried in the navigation state
 * as `{ from: { path, label } }`; anything else (or no state) means the session's results, as before.
 */
export interface BackTo {
  path: string;
  label: string;
}

export function backToFrom(state: unknown, sessionId: string): BackTo {
  const from = typeof state === 'object' && state !== null ? (state as { from?: unknown }).from : undefined;
  if (typeof from === 'object' && from !== null) {
    const { path, label } = from as { path?: unknown; label?: unknown };
    if (typeof path === 'string' && /^\/(patterns|analysis)(\?|$)/.test(path) && typeof label === 'string' && label.length > 0) {
      return { path, label };
    }
  }
  return { path: `/sessions/${sessionId}/results`, label: 'Back to results' };
}
