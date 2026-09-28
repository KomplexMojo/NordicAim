// REV-47 (analysis-pipeline §1), REV-136: which main tab a route belongs to, and where the tab bar is hidden.

import { describe, expect, it } from 'vitest';

import { MAIN_TABS, activeTab, inSettings, showsTabBar } from '@/lib/app/nav';

describe('MAIN_TABS', () => {
  it('is Sessions, Analysis, Patterns in that order', () => {
    expect(MAIN_TABS.map((t) => [t.label, t.to])).toEqual([
      ['Sessions', '/'],
      ['Analysis', '/analysis'],
      ['Patterns', '/patterns'],
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

  it('marks Analysis and Patterns', () => {
    expect(activeTab('/analysis')).toBe('analysis');
    expect(activeTab('/patterns')).toBe('patterns');
  });

  it('marks no tab on Settings and Diagnostics, which belong to the header gear', () => {
    for (const path of ['/settings', '/settings/backing-card', '/diagnostics']) {
      expect(activeTab(path)).toBeNull();
      expect(inSettings(path)).toBe(true);
    }
    for (const path of ['/', '/analysis', '/patterns', '/sessions/abc', '/settingsx']) expect(inSettings(path)).toBe(false);
  });
});

describe('showsTabBar', () => {
  it('is hidden on the full-screen capture screens only', () => {
    expect(showsTabBar('/sessions/abc/capture')).toBe(false);
    expect(showsTabBar('/settings/backing-card')).toBe(false);
    expect(showsTabBar('/settings/template-sheet/precision')).toBe(false);
    expect(showsTabBar('/')).toBe(true);
    expect(showsTabBar('/sessions/abc/metadata')).toBe(true);
    expect(showsTabBar('/settings')).toBe(true);
    expect(showsTabBar('/diagnostics')).toBe(true);
  });
});
