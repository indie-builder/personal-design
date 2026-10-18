import { baseUrl, withBrowser, go as visit, writeEvidence } from './harness.cjs';
import assert from 'node:assert/strict';

const base = baseUrl();
await withBrowser(
  async ({ page, errors }) => {
    const go = (path) => visit(page, base, path, 1800);

    await go('/products/muse');

    // Failures: missing/misaligned motion, reversal jumps, diagonal wrap travel,
    // stale geometry, delayed selection, animated instant paths, or moving results.
    await page.evaluate(() => {
      const group = document.querySelector('[role="group"][aria-label="分类"]');
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const marker = () => group.querySelector('[data-category-indicator]');
      const animations = () =>
        group
          .getAnimations({ subtree: true })
          .filter((animation) =>
            animation.effect.target?.matches('[data-category-indicator], [data-category-ghost]'),
          );
      const nativeAnimate = Element.prototype.animate;
      const created = [];
      Element.prototype.animate = function (...args) {
        const animation = nativeAnimate.apply(this, args);
        if (this.matches('[data-category-indicator], [data-category-ghost]')) {
          created.push(animation);
          if (window.__categoryMotion.freeze) {
            animation.pause();
            animation.currentTime = 0;
          }
        }
        return animation;
      };
      window.__categoryMotion = {
        freeze: true,
        group,
        marker,
        animations,
        created,
        rect,
        sample: () => {
          const selected = group.querySelector('[aria-pressed="true"]');
          const grid = document.querySelector('a[id^="muse-"]')?.parentElement;
          const origin = group.getBoundingClientRect();
          const fading = group.querySelector('[data-category-ghost]');
          return {
            marker: marker() ? rect(marker()) : null,
            markerOpacity: marker() ? getComputedStyle(marker()).opacity : null,
            ghostOpacity: fading ? getComputedStyle(fading).opacity : null,
            selected: {
              x: origin.x + selected.offsetLeft,
              y: origin.y + selected.offsetTop,
              width: selected.offsetWidth,
              height: selected.offsetHeight,
            },
            selectedText: selected.textContent,
            cat: new URL(location.href).searchParams.get('cat'),
            gridMotion:
              grid
                ?.getAnimations({ subtree: true })
                .filter((animation) =>
                  animation.effect
                    .getKeyframes()
                    .some((frame) => frame.transform && frame.transform !== 'none'),
                ).length ?? 0,
            gridTransform: grid ? getComputedStyle(grid).transform : null,
            gridOpacity: grid ? getComputedStyle(grid).opacity : null,
            animations: animations().map((animation) => ({
              duration: animation.effect.getTiming().duration,
              easing: animation.effect.getTiming().easing,
              target: animation.effect.target.hasAttribute('data-category-ghost')
                ? 'ghost'
                : 'marker',
              frames: animation.effect
                .getKeyframes()
                .map(({ transform, opacity }) => ({ transform, opacity })),
            })),
            ghosts: group.querySelectorAll('[data-category-ghost]').length,
            willChange: marker() ? getComputedStyle(marker()).willChange : null,
          };
        },
      };
    });
    const sample = async () => {
      await page.waitForFunction(() => window.__categoryMotion.group.getClientRects().length > 0);
      return page.evaluate(() => window.__categoryMotion.sample());
    };
    const seek = (time) =>
      page.evaluate((value) => {
        for (const animation of window.__categoryMotion.animations()) animation.currentTime = value;
      }, time);
    const finish = async () => {
      await page.evaluate(async () => {
        const animations = window.__categoryMotion.animations();
        for (const animation of animations) {
          animation.currentTime = Number(animation.effect.getTiming().duration);
          animation.play();
        }
        await Promise.allSettled(animations.map((animation) => animation.finished));
      });
    };
    const aligned = (state) => {
      assert(state.marker, '共享选中线必须存在');
      assert(Math.abs(state.marker.x - state.selected.x) < 1, `选中线左端对齐: ${JSON.stringify(state)}`);
      assert(Math.abs(state.marker.width - state.selected.width) < 1, '选中线宽度跟随实际分类');
      assert(
        Math.abs(state.marker.y - (state.selected.y + state.selected.height - 1)) < 1,
        '保留底部1px线位置',
      );
    };
    const noGridMotion = (state) => {
      assert.equal(state.gridMotion, 0, '分类切换不得添加网格空间动画');
      assert.equal(state.gridTransform, 'none');
      assert.equal(state.gridOpacity, '1');
    };
    const tabs = page.getByRole('group', { name: '分类', exact: true });
    const buttons = tabs.getByRole('button');
    const initial = await sample();
    aligned(initial);
    assert.equal(initial.animations.length, 0, '首屏静态选中线');
    const start = initial.marker;
    const targetLabel = await buttons.nth(1).textContent();
    await buttons.nth(1).click();
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 1);
    const moving = await sample();
    assert.equal(moving.selectedText, targetLabel, '动画前立即提交 aria-pressed');
    assert(moving.cat, '动画前立即更新分类 URL');
    assert.equal(moving.animations.length, 1, '普通指针必须创建共享线运动');
    assert.equal(moving.animations[0].duration, 180);
    assert.equal(moving.animations[0].easing, 'cubic-bezier(0.23, 1, 0.32, 1)');
    assert(Math.abs(moving.marker.x - start.x) < 1, '从当前可见位置起步');
    await seek(45);
    const midway = await sample();
    assert(midway.marker.x > start.x && midway.marker.x < midway.selected.x, '中间帧必须真实移动');
    noGridMotion(midway);
    await buttons.first().click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('cat'));
    await page.waitForFunction(() =>
      window.__categoryMotion.group.getClientRects().length > 0 &&
      window.__categoryMotion.animations().length === 1,
    );
    const reversed = await sample();
    assert(Math.abs(reversed.marker.x - midway.marker.x) < 1, '反向从视觉当前位置衔接');
    assert(Math.abs(reversed.marker.width - midway.marker.width) < 1, '反向保留视觉宽度');
    assert.equal(reversed.animations.length, 1, '反向取消旧动画');
    await finish();
    aligned(await sample());
    assert.equal((await sample()).willChange, 'auto', '完成后移除 will-change');

    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(60);
    const wrapped = await buttons.evaluateAll((elements) => {
      const first = elements[0].getBoundingClientRect();
      return elements.findIndex((element) => element.getBoundingClientRect().top > first.top + 2);
    });
    assert(wrapped > 0, '小屏真实分类必须换行');
    await buttons.nth(wrapped).click();
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 2);
    const crossfade = await sample();
    assert.equal(crossfade.ghosts, 1, '跨行保留短暂的原位置淡出');
    assert.equal(crossfade.animations.length, 2, '跨行使用两处原位交叉淡变');
    for (const animation of crossfade.animations) {
      assert(
        animation.frames.every((frame) => !frame.transform),
        '跨行禁止斜向位置插值',
      );
    }
    await seek(50);
    aligned(await sample());
    await seek(110);
    const exchange = await sample();
    assert.equal(exchange.ghosts, 1, '淡出层保留到自身结束');
    assert.equal(exchange.ghostOpacity, '0', '100ms 后淡出层保持终态，不得闪回原分类');
    assert(Number(exchange.markerOpacity) > 0.95, '100–140ms 之间入场层已接近完成');
    await finish();
    assert.equal((await sample()).ghosts, 0);
    // B→A, then A→B mid-flight: the returning line resumes the fading ghost's opacity.
    await buttons.first().click();
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 2);
    await seek(50);
    const beforeReverse = await sample();
    assert.equal(beforeReverse.ghosts, 1);
    await buttons.nth(wrapped).click();
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 2);
    const reverse = await sample();
    assert.equal(reverse.ghosts, 1, '跨行反向只保留一个残影');
    assert(Math.abs(reverse.marker.x - reverse.selected.x) < 1, '跨行反向立即对齐新选择');
    const starts = Object.fromEntries(
      reverse.animations.map((animation) => [animation.target, animation.frames[0].opacity]),
    );
    const near = (left, right) => Math.abs(Number(left) - Number(right)) < 0.01;
    assert(
      near(starts.marker, beforeReverse.ghostOpacity),
      '跨行反向从目标位置残影的实际透明度接续',
    );
    assert(
      near(starts.ghost, beforeReverse.markerOpacity),
      '跨行反向从旧位置的实际透明度退出',
    );
    await finish();
    aligned(await sample());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(60);
    aligned(await sample());
    await buttons.evaluateAll((elements) => {
      elements[0].style.paddingInline = '12px';
    });
    await page.waitForTimeout(60);
    aligned(await sample());
    await buttons.evaluateAll((elements) => {
      elements[0].style.paddingInline = '';
    });
    await page.waitForTimeout(60);

    // A reflow settles an active intent; a later real loader suspension must not replay it.
    await buttons.first().click();
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 1);
    await seek(45);
    await buttons.first().evaluate((element) => { element.style.paddingInline = '12px'; });
    await page.waitForTimeout(60);
    aligned(await sample());
    await buttons.first().evaluate((element) => { element.style.paddingInline = ''; });
    await page.waitForTimeout(60);
    const reflowCount = await page.evaluate(() => window.__categoryMotion.created.length);
    await page.getByRole('searchbox').fill('dashboard');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'dashboard');
    await page.locator('a[id^="muse-"]').first().waitFor();
    assert.equal(
      await page.evaluate(() => window.__categoryMotion.created.length),
      reflowCount,
      '重排落定后路由恢复不得重播旧分类意图',
    );
    await page.getByRole('searchbox').fill('');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('q'));
    await page.locator('a[id^="muse-"]').first().waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });

    await buttons.nth(1).click();
    await page.keyboard.press('Shift');
    await page.waitForTimeout(20);
    aligned(await sample());
    assert.equal((await sample()).animations.length, 0, '中途键盘立即停住');
    const beforeKeyboard = await page.evaluate(() => window.__categoryMotion.created.length);
    await buttons.nth(1).focus();
    await page.keyboard.press('Enter');
    aligned(await sample());
    assert.equal(
      await page.evaluate(() => window.__categoryMotion.created.length),
      beforeKeyboard,
      '键盘不创建指示线动画',
    );
    assert.equal(
      await buttons.nth(1).evaluate((element) => document.activeElement === element),
      true,
    );
    await page.mouse.click(4, 4);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(60);
    assert.equal(
      await page.evaluate(() => document.activeElement === document.body),
      true,
      '点击空白后重排不得抢回分类焦点',
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await buttons.first().click();
    aligned(await sample());
    assert.equal(
      await page.evaluate(() => window.__categoryMotion.created.length),
      beforeKeyboard,
      '减少动态效果不创建动画',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await buttons.nth(1).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__categoryMotion.animations().length === 0);
    aligned(await sample());
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await buttons.first().click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(20);
    assert.equal((await sample()).animations.length, 0, '后台不等待动画');
    aligned(await sample());
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      window.__categoryMotion.freeze = false;
    });
    await buttons.first().waitFor({ state: 'visible' });
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('cat'));
    noGridMotion(await sample());
    await writeEvidence(
      new URL('../../.impeccable/review/motion-additions/category.json', import.meta.url),
      { passed: true, initial, moving, midway, reversed, crossfade, exchange, beforeReverse, reverse },
    );
    console.log(
      'PASS category shared underline/mid-frame/reversal/wrap/reflow/instant policies/no grid motion',
    );
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
    assert(
      await page
        .locator('video')
        .first()
        .evaluate((element) => element.controls),
    );
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
  },
  { pageOptions: { viewport: { width: 1440, height: 900 } } },
);
