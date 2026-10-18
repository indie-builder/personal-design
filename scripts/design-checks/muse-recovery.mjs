import { baseUrl, withBrowser, go as visit, writeEvidence } from './harness.cjs';
import assert from 'node:assert/strict';
import { listPosts } from '../../packages/inspora/src/index.ts';

// 灵感集恢复路径回归：对齐 docs/design/README.md 契约——无效分类与空结果给出
// 「没有找到匹配的灵感」并可一键清除、q 在 URL 保留、分类切换写入 cat、
// 接近末端滚动自动追加（无手动加载按钮）、长关键词窄屏无溢出、
// 详情媒体 15 秒超时给出「媒体暂时无法加载」并可重试、始终保留原媒体入口。
const base = baseUrl();
await withBrowser(
  async ({ page, errors }) => {
    const go = (path) => visit(page, base, path, 1400);

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
  },
  {
    pageOptions: {
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    },
  },
);

// Failure modes: thumbnail removed before full opacity; stale exit after retry/switch;
// duplicate live status or focus lost in an inert exit; cancelled/hidden/reduced/key
// animation never cleans up. Hold real image URLs, then sample the actual handoff.
await withBrowser(
  async ({ page, errors }) => {
    const posts = listPosts();
    const post = posts.find((item) => item.slug === 'file-management-dashboard');
    const multi = posts.find((item) => item.slug === 'product-comps');
    assert(post && multi, '媒体回归需要已有单图与多图作品');
    const evidence = [];
    const imageBody =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#888"/></svg>';
    let held = [];
    let source;
    const track = page.getByRole('region', { name: '作品媒体' });
    const activeSlide = () => track.locator('figure:not([inert])');
    const start = async (target = post) => {
      for (const route of held.splice(0)) await route.abort();
      await page.unrouteAll({ behavior: 'wait' });
      source = new URL(target.media[0].src, base).href;
      await page.route(source, (route) => {
        held.push(route);
      });
      await page.goto(`${base}/products/muse/${target.slug}`, { waitUntil: 'domcontentloaded' });
      await activeSlide().getByRole('status').waitFor();
      await page.waitForFunction(
        () => document.querySelector('[aria-label="作品媒体"] img[alt=""]')?.complete,
      );
      await page.mouse.click(4, 4);
      await page.waitForTimeout(250);
      assert.equal(await activeSlide().getAttribute('data-ready'), 'false');
    };
    const release = async () => {
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="作品媒体"] figure:not([inert])'),
      );
      assert(held.length > 0, '原图请求应仍被挂起');
      for (const route of held.splice(0))
        await route.fulfill({ contentType: 'image/svg+xml', body: imageBody });
    };
    const sample = async (label, action = release) => {
      await page.evaluate(() => {
        window.__mediaSamples = [];
        const start = performance.now();
        const frame = () => {
          const slide = document.querySelector('[aria-label="作品媒体"] figure:not([inert])');
          if (!slide) return;
          const full = slide.querySelector('img:last-of-type');
          const preview = slide.querySelector('img[alt=""]');
          const leaving = slide.querySelector('[data-leaving]');
          window.__mediaSamples.push({
            time: performance.now() - start,
            ready: slide.dataset.ready,
            full: full && Number(getComputedStyle(full).opacity),
            preview: preview && Number(getComputedStyle(preview).opacity),
            leaving: leaving && Number(getComputedStyle(leaving).opacity),
            safe:
              !leaving ||
              (leaving.inert &&
                leaving.getAttribute('aria-hidden') === 'true' &&
                !leaving.hasAttribute('role')),
            statuses: slide.querySelectorAll('[role="status"]').length,
          });
          if (performance.now() - start < 650) requestAnimationFrame(frame);
          else window.__mediaSamplesDone = true;
        };
        window.__mediaSamplesDone = false;
        requestAnimationFrame(frame);
      });
      await action();
      await page.waitForFunction(() => window.__mediaSamplesDone);
      const frames = await page.evaluate(() => window.__mediaSamples);
      evidence.push({ label, frames });
      assert(
        frames.every((frame) => frame.safe && frame.statuses <= 1),
        '退出层必须 inert/aria-hidden，只有当前状态 live',
      );
      return frames;
    };
    const clean = async () => {
      await page.waitForFunction(() => {
        const slide = document.querySelector('[aria-label="作品媒体"] figure:not([inert])');
        return (
          slide?.dataset.ready === 'true' &&
          !slide.querySelector('img[alt=""], [data-leaving], [role="status"]') &&
          getComputedStyle(slide.querySelector('img')).opacity === '1'
        );
      });
    };

    await start();
    const frames = await sample('pointer-handoff');
    assert(
      frames.some(
        (frame) =>
          frame.ready === 'true' && frame.full > 0 && frame.full < 1 && frame.preview === 0.85,
      ),
      '原图160ms淡入期间必须保留完整缩略图',
    );
    assert(
      frames.some((frame) => frame.full === 1 && frame.preview > 0 && frame.preview < 0.85),
      '原图完全可见后缩略图才140ms退场',
    );
    assert(
      frames.some((frame) => frame.leaving > 0 && frame.leaving < 1 && frame.statuses === 0),
      '加载状态立即结束语义，视觉140ms退场',
    );
    await clean();

    // Timeout and retry must update business/ARIA immediately while preserving focus.
    await start();
    await activeSlide().getByText('媒体暂时无法加载', { exact: true }).waitFor({ timeout: 18000 });
    await page.waitForTimeout(250);
    await activeSlide().getByRole('button', { name: '重试', exact: true }).focus();
    const retryFrames = await sample('error-retry', async () => {
      await page.mouse.click(4, 4);
      await activeSlide()
        .getByRole('button', { name: '重试', exact: true })
        .evaluate((button) => {
          button.focus();
          button.click();
        });
      await activeSlide().getByRole('status').getByText('正在加载媒体…', { exact: true }).waitFor();
      assert(
        await track.evaluate((element) => document.activeElement === element),
        '退出重试按钮必须将焦点归还稳定媒体区域',
      );
    });
    assert(
      retryFrames.some((frame) => frame.leaving > 0 && frame.leaving < 1 && frame.statuses === 1),
      '重试时错误层与当前加载状态应交叉淡变',
    );
    await release();
    await clean();

    // A rapid image switch settles outgoing work; keyboard stays inside the carousel.
    await start(multi);
    await release();
    await track.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await clean();
    assert.equal(new URL(page.url()).pathname, `/products/muse/${multi.slug}`);

    for (const policy of ['keyboard', 'reduced', 'background', 'cancel']) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await start();
      await release();
      await page.waitForFunction(
        () => document.querySelector('[aria-label="作品媒体"] figure')?.dataset.ready === 'true',
      );
      if (policy === 'keyboard') await page.keyboard.press('Tab');
      if (policy === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      if (policy === 'background')
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      if (policy === 'cancel')
        await activeSlide().evaluate((slide) => {
          for (const animation of slide.getAnimations({ subtree: true })) animation.cancel();
        });
      if (policy !== 'cancel') {
        await page.waitForTimeout(50);
        assert(
          await activeSlide().evaluate(
            (slide) =>
              !slide.querySelector('img[alt=""], [data-leaving]') &&
              getComputedStyle(slide.querySelector('img')).opacity === '1',
          ),
          `${policy} 应立即提交原图终态并清理视觉层`,
        );
      }
      await clean();
      assert.equal(
        await activeSlide().locator('[data-leaving]').count(),
        0,
        `${policy} 应清理退出层`,
      );
      evidence.push({ label: policy, settled: true });
    }
    // Pending response and active visual work must not outlive a route unmount.
    await start();
    await release();
    await page.goto(`${base}/products/muse`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('[data-leaving]').count(), 0);
    assert.equal(errors.length, 0, `页面报错：${errors.join(' | ')}`);
    await writeEvidence(
      new URL('../../.impeccable/review/media-handoff.json', import.meta.url),
      evidence,
    );
    console.log(
      'PASS media handoff/status exit/retry/focus/switch/keyboard/reduced/background/cancel/unmount',
    );
  },
  { pageOptions: { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' } },
);
