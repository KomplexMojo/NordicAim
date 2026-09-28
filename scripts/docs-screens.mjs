#!/usr/bin/env node
// Regenerates the README and guide screenshots (docs/assets/) from the current app: the fake-camera test build with the demo
// sessions, plus a few earlier copies of them so Analysis and the coach image have a history to show. Nothing here is real
// athlete data, and no photo carries GPS (`pnpm check:privacy`).
//
//   pnpm docs:screens            # starts `pnpm dev:test` on 127.0.0.1:3874 if it is not already running
//
// Uses Playwright's Chromium (PLAYWRIGHT_CHROMIUM_PATH when set). Phone screens are 393 × 852 CSS px at 2× scale.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}docs/assets/`;
const BASE = 'http://127.0.0.1:3874';
const PHONE = { width: 393, height: 852 };

async function serverUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn('pnpm', ['dev:test'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i += 1) {
    if (await serverUp()) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('pnpm dev:test did not start on 127.0.0.1:3874');
}

/**
 * Copies every demo session `copies` times into earlier dates, each copy's shots shifted and spread a little more the
 * further back it goes (a steady improvement), then lets the pipeline re-score them. Runs in the page.
 */
async function addHistory(page, copies) {
  const clones = await page.evaluate(async (copies) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('asa');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = (store) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const keys = () =>
      new Promise((resolve, reject) => {
        const req = db.transaction('blobs').objectStore('blobs').getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const sessions = await all('sessions');
    const photos = await all('photos');
    const analyses = await all('analyses');
    const blobKeys = await keys();
    const blobs = new Map();
    for (const key of blobKeys) {
      if (!String(key).startsWith('photo:')) continue;
      blobs.set(
        key,
        await new Promise((resolve, reject) => {
          const req = db.transaction('blobs').objectStore('blobs').get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
      );
    }

    const shiftDate = (iso, days) => {
      const d = new Date(`${iso}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    };
    const out = [];
    const tx = db.transaction(['sessions', 'photos', 'analyses', 'blobs'], 'readwrite');
    for (let k = 1; k <= copies; k += 1) {
      for (const s of sessions) {
        const sid = crypto.randomUUID();
        const idMap = new Map(s.photoIds.map((pid) => [pid, crypto.randomUUID()]));
        const created = new Date(Date.parse(s.createdAt) - k * 6 * 86_400_000).toISOString();
        tx.objectStore('sessions').put({
          ...s,
          id: sid,
          sessionDate: shiftDate(s.sessionDate, k * 6),
          createdAt: created,
          updatedAt: created,
          photoIds: s.photoIds.map((pid) => idMap.get(pid)),
          artifacts: [],
          shares: [],
        });
        for (const p of photos.filter((p) => p.sessionId === s.id)) {
          const pid = idMap.get(p.id) ?? crypto.randomUUID();
          tx.objectStore('photos').put({ ...p, id: pid, sessionId: sid });
          const a = analyses.find((a) => a.photoId === p.id);
          if (a !== undefined) {
            tx.objectStore('analyses').put({ ...a, photoId: pid, computed: null });
            // Older copies sit further from the centre and spread wider (the shots scaled out from the bullseye, with a
            // little unevenness so no line is perfectly straight): the history improves towards today.
            const f = 1 + 0.1 * k + (k % 2 === 1 ? 0.04 : -0.02);
            const shots = a.shots.map((sh, i) => ({
              ...sh,
              xMm: sh.xMm * f + (((i * 7) % 5) - 2) * 0.4,
              yMm: sh.yMm * f + (((i * 3) % 4) - 1.5) * 0.4,
            }));
            out.push({ pid, shots });
          }
          for (const [key, value] of blobs) {
            if (key.startsWith(`photo:${p.id}:`)) tx.objectStore('blobs').put(value, key.replace(p.id, pid));
          }
        }
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return out;
  }, copies);
  for (const { pid, shots } of clones) await page.evaluate(({ pid, shots }) => window.__asaTest.setShots(pid, shots), { pid, shots });
  await page.evaluate(() => window.__asaTest.waitForIdle());
}

/** Hash routes keep the window's scroll, so every screen starts from the top. */
async function open(page, hash) {
  await page.goto(`${BASE}/#${hash}`);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.settle ?? 600);
  const path = `${OUT}${name}`;
  if (opts.locator) await opts.locator.screenshot({ path, ...(name.endsWith('.jpg') ? { type: 'jpeg', quality: 85 } : {}) });
  else await page.screenshot({ path, ...(name.endsWith('.jpg') ? { type: 'jpeg', quality: 85 } : {}) });
  console.log(`wrote docs/assets/${name}`);
}

async function download(page, trigger, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()]);
  await file.saveAs(`${OUT}${name}`);
  console.log(`wrote docs/assets/${name}`);
}

/** The README's four-phone strip, drawn from the screens just taken. */
async function hero(browser, panels) {
  const page = await browser.newPage({ viewport: { width: 1480, height: 653 } });
  const img = (f) => `data:image/${f.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${readFileSync(`${OUT}screens/${f}`).toString('base64')}`;
  const cells = panels
    .map(
      ([file, caption]) => `<figure><div class="phone"><img src="${img(file)}"></div><figcaption>${caption}</figcaption></figure>`,
    )
    .join('');
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; background: #EAF2F8; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    main { display: flex; justify-content: center; gap: 40px; padding: 40px 40px 0; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; }
    .phone { width: 300px; height: 506px; border: 10px solid #1F2630; border-radius: 44px; overflow: hidden; background: #1F2630; }
    .phone img { width: 300px; height: 506px; object-fit: cover; object-position: top; display: block; border-radius: 34px; }
    figcaption { margin-top: 34px; font-size: 22px; font-weight: 700; color: #1F2630; }
  </style></head><body><main>${cells}</main></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}hero-screens.png` });
  console.log('wrote docs/assets/hero-screens.png');
  await page.close();
}

async function main() {
  mkdirSync(`${OUT}screens`, { recursive: true });
  const server = await ensureServer();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
    const page = await context.newPage();
    await open(page, `/`);
    await page.waitForFunction(() => window.__asaTest !== undefined);

    // An athlete, so the summary and coach images carry the athlete line.
    await open(page, `/settings`);
    await page.getByTestId('athlete-name').fill('Demo Athlete');
    await page.getByTestId('athlete-club').fill('NordicAim Demo Club');
    await page.getByTestId('athlete-club').blur();

    const sid = await page.evaluate(() => window.__asaTest.loadDemo());
    await page.evaluate(() => window.__asaTest.waitForIdle());
    await addHistory(page, 4);

    // A backup, made the way the owner makes one (the file goes to a temporary folder, not the repo): Settings then shows
    // its message, and no screen shows the backup reminder.
    await open(page, '/settings');
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
    await page.getByTestId('backup-now').click();
    const [backupFile] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
    await backupFile.saveAs(`${tmpdir()}/${backupFile.suggestedFilename()}`);
    await page.getByTestId('backup-message').waitFor();
    const backup = page.locator('section[aria-labelledby="settings-backup-title"]');
    await backup.scrollIntoViewIfNeeded();
    await shot(page, 'screens/backup.png', { locator: backup });

    // 1. Capture, Precision prone chosen.
    await open(page, `/sessions/${sid}/capture?fakeCamera=precision`);
    await page.getByTestId('kind-precision-prone').click();
    await shot(page, 'screens/capture.jpg', { settle: 1500 });

    // 2. Metadata.
    await open(page, `/sessions/${sid}/metadata`);
    await page.locator('[aria-label="Target type"]').first().waitFor();
    await shot(page, 'screens/metadata.png');

    // 3. Results, with the summary image made.
    await open(page, `/sessions/${sid}/results`);
    await page.getByTestId('target-card').first().waitFor({ timeout: 30_000 });
    await shot(page, 'screens/results.png', { settle: 1500 });

    // 4. One target, read out; then its shot correction.
    const session = await page.evaluate((sid) => window.__asaTest.getSession(sid), sid);
    const precisionPid = await page.evaluate(async (ids) => {
      for (const id of ids) {
        const card = document.querySelector(`[data-photo-id="${id}"]`);
        if (card?.textContent?.includes('Precision')) return id;
      }
      return ids.at(-1);
    }, session.photoIds);
    await open(page, `/sessions/${sid}/photos/${precisionPid}`);
    await page.getByTestId('mode-shots').waitFor({ timeout: 30_000 });
    await shot(page, 'screens/target.png', { settle: 1500 });
    await page.getByTestId('mode-shots').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -100));
    await shot(page, 'screens/adjust.jpg', { settle: 800 });

    // 5. Patterns: every precision prone shot, all time.
    await open(page, `/patterns`);
    await page.getByTestId('pattern-view-precision-prone').click();
    await page.getByTestId('pattern-range-all').click();
    await shot(page, 'screens/patterns.png', { settle: 1200 });

    // 6. Analysis: precision prone, all time, scrolled to the charts; then the coach image.
    await open(page, `/analysis`);
    await page.getByTestId('analysis-view-precision-prone').click();
    await page.getByTestId('analysis-range-all').click();
    await shot(page, 'screens/analysis.png', { settle: 1000 });
    await page.getByTestId('trend-score').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -72));
    await shot(page, 'screens/analysis-trends.png', { settle: 800 });
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
    await page.getByTestId('make-trends-image').click();
    await page.getByTestId('trends-image-preview').waitFor({ timeout: 60_000 });
    await download(page, () => page.getByTestId('share-trends-image').click(), 'coach-image.png');

    // 7. The session's summary image (the brag sheet).
    await open(page, `/sessions/${sid}/results`);
    await page.getByTestId('summary-image').waitFor({ timeout: 60_000 });
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
    await download(page, () => page.getByTestId('summary-share').click(), 'summary-image.png');

    // 8. Settings: the top (the athlete), and the scoring rule.
    await open(page, '/settings');
    await shot(page, 'screens/settings.png', { settle: 800 });
    await page.getByText('Scoring and hole size').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -90));
    await shot(page, 'screens/scoring.png', { settle: 600 });

    await hero(browser, [
      ['capture.jpg', '1 Photograph the target'],
      ['target.png', '2 Read each target'],
      ['adjust.jpg', '3 Correct any shot'],
      ['analysis-trends.png', '4 Track your trends'],
    ]);
    await context.close();
  } finally {
    await browser.close();
    if (server !== null) process.kill(-server.pid);
  }
}

await main();
