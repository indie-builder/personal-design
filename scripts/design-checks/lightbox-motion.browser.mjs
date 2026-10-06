// Pass a compatible production tab, CDP session and viewport adapter.
// Lightbox FLIP enter/exit, touch swipe and reduced-motion behavior on a multi-image muse
// detail page. Failures collect into issues; callers must check `passed`.
export async function verifyLightboxMotion(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const issues = [];
  const checks = [];
  const expect = (ok, message) => {
    if (!ok) issues.push(message);
    return ok;
  };
  const evaluate = async (expression) => {
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      { timeoutMs: 20000 },
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = (ms) => evaluate(`new Promise((resolve) => setTimeout(resolve, ${ms}))`);
  const mouseClick = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1 },
        { timeoutMs: 5000 },
      );
  };
  const mouseDrag = async (from, dx) => {
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 },
      { timeoutMs: 5000 },
    );
    for (let step = 1; step <= 4; step++) {
      await sleep(50);
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: from.x + (dx * step) / 4, y: from.y, button: 'left', buttons: 1 },
        { timeoutMs: 5000 },
      );
    }
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: from.x + dx, y: from.y, button: 'left', clickCount: 1 },
      { timeoutMs: 5000 },
    );
  };
  const touchDrag = async (from, dx, stepPx, stepMs) => {
    const steps = Math.max(1, Math.round(Math.abs(dx) / stepPx));
    await cdp.send(
      'Input.dispatchTouchEvent',
      { type: 'touchStart', touchPoints: [from] },
      { timeoutMs: 5000 },
    );
    for (let step = 1; step <= steps; step++) {
      await sleep(stepMs);
      await cdp.send(
        'Input.dispatchTouchEvent',
        { type: 'touchMove', touchPoints: [{ x: from.x + (dx * step) / steps, y: from.y }] },
        { timeoutMs: 5000 },
      );
    }
    await sleep(stepMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, { timeoutMs: 5000 });
  };
  const pressEscape = async () => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
        { timeoutMs: 5000 },
      );
  };
  const closeLightbox = async () => {
    await pressEscape();
    await wait(450);
  };
  const installRecorder = (deadline) =>
    evaluate(`(() => {
      const log = [];
      const start = performance.now();
      let signature = null;
      window.__lightboxMotion = null;
      const read = () => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        const img = dialog ? dialog.querySelector('img:not([aria-hidden])') : null;
        const swipe = dialog ? dialog.querySelector('.touch-pan-y') : null;
        const counter = dialog ? dialog.querySelector('.font-mono') : null;
        return {
          t: Math.round(performance.now() - start),
          dialog: !!dialog,
          img: (() => { if (!img) return null; const cs = getComputedStyle(img); return {
            transform: cs.transform, duration: cs.transitionDuration, opacity: cs.opacity,
            left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height,
          }; })(),
          swipe: swipe ? { transform: swipe.style.transform, transition: swipe.style.transition } : null,
          counter: counter ? counter.textContent.trim() : null,
          lightboxOpen: document.body.dataset.lightboxOpen === 'true' ? 1 : 0,
          focus: document.activeElement ? document.activeElement.getAttribute('aria-label') || document.activeElement.id || document.activeElement.tagName.toLowerCase() : null,
        };
      };
      const sample = () => {
        const frame = read();
        const next = JSON.stringify({ ...frame, t: 0 });
        if (next !== signature) { log.push(frame); signature = next; }
        if (performance.now() - start > ${deadline}) { window.__lightboxMotion = log; return; }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })()`);
  const harvest = (timeoutMs) =>
    evaluate(`new Promise((resolve) => {
      const started = performance.now();
      const poll = () => {
        if (window.__lightboxMotion || performance.now() - started > ${timeoutMs}) resolve(window.__lightboxMotion || []);
        else setTimeout(poll, 60);
      };
      poll();
    })`);
  const matrix = (transform) => {
    const match = /matrix\(([^)]+)\)/.exec(transform || '');
    if (!match) return null;
    const values = match[1].split(',').map(Number);
    return { a: values[0], e: values[4], f: values[5] };
  };
  const flipTarget = (trigger, frame) => ({
    x: trigger.x - (parseFloat(frame.left) + parseFloat(frame.width) / 2),
    y: trigger.y - (parseFloat(frame.top) + parseFloat(frame.height) / 2),
    scale: trigger.width / parseFloat(frame.width),
  });
  const matchesFlip = (m, target) =>
    !!m &&
    !!target &&
    Math.abs(m.a - target.scale) <= Math.max(0.05, Math.abs(target.scale) * 0.05) &&
    Math.abs(m.e - target.x) <= 4 &&
    Math.abs(m.f - target.y) <= 4;
  const zoomTrigger = () =>
    evaluate(`(() => {
      const button = [...document.querySelectorAll('button[aria-label^="放大查看"]')]
        .find((b) => !b.closest('figure')?.inert && b.getClientRects().length > 0);
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, label: button.getAttribute('aria-label') };
    })()`);
  const dialogButton = (label) =>
    evaluate(`(() => {
      const button = [...document.querySelectorAll('[role="dialog"] button[aria-label="${label}"]')]
        .find((el) => el.getClientRects().length > 0);
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
  const imageCenter = () =>
    evaluate(`(() => {
      const img = document.querySelector('[role="dialog"] img:not([aria-hidden])');
      if (!img) return null;
      return { x: parseFloat(img.style.left) + parseFloat(img.style.width) / 2, y: parseFloat(img.style.top) + parseFloat(img.style.height) / 2 };
    })()`);

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await viewport.set({ width: 1440, height: 900 });

    await tab.goto(base + '/products/muse');
    await tab.playwright
      .locator('section[aria-label="灵感浏览"] a[id^="muse-"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 20000 });
    const candidates = await evaluate(`[...document.querySelectorAll('section[aria-label="灵感浏览"] a[id^="muse-"]')]
      .map((a) => {
        const badge = a.querySelector('span[class*="badge"]');
        const count = badge ? Number(/(\\d+)/.exec(badge.textContent)?.[1] ?? 0) : 1;
        return { href: a.getAttribute('href'), count };
      })
      .sort((x, y) => y.count - x.count)
      .slice(0, 4)`);
    let opened = null;
    for (const candidate of candidates) {
      const target = new URL(candidate.href, base);
      await tab.goto(base + target.pathname + target.search);
      await tab.playwright
        .locator('nav[aria-label="作品导航"]')
        .waitFor({ state: 'visible', timeoutMs: 20000 });
      const trigger = await zoomTrigger();
      if (!trigger) continue;
      await installRecorder(1600);
      await mouseClick(trigger.x, trigger.y);
      const frames = await harvest(2600);
      const counterFrame = frames.find((f) => f.counter);
      const total = counterFrame ? Number(/\d+\s*\/\s*(\d+)/.exec(counterFrame.counter)?.[1] ?? 0) : 0;
      if (frames.some((f) => f.dialog) && total >= 2) {
        opened = { frames, trigger, total, counter: counterFrame.counter };
        break;
      }
      if (frames.some((f) => f.dialog)) await closeLightbox();
    }
    if (!opened) {
      issues.push('未找到含 ≥2 张图片的灵感详情，无法验证灯箱动效');
      return { passed: false, base, checks, issues };
    }
    checks.push(`multi-image detail found, lightbox counter ${opened.counter}`);

    const trigger = opened.trigger;
    const firstImgFrame = opened.frames.find((f) => f.img)?.img;
    const flip = firstImgFrame ? flipTarget(trigger, firstImgFrame) : null;
    const firstMoving = opened.frames.map((f) => f.img).find((img) => img && img.transform !== 'none');
    expect(
      matchesFlip(firstMoving ? matrix(firstMoving.transform) : null, flip),
      '灯箱打开：首帧 transform 应为自触发元素位置出发的 FLIP 起点',
    );
    expect(
      opened.frames.some((f) => f.img?.duration.includes('0.2s')),
      '灯箱打开：展开 transform/opacity 过渡应为 200ms',
    );
    const settledFrame = [...opened.frames].reverse().find((f) => f.img);
    expect(
      !!settledFrame && settledFrame.img.transform === 'none' && settledFrame.img.duration.includes('0.2s'),
      '灯箱打开：展开后应过渡到 transform none',
    );
    checks.push('pointer open: FLIP start from trigger rect, 200ms expand transition');

    const retrigger = (await zoomTrigger()) ?? trigger;
    const closeButton = await dialogButton('关闭');
    if (!expect(closeButton, '灯箱打开后应存在「关闭」按钮'))
      return { passed: false, base, checks, issues };
    await installRecorder(1400);
    await mouseClick(closeButton.x, closeButton.y);
    const closeFrames = await harvest(2400);
    const closingImgs = closeFrames.filter((f) => f.img).map((f) => f.img);
    const lastClosing = closingImgs[closingImgs.length - 1];
    expect(
      closingImgs.some((img) => img.duration.includes('0.14s') && img.transform !== 'none'),
      '灯箱关闭：收拢过渡应为 140ms 且 transform 回到触发位置途中',
    );
    expect(
      matchesFlip(lastClosing ? matrix(lastClosing.transform) : null, flipTarget(retrigger, lastClosing ?? firstImgFrame)),
      '灯箱关闭：收拢终点应为重测后的触发元素位置',
    );
    const closeEnd = closeFrames[closeFrames.length - 1];
    expect(!closeEnd.dialog, '灯箱关闭后 dialog 应卸载');
    expect(!closeEnd.lightboxOpen, '灯箱关闭后应解除 body 滚动锁');
    expect(String(closeEnd.focus ?? '').startsWith('放大查看'), '灯箱关闭后焦点应回到触发元素');
    checks.push('pointer close: 140ms return to re-measured trigger, unmount and focus restore');

    await installRecorder(2600);
    await mouseClick(trigger.x, trigger.y);
    await wait(600);
    const nextButton = await dialogButton('下一张');
    if (nextButton) await mouseClick(nextButton.x, nextButton.y);
    await wait(350);
    const closeAgain = await dialogButton('关闭');
    if (closeAgain) await mouseClick(closeAgain.x, closeAgain.y);
    const pagedFrames = await harvest(3600);
    const counterAfterNext = pagedFrames.find((f) => f.counter && f.counter !== opened.counter)?.counter;
    expect(!!counterAfterNext, '翻页后计数应变化');
    const closingMatrix = pagedFrames
      .filter((f) => f.img)
      .map((f) => f.img)
      .reverse()
      .map((img) => matrix(img.transform))
      .find(Boolean);
    expect(
      !!closingMatrix && Math.abs(closingMatrix.a - 0.97) <= 0.02 && Math.abs(closingMatrix.e) <= 4,
      '翻页后关闭：sourceEl 失效应走原地 scale(0.97) 淡出',
    );
    expect(!pagedFrames[pagedFrames.length - 1].dialog, '翻页后关闭 dialog 应卸载');
    checks.push(`paged close: counter ${opened.counter}→${counterAfterNext ?? '?'}, scale(0.97) fade-out`);

    const swipeCenter = firstImgFrame
      ? {
          x: parseFloat(firstImgFrame.left) + parseFloat(firstImgFrame.width) / 2,
          y: parseFloat(firstImgFrame.top) + parseFloat(firstImgFrame.height) / 2,
        }
      : null;
    if (swipeCenter) {
      await installRecorder(3000);
      await mouseClick(trigger.x, trigger.y);
      await wait(650);
      await touchDrag(swipeCenter, -140, 20, 40);
      await wait(550);
      const flipFrames = await harvest(4200);
      const dragSamples = flipFrames
        .map((f) => f.swipe?.transform)
        .filter((t) => t && t.startsWith('translate3d('))
        .map((t) => Number(/translate3d\(([-\d.]+)px/.exec(t)?.[1] ?? NaN));
      expect(
        dragSamples.some((v) => Math.abs(v - -126) <= 15),
        '拖拽应跟手为 translate3d（约 -140px×0.9）',
      );
      const finalCounter = [...flipFrames].reverse().find((f) => f.counter)?.counter;
      expect(finalCounter !== opened.counter, `松手超过阈值应切页，计数 ${opened.counter}→${finalCounter}`);
      const lastSwipe = [...flipFrames].reverse().find((f) => f.swipe)?.swipe;
      expect(!lastSwipe?.transform, '切页后拖拽容器 transform 应复位');
      checks.push(`swipe flip: translate3d follows pointer, counter ${opened.counter}→${finalCounter}`);
      await closeLightbox();

      await installRecorder(3000);
      await mouseClick(trigger.x, trigger.y);
      await wait(650);
      await touchDrag(swipeCenter, -36, 12, 60);
      await wait(550);
      const bounceFrames = await harvest(4200);
      expect(
        bounceFrames.some((f) => f.swipe?.transition.includes('150ms') && !f.swipe?.transform),
        '未达阈值松手应 150ms 回弹且 transform 复位',
      );
      const bouncedCounter = [...bounceFrames].reverse().find((f) => f.counter)?.counter;
      expect(bouncedCounter === opened.counter, '回弹不应切页');
      checks.push('swipe bounce: 150ms spring back below threshold, counter unchanged');
      await closeLightbox();

      await installRecorder(3000);
      await mouseClick(trigger.x, trigger.y);
      await wait(650);
      await mouseDrag(swipeCenter, -120);
      await wait(450);
      const mouseFrames = await harvest(4200);
      expect(
        mouseFrames.every((f) => !f.swipe?.transform),
        '鼠标拖拽不得驱动 swipe 位移（仅触摸指针）',
      );
      checks.push('mouse drag: no swipe translation');
      await closeLightbox();
    } else issues.push('灯箱图片区域坐标缺失，未覆盖滑动翻图');

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await installRecorder(2800);
    await mouseClick(trigger.x, trigger.y);
    await wait(450);
    const center = (await imageCenter()) ?? swipeCenter;
    if (center) {
      await touchDrag(center, -36, 12, 60);
      await wait(450);
    }
    await pressEscape();
    await wait(400);
    const reducedFrames = await harvest(4000);
    // 取 settle 后的帧：全局钳位是 0.01ms（保留 transitionend），不是字面 0s。
    const openDialogFrames = reducedFrames.filter((f) => f.dialog && f.img);
    const openReduced = openDialogFrames[openDialogFrames.length - 1];
    expect(
      !!openReduced && parseFloat(openReduced.img.duration) <= 0.001 && openReduced.img.transform === 'none',
      '减少动态效果：打开灯箱 transition 应被钳位（≤0.01ms）且无 FLIP 残留位移',
    );
    if (center) {
      const lastReducedSwipe = [...reducedFrames].reverse().find((f) => f.swipe)?.swipe;
      expect(lastReducedSwipe?.transition === 'none', '减少动态效果：滑动回弹 transition 应为 none');
    }
    const reducedEnd = reducedFrames[reducedFrames.length - 1];
    expect(!reducedEnd.dialog, 'Esc 应关闭灯箱');
    expect(String(reducedEnd.focus ?? '').startsWith('放大查看'), 'Esc 关闭后焦点应回到触发元素');
    checks.push('reduced motion: instant open/close, transition none, Esc focus restore');

    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
