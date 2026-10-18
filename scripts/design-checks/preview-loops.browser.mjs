import { createPreviewLoopProbe } from './preview-loops-probes.mjs';

// Pass a compatible production tab, CDP session and viewport adapter.
// Homepage loop previews per DESIGN.md 动效: the 6s book queue, the 10s receipt
// scene and the 8s AI chat reply. Visible, offscreen, keyboard and reduced-motion
// states are sampled separately; failures collect into issues; callers check `passed`.
export async function verifyPreviewLoops(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const issues = [];
  const checks = [];
  const expect = (ok, message) => {
    if (!ok) issues.push(message);
    return ok;
  };
  const {
    evaluate,
    sleep,
    until,
    pressShift,
    inputMode,
    setReduced,
    restorePointer,
    revealTile,
    hideTile,
    bookState,
    bookSubtreeAnimations,
    bookAdvance,
    receiptState,
    chatState,
    chatAnimationProperties,
    chatSamples,
    chatStaticState,
    waitForReceiptCover,
  } = createPreviewLoopProbe(cdp);

  try {
    await setReduced('no-preference');
    await viewport.set({ width: 1440, height: 900 });

    await tab.goto(base + '/');
    await tab.playwright.locator('#home-timeline').waitFor({ state: 'visible', timeoutMs: 20000 });
    await evaluate(revealTile('/products/layout-compositions'));
    const bookRunning = await until(
      bookState,
      (state) => state && state.running === 'true' && state.playState === 'running',
      8000,
    );
    if (
      expect(!!bookRunning, '书籍队列：指针可视时应开始运行（data-running=true 且动画 playing）')
    ) {
      const advance = await bookAdvance(11000);
      expect(
        advance.titles.length >= 2,
        `书籍队列：可视时 6 秒周期应推进书目，采样仅见 ${JSON.stringify(advance.titles)}`,
      );
      checks.push(`book visible: queue advanced through ${advance.titles.join(' -> ')}`);
    }

    const midCycle = await until(
      bookState,
      (state) => state && state.time !== null && state.time >= 1200 && state.time <= 3800,
      8000,
    );
    if (expect(!!midCycle, '书籍队列：未能在 6 秒周期中段采样到进行中的动画')) {
      const frozen = { title: midCycle.title, time: midCycle.time };
      await evaluate(hideTile('/products/layout-compositions'));
      const paused = await until(bookState, (state) => state && state.running === 'false', 6000);
      expect(
        !!paused && paused.playState === 'paused',
        `书籍队列：离屏后应暂停（data-running=${paused ? paused.running : '缺失'}，playState=${paused ? paused.playState : '缺失'}）`,
      );
      await sleep(7000);
      const whileHidden = await bookState();
      expect(
        !!(whileHidden && whileHidden.title === frozen.title),
        `书籍队列：离屏 7 秒不得推进书目（冻结 ${frozen.title}，实际 ${whileHidden ? whileHidden.title : '缺失'}，不得凭零时长 animationend 跳下一本）`,
      );
      expect(
        !!(
          whileHidden &&
          whileHidden.time !== null &&
          Math.abs(whileHidden.time - frozen.time) <= 60
        ),
        `书籍队列：离屏动画时间应冻结在约 ${frozen.time}ms（实际 ${whileHidden ? whileHidden.time : '缺失'}ms）`,
      );
      await evaluate(revealTile('/products/layout-compositions'));
      const resumed = await until(bookState, (state) => state && state.running === 'true', 6000);
      expect(
        !!(resumed && resumed.title === frozen.title),
        `书籍队列：恢复后应从当前书目继续（冻结 ${frozen.title}，恢复时 ${resumed ? resumed.title : '缺失'}）`,
      );
      expect(
        !!(resumed && resumed.time !== null && resumed.time >= frozen.time - 40),
        `书籍队列：恢复应续播动画而非重头开始（冻结 ${frozen.time}ms，恢复 ${resumed ? resumed.time : '缺失'}ms）`,
      );
      const advanced = await until(
        bookState,
        (state) => state && state.title !== frozen.title,
        9000,
      );
      expect(!!advanced, '书籍队列：恢复续播完成后应推进到下一本书');
      checks.push(
        `book offscreen: frozen at ${frozen.title} ${frozen.time}ms, resumed and advanced to ${advanced ? advanced.title : '?'}`,
      );
    }

    const beforeKeyboard = await bookState();
    await pressShift();
    expect(
      (await until(inputMode, (mode) => mode === 'keyboard', 3000)) === 'keyboard',
      '输入模式：可信 keydown 应将 html[data-input] 切为 keyboard',
    );
    const keyboardPaused = await until(
      bookState,
      (state) => state && state.running === 'false',
      6000,
    );
    expect(
      !!keyboardPaused && keyboardPaused.playState === 'paused',
      `书籍队列：键盘模式应停止队列（data-running=${keyboardPaused ? keyboardPaused.running : '缺失'}，playState=${keyboardPaused ? keyboardPaused.playState : '缺失'}）`,
    );
    await sleep(7000);
    const keyboardStill = await bookState();
    expect(
      !!(keyboardStill && beforeKeyboard && keyboardStill.title === beforeKeyboard.title),
      `书籍队列：键盘模式 7 秒不得推进书目（起始 ${beforeKeyboard ? beforeKeyboard.title : '缺失'}，实际 ${keyboardStill ? keyboardStill.title : '缺失'}）`,
    );
    checks.push(
      `book keyboard: queue stopped on ${keyboardStill ? keyboardStill.title : '?'}, no advance in 7s`,
    );
    await restorePointer();

    await setReduced('reduce');
    const reducedPaused = await until(
      bookState,
      (state) => state && state.running === 'false',
      6000,
    );
    const reducedAnimations = await bookSubtreeAnimations();
    expect(!!reducedPaused, '书籍队列：减少动态效果应停止队列');
    expect(
      reducedAnimations === 0,
      `书籍队列：减少动态效果不应挂载 6 秒关键帧（实际 ${reducedAnimations} 个动画）`,
    );
    await sleep(2500);
    const reducedStill = await bookState();
    expect(
      !!(reducedStill && reducedPaused && reducedStill.title === reducedPaused.title),
      `书籍队列：减少动态效果不得推进书目（${reducedPaused ? reducedPaused.title : '缺失'} -> ${reducedStill ? reducedStill.title : '缺失'}）`,
    );
    checks.push('book reduced motion: keyframes absent, queue static');
    await setReduced('no-preference');

    await tab.goto(base + '/');
    await tab.playwright
      .locator('#home-timeline a[href="/products/personal-sites"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 20000 });
    await evaluate(revealTile('/products/personal-sites'));
    await waitForReceiptCover();
    const receiptReady = await until(
      receiptState,
      (state) => state && state.ready === 'true' && state.running === 'true',
      10000,
    );
    if (
      expect(
        !!receiptReady &&
          // Module keyframes are hash-scoped（Vite 模板为 _local_hash_index，local 在中段），
          // 按名段匹配三个关键帧
          /(^|_)paper-feed(_|$)/.test(String(receiptReady.paper.name)) &&
          /(^|_)receipt-scene(_|$)/.test(String(receiptReady.printer.name)) &&
          /(^|_)homepage-scene(_|$)/.test(String(receiptReady.homepage.name)),
        `小票预览：图就绪且可视时应挂载 10s 周期关键帧（${
          receiptReady
            ? `paper=${receiptReady.paper.name} printer=${receiptReady.printer.name} homepage=${receiptReady.homepage.name}`
            : '预览未就绪'
        }）`,
      )
    ) {
      await sleep(600);
      const playing = await receiptState();
      expect(
        !!(
          playing &&
          playing.paper.state === 'running' &&
          playing.paper.time - receiptReady.paper.time >= 350
        ),
        `小票预览：可视时 paper-feed 应推进（${receiptReady.paper.time}ms -> ${playing ? playing.paper.time : '缺失'}ms）`,
      );
      checks.push(
        `receipt visible: 10s cycle advancing ${receiptReady.paper.time} -> ${playing ? playing.paper.time : '?'}ms`,
      );
    }

    await evaluate(hideTile('/products/personal-sites'));
    const receiptPaused = await until(
      receiptState,
      (state) => state && state.running === 'false',
      6000,
    );
    expect(
      !!receiptPaused && receiptPaused.paper.state === 'paused',
      `小票预览：离屏后周期应暂停（data-running=${receiptPaused ? receiptPaused.running : '缺失'}，paper playState=${receiptPaused ? receiptPaused.paper.state : '缺失'}）`,
    );
    if (receiptPaused) {
      await sleep(900);
      const receiptFrozen = await receiptState();
      expect(
        !!(
          receiptFrozen &&
          receiptFrozen.paper.time !== null &&
          Math.abs(receiptFrozen.paper.time - receiptPaused.paper.time) <= 40
        ),
        `小票预览：离屏暂停期间动画时间应冻结（${receiptPaused.paper.time}ms -> ${receiptFrozen ? receiptFrozen.paper.time : '缺失'}ms）`,
      );
      checks.push('receipt offscreen: paused and clock frozen');
    }

    await evaluate(revealTile('/products/personal-sites'));
    await until(receiptState, (state) => state && state.running === 'true', 6000);
    await pressShift();
    await until(inputMode, (mode) => mode === 'keyboard', 3000);
    const receiptKeyboard = await until(
      receiptState,
      (state) => state && state.running === 'false',
      6000,
    );
    expect(
      !!receiptKeyboard && receiptKeyboard.animations === 0,
      `小票预览：键盘模式 animation 应归零（ready=${receiptKeyboard ? receiptKeyboard.ready : '缺失'}，实际 ${receiptKeyboard ? receiptKeyboard.animations : '缺失'} 个动画）`,
    );
    expect(
      !!receiptKeyboard &&
        receiptKeyboard.paper.transform === 'none' &&
        receiptKeyboard.printer.opacity === '1' &&
        receiptKeyboard.homepage.opacity === '0',
      `小票预览：键盘模式应显示完整小票（paper=${receiptKeyboard ? receiptKeyboard.paper.transform : '缺失'}，printer=${receiptKeyboard ? receiptKeyboard.printer.opacity : '缺失'}，homepage=${receiptKeyboard ? receiptKeyboard.homepage.opacity : '缺失'}）`,
    );
    checks.push('receipt keyboard: animation none, full receipt shown');
    await restorePointer();

    await setReduced('reduce');
    await until(receiptState, (state) => state && state.running === 'false', 6000);
    const receiptReduced = await receiptState();
    expect(
      !!receiptReduced &&
        receiptReduced.animations === 0 &&
        receiptReduced.paper.transform === 'none',
      `小票预览：减少动态效果应为静态完整小票（${receiptReduced ? receiptReduced.animations : '缺失'} 个动画，paper=${receiptReduced ? receiptReduced.paper.transform : '缺失'}）`,
    );
    checks.push('receipt reduced motion: static complete receipt');
    await setReduced('no-preference');

    // Blocking the cover plus a disabled cache is the only way to reach the
    // production data-ready="false" path for a local bundled image.
    await cdp.send('Network.enable', {}, { timeoutMs: 5000 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    // The optimizer request carries the percent-encoded path in its url= parameter.
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*personal-sites*home.webp*', '*%2Fpersonal-sites%2Fhome.webp*'],
    });
    await tab.goto(base + '/');
    await tab.playwright
      .locator('#home-timeline a[href="/products/personal-sites"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 20000 });
    await evaluate(revealTile('/products/personal-sites'));
    // 负向断言等的是 false 状态：显式等被拦截的封面请求收敛（img complete 即错误收敛），
    // 不依赖固定时长——流式/水合时序变化不会把「未就绪」误报成竞态
    await until(
      () =>
        evaluate(`(() => {
          const img = document.querySelector('a[href="/products/personal-sites"] div[data-ready] img');
          return !!(img && img.complete);
        })()`),
      (settled) => settled,
      10000,
    );
    await sleep(300);
    const notReady = await receiptState();
    expect(
      !!(notReady && notReady.ready === 'false'),
      `小票预览：封面图被拦截时应保持 data-ready=false（实际 ${notReady ? notReady.ready : '缺失'}）`,
    );
    expect(
      !!(notReady && notReady.animations === 0),
      `小票预览：图未就绪不得播放 10s 周期（实际 ${notReady ? notReady.animations : '缺失'} 个动画）`,
    );
    checks.push('receipt cover blocked: data-ready=false, no cycle attached');
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    await cdp.send('Network.disable', {}, { timeoutMs: 5000 });

    await evaluate(revealTile('/products/ai-chat'));
    const chatRunning = await until(
      chatState,
      (state) => state && state.running && state.motion,
      8000,
    );
    if (
      expect(
        !!chatRunning && chatRunning.playState === 'running',
        `AI 问答预览：可视且指针模式应播放（data-motion=${chatRunning ? chatRunning.motion : '缺失'}，--preview-play-state=${chatRunning ? chatRunning.playState : '缺失'}）`,
      )
    ) {
      const animations = await chatAnimationProperties();
      expect(
        !!(
          animations &&
          animations.count > 0 &&
          animations.states.every((state) => state === 'running')
        ),
        `AI 问答预览：8s 循环应处于运行态（${animations ? animations.count : '缺失'} 个动画，状态 ${animations ? animations.states.join(',') : '缺失'}）`,
      );
      expect(
        !!(
          animations &&
          animations.properties.length > 0 &&
          animations.properties.every(
            (property) => property === 'opacity' || property === 'transform',
          )
        ),
        `AI 问答预览：循环仅应动画 transform/opacity（实际 ${animations ? animations.properties.join(',') : '缺失'}）`,
      );
      const change = await chatSamples(1200, 6500);
      expect(
        !!(change && change.distinct >= 2),
        `AI 问答预览：一轮内元素 transform/opacity 采样应变化（${change ? change.distinct : '缺失'} 种状态）`,
      );
      checks.push(
        `chat visible: 8s loop running, ${animations ? animations.properties.join('/') : '?'} only, samples change`,
      );
    }

    await evaluate(hideTile('/products/ai-chat'));
    const chatPaused = await until(chatState, (state) => state && !state.running, 6000);
    expect(
      !!chatPaused && chatPaused.playState === 'paused',
      `AI 问答预览：离屏后应暂停（data-running=${chatPaused ? chatPaused.running : '缺失'}，--preview-play-state=${chatPaused ? chatPaused.playState : '缺失'}）`,
    );
    const chatFrozen = await chatSamples(900, 3000);
    expect(
      !!(chatFrozen && chatFrozen.frozen),
      `AI 问答预览：离屏暂停期间采样应不变（${chatFrozen ? chatFrozen.distinct : '缺失'} 种状态）`,
    );
    checks.push('chat offscreen: paused, samples frozen');

    await evaluate(revealTile('/products/ai-chat'));
    await until(chatState, (state) => state && state.running, 6000);
    await pressShift();
    await until(inputMode, (mode) => mode === 'keyboard', 3000);
    const chatKeyboard = await until(
      chatState,
      (state) => state && !state.running && !state.motion,
      6000,
    );
    expect(
      !!chatKeyboard,
      'AI 问答预览：键盘模式应移除 data-motion 与 data-running（即时策略不挂循环）',
    );
    const chatKeyboardAnimations = await chatAnimationProperties();
    expect(
      !!(chatKeyboardAnimations && chatKeyboardAnimations.count === 0),
      `AI 问答预览：键盘模式不得保留循环动画（实际 ${chatKeyboardAnimations ? chatKeyboardAnimations.count : '缺失'} 个）`,
    );
    const chatKeyboardStatic = await chatStaticState();
    expect(
      !!(
        chatKeyboardStatic &&
        chatKeyboardStatic.question.opacity === '1' &&
        chatKeyboardStatic.followUp.opacity === '1' &&
        chatKeyboardStatic.bars.every((bar) => bar.transform === 'none')
      ),
      `AI 问答预览：键盘模式应显示静态完成态（question=${chatKeyboardStatic ? chatKeyboardStatic.question.opacity : '缺失'}，followUp=${chatKeyboardStatic ? chatKeyboardStatic.followUp.opacity : '缺失'}）`,
    );
    checks.push('chat keyboard: static completed state, no animations');
    await restorePointer();

    await setReduced('reduce');
    const chatReduced = await until(
      chatState,
      (state) => state && !state.running && !state.motion,
      6000,
    );
    const chatReducedAnimations = await chatAnimationProperties();
    const chatReducedStatic = await chatStaticState();
    expect(
      !!(
        chatReduced &&
        chatReducedAnimations &&
        chatReducedAnimations.count === 0 &&
        chatReducedStatic &&
        chatReducedStatic.question.opacity === '1'
      ),
      'AI 问答预览：减少动态效果应为静态完成态且无动画',
    );
    checks.push('chat reduced motion: static completed state');
    await setReduced('no-preference');

    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  }
}
