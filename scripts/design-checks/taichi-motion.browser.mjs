// Pass a compatible production tab, CDP session and viewport adapter on the homepage.
// Header taichi avatar easter egg per DESIGN.md 头像彩蛋 and the homepage contract:
// click-triggered 9.2s WAAPI sequence on one shared clock, Esc collapse via a 150ms
// stage fade, reduced motion reduced to a 1s static-pose fade, instant policy cutting
// mid-play, and no pointer capture over work links.
// Failures collect into issues; callers must check `passed`.
export async function verifyTaichiMotion(tab, cdp, viewport) {
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
  const mouseClick = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1 },
        { timeoutMs: 5000 },
      );
  };
  const pointerMove = async () => {
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 600, y: 300 },
      { timeoutMs: 5000 },
    );
  };
  const key = async (def) => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        {
          type,
          key: def.key,
          code: def.code,
          windowsVirtualKeyCode: def.code0,
          nativeVirtualKeyCode: def.code0,
        },
        { timeoutMs: 5000 },
      );
  };
  const TRIGGER = 'header button[title="来一段太极"]';
  const triggerRect = () =>
    evaluate(`(() => {
      const button = document.querySelector('${TRIGGER}');
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        label: button.getAttribute('aria-label'),
        px: Math.round(rect.x + 140),
        py: Math.round(rect.y + 120),
      };
    })()`);
  const runningAnims = () =>
    evaluate(`(() => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      const nodes = [root, ...root.querySelectorAll('*')];
      return nodes.flatMap((el) => el.getAnimations()).filter((a) => a.playState === 'running').length;
    })()`);

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await viewport.set({ width: 1440, height: 900 });
    await tab.goto(base + '/');
    await tab.playwright.locator(TRIGGER).waitFor({ state: 'visible', timeoutMs: 20000 });

    const links = await evaluate(
      `document.querySelectorAll('[data-timeline-stop] a[href^="/products/"]').length`,
    );
    expect(links >= 1, `彩蛋之外应存在可点击的作品链接（found ${links}）`);
    const first = await triggerRect();
    if (!expect(!!first && first.label === '点击头像，看一段太极', `头像触发器初始应为静态文案（${first && first.label}）`)) {
      return { passed: false, base, checks, issues };
    }
    await evaluate(
      `window.__taichiHitBefore = document.elementFromPoint(${first.px}, ${first.py}); true`,
    );
    await mouseClick(first.x, first.y);
    const play = await evaluate(`(async () => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      const frames = [];
      const start = performance.now();
      while (performance.now() - start < 1700) {
        const stage = root.querySelector('div[class*="__stage"]');
        const actor = root.querySelector('div[class*="__actor"]');
        const anims = actor ? actor.getAnimations({ subtree: true }) : [];
        const cts = anims.map((a) => Number(a.currentTime)).filter((n) => !Number.isNaN(n));
        const hit = stage ? document.elementFromPoint(${first.px}, ${first.py}) : null;
        frames.push({
          stage: !!stage,
          count: anims.length,
          running: anims.filter((a) => a.playState === 'running').length,
          durations: [...new Set(anims.map((a) => Number(a.effect ? a.effect.getTiming().duration : 0)))],
          spread: cts.length ? Math.round(Math.max(...cts) - Math.min(...cts)) : null,
          pointerEvents: stage ? getComputedStyle(stage).pointerEvents : null,
          disabled: button.getAttribute('aria-disabled'),
          label: button.getAttribute('aria-label'),
          hitInStage: !!(hit && stage && (hit === stage || stage.contains(hit))),
          hitSame: !!hit && hit === window.__taichiHitBefore,
        });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return frames;
    })()`);
    const staged = play.filter((f) => f.stage);
    const full = play.filter((f) => f.count >= 10);
    const clockFrame = full[0] || { durations: [], spread: null };
    expect(
      play.length > 20 && staged.length > 15 && play.slice(2).every((f) => f.stage),
      `点击后舞台应出现并保持（staged ${staged.length}/${play.length} 帧）`,
    );
    expect(
      full.length > 10,
      `关节序列应运行（travel+8关节+body=10 个动画，峰值 ${Math.max(0, ...play.map((f) => f.count))}）`,
    );
    expect(
      clockFrame.durations.length === 1 && clockFrame.durations[0] === 9200,
      `序列应共享 9.2s 时钟（durations ${JSON.stringify(clockFrame.durations)}）`,
    );
    expect(full.every((f) => f.running === f.count), '序列动画应全部处于 running');
    expect(
      full.every((f) => f.spread === null || f.spread <= 100),
      `各关节 currentTime 应一致（spread ${clockFrame.spread}）`,
    );
    expect(staged.every((f) => f.pointerEvents === 'none'), '舞台不得捕获输入（pointer-events:none）');
    expect(
      play.some((f) => f.disabled === 'true' && f.label === '太极表演中，按 Esc 收起'),
      '表演中触发器应提示 Esc 收起并避免重复触发',
    );
    expect(
      staged.every((f) => !f.hitInStage) && staged.some((f) => f.hitSame),
      '舞台下方元素应仍可命中（彩蛋不抢占作品操作）',
    );
    checks.push(
      `pointer play: ${Math.max(0, ...play.map((f) => f.count))} animations share the 9.2s clock, stage pointer-events none, hit-through intact`,
    );

    // Install the sampler BEFORE Esc so the whole window is covered.
    await evaluate(`(() => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      window.__taichiEsc = [];
      const start = performance.now();
      const sample = () => {
        const stage = root.querySelector('div[class*="__stage"]');
        window.__taichiEsc.push({ t: Math.round(performance.now() - start), stage: !!stage });
        if (stage) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })()`);
    await key({ key: 'Escape', code: 'Escape', code0: 27 });
    await new Promise((resolve) => setTimeout(resolve, 1300));
    const collapse = await evaluate(`(() => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      const frames = window.__taichiEsc ?? [];
      const stage = root.querySelector('div[class*="__stage"]');
      const running = [root, ...root.querySelectorAll('*')]
        .flatMap((el) => el.getAnimations())
        .filter((a) => a.playState === 'running').length;
      return { frames, gone: !stage, label: button.getAttribute('aria-label'), disabled: button.getAttribute('aria-disabled'), running };
    })()`);
    // Esc is a keyboard input: the shell flags data-input=keyboard before the component's
    // handler runs, so the instant contract applies and the stage must collapse immediately.
    const collapsed = collapse.frames.length > 0 && !collapse.frames[collapse.frames.length - 1].stage;
    expect(
      collapse.gone && collapse.running === 0,
      `Esc 后舞台应清理且无残留动画（gone=${collapse.gone}, running=${collapse.running}）`,
    );
    expect(collapsed, 'Esc（键盘路径）应即时收起舞台，不等待淡出');
    expect(
      collapse.label === '点击头像，看一段太极' && collapse.disabled !== 'true',
      `Esc 后触发器应恢复可再次触发（${collapse.label}）`,
    );
    checks.push(
      `Esc collapse: keyboard path unmounts immediately, no leftover animations`,
    );

    await pointerMove();
    const again = await triggerRect();
    await mouseClick(again.x, again.y);
    await evaluate('new Promise((resolve) => setTimeout(resolve, 1300))');
    await key({ key: 'Shift', code: 'ShiftLeft', code0: 16 });
    const cut = await evaluate(`(async () => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      const start = performance.now();
      let goneAt = null;
      while (performance.now() - start < 900) {
        if (!root.querySelector('div[class*="__stage"]')) {
          goneAt = Math.round(performance.now() - start);
          break;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { goneAt, label: button.getAttribute('aria-label') };
    })()`);
    expect(
      cut.goneAt !== null,
      `指针动作中切即时策略应立即收起，不继续播放（goneAt=${cut.goneAt}）`,
    );
    expect(cut.label === '点击头像，看一段太极', `即时策略收起后触发器应恢复（${cut.label}）`);
    expect((await runningAnims()) === 0, '即时策略收起后不应残留运行动画');
    checks.push(`instant-policy cut: stage unmounted ${cut.goneAt}ms after trusted keydown, sequence cut short`);

    await pointerMove();
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const third = await triggerRect();
    await mouseClick(third.x, third.y);
    const reduced = await evaluate(`(async () => {
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      await new Promise((resolve) => setTimeout(resolve, 350));
      const stage = root.querySelector('div[class*="__stage"]');
      const actor = root.querySelector('div[class*="__actor"]');
      const anims = actor ? actor.getAnimations({ subtree: true }) : [];
      const travel = anims[0];
      const keys = travel && travel.effect ? travel.effect.getKeyframes() : [];
      return {
        stage: !!stage,
        count: anims.length,
        durations: [...new Set(anims.map((a) => Number(a.effect ? a.effect.getTiming().duration : 0)))],
        joints: actor ? actor.querySelectorAll('[data-joint]').length : 0,
        staticPose:
          keys.length > 0 &&
          keys.every((k) => !k.transform || String(k.transform).replace(/\\s+/g, '') === 'translate(52px,20px)'),
        fades: keys.some((k) => Number(k.opacity) === 0) && keys.some((k) => Number(k.opacity) === 1),
      };
    })()`);
    expect(
      reduced.stage && reduced.count === 1,
      `减少动态效果应只保留 1 个 travel 动画（count=${reduced.count}）`,
    );
    expect(
      reduced.durations.length === 1 && reduced.durations[0] <= 1200,
      `减少动态效果应为约 1s 的短淡变（duration=${reduced.durations[0]}）`,
    );
    expect(
      reduced.staticPose && reduced.fades,
      `减少动态效果应保持静态姿态仅淡变（staticPose=${reduced.staticPose}, fades=${reduced.fades}）`,
    );
    expect(reduced.joints >= 8, `静态姿态下关节节点应仍在 DOM（joints=${reduced.joints}）`);
    const settled = await evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const button = document.querySelector('${TRIGGER}');
      const root = button.closest('div');
      return {
        stage: !!root.querySelector('div[class*="__stage"]'),
        label: button.getAttribute('aria-label'),
      };
    })()`);
    expect(
      !settled.stage && settled.label === '点击头像，看一段太极',
      `短淡变结束后应自动收起（stage=${settled.stage}, label=${settled.label}）`,
    );
    expect((await runningAnims()) === 0, '短淡变结束后不应残留运行动画');
    checks.push(`reduced motion: single ${reduced.durations[0]}ms static-pose fade, auto-dismissed`);

    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
