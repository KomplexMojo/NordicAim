import { expect, test, type Page } from '@playwright/test';

// M29 (coach-context-import.md §5-§6, REV-159): attach a 545 Coach export to one session from the Sessions list, preview it, Add,
// see the summary image take it in; the same records cannot go on a second session; re-attaching replaces; Remove frees them.
// The export here is made up in the test, shaped like the real one (the owner's real file stays in fixtures/private/).

interface HookCoach {
  metal: Array<{ fingerprint: string; record: { position: string } }>;
  zero: unknown[];
  wind: unknown[];
}

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    getSession(sessionId: string): Promise<{ sessionDate: string; artifacts: Array<{ id: string; heightPx: number }> } | null>;
    getCoachContext(sessionId: string): Promise<HookCoach | null>;
  };
};

// OpenCV loads in the worker and two demo sessions run through the pipeline, plus several summary-image renders.
test.setTimeout(240_000);

function coachFile(day: string, bouts = 4): Record<string, unknown> {
  const hits = [
    [true, true, false, true, true],
    [true, false, false, true, true],
    [true, true, true, true, true],
    [false, true, true, true, false],
  ];
  return {
    format: 'coach-context',
    formatVersion: 1,
    source: { app: '545-coach', appVersion: '0.0.0-test', exportedAt: '2026-10-01T08:00:00.000Z' },
    athleteHint: null,
    range: { from: day, to: day },
    metalSessions: hits.slice(0, bouts).map((discHits, i) => ({
      sessionDate: day,
      position: i % 2 === 0 ? 'prone' : 'standing',
      discHits,
      comboGroup: i < 2 ? 'g-1' : 'g-2',
      hitRate: discHits.filter(Boolean).length / 5,
      targetZone: i % 2 === 0 ? null : 2,
      race: null,
    })),
    // Noon UTC is the same calendar day in every timezone the tests run in.
    zeroAdjustments: [{ at: `${day}T12:00:00.000Z`, verticalClicks: 2, horizontalClicks: -1, note: 'after confirm' }],
    windConditions: [{ sessionDate: day, speedKph: null, direction: null, note: 'none' }],
    conventions: {
      discOrder: 'alpha, beta, charlie, delta, echo — left to right downrange',
      zeroClicks: '+ up / + right, − down / − left',
      windDirection: 'clock position wind blows FROM, facing the target',
      windStrength: 'band only (none, light, moderate, strong)',
    },
  };
}

const hook = (page: Page) => page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
const coachOf = (page: Page, sid: string) => page.evaluate((id) => (window as HookWindow).__asaTest!.getCoachContext(id), sid);
async function latestHeight(page: Page, sid: string): Promise<number | null> {
  const s = await page.evaluate((id) => (window as HookWindow).__asaTest!.getSession(id), sid);
  return s?.artifacts.at(-1)?.heightPx ?? null;
}

async function openCoach(page: Page, sid: string): Promise<void> {
  await page.goto('/#/');
  await page.locator(`[data-testid="session-coach"][data-session-id="${sid}"]`).click();
  await expect(page.getByTestId('coach-dialog')).toBeVisible();
}

async function pick(page: Page, content: string): Promise<void> {
  await page.getByTestId('coach-file-input').setInputFiles({ name: 'coach-context.json', mimeType: 'application/json', buffer: Buffer.from(content) });
}

test('attach 545 Coach data: preview, Add, duplicate refused, re-attach replaces, Remove frees it', async ({ page }) => {
  await page.goto('/#/');
  await hook(page);
  const first = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const second = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const day = (await page.evaluate((id) => (window as HookWindow).__asaTest!.getSession(id), first))!.sessionDate;

  await expect.poll(() => latestHeight(page, first), { timeout: 60_000 }).not.toBeNull();
  const plain = (await latestHeight(page, first))!;

  // A file that is not a 545 Coach export is refused by name, and nothing is written.
  await openCoach(page, first);
  await expect(page.getByTestId('coach-none')).toBeVisible();
  await pick(page, '{"format":"nordic-aim-backup"}');
  await expect(page.getByTestId('coach-error')).toContainText('not a 545 Coach export');
  expect(await coachOf(page, first)).toBeNull();

  // Attach → preview → Add.
  await pick(page, JSON.stringify(coachFile(day)));
  await expect(page.getByTestId('coach-preview')).toBeVisible();
  await expect(page.getByTestId('coach-preview-counts')).toHaveText('4 metal bouts · 1 zero adjustment · 1 wind record');
  await expect(page.locator('[data-testid="coach-preview-picture"] g.metal-bout')).toHaveCount(4);
  await expect(page.locator('[data-testid="coach-preview-picture"] g.wind-icon')).toHaveAttribute('data-wind', 'none');
  await expect(page.getByTestId('coach-preview-zero')).toContainText('2 up · 1 left');
  await page.getByTestId('coach-add').click();
  await expect(page.getByTestId('coach-dialog')).toBeHidden();
  await expect.poll(async () => (await coachOf(page, first))?.metal.length ?? 0).toBe(4);
  await expect(page.locator(`[data-testid="session-coach"][data-session-id="${first}"]`)).toHaveAttribute('data-attached', 'true');
  // The summary image is drawn again with one disc row per bout.
  await expect.poll(() => latestHeight(page, first), { timeout: 60_000 }).toBe(plain + 46 + 4 * 34);

  // The same records on a second session: refused by name, nothing written.
  await openCoach(page, second);
  await pick(page, JSON.stringify(coachFile(day)));
  await page.getByTestId('coach-add').click();
  await expect(page.getByTestId('coach-error')).toContainText('already attached to');
  expect(await coachOf(page, second)).toBeNull();
  await page.getByTestId('coach-cancel').click();
  await page.getByTestId('coach-close').click();

  // Re-attaching to the first session replaces what it had: two bouts, not six.
  await openCoach(page, first);
  await pick(page, JSON.stringify(coachFile(day, 2)));
  await expect(page.locator('[data-testid="coach-preview-picture"] g.metal-bout')).toHaveCount(2);
  await page.getByTestId('coach-add').click();
  await expect(page.getByTestId('coach-dialog')).toBeHidden();
  await expect.poll(async () => (await coachOf(page, first))?.metal.length ?? 0).toBe(2);
  await expect.poll(() => latestHeight(page, first), { timeout: 60_000 }).toBe(plain + 46 + 2 * 34);

  // Remove clears it, the summary returns to its plain height, and the records can now go on the second session.
  await openCoach(page, first);
  await page.getByTestId('coach-remove').click();
  await expect(page.getByTestId('coach-dialog')).toBeHidden();
  await expect.poll(() => coachOf(page, first)).toBeNull();
  await expect.poll(() => latestHeight(page, first), { timeout: 60_000 }).toBe(plain);

  await openCoach(page, second);
  await pick(page, JSON.stringify(coachFile(day)));
  await page.getByTestId('coach-add').click();
  await expect(page.getByTestId('coach-dialog')).toBeHidden();
  await expect.poll(async () => (await coachOf(page, second))?.metal.length ?? 0).toBe(4);
});
