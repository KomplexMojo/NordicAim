// REV-47 (analysis-pipeline §1): which main tab a route belongs to, and where the tab bar is hidden.

import { describe, expect, it } from 'vitest';

import { MAIN_TABS, activeTab, showsTabBar } from '@/lib/app/nav';

describe('MAIN_TABS', () => {
  it('is Sessions, Settings, Diagnostics in that order', () => {
    expect(MAIN_TABS.map((t) => [t.label, t.to])).toEqual([
      ['Sessions', '/'],
      ['Settings', '/settings'],
      ['Diagnostics', '/diagnostics'],
    ]);
  });
});

describe('activeTab', () => {
  it('puts home, every session route and review under Sessions', () => {
    for (const path of [
      '/',
      '/sessions',
      '/sessions/abc',
      '/sessions/abc/metadata',
      '/sessions/abc/results',
      '/sessions/abc/photos/p1',
      '/sessions/abc/photos/p1/adjust',
      '/review/abc',
    ]) {
      expect(activeTab(path)).toBe('shooting');
    }
  });

  it('marks Settings and Diagnostics', () => {
    expect(activeTab('/settings')).toBe('settings');
    expect(activeTab('/settings/backing-card')).toBe('settings');
    expect(activeTab('/diagnostics')).toBe('diagnostics');
  });
});

describe('showsTabBar', () => {
  it('is hidden on the full-screen capture screens only', () => {
    expect(showsTabBar('/sessions/abc/capture')).toBe(false);
    expect(showsTabBar('/settings/backing-card')).toBe(false);
    expect(showsTabBar('/')).toBe(true);
    expect(showsTabBar('/sessions/abc/metadata')).toBe(true);
    expect(showsTabBar('/settings')).toBe(true);
    expect(showsTabBar('/diagnostics')).toBe(true);
  });
});
