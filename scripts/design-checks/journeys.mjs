import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// 从首页出发的两条完整浏览路径回归：对齐 docs/design/README.md 契约。
// 路径一：首页 → 灵感集 → 搜索 → 作品详情（原作入口）→ 返回恢复关键词。
// 路径二：首页 → 布局参考 → 书架开册 → 画册翻页 → 图片放大即详情 →
// Esc 关放大 → Esc 回书架（书脊焦点恢复）→ 浏览器后退回首页。
const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const results = [];
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  // 路径一：灵感集完整浏览路径。
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: '进入灵感集', exact: true }).click();
  await page.getByRole('searchbox').waitFor();
  await page.getByRole('searchbox').fill('dashboard');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'dashboard');
  const work = page.locator('a[id^="muse-"]').first();
  await work.waitFor();
  await work.click();
  await page.getByRole('link', { name: '返回灵感集', exact: true }).waitFor();
  const source = page.getByRole('link', { name: '查看原作', exact: true });
  assert((await source.count()) === 1, '详情应提供唯一原作入口');
  assert(
    (await source.getAttribute('href'))?.startsWith('https://'),
    '原作入口应指向外部原址',
  );
  await page.getByRole('link', { name: '返回灵感集', exact: true }).click();
  await page.getByRole('searchbox').waitFor();
  assert.equal(await page.getByRole('searchbox').inputValue(), 'dashboard', '返回应恢复搜索关键词');
  results.push('home → muse → query → detail with source link → return restores query');

  // 路径二：布局参考完整浏览路径。
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: '进入布局参考', exact: true }).click();
  await page.getByText('选一本，翻开看看。', { exact: true }).waitFor();
  await page.locator('[class*="shelf"] button').first().click();
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor();
  const status = () =>
    page.locator('[aria-label$="画册"] p[role="status"]').getAttribute('aria-label');
  const status0 = await status();
  await page.getByRole('button', { name: '下一页' }).click();
  await page.waitForFunction(
    (prev) =>
      document.querySelector('[aria-label$="画册"] p[role="status"]')?.getAttribute('aria-label') !==
      prev,
    status0,
    { timeout: 5000 },
  );
  await page.locator('button[data-page-id]').first().click();
  await page.locator('[role="dialog"]').waitFor();
  const zoomedId = await page.evaluate(() =>
    document.querySelector('[data-book-spread] button[data-page-id]')?.getAttribute('data-page-id'),
  );
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute('data-page-id'))) === zoomedId,
    '关闭放大后焦点应回到当前书页',
  );
  await page.keyboard.press('Escape');
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.id === 'book-0', undefined, {
    timeout: 5000,
  });
  await page.goBack();
  await page.waitForURL(new RegExp(`^${base}/?$`));
  results.push('home → layouts → open book → album flip → zoom as detail → Esc layering → back to home');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await mkdir('docs/design/execution/evidence', { recursive: true });
  await writeFile(
    'docs/design/execution/evidence/journeys.json',
    `${JSON.stringify({ base, results, errors, passed: results.length === 2 && errors.length === 0 }, null, 2)}\n`,
  );
}
console.log('PASS', results);
