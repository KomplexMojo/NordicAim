import { expect, test, type Page } from '@playwright/test';

// REV-100 (#41): set a passphrase, the summary carries the athlete's line and stamp, Verify confirms it.

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    getSession(sessionId: string): Promise<{ artifacts: Array<{ id: string }> } | null>;
  };
};

test.setTimeout(240_000);
const PASS = 'correct horse battery staple';

async function storedProvenance(page: Page, artifactId: string): Promise<{ payload: string; stamp: string } | null> {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('asa');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('blobs').objectStore('blobs').get(`artifact:${id}:json`);
          get.onsuccess = async () => {
            const stored = get.result as { bytes: ArrayBuffer } | undefined;
            if (stored === undefined) return resolve(null);
            const parsed = JSON.parse(new TextDecoder().decode(stored.bytes)) as { provenance?: { payload: string; stamp: string } };
            resolve(parsed.provenance ?? null);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    artifactId,
  );
}

test('a passphrase stamps the summary and Verify confirms it (and rejects a wrong passphrase or stamp)', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill('Jane Doe');
  await page.getByTestId('athlete-club').fill('Caledonia Nordic Ski Club');
  await page.getByTestId('athlete-club').blur();

  // Too short is refused.
  await page.getByTestId('athlete-passphrase').fill('short');
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('at least 12');
  await page.getByTestId('athlete-passphrase').fill(PASS);
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Key set', { timeout: 30_000 });
  await expect(page.getByTestId('key-fingerprint')).toHaveText(/^[0-9A-F]{8}$/);
  const fingerprint = (await page.getByTestId('key-fingerprint').textContent())!;

  // A summary built now carries the stamp; the sidecar holds the payload.
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => {
      const s = await page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId);
      const id = s?.artifacts.at(-1)?.id;
      return id === undefined ? null : (await storedProvenance(page, id))?.stamp ?? null;
    }, { timeout: 60_000 })
    .toMatch(new RegExp(`^${fingerprint}-[0-9A-F]{12}$`));
  const session = await page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId);
  const prov = (await storedProvenance(page, session!.artifacts.at(-1)!.id))!;
  expect(prov.payload).toContain('"name":"Jane Doe"');

  // Verify.
  await page.goto('/#/verify');
  await page.getByTestId('verify-session').selectOption(sessionId);
  await page.getByTestId('verify-stamp').fill(prov.stamp.toLowerCase());
  await page.getByTestId('verify-passphrase').fill(PASS);
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-result')).toHaveAttribute('data-status', 'match', { timeout: 30_000 });
  await expect(page.getByTestId('verify-summary')).toContainText('Jane Doe');

  await page.getByTestId('verify-passphrase').fill('not the right passphrase');
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-result')).toHaveAttribute('data-status', 'wrong-passphrase', { timeout: 30_000 });

  await page.getByTestId('verify-passphrase').fill(PASS);
  await page.getByTestId('verify-stamp').fill(`${fingerprint}-000000000000`);
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-result')).toHaveAttribute('data-status', 'no-match', { timeout: 30_000 });
});

test('changing the name in Settings rebuilds the summary with the new identity', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 60_000 });
  const latest = async () => (await page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId))?.artifacts.at(-1)?.id;
  const first = await latest();

  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill('Jane Doe');
  await page.getByTestId('athlete-name').blur();
  await page.getByTestId('athlete-passphrase').fill(PASS);
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Key set', { timeout: 30_000 });

  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect.poll(latest, { timeout: 60_000 }).not.toBe(first);
  const prov = await storedProvenance(page, (await latest())!);
  expect(prov?.payload).toContain('"name":"Jane Doe"');
});
