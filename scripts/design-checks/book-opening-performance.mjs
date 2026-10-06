// Pass a compatible production tab, CDP session and viewport adapter.
// Frame-time sampling of the layout-compositions opening sequence (extract 1680ms,
// align 360ms, spread 720ms) plus instant-path checks. Callers must check `passed`.
export async function verifyBookOpeningPerformance(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const path = '/products/layout-compositions';
  const issues = [];
  const checks = [];
  const metrics = [];
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
  const mouseClick = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1 },
        { timeoutMs: 5000 },
      );
  };
  const summarize = (deltas) => {
    const sorted = [...deltas].sort((a, b) => a - b);
    const total = sorted.length;
    return {
      frames: total,
      avgMs: Number((deltas.reduce((sum, v) => sum + v, 0) / total).toFixed(1)),
      p95Ms: sorted[Math.min(total - 1, Math.max(0, Math.ceil(total * 0.95) - 1))],
      maxMs: sorted[total - 1],
      longFrames: deltas.filter((v) => v > 50).length,
      over100: deltas.filter((v) => v > 100).length,
      longRatio: Number((deltas.filter((v) => v > 50).length / total).toFixed(4)),
      dropRatio: Number((deltas.filter((v) => v > 25).length / total).toFixed(4)),
    };
  };
  const installSampler = () =>
    evaluate(`(() => {
      const deltas = [];
      const start = performance.now();
      let last = start;
      let stable = 0;
      let clicked = false;
      window.__bookOpening = null;
      const tick = () => {
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        if (!clicked && deltas.length === 2) { clicked = true; document.getElementById('book-0').click(); }
        const ready =
          !!document.querySelector('select[aria-label="跳转到图鉴"]') &&
          !document.querySelector('[data-opening]') &&
          !document.querySelector('[aria-busy="true"]');
        stable = ready ? stable + 1 : 0;
        if (stable >= 3 || now - start > 5000) {
          const status = document.querySelector('[aria-label$="画册"] p[role="status"]');
          window.__bookOpening = {
            deltas: deltas.map(Math.round),
            elapsedMs: Math.round(now - start),
            picker: !!document.querySelector('select[aria-label="跳转到图鉴"]'),
            status: status ? status.textContent.trim() : null,
          };
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
  const harvest = () =>
    evaluate(`new Promise((resolve) => {
      const started = performance.now();
      const poll = () => {
        if (window.__bookOpening || performance.now() - started > 6500) resolve(window.__bookOpening || null);
        else setTimeout(poll, 80);
      };
      poll();
    })`);
  const installInstantProbe = () =>
    evaluate(`(() => {
      const start = performance.now();
      let frames = 0;
      let sawOpening = false;
      let sawBusy = false;
      let pickerAt = null;
      window.__bookInstant = null;
      const tick = () => {
        const now = performance.now();
        frames += 1;
        if (document.querySelector('[data-opening]')) sawOpening = true;
        if (document.querySelector('[aria-busy="true"]')) sawBusy = true;
        if (pickerAt === null && document.querySelector('select[aria-label="跳转到图鉴"]')) pickerAt = now - start;
        if (frames >= 60 || (pickerAt !== null && now - start > pickerAt + 250)) {
          const status = document.querySelector('[aria-label$="画册"] p[role="status"]');
          window.__bookInstant = {
            sawOpening, sawBusy, pickerAt: pickerAt === null ? null : Math.round(pickerAt),
            status: status ? status.textContent.trim() : null,
          };
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
  const harvestInstant = () =>
    evaluate(`new Promise((resolve) => {
      const started = performance.now();
      const poll = () => {
        if (window.__bookInstant || performance.now() - started > 5000) resolve(window.__bookInstant || null);
        else setTimeout(poll, 60);
      };
      poll();
    })`);

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await viewport.set({ width: 1440, height: 900 });

    await tab.goto(base + path);
    await tab.playwright.locator('#book-0').waitFor({ state: 'visible', timeoutMs: 20000 });
    await installSampler();
    const run = await harvest();
    if (expect(run && run.picker, '指针开册：序列应在采样窗口内到达画册')) {
      const summary = summarize(run.deltas);
      metrics.push({ mode: 'pointer', elapsedMs: run.elapsedMs, status: run.status, ...summary });
      expect(run.elapsedMs <= 4500, `指针开册：应在 4.5s 看门狗内完成，实际 ${run.elapsedMs}ms`);
      expect(summary.over100 === 0, `指针开册：不得出现 >100ms 单帧，最大 ${summary.maxMs}ms`);
      expect(
        summary.longRatio <= 0.05,
        `指针开册：>50ms 长帧占比 ${(summary.longRatio * 100).toFixed(1)}% 应 ≤5%（${summary.longFrames}/${summary.frames}）`,
      );
      expect(!!run.status && /1[–-]2/.test(run.status), `指针开册：应进入目标跨页，实际「${run.status}」`);
      checks.push(
        `pointer opening: ${run.elapsedMs}ms, avg ${summary.avgMs}ms, p95 ${summary.p95Ms}ms, max ${summary.maxMs}ms, long ${summary.longFrames}/${summary.frames}`,
      );
    }

    await tab.goto(base + path);
    await tab.playwright.locator('#book-0').waitFor({ state: 'visible', timeoutMs: 20000 });
    await installInstantProbe();
    // locator.press sends a trusted keyboard event and activates the button; a bare CDP
    // keyDown without text never triggers activation.
    await tab.playwright.locator('#book-0').press('Enter');
    const keyboard = await harvestInstant();
    if (
      expect(keyboard && keyboard.pickerAt !== null, '键盘开册：应直接进入画册') &&
      expect(!keyboard.sawOpening && !keyboard.sawBusy, '键盘开册：不得出现抽书或开册展示层')
    ) {
      metrics.push({ mode: 'keyboard', ...keyboard });
      expect(keyboard.pickerAt <= 1500, `键盘开册：应即时进入，实际 ${keyboard.pickerAt}ms`);
      expect(
        !!keyboard.status && /1[–-]2/.test(keyboard.status),
        `键盘开册：应直接进入目标跨页，实际「${keyboard.status}」`,
      );
      checks.push(`keyboard opening: picker at ${keyboard.pickerAt}ms, no opening layer`);
    }

    await tab.goto(base + path);
    await tab.playwright.locator('#book-0').waitFor({ state: 'visible', timeoutMs: 20000 });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const spine = await evaluate(`(() => {
      const r = document.getElementById('book-0').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await installInstantProbe();
    await mouseClick(spine.x, spine.y);
    const reduced = await harvestInstant();
    if (
      expect(reduced && reduced.pickerAt !== null, '减少动态效果：指针开册应直接进入画册') &&
      expect(!reduced.sawOpening && !reduced.sawBusy, '减少动态效果：不得出现抽书或开册展示层')
    ) {
      metrics.push({ mode: 'reduced-motion', ...reduced });
      expect(reduced.pickerAt <= 1500, `减少动态效果：应即时进入，实际 ${reduced.pickerAt}ms`);
      expect(
        !!reduced.status && /1[–-]2/.test(reduced.status),
        `减少动态效果：应直接进入目标跨页，实际「${reduced.status}」`,
      );
      checks.push(`reduced-motion opening: picker at ${reduced.pickerAt}ms, no opening layer`);
    }

    return { passed: issues.length === 0, base, checks, issues, metrics };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues, metrics };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
