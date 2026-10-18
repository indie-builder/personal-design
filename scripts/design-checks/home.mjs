import assert from 'node:assert/strict';
import { baseUrl, withBrowser, writeEvidence, settle } from './harness.cjs';

// 首页行为回归：对齐 docs/design/README.md 首页契约（时间轴溢出翻页、方向键一步一列、
// 拖动、减少动态效果即时到位、窄屏无横向溢出；封面失败仅做无页面错误冒烟）。
// 翻页/回退采用应用自身的按钮与方向键路径；定位到端点用 scrollTo，
// 因为 Chromium 对纯横向滚动容器不再提供原生 End/Home 键行为。
const baseURL = baseUrl();
const evidenceURL = new URL('../../docs/design/execution/evidence/home-behavior.json', import.meta.url);
const evidence = { baseURL, checks: {}, pageErrors: [] };
// smooth 滚动有启动延迟，连续采样会误判提前停稳；统一给足固定等待。
try {
  await withBrowser(async ({ page }) => {
    await page.goto(baseURL);
    const region = page.getByRole('region', { name: '作品时间轴' });
    await region.waitFor();
    const geometry = () =>
      region.evaluate((el) => ({
        scroll: el.scrollLeft,
        max: el.scrollWidth - el.clientWidth,
        column: el.querySelector('li[class*="entry"]')?.getBoundingClientRect().width ?? 0,
      }));
    evidence.checks.baseline = await geometry();
    assert(evidence.checks.baseline.max > 0, '时间轴应横向溢出');
    assert(evidence.checks.baseline.column > 100, '作品条目宽度异常');
    assert(await page.getByText('未完待续', { exact: true }).count(), '缺少末尾「未完待续」条目');

    const prev = page.getByRole('button', { name: '向前浏览作品' });
    const next = page.getByRole('button', { name: '向后浏览作品' });
    assert(await prev.isDisabled(), '起点处「向前」应禁用');
    assert(!(await next.isDisabled()), '溢出时「向后」应可用');

    // 翻页步长必须等于一个作品条目（装饰性漫步者 li 不得缩小步长）。
    await next.click();
    await settle(page);
    evidence.checks.nextStep = (await geometry()).scroll;
    assert(Math.abs(evidence.checks.nextStep - evidence.checks.baseline.column) <= 1,
      `翻页步长 ${evidence.checks.nextStep} 应等于条目宽 ${evidence.checks.baseline.column}`);

    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await settle(page);
    evidence.checks.end = await geometry();
    assert(Math.abs(evidence.checks.end.max - evidence.checks.end.scroll) <= 2, '应能到达末端');
    assert(await next.isDisabled(), '末端「向后」应禁用');
    assert(!(await prev.isDisabled()), '末端「向前」应可用');

    // 方向键从末端回退一步 = 一个条目宽。
    await region.focus();
    await page.keyboard.press('ArrowLeft');
    await settle(page);
    evidence.checks.arrowBack = (await geometry()).scroll;
    assert(Math.abs(evidence.checks.end.scroll - evidence.checks.arrowBack - evidence.checks.baseline.column) <= 1,
      `方向键回退步长 ${evidence.checks.end.scroll - evidence.checks.arrowBack} 应等于条目宽`);

    // 拖动浏览且停留在首页。
    await region.evaluate((el) => el.scrollTo({ left: 0 }));
    await settle(page);
    const rect = await region.boundingBox();
    assert(rect);
    await page.mouse.move(rect.x + 250, rect.y + 150);
    await page.mouse.down();
    await page.mouse.move(rect.x + 50, rect.y + 150, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    evidence.checks.drag = { offset: (await geometry()).scroll, pathname: new URL(page.url()).pathname };
    assert(evidence.checks.drag.offset > 100, '拖动应实质移动时间轴');
    assert.equal(evidence.checks.drag.pathname, '/');

    // 减少动态效果时方向键即时到位，不留下平滑滚动中间位置。
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await region.evaluate((el) => el.scrollTo({ left: 0 }));
    await region.focus();
    await page.keyboard.press('ArrowRight');
    evidence.checks.reduced = await geometry();
    assert(Math.abs(evidence.checks.reduced.scroll - evidence.checks.reduced.column) <= 1,
      `减少动态效果时应即时移动一列，实际 ${evidence.checks.reduced.scroll}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    evidence.checks.mobile = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(evidence.checks.mobile.width, evidence.checks.mobile.scroll, '窄屏不应出现页面级横向溢出');

    // 图片优化通道被拦截时页面仍须无错误渲染。当前仅工具预览图标走 /_image（lazy），
    // 重载后可能不在视口内；先滚到首张优化图，保证 abort 路径真实命中而不是空断言。
    const imageAborts = [];
    await page.route('**/_image?**', (route) => {
      imageAborts.push(route.request().url());
      return route.abort();
    });
    await page.reload();
    await page.getByRole('region', { name: '作品时间轴' }).waitFor();
    if (!imageAborts.length) {
      const optimized = page.locator('img[src*="/_image?"]').first();
      assert(await optimized.count(), '首页缺少经 /_image 优化的图片，无法验证拦截路径');
      await optimized.scrollIntoViewIfNeeded();
      const deadline = Date.now() + 5000;
      while (!imageAborts.length && Date.now() < deadline) await page.waitForTimeout(100);
    }
    evidence.checks.imageAborts = imageAborts.length;
    assert(imageAborts.length > 0, '/_image 拦截未命中：matcher 与实际图片端点不一致');
    assert.deepEqual(evidence.pageErrors, []);
    evidence.passed = true;
  }, { evidence, pageOptions: { viewport: { width: 1440, height: 900 } } });
} catch (error) {
  evidence.passed = false;
  evidence.failure = error.stack;
  throw error;
} finally {
  await writeEvidence(evidenceURL, evidence);
}
console.log('Homepage behavior checks passed. Evidence: docs/design/execution/evidence/home-behavior.json');
