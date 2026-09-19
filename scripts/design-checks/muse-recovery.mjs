import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { listPosts } from '../../packages/inspora/src/index.ts';

// 灵感集恢复路径回归：对齐 docs/design/README.md 契约——无效分类与空结果给出
// 「没有找到匹配的灵感」并可一键清除、q 在 URL 保留、分类切换写入 cat、
// 接近末端滚动自动追加（无手动加载按钮）、长关键词窄屏无溢出、
// 详情媒体 15 秒超时给出「媒体暂时无法加载」并可重试、始终保留原媒体入口。
const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const go = async (path) => {
    await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
  };

  // 无效分类 + 关键词：空结果说明、q 保留、清除筛选后回全部。
  await go('/products/muse?cat=invalid-category&q=dashboard');
  await page.getByRole('heading', { name: '没有找到匹配的灵感' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'dashboard', '空结果应保留 q');
  await page.getByRole('button', { name: '查看全部灵感', exact: true }).click();
  await page.locator('a[id^="muse-"]').first().waitFor();
  const url = new URL(page.url());
  assert(!url.searchParams.has('cat') && !url.searchParams.has('q'), '查看全部应清空筛选');

  // 分类切换：写入中文分类 cat，结果非空。
  await page.locator('[aria-label="分类"] button').last().click();
  await page.waitForTimeout(600);
  assert(new URL(page.url()).searchParams.get('cat'), '分类切换应写入 cat');
  assert((await page.locator('a[id^="muse-"]').count()) > 0, '分类结果不应为空');

  // 滚动自动追加：切回「全部」后接近末端滚动，网格数量增长，且不存在手动加载按钮。
  await page.locator('[aria-label="分类"] button').first().click();
  await page.waitForTimeout(800);
  const before = await page.locator('a[id^="muse-"]').count();
  assert(before > 0, '网格应有初始内容');
  assert(
    (await page.getByRole('button', { name: /加载更多/ }).count()) === 0,
    '不应存在手动加载按钮',
  );
  await page.keyboard.press('End');
  await page.waitForFunction(
    (prev) => document.querySelectorAll('a[id^="muse-"]').length > prev,
    before,
    { timeout: 8000 },
  );
  console.log('PASS invalid category recovery/q preserved/category/scroll append');

  // 长关键词：390px 窄屏无横向溢出。
  await page.getByRole('searchbox').fill('x'.repeat(180));
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // 详情媒体超时：挂起首个媒体请求，15 秒后给出恢复出口；放行重试后恢复。
  const post = listPosts().find((item) => item.slug === 'file-management-dashboard');
  const mediaUrl = new URL(post.media[0].src, base).href;
  const held = [];
  await page.route(mediaUrl, (route) => held.push(route));
  await go('/products/muse/file-management-dashboard');
  await page.getByText('媒体暂时无法加载', { exact: true }).waitFor({ timeout: 18000 });
  assert(await page.getByRole('button', { name: '重试', exact: true }).isVisible());
  assert(
    (await page.getByRole('link', { name: /打开原媒体|新窗口/ }).count()) >= 1,
    '错误态应保留原媒体入口',
  );
  for (const route of held) await route.abort();
  await page.unroute(mediaUrl);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByText('媒体暂时无法加载', { exact: true }).waitFor({
    state: 'detached',
    timeout: 20000,
  });
  console.log('PASS 15-second stalled-media timeout/retry/original-media recovery controls');

  assert(errors.length === 0, `页面报错：${errors.join(' | ')}`);
} finally {
  await browser.close();
}
