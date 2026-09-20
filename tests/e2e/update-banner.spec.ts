import { expect, test } from '@playwright/test';

// REV-101 (#43): a newer deployed build shows a tappable banner on Home; the same build shows none.

test('no banner when the deployed build is the running one', async ({ page }) => {
  await page.goto('/#/');
  const running = (await page.getByTestId('app-version').textContent())!;
  test.skip(!/^[0-9a-f]{7}$/.test(running), 'a dev build has no sha to compare');
  await page.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sha: running, builtAt: '2026-09-20T00:00:00Z' }) }));
  await page.reload();
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('a newer deployed build shows the banner, and tapping it reloads the app', async ({ page }) => {
  await page.goto('/#/');
  const running = (await page.getByTestId('app-version').textContent())!;
  test.skip(!/^[0-9a-f]{7}$/.test(running), 'a dev build has no sha to compare');
  await page.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sha: 'deadbee', builtAt: '2026-09-20T00:00:00Z' }) }));
  await page.reload();
  const banner = page.getByTestId('update-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(`${running} → deadbee`);

  const nav = page.waitForURL(/[?&]u=\d+/);
  await banner.click();
  await nav;
  await expect(page.getByTestId('app-version')).toBeVisible();
});

test('offline or an unreadable file is silent', async ({ page }) => {
  await page.route('**/version.json*', (route) => route.abort());
  await page.goto('/#/');
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});
