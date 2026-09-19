import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
const results = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
async function check(name, work) { await work(); results.push({ name, passed: true }); console.log('PASS', name); }
async function go(route = '/') { return page.goto(base + route, { waitUntil: 'domcontentloaded' }); }
async function theme(value) { await page.waitForFunction(v => document.documentElement.dataset.theme === v, value); }
try {
  await go();
  await check('theme follows OS initially and dynamically', async () => {
    await theme('light'); await page.emulateMedia({ colorScheme: 'dark' }); await theme('dark');
  });
  await check('manual theme persists and overrides OS', async () => {
    await page.getByRole('button', { name: '切换为浅色主题' }).click(); await theme('light');
    await page.reload({ waitUntil: 'domcontentloaded' }); await theme('light');
  });
  await check('theme storage syncs across tabs and invalid value falls back to OS', async () => {
    const other = await context.newPage(); await other.goto(base, { waitUntil: 'domcontentloaded' });
    await other.evaluate(() => localStorage.setItem('theme', 'dark')); await theme('dark');
    await other.evaluate(() => localStorage.setItem('theme', 'invalid')); await page.reload({ waitUntil: 'domcontentloaded' }); await theme('dark');
    await other.close();
  });
  await check('keyboard skip link reaches main content', async () => {
    await go();
    await page.getByRole('link', { name: '跳至内容' }).waitFor();
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement?.getAttribute('href') === '#workspace-content');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'workspace-content');
  });
  const routes = ['/', '/products/muse', '/products/layout-compositions', '/products/muse/file-management-dashboard', '/products/layout-compositions/001', '/missing-page'];
  for (const width of [320, 720]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) await check(`reflow ${width}px ${route}`, async () => {
      const response = await go(route); assert.equal(response.status(), route === '/missing-page' ? 404 : 200);
      const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(sizes[0] <= sizes[1], JSON.stringify(sizes));
      await page.getByRole('main').waitFor();
      assert.equal(await page.getByRole('main').count(), 1);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
    });
  }
  await check('theme works when localStorage is unavailable', async () => {
    const isolated = await browser.newContext({ colorScheme: 'dark' });
    await isolated.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }));
    const p = await isolated.newPage(); await p.goto(base, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await p.getByRole('button', { name: '切换为浅色主题' }).click();
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'light'); await isolated.close();
  });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await mkdir('docs/design/execution/evidence', { recursive: true });
  await writeFile('docs/design/execution/evidence/foundation.json', JSON.stringify({ base, results, errors }, null, 2) + '\n');
}
