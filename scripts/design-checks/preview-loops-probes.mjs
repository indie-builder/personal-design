// Internal browser setup and probes; expressions stay in the page execution context.
export function createPreviewLoopProbe(cdp) {
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
  const until = async (probe, accept, timeoutMs) => {
    const started = Date.now();
    for (;;) {
      const value = await probe();
      if (accept(value)) return value;
      if (Date.now() - started > timeoutMs) return null;
      await sleep(120);
    }
  };
  const mouseClick = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1 },
        { timeoutMs: 5000 },
      );
  };
  // Shift reaches the document-level data-input capture listener like any keydown,
  // but unlike Tab it moves no focus and activates nothing.
  const pressShift = async () => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        {
          type,
          key: 'Shift',
          code: 'ShiftLeft',
          windowsVirtualKeyCode: 16,
          nativeVirtualKeyCode: 16,
        },
        { timeoutMs: 5000 },
      );
  };
  const inputMode = () => evaluate('document.documentElement.dataset.input || null');
  const setReduced = (value) =>
    cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
  const restorePointer = async () => {
    const point = await evaluate(`(() => {
      const date = document.querySelector('#home-timeline time');
      if (!date) return null;
      const rect = date.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (point) await mouseClick(point.x, point.y);
  };
  const revealTile = (href) => `(() => {
    const link = document.querySelector('a[href="${href}"]');
    if (!link) return false;
    link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
    return true;
  })()`;
  const hideTile = (href) => `(() => {
    const track = document.getElementById('home-timeline');
    const link = document.querySelector('a[href="${href}"]');
    if (!track || !link) return false;
    const tile = link.closest('li');
    const viewportRect = track.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const currentLeft = tileRect.left - viewportRect.left + track.scrollLeft;
    const max = track.scrollWidth - track.clientWidth;
    const pushLeft = currentLeft + tileRect.width + 24;
    const target = pushLeft <= max ? pushLeft : Math.max(0, currentLeft - track.clientWidth - 24);
    track.scrollTo({ left: target, behavior: 'instant' });
    const after = tile.getBoundingClientRect();
    return after.right <= viewportRect.left || after.left >= viewportRect.right;
  })()`;
  const bookState = () =>
    evaluate(`(() => {
    const root = document.querySelector('a[href="/products/layout-compositions"] div[data-running]');
    const spine = root ? root.querySelector('[data-book-active="true"]') : null;
    if (!root || !spine) return null;
    const animation = spine.getAnimations()[0];
    return {
      running: root.dataset.running,
      title: spine.getAttribute('data-cover-title'),
      playState: animation ? animation.playState : null,
      time: animation ? Math.round(animation.currentTime) : null,
    };
  })()`);
  const bookSubtreeAnimations = () =>
    evaluate(`(() => {
    const root = document.querySelector('a[href="/products/layout-compositions"] div[data-running]');
    return root ? root.getAnimations({ subtree: true }).length : null;
  })()`);
  const bookAdvance = (limitMs) =>
    evaluate(`new Promise((resolve) => {
    const titles = [];
    const started = performance.now();
    const sample = () => {
      const spine = document.querySelector('a[href="/products/layout-compositions"] [data-book-active="true"]');
      const title = spine ? spine.getAttribute('data-cover-title') : null;
      if (title && titles[titles.length - 1] !== title) titles.push(title);
      if (titles.length >= 2 || performance.now() - started > ${limitMs}) resolve({ titles, last: title });
      else setTimeout(sample, 400);
    };
    sample();
  })`);
  const receiptState = () =>
    evaluate(`(() => {
    const root = document.querySelector('a[href="/products/personal-sites"] div[data-ready]');
    if (!root) return null;
    const name = [...root.querySelectorAll('div')].find(
      (el) => !el.childElementCount && el.textContent.trim() === '陈远 / CHEN YUAN',
    );
    if (!name) return null;
    const paper = name.parentElement;
    const printer = paper.parentElement.parentElement;
    const homepage = root.firstElementChild;
    const read = (el) => {
      const styles = getComputedStyle(el);
      const animation = el.getAnimations()[0];
      return {
        name: styles.animationName,
        playState: styles.animationPlayState,
        transform: styles.transform,
        opacity: styles.opacity,
        time: animation ? Math.round(animation.currentTime) : null,
        state: animation ? animation.playState : null,
      };
    };
    return {
      ready: root.dataset.ready,
      running: root.dataset.running,
      paper: read(paper),
      printer: read(printer),
      homepage: read(homepage),
      animations: root.getAnimations({ subtree: true }).length,
    };
  })()`);
  const chatState = () =>
    evaluate(`(() => {
    const root = document.querySelector('[data-chat-preview]');
    if (!root) return null;
    return {
      running: root.hasAttribute('data-running'),
      motion: root.hasAttribute('data-motion'),
      playState: getComputedStyle(root).getPropertyValue('--preview-play-state').trim(),
      animations: root.getAnimations({ subtree: true }).length,
    };
  })()`);
  const chatAnimationProperties = () =>
    evaluate(`(() => {
    const root = document.querySelector('[data-chat-preview]');
    if (!root) return null;
    const animations = root.getAnimations({ subtree: true });
    // CSSAnimation.getKeyframes is not callable here; collect properties from the
    // CSSKeyframesRule that animationName points at instead.
    const keyframeProperties = (name) => {
      const props = new Set();
      for (const sheet of document.styleSheets)
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSKeyframesRule && rule.name === name)
              for (const frame of rule.cssRules)
                for (let i = 0; i < frame.style.length; i++) props.add(frame.style[i]);
          }
        } catch {}
      return [...props];
    };
    const properties = new Set();
    for (const animation of animations) {
      if (animation.animationName && animation.animationName !== 'none')
        for (const property of keyframeProperties(animation.animationName)) properties.add(property);
      else if (animation.transitionProperty) properties.add(animation.transitionProperty);
    }
    return {
      count: animations.length,
      states: [...new Set(animations.map((animation) => animation.playState))],
      properties: [...properties].sort(),
    };
  })()`);
  const chatSamples = (intervalMs, limitMs) =>
    evaluate(`new Promise((resolve) => {
    const root = document.querySelector('[data-chat-preview]');
    const spans = [...root.querySelectorAll('span')];
    const question = spans.find((el) => el.textContent === '看看两周试用的效果');
    const followUp = spans.find((el) => el.textContent === '看看改进建议');
    if (!question || !followUp) { resolve({ distinct: 0, frozen: false, missing: true }); return; }
    const answer = followUp.parentElement;
    const thinking = answer.parentElement.firstElementChild;
    const bars = [...root.querySelectorAll('b')];
    const signature = () => [question, thinking, answer, followUp, ...bars]
      .map((el) => {
        const styles = getComputedStyle(el);
        return styles.opacity + '|' + styles.transform;
      })
      .join(';');
    const seen = [];
    const started = performance.now();
    const sample = () => {
      const value = signature();
      if (seen[seen.length - 1] !== value) seen.push(value);
      if (seen.length >= 2 || performance.now() - started > ${limitMs})
        resolve({ distinct: seen.length, frozen: seen.length === 1 });
      else setTimeout(sample, ${intervalMs});
    };
    sample();
  })`);
  const chatStaticState = () =>
    evaluate(`(() => {
    const root = document.querySelector('[data-chat-preview]');
    if (!root) return null;
    const spans = [...root.querySelectorAll('span')];
    const question = spans.find((el) => el.textContent === '看看两周试用的效果');
    const followUp = spans.find((el) => el.textContent === '看看改进建议');
    const bars = [...root.querySelectorAll('b')];
    if (!question || !followUp || bars.length < 2) return null;
    const read = (el) => {
      const styles = getComputedStyle(el);
      return { opacity: styles.opacity, transform: styles.transform };
    };
    return { question: read(question), followUp: read(followUp), bars: bars.map(read) };
  })()`);

  const waitForReceiptCover = async () => {
    // 水合竞态补偿：直连封面的加载可能快于水合，React 的 onLoad 在监听器挂载前已完成
    // （img.complete=true 但 data-ready 停在 false，10s 周期永不挂载）。外壳 data-input
    // 对合成 pointermove 有响应即水合完成；对已完成且解码成功的封面补发一次 load 事件
    // 等价于浏览器从缓存重放完成通知。断言不变：负向路径的 ready=false 仍由下方请求
    // 拦截真实产生（naturalWidth=0 时不会补发）。
    await until(
      () =>
        evaluate(`(() => {
          window.dispatchEvent(new Event('pointermove'));
          return document.documentElement.dataset.input || null;
        })()`),
      (mode) => mode === 'pointer',
      20000,
    );
    await evaluate(`(() => {
      const root = document.querySelector('a[href="/products/personal-sites"] div[data-ready]');
      const img = root ? root.querySelector('img') : null;
      if (root && root.dataset.ready !== 'true' && img && img.complete && img.naturalWidth > 0)
        img.dispatchEvent(new Event('load'));
      return root ? root.dataset.ready : null;
    })()`);
  };
  return {
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
  };
}
