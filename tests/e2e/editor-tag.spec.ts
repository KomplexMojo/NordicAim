import { expect, test, type Page } from '@playwright/test';

// REV-96 (#33): a tap never zooms or pans; a new shot gets a grab tag; dragging the tag moves the shot with a constant offset;
// the one zoom control sits on the picture.

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string }>>;
  };
};

test.setTimeout(240_000);

async function openTarget(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const photos = await page.evaluate((s) => (window as HookWindow).__asaTest!.listPhotos(s), sid);
  await page.goto(`/#/sessions/${sid}/photos/${photos[photos.length - 1]!.id}`);
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('image-stage').scrollIntoViewIfNeeded();
}

async function view(page: Page) {
  const stage = page.getByTestId('image-stage');
  return {
    zoom: await stage.getAttribute('data-zoom'),
    scale: await stage.getAttribute('data-scale'),
    ox: await stage.getAttribute('data-offset-x'),
    oy: await stage.getAttribute('data-offset-y'),
  };
}

test('a tap to add or select a shot never changes zoom or pan', async ({ page }) => {
  await openTarget(page);
  const stage = page.getByTestId('image-stage');
  const box = (await stage.boundingBox())!;
  const before = await view(page);

  // Bare paper near a corner of the photo: adds a shot.
  const count = page.locator('[data-testid="shot"]');
  const n = await count.count();
  await page.mouse.click(box.x + 40, box.y + 40);
  await expect(count).toHaveCount(n + 1);
  expect(await view(page)).toEqual(before);

  // Tapping the new shot (select) does not zoom either.
  const added = page.locator('[data-testid="shot"][data-selected="true"] circle').first();
  const ab = (await added.boundingBox())!;
  await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
  expect(await view(page)).toEqual(before);
});

test('the new shot has a grab tag; dragging the tag moves the shot by the same amount', async ({ page }) => {
  await openTarget(page);
  const box = (await page.getByTestId('image-stage').boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 60);
  const tag = page.getByTestId('shot-tag');
  await expect(tag).toHaveCount(1);

  const marker = () => page.locator('[data-testid="shot"][data-selected="true"] circle').first().boundingBox();
  const m0 = (await marker())!;
  const t0 = (await tag.locator('circle').boundingBox())!;
  const from = { x: t0.x + t0.width / 2, y: t0.y + t0.height / 2 };
  // The tag is clear of the hole: the finger on it would not cover the marker.
  expect(Math.hypot(from.x - (m0.x + m0.width / 2), from.y - (m0.y + m0.height / 2))).toBeGreaterThan(30);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 30, { steps: 4 });
  await page.mouse.move(from.x + 20, from.y + 50, { steps: 4 });
  await page.mouse.up();

  const m1 = (await marker())!;
  expect(m1.x + m1.width / 2 - (m0.x + m0.width / 2)).toBeCloseTo(20, 0);
  expect(m1.y + m1.height / 2 - (m0.y + m0.height / 2)).toBeCloseTo(50, 0);
});

test('one zoom control on the picture: + − Fit, and it never adds a shot', async ({ page }) => {
  await openTarget(page);
  const control = page.getByTestId('viewport-control');
  await expect(control).toBeVisible();
  const stage = page.getByTestId('image-stage');
  const shots = page.locator('[data-testid="shot"]');
  const n = await shots.count();

  await page.getByTestId('zoom-in').click();
  await expect(stage).not.toHaveAttribute('data-zoom', '1');
  await page.getByTestId('zoom-fit').click();
  await expect(stage).toHaveAttribute('data-zoom', '1');
  await expect(shots).toHaveCount(n);

  await stage.focus();
  await page.keyboard.press('+');
  await expect(stage).not.toHaveAttribute('data-zoom', '1');
  await page.keyboard.press('0');
  await expect(stage).toHaveAttribute('data-zoom', '1');
});
