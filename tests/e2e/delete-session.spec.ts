import { expect, test } from '@playwright/test';

// REV-61 / issue #18: deleting a session takes one screen with a slide and removes everything attached to it.

type HookWindow = Window & {
  __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> };
};

test.setTimeout(240_000);

test('a session is deleted only from the one delete screen, by sliding; cancelling deletes nothing', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const doomedId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const keptId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  expect(keptId).not.toBe(doomedId);

  // Home is the one screen that lists every session, and Delete is on it (REV-72).
  await page.goto('/#/');
  const doomedDelete = page.locator(`[data-testid="session-delete"][data-session-id="${doomedId}"]`);
  await expect(doomedDelete).toBeVisible();
  const rowsBefore = await page.getByTestId('session-delete').count();
  expect(rowsBefore).toBeGreaterThanOrEqual(2);

  // Cancel at step 1 deletes nothing.
  const dialog = page.getByTestId('delete-session-dialog');
  await doomedDelete.click();
  // REV-117: one screen: the session, what goes with it, the backup note and the slide are all here.
  await expect(page.getByTestId('delete-counts')).toContainText(/Photos/);
  await expect(page.getByTestId('delete-backup-note')).toContainText('not made a backup');
  await expect(page.getByTestId('slide-to-delete')).toBeVisible();
  await page.getByTestId('delete-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore);

  // Escape closes it too and deletes nothing.
  await doomedDelete.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore);

  // The full path: the destructive button stays disabled until the exact phrase is typed.
  await doomedDelete.click();
  await expect(dialog).toBeVisible();
  const track = page.getByTestId('slide-to-delete');
  const handle = page.getByTestId('slide-handle');
  await expect(track).toHaveAttribute('data-state', 'idle');

  // A tap does nothing.
  await handle.click();
  await expect(track).toHaveAttribute('data-state', 'idle');

  // Sliding all the way but letting go before the hold is up cancels: the handle springs back and nothing is deleted.
  // The handle springs back over 150 ms after a release; read its position only once it has stopped moving.
  const atRest = async () => {
    let last = JSON.stringify(await handle.boundingBox());
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(100);
      const now = JSON.stringify(await handle.boundingBox());
      if (now === last) return;
      last = now;
    }
  };
  const drag = async (holdMs: number, release: boolean) => {
    await atRest();
    const h = (await handle.boundingBox())!;
    const t = (await track.boundingBox())!;
    const y = h.y + h.height / 2;
    await page.mouse.move(h.x + h.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width - 10, y, { steps: 12 });
    await page.waitForTimeout(holdMs);
    if (release) await page.mouse.up();
  };
  await drag(300, true);
  await expect(track).toHaveAttribute('data-state', 'idle');
  await expect(dialog).toBeVisible();

  // Sliding only part of the way and holding does nothing either.
  {
    await atRest();
    const h = (await handle.boundingBox())!;
    const t = (await track.boundingBox())!;
    const y = h.y + h.height / 2;
    await page.mouse.move(h.x + h.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2, y, { steps: 8 });
    await page.waitForTimeout(1300);
    await expect(track).not.toHaveAttribute('data-state', 'done');
    await page.mouse.up();
  }
  await expect(dialog).toBeVisible();

  // Slide to the trash and hold: only then is it deleted.
  // Holding at the trash completes the delete, which closes the dialog; wait for that (not for a transient 'done' state), then let go.
  await drag(0, false);
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await page.mouse.up();
  await expect(doomedDelete).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore - 1);
  await expect(page.locator(`[data-testid="session-delete"][data-session-id="${keptId}"]`)).toBeVisible();

  // Gone from Home too, and the other session still opens with its results.
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByTestId('session-list').locator('a[href*="' + doomedId + '"]')).toHaveCount(0);
  await page.goto(`/#/sessions/${keptId}/results`);
  await expect(page.getByTestId('target-card').first()).toBeVisible({ timeout: 30_000 });
});

test('there is no separate Sessions screen: the old address lands on Home, which lists every session', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  }
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/sessions');
  await expect(page).toHaveURL(/#\/$/);
  // All seven, not just the most recent few, each with Delete.
  await expect(page.getByTestId('session-delete')).toHaveCount(7);
  await expect(page.getByTestId('open-patterns')).toBeVisible();
});

test('the slide can be done from the keyboard: a tap of Enter does nothing, holding it deletes (#27)', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const id = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto('/#/');
  await page.locator(`[data-testid="session-delete"][data-session-id="${id}"]`).click();
  const dialog = page.getByTestId('delete-session-dialog');
  await expect(dialog).toBeVisible();
  const track = page.getByTestId('slide-to-delete');
  const handle = page.getByTestId('slide-handle');

  await handle.focus();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.up('Enter');
  await expect(track).toHaveAttribute('data-state', 'idle');
  await expect(dialog).toBeVisible();

  await page.keyboard.down('Enter');
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await page.keyboard.up('Enter');
  await expect(page.locator(`[data-testid="session-delete"][data-session-id="${id}"]`)).toHaveCount(0);
});

test('many sessions: rows show the time, and a search box filters them (REV-93)', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  }
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto('/#/');
  await expect(page.getByTestId('session-when').first()).toHaveText(/\d{4}-\d{2}-\d{2} · \d{2}:\d{2}/);
  const search = page.getByTestId('session-search');
  await expect(search).toBeVisible();
  const total = await page.getByTestId('session-when').count();
  await search.fill('zzzz-no-such-session');
  await expect(page.getByTestId('session-search-empty')).toBeVisible();
  await expect(page.getByTestId('session-when')).toHaveCount(0);
  await search.fill('');
  await expect(page.getByTestId('session-when')).toHaveCount(total);
});
