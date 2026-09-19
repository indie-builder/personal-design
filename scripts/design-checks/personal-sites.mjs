import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// 个人网站页行为回归：对齐 docs/design/README.md 契约——宣传片可视静音循环、
// 点击与空格／Enter 切换播放、reduced-motion 不自动播放但手动播放可用、
// 失败给出重试、「打开网站」外链新标签。此前四个产品中唯一无浏览器回归的表面。
const base = (process.env.DESIGN_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const browser = await chromium.launch();
try {
  // 常规偏好：可视自动播放，aria 与提示同步，空格／Enter 可暂停／恢复。
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/products/personal-sites`, { waitUntil: 'domcontentloaded' });
  const video = page.locator('section[aria-label="个人网站动态展示"] video');
  await video.waitFor();
  await page.waitForFunction(
    () => {
      const v = document.querySelector('section[aria-label="个人网站动态展示"] video');
      return v && v.readyState >= 2 && !v.paused && v.currentTime > 0;
    },
    undefined,
    { timeout: 30000 },
  );
  assert.equal(
    await video.getAttribute('aria-label'),
    '暂停个人网站宣传片',
    '播放中 aria 应为暂停',
  );
  assert(await page.getByText('点击暂停', { exact: true }).isVisible(), '播放中应显示暂停提示');

  await video.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => document.querySelector('section[aria-label="个人网站动态展示"] video')?.paused,
    undefined,
    { timeout: 5000 },
  );
  assert.equal(await video.getAttribute('aria-label'), '播放个人网站宣传片');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => !document.querySelector('section[aria-label="个人网站动态展示"] video')?.paused,
    undefined,
    { timeout: 5000 },
  );
  const siteLink = page.getByRole('link', { name: '打开个人网站（新标签页）' });
  assert.equal(await siteLink.getAttribute('target'), '_blank');
  assert.ok((await siteLink.getAttribute('rel'))?.includes('noopener'), '外链应带 noopener');
  assert(errors.length === 0, `页面报错：${errors.join(' | ')}`);
  await page.close();
  console.log('PASS promo autoplay/aria sync, Space pause, Enter resume, external site link');

  // reduced-motion：不自动播放；手动播放（Enter）仍可用。
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await rm.goto(`${base}/products/personal-sites`, { waitUntil: 'domcontentloaded' });
  const rmVideo = rm.locator('section[aria-label="个人网站动态展示"] video');
  await rmVideo.waitFor();
  await rm.waitForTimeout(2000);
  assert.ok(await rmVideo.evaluate((el) => el.paused), 'reduced-motion 下不应自动播放');
  await rmVideo.focus();
  await rm.keyboard.press('Enter');
  await rm.waitForFunction(
    () => !document.querySelector('section[aria-label="个人网站动态展示"] video')?.paused,
    undefined,
    { timeout: 10000 },
  );
  await rm.close();
  console.log('PASS reduced-motion no autoplay, manual play works');

  // 失败恢复：媒体请求失败给出状态说明与重新加载，放行后重试成功。
  const fail = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fail.route('**/personal-sites/promo.mp4*', (route) => route.abort());
  await fail.goto(`${base}/products/personal-sites`, { waitUntil: 'domcontentloaded' });
  await fail.getByRole('status').getByText('宣传片暂时无法播放，请重试或打开原网站。').waitFor({ timeout: 15000 });
  await fail.unroute('**/personal-sites/promo.mp4*');
  await fail.getByRole('button', { name: '重新加载' }).click();
  await fail.getByRole('status').waitFor({ state: 'detached', timeout: 20000 });
  await fail.close();
  console.log('PASS promo failure status with reload recovery');
} finally {
  await browser.close();
}
