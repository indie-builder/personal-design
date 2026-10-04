import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// 布局参考状态回归：只保留书架与 cat/page 画册入口，旧独立图鉴地址一律 404，
// 缺图条目仍可定位书页且不弹放大，
// 高清挂起时灯箱缩略图兜底并可重试恢复、直达地址不重播抽书动画、
// reduced-motion 下 Esc 即时返回书架。
const baseURL = (process.env.DESIGN_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const evidenceURL = new URL('../../docs/design/execution/evidence/layouts-states.json', import.meta.url);
const evidence = { baseURL, checks: {}, pageErrors: [] };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));

  // 旧独立详情入口已删除：有图、缺图和未知编号都由路由层返回 404。
  for (const id of ['001', '063', '999']) {
    const response = await page.goto(`${baseURL}/products/layout-compositions/${id}`, {
      waitUntil: 'domcontentloaded',
    });
    assert(response?.status() === 404, `已退役图鉴地址 ${id} 应返回 404，实际 ${response?.status()}`);
  }
  evidence.checks.retiredRoutes = '001, 063 and 999 return true 404';

  // 当前缺图入口：cat/page 定位书页，保留明确占位且不弹放大。
  await page.goto(`${baseURL}/products/layout-compositions?cat=构图逻辑&page=063`, { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-page-id="063"]').waitFor();
  assert(
    new URL(page.url()).searchParams.get('cat') === '构图逻辑',
    '缺图书页应保留当前分类',
  );
  assert(
    (await page.locator('[role="dialog"]').count()) === 0,
    '缺图条目不应打开放大',
  );
  assert(
    await page.getByText('此图鉴暂缺图片').isVisible(),
    '缺图书页应显示缺图占位',
  );
  assert(await page.locator('button[data-page-id="063"]').isDisabled(), '缺图页不应提供放大入口');
  evidence.checks.missingPage = 'cat/page=063 lands on its page without zoom dialog';

  // 直达带 cat/page 的地址：不重播抽书动画，画册直接可见。
  await page.goto(`${baseURL}/products/layout-compositions?cat=构图逻辑&page=003&zoom=003`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('select[aria-label="跳转到图鉴"]').waitFor();
  assert(
    (await page.locator('[data-opening]').count()) === 0,
    '直达地址不应重播抽书动画',
  );
  const directStatus = await page
    .locator('[aria-label$="画册"] p[role="status"]')
    .getAttribute('aria-label');
  assert(directStatus === '第3至4页，共86页', `直达应定位第3至4页，实际「${directStatus}」`);
  assert((await page.locator('[role="dialog"]').count()) === 0, '旧 zoom 参数不应自动打开放大');
  evidence.checks.directPage = 'cat/page opens the reader directly; retired zoom is ignored';

  // 高清挂起：灯箱先显示缩略图兜底与明确提示，可重试；放行后恢复高清。
  // 前提：003 的高清图走上游 CDN；若 sync 生成其本地 webp，需换无本地图的编号。
  await page.route('**/cdn.jsdelivr.net/**', () => {});
  await page.locator('button[data-page-id]').first().click();
  await page.locator('[role="dialog"]').waitFor();
  await page.getByText('高清图暂时无法加载，当前显示预览图。', { exact: true }).waitFor({ timeout: 16000 });
  await page.unroute('**/cdn.jsdelivr.net/**');
  await page.getByRole('button', { name: '重新加载' }).click();
  await page.getByText('高清图暂时无法加载，当前显示预览图。', { exact: true }).waitFor({
    state: 'detached',
    timeout: 30000,
  });
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  evidence.checks.hdFallback = 'stalled HD falls back to thumb with retry, recovers after release';

  // reduced-motion：Esc 即时返回书架（无合册动画等待）。
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  rm.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  await rm.goto(`${baseURL}/products/layout-compositions`, { waitUntil: 'domcontentloaded' });
  await rm.locator('[class*="shelf"] button').first().click();
  await rm.locator('select[aria-label="跳转到图鉴"]').waitFor();
  await rm.keyboard.press('Escape');
  await rm.locator('select[aria-label="跳转到图鉴"]').waitFor({ state: 'detached', timeout: 2000 });
  await rm.close();
  evidence.checks.reducedMotion = 'Esc returns to shelf instantly';

  assert(evidence.pageErrors.length === 0, `页面报错：${evidence.pageErrors.join(' | ')}`);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await browser.close();
  await mkdir(new URL('../../docs/design/execution/evidence/', import.meta.url), { recursive: true });
  evidence.passed = !evidence.failure;
  await writeFile(evidenceURL, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}
