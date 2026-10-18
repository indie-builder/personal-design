// Internal browser setup and probes; expressions stay in the page execution context.
export function createRouteMotionProbe(tab, cdp, expect) {
  const evaluate = async (expression) => {
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      { timeoutMs: 20000 },
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const mouseClick = async (x, y, modifiers = 0) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1, modifiers },
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
  const INSTALL_RECORDER = `(() => {
    const log = [];
    const startUrl = location.pathname + location.search;
    const start = performance.now();
    let signature = null;
    let stable = 0;
    window.__routeMotionLog = null;
    window.__routeMotionStop = null;
    const sample = () => {
      const content = document.getElementById('workspace-content');
      const anims = content ? content.getAnimations().map((a) => ({
        state: a.playState,
        duration: a.effect ? Number(a.effect.getTiming().duration) : null,
        keys: a.effect && a.effect.getKeyframes ? a.effect.getKeyframes().map((k) => ({
          opacity: k.opacity === undefined ? null : String(k.opacity),
          transform: k.transform === undefined ? null : String(k.transform),
        })) : [],
      })) : [];
      const frame = {
        t: Math.round(performance.now() - start),
        url: location.pathname + location.search,
        routeMotion: document.querySelector('[data-route-motion]') ? 1 : 0,
        travelTitles: document.querySelectorAll('[class*="travelTitle"]').length,
        anims,
      };
      const next = JSON.stringify({ ...frame, t: 0 });
      if (next !== signature) { log.push(frame); signature = next; }
      const settled = frame.url !== startUrl && !frame.routeMotion && !frame.travelTitles && frame.anims.length === 0;
      stable = settled ? stable + 1 : 0;
      if (stable >= 3 || window.__routeMotionStop || performance.now() - start > 6000) { window.__routeMotionLog = log; return; }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`;
  const HARVEST = `new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      if (window.__routeMotionLog || performance.now() - started > 7500) resolve(window.__routeMotionLog || []);
      else setTimeout(poll, 60);
    };
    poll();
  })`;
  const runScenario = async (click) => {
    await evaluate(INSTALL_RECORDER);
    await click();
    return evaluate(HARVEST);
  };
  const exitKeys = (keys, sign) => {
    const last = keys[keys.length - 1] ?? {};
    const transform = String(last.transform ?? '');
    return (
      String(keys[0]?.opacity ?? '') === '1' &&
      String(last.opacity ?? '') === '0' &&
      (sign < 0
        ? transform.includes('-28px')
        : transform.includes('28px') && !transform.includes('-28px'))
    );
  };
  const pathOf = (url) => String(url ?? '').split('?')[0];
  const sawExit = (frames, url, sign) =>
    frames.some(
      (f) =>
        pathOf(f.url) === url && f.anims.some((a) => a.duration === 180 && exitKeys(a.keys, sign)),
    );
  const sawEntry = (frames, fromUrl, sign) =>
    frames.some(
      (f) =>
        pathOf(f.url) !== fromUrl &&
        f.anims.some((a) => {
          const first = String(a.keys[0]?.transform ?? '');
          return (
            a.duration === 360 &&
            (sign < 0 ? first.includes('translateX(-28px') : first.includes('translateX(28px'))
          );
        }),
    );
  const exitBeforeCommit = (frames, fromUrl) => {
    const exitAt = frames.findIndex(
      (f) => pathOf(f.url) === fromUrl && f.anims.some((a) => a.duration === 180),
    );
    const commitAt = frames.findIndex((f) => pathOf(f.url) !== fromUrl);
    return exitAt !== -1 && commitAt > exitAt;
  };
  const settledClean = (frames, pathStart) => {
    const last = frames[frames.length - 1] ?? {};
    return (
      !last.routeMotion &&
      !last.travelTitles &&
      (last.anims ?? []).length === 0 &&
      pathOf(last.url).startsWith(pathStart)
    );
  };
  const pageState = () =>
    evaluate(`(() => {
      const content = document.getElementById('workspace-content');
      const rect = content ? content.getBoundingClientRect() : null;
      const hit = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, Math.min(rect.top + rect.height / 2, innerHeight - 20))
        : null;
      return {
        scrollY: Math.round(window.scrollY),
        activeId: document.activeElement ? document.activeElement.id : null,
        titleVisible: document.querySelector('main h1') ? document.querySelector('main h1').checkVisibility() : false,
        gridTitleVisible: document.querySelector('h1[data-workspace-title]')
          ? document.querySelector('h1[data-workspace-title]').checkVisibility()
          : false,
        contentAnims: content ? content.getAnimations().length : -1,
        hitInsideContent: !!(hit && content && (hit === content || content.contains(hit))),
      };
    })()`);
  const pickCell = () =>
    evaluate(`(async () => {
      window.scrollTo(0, 600);
      const cells = [...document.querySelectorAll('section[aria-label="灵感浏览"] a[id^="muse-"]')];
      let chosen = cells.find((a) => {
        const r = a.getBoundingClientRect();
        return r.height > 0 && r.bottom > 80 && r.top < innerHeight - 80;
      });
      if (!chosen) chosen = cells[0];
      const started = performance.now();
      while (performance.now() - started < 2000) {
        chosen.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const r = chosen.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + Math.min(r.height / 2, 100);
        if (chosen.contains(document.elementFromPoint(x, y)))
          return { id: chosen.id, href: chosen.getAttribute('href'), path: chosen.pathname, x, y, scrollY: Math.round(window.scrollY) };
      }
      throw new Error('Grid card did not settle at a clickable point');
    })()`);
  const navLinks = () =>
    evaluate(`(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, href: el.getAttribute('href'), path: el.pathname };
      };
      const nav = document.querySelector('nav[aria-label="作品导航"]');
      return {
        back: rect(nav?.querySelector('a:not([data-direction])') || nav?.querySelector('a')),
        prev: rect(nav?.querySelector('a[data-direction="previous"][aria-label^="上一件"]')),
        next: rect(nav?.querySelector('a[data-direction="next"]')),
        keyboardPrev: document.documentElement.dataset.detailPrev || null,
        keyboardNext: document.documentElement.dataset.detailNext || null,
      };
    })()`);
  const GRID_STATE = `(() => {
    const ids = [...document.querySelectorAll('section[aria-label="灵感浏览"] a[id^="muse-"]')].map((a) => a.id);
    const section = document.querySelector('section[aria-label="灵感浏览"]');
    const status = document.querySelector('p[data-status]');
    const active = document.activeElement;
    return {
      url: location.pathname + location.search,
      cells: ids.length,
      unique: new Set(ids).size,
      busy: section ? section.getAttribute('aria-busy') === 'true' : null,
      status: status ? status.getAttribute('data-status') : null,
      scrollY: Math.round(window.scrollY),
      activeInside: !!(active && active.closest && active.closest('section[aria-label="灵感浏览"]')),
    };
  })()`;
  const waitFor = async (expression, predicate, { timeoutMs = 6000, intervalMs = 100 } = {}) => {
    const startedAt = Date.now();
    let state = await evaluate(expression);
    while (!predicate(state) && Date.now() - startedAt < timeoutMs) {
      await evaluate(`new Promise((resolve) => setTimeout(resolve, ${intervalMs}))`);
      state = await evaluate(expression);
    }
    return state;
  };
  const cellInView = () =>
    evaluate(`(() => {
      const cells = [...document.querySelectorAll('section[aria-label="灵感浏览"] a[id^="muse-"]')];
      let chosen = cells.find((a) => {
        const r = a.getBoundingClientRect();
        return r.height > 0 && r.bottom > 100 && r.top < innerHeight - 100;
      });
      if (!chosen) chosen = cells[0];
      chosen.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = chosen.getBoundingClientRect();
      return { id: chosen.id, path: chosen.pathname, x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 100), scrollY: Math.round(window.scrollY) };
    })()`);
  const scrollForBatches = async (factor, maxSteps) => {
    let state = await evaluate(GRID_STATE);
    const target = state.cells * factor;
    for (
      let step = 0;
      step < maxSteps && (state.cells < target || state.scrollY < 2000);
      step += 1
    ) {
      const before = state.cells;
      await evaluate(`window.scrollTo(0, Math.max(2000, ${state.scrollY} + 1600))`);
      state = await waitFor(GRID_STATE, (next) => next.cells > before, { timeoutMs: 3000 });
      if (state.cells <= before) break;
    }
    return state;
  };
  const openGrid = async (base) => {
    await tab.goto(base + '/products/muse');
    await tab.playwright
      .locator('section[aria-label="灵感浏览"] a[id^="muse-"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 20000 });
    // 批量共享页面时，路由滚动恢复会把网格还原到上一检查离开的位置；恢复若落在
    // pickCell 的坐标计算与点击之间，采样就会把裁剪／漂移误读为动效缺陷。参照
    // timeline-motion 的加固：先把关键滚动容器滚进视口并锚回顶部，轮询网格就绪
    // 态（aria-busy 解除 + data-status=ready）且滚动位置连续两帧稳定后再采样。
    const settled = await evaluate(`(async () => {
      const section = document.querySelector('section[aria-label="灵感浏览"]');
      section?.scrollIntoView({ block: 'start', behavior: 'instant' });
      window.scrollTo(0, 0);
      const started = performance.now();
      while (performance.now() - started < 6000) {
        const ready =
          section?.getAttribute('aria-busy') !== 'true' &&
          document.querySelector('p[data-status]')?.getAttribute('data-status') === 'ready';
        const stable = await new Promise((resolve) => {
          const first = window.scrollY;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY === first)));
        });
        if (ready && stable) return { scrollY: Math.round(window.scrollY) };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    })()`);
    expect(settled !== null, '网格滚动恢复应落定（ready 且滚动位置稳定）后才开始采样');
  };

  const reverseDuringEntry = async (cell) => {
    await evaluate(INSTALL_RECORDER);
    await mouseClick(cell.x, cell.y);
    await evaluate(
      `new Promise((resolve) => {
        const started = performance.now();
        const poll = () => (location.pathname !== '/products/muse' || performance.now() - started > 4000) ? resolve() : requestAnimationFrame(poll);
        poll();
      })`,
    );
    const backPoint = await evaluate(`(() => {
      const started = performance.now();
      return new Promise((resolve) => {
        const poll = () => {
          const link = document.querySelector('nav[aria-label="作品导航"] a');
          if (link) { const r = link.getBoundingClientRect(); resolve({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); }
          else if (performance.now() - started > 1500) resolve(null);
          else requestAnimationFrame(poll);
        };
        poll();
      });
    })()`);
    if (backPoint) await mouseClick(backPoint.x, backPoint.y);
    return evaluate(HARVEST);
  };
  const returnWithHistory = async (cell) => {
    await mouseClick(cell.x, cell.y);
    await evaluate(
      `new Promise((resolve) => { const started = performance.now(); const poll = () => (location.pathname !== '/products/muse' || performance.now() - started > 4000) ? resolve() : requestAnimationFrame(poll); poll(); })`,
    );
    await evaluate(
      `new Promise((resolve) => { const started = performance.now(); const poll = () => { const content = document.getElementById('workspace-content'); ((content && !content.getAnimations().length) || performance.now() - started > 3000) ? resolve() : requestAnimationFrame(poll); }; poll(); })`,
    );
    return runScenario(() =>
      Promise.race([
        Promise.resolve(tab.back()).catch(() => undefined),
        evaluate(`new Promise((resolve) => setTimeout(resolve, 6000))`),
      ]),
    );
  };
  return {
    evaluate,
    mouseClick,
    key,
    runScenario,
    pathOf,
    sawExit,
    sawEntry,
    exitBeforeCommit,
    settledClean,
    pageState,
    pickCell,
    navLinks,
    GRID_STATE,
    waitFor,
    cellInView,
    scrollForBatches,
    openGrid,
    reverseDuringEntry,
    returnWithHistory,
  };
}
