import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const go = async (path) => {
    await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
    // Development builds expose SSR controls before hydration finishes.
    await page.waitForTimeout(1800);
  };

  await go('/products/muse');
  const search = page.getByRole('searchbox');
  await search.fill('zzzz-no-match-928');
  await page.getByRole('heading', { name: '没有找到匹配的灵感' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'zzzz-no-match-928');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  assert.equal(await search.inputValue(), 'zzzz-no-match-928');
  await page.getByRole('button', { name: '查看全部灵感', exact: true }).click();
  await page.locator('a[id^="muse-"]').first().waitFor();
  await search.fill('dashboard');
  await page.waitForTimeout(300);
  const detail = page.locator('a[id^="muse-"]').first();
  const href = await detail.getAttribute('href');
  await detail.click();
  await page.getByRole('link', { name: '返回灵感集', exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: '返回灵感集', exact: true }).click();
  await search.waitFor();
  assert.equal(await search.inputValue(), 'dashboard');
  console.log('PASS search empty/URL reload/clear/detail-return', href);

  await go('/products/muse/product-comps');
  const track = page.getByRole('region', { name: '作品媒体' });
  await track.focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  assert(await page.getByRole('button', { name: '下一张媒体', exact: true }).isDisabled());
  await page.keyboard.press('Home');
  await page.waitForTimeout(600);
  assert(await page.getByRole('button', { name: '上一张媒体', exact: true }).isDisabled());
  const counter = page.locator('span[aria-live="polite"]').first();
  const before = await counter.textContent();
  const url = page.url();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  assert.equal(page.url(), url, '方向键在轮播内不得跳转路由');
  assert.notEqual(await counter.textContent(), before, '方向键应推进轮播媒体');
  console.log('PASS multi carousel Home/End/bounds/local arrow advance without navigation');

  // 边界取自数据包排序的真实首尾作品（与详情页相邻列表同一 API）。
  const { listPosts } = await import('../../packages/inspora/src/index.ts');
  const posts = listPosts();
  await go(`/products/muse/${posts[0].slug}`);
  assert(await page.locator('video').first().evaluate((element) => element.controls));
  assert(await page.getByRole('button', { name: '已是第一件', exact: true }).isDisabled());
  await go(`/products/muse/${posts[posts.length - 1].slug}`);
  assert(await page.getByRole('button', { name: '已是最后一件', exact: true }).isDisabled());
  console.log('PASS native video controls and first/last navigation boundaries');

  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await go('/products/muse/1-23');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  console.log('PASS detail long-title overflow at 1440/1024/390/320');
  console.log('pageerrors', JSON.stringify(errors));
} finally {
  await browser.close();
}
