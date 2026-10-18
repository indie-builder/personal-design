import { createRouteMotionProbe } from './route-motion-probes.mjs';

// Pass a compatible production tab, CDP session and viewport adapter.
// Route paired-motion keyframes on the muse grid/detail surfaces per DESIGN.md 动效.
// Failures collect into issues; callers must check `passed`.
export async function verifyRouteMotion(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const issues = [];
  const checks = [];
  const expect = (ok, message) => {
    if (!ok) issues.push(message);
    return ok;
  };
  const {
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
  } = createRouteMotionProbe(tab, cdp, expect);

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await viewport.set({ width: 1440, height: 900 });

    await openGrid(base);
    const cell = await pickCell();
    let frames = await runScenario(() => mouseClick(cell.x, cell.y));
    const gridUrl = pathOf(frames[0].url);
    expect(
      sawExit(frames, gridUrl, -1),
      '网格→详情：路由提交前 #workspace-content 应有 180ms 退场（末帧 translateX(-28px)）',
    );
    expect(exitBeforeCommit(frames, gridUrl), '网格→详情：退场期间 URL 不得提前切换');
    expect(sawEntry(frames, gridUrl, 1), '详情进入应为 360ms 且起始 translateX(28px)');
    expect(
      settledClean(frames, cell.path),
      '网格→详情：结束后应无 data-route-motion、travelTitle 或残留动画',
    );
    const afterEnter = await pageState();
    expect(
      afterEnter.titleVisible && afterEnter.hitInsideContent,
      '详情页真实标题可见且无透明阻挡层',
    );
    checks.push(
      `grid→detail pointer: 180ms exit -28px before commit, 360ms entry from +28px (${frames.length} frames)`,
    );

    const links = await navLinks();
    if (links.next) {
      frames = await runScenario(() => mouseClick(links.next.x, links.next.y));
      const fromNext = pathOf(frames[0].url);
      expect(sawExit(frames, fromNext, -1), '下一件：退场末帧应为 translateX(-28px)');
      expect(exitBeforeCommit(frames, fromNext), '下一件：退场期间 URL 不得提前切换');
      expect(sawEntry(frames, fromNext, 1), '下一件：目标页应自右（+28px）进入 360ms');
      expect(settledClean(frames, links.next.path), '下一件：结束后无动效残留');
      checks.push('next sibling: exit -28px, entry from right');
    } else issues.push('详情页缺少「下一件」链接，未覆盖 next 方向');

    const linksAfterNext = await navLinks();
    if (linksAfterNext.prev) {
      frames = await runScenario(() => mouseClick(linksAfterNext.prev.x, linksAfterNext.prev.y));
      const fromPrev = pathOf(frames[0].url);
      expect(sawExit(frames, fromPrev, 1), '上一件：退场应为默认末帧 translateX(28px)');
      expect(exitBeforeCommit(frames, fromPrev), '上一件：退场期间 URL 不得提前切换');
      expect(sawEntry(frames, fromPrev, -1), '上一件：目标页应自左（-28px）进入 360ms');
      expect(settledClean(frames, linksAfterNext.prev.path), '上一件：结束后无动效残留');
      checks.push('previous sibling: default exit +28px, entry from left');
    } else issues.push('详情页缺少「上一件」链接，未覆盖 previous 方向');

    const back = (await navLinks()).back;
    if (back) {
      frames = await runScenario(() => mouseClick(back.x, back.y));
      const beforeReturn = pathOf(frames[0].url);
      expect(
        sawExit(frames, beforeReturn, 1),
        '返回网格：原页应先播默认 180ms 退场（末帧 translateX(28px)）',
      );
      expect(exitBeforeCommit(frames, beforeReturn), '返回网格：退场期间 URL 不得提前切换');
      expect(sawEntry(frames, beforeReturn, 1), '返回网格：网格应以 360ms 自右重入');
      expect(
        frames.some((f) => f.travelTitles === 1),
        '返回网格：共享标题飞行层应出现',
      );
      expect(settledClean(frames, gridUrl), '返回网格：结束后无 travelTitle 或动效残留');
      await evaluate('new Promise((resolve) => setTimeout(resolve, 400))');
      const returned = await pageState();
      expect(
        returned.gridTitleVisible && returned.hitInsideContent,
        '返回网格：真实标题可见且无透明阻挡层',
      );
      expect(
        Math.abs(returned.scrollY - cell.scrollY) <= 80,
        `返回网格：滚动应恢复到 ${cell.scrollY}，实际 ${returned.scrollY}`,
      );
      expect(
        returned.activeId === cell.id,
        `返回网格：焦点应回到 ${cell.id}，实际 ${returned.activeId}`,
      );
      checks.push(
        `back to grid: exit then re-entry, scroll ${cell.scrollY}→${returned.scrollY}, focus ${returned.activeId}`,
      );
    } else issues.push('详情页缺少「返回灵感集」链接，未覆盖返回恢复');

    let deep = await scrollForBatches(3, 10);
    const deepBefore = deep.cells;
    const deepCell = await cellInView();
    frames = await runScenario(() => mouseClick(deepCell.x, deepCell.y));
    expect(
      sawExit(frames, gridUrl, -1),
      '深滚动→详情：原表面仍应有 180ms 退场（末帧 translateX(-28px)）',
    );
    expect(exitBeforeCommit(frames, gridUrl), '深滚动→详情：退场期间 URL 不得提前切换');
    expect(settledClean(frames, deepCell.path), '深滚动→详情：结束后无动效残留');
    const deepBack = (await navLinks()).back;
    if (deepBack) {
      frames = await runScenario(() => mouseClick(deepBack.x, deepBack.y));
      expect(settledClean(frames, gridUrl), '深滚动返回：结束后无 travelTitle 或动效残留');
      deep = await waitFor(
        GRID_STATE,
        (s) => !s.busy && s.status === 'ready' && s.cells >= deepBefore,
        { timeoutMs: 8000 },
      );
      expect(
        !deep.busy && deep.status === 'ready',
        `深滚动返回：浏览状态应就绪（status=${deep.status}，busy=${deep.busy}）`,
      );
      expect(
        Math.abs(deep.scrollY - deepCell.scrollY) <= 80,
        `深滚动返回：滚动应恢复到 ${deepCell.scrollY}，实际 ${deep.scrollY}`,
      );
      expect(
        deep.cells >= deepBefore,
        `深滚动返回：卡片数应不低于离开前 ${deepBefore}，实际 ${deep.cells}`,
      );
      expect(
        deep.cells === deep.unique,
        `深滚动返回：不得重复追加卡片（唯一 ${deep.unique}/${deep.cells}）`,
      );
      checks.push(
        `deep scroll: exit on original surface, ${deepBefore}→${deep.cells} cells, scroll ${deepCell.scrollY}→${deep.scrollY}`,
      );
    } else issues.push('深滚动：详情页缺少返回链接，未覆盖深滚动恢复');

    await evaluate('document.activeElement && document.activeElement.blur()');
    let focused = await evaluate(
      'document.activeElement ? document.activeElement.id || document.activeElement.tagName : null',
    );
    let tabs = 0;
    while (tabs < 40 && !String(focused).startsWith('muse-')) {
      await key({ key: 'Tab', code: 'Tab', code0: 9 });
      tabs += 1;
      await evaluate('new Promise((resolve) => requestAnimationFrame(resolve))');
      focused = await evaluate(
        'document.activeElement ? document.activeElement.id || document.activeElement.tagName : null',
      );
    }
    const keyCell = String(focused).startsWith('muse-')
      ? await evaluate(`(() => {
          const el = document.activeElement;
          return { id: el.id, path: el.pathname, href: el.getAttribute('href') };
        })()`)
      : await pickCell();
    if (!String(focused).startsWith('muse-'))
      await evaluate(`document.getElementById(${JSON.stringify(keyCell.id)}).focus()`);
    frames = await runScenario(() => key({ key: 'Enter', code: 'Enter', code0: 13 }));
    const gridAtEnter = frames[0]?.url ?? '/products/muse';
    expect(
      frames.every((f) => (f.url === gridAtEnter ? f.anims.length === 0 && !f.routeMotion : true)),
      '键盘 Enter：路由切换前不得创建任何空间动画',
    );
    expect(
      frames.every((f) => !f.routeMotion && !f.travelTitles),
      '键盘 Enter：不得出现 data-route-motion 或 travelTitle',
    );
    const enterArrived = await waitFor(
      'location.pathname + location.search',
      (url) => url.startsWith(keyCell.path),
      { timeoutMs: 6000 },
    );
    expect(
      !!enterArrived && enterArrived.startsWith(keyCell.path),
      `键盘 Enter：应即时切换到目标详情（${enterArrived}）`,
    );
    checks.push(
      `keyboard Enter${tabs ? ` after ${tabs} Tabs` : ''}: instant navigation, no motion artifacts`,
    );

    const keyboardTarget = await evaluate(
      `document.documentElement.dataset.detailPrev || document.documentElement.dataset.detailNext || null`,
    );
    if (keyboardTarget) {
      const navInfo = await navLinks();
      const arrowKey =
        keyboardTarget === navInfo.keyboardPrev
          ? { key: 'ArrowLeft', code: 'ArrowLeft', code0: 37 }
          : { key: 'ArrowRight', code: 'ArrowRight', code0: 39 };
      await evaluate('document.activeElement && document.activeElement.blur()');
      frames = await runScenario(() => key(arrowKey));
      expect(
        frames.every((f) => f.anims.length === 0 && !f.routeMotion && !f.travelTitles),
        '键盘方向键：相邻详情切换不得创建空间动画',
      );
      expect(
        settledClean(frames, new URL(base + keyboardTarget).pathname),
        '键盘方向键：应即时到达相邻详情',
      );
      checks.push('keyboard arrow: instant adjacent navigation');
    } else issues.push('详情页缺少 detailPrev/detailNext，未覆盖键盘相邻导航');

    await openGrid(base);
    const quickCell = await pickCell();
    frames = await reverseDuringEntry(quickCell);
    expect(
      settledClean(frames, gridUrl),
      '快速反向：取消进入并返回后应无残留动画、travelTitle 或 data-route-motion',
    );
    const reversed = await pageState();
    expect(
      reversed.gridTitleVisible && reversed.hitInsideContent,
      '快速反向：网格标题可见且无透明阻挡层',
    );
    checks.push('rapid reverse: entry cancelled, return committed, no leftovers');

    await openGrid(base);
    const nativeGridUrl = await evaluate('location.pathname + location.search');
    const nativeCell = await pickCell();
    frames = await returnWithHistory(nativeCell);
    expect(
      frames.every((f) => (f.anims ?? []).length === 0),
      '原生后退：popstate 不得产生任何表面动画',
    );
    expect(
      frames.every((f) => !f.routeMotion && !f.travelTitles),
      '原生后退：无 data-route-motion 或 travelTitle 残留',
    );
    expect(settledClean(frames, gridUrl), '原生后退：应回到网格并稳定');
    const native = await waitFor(GRID_STATE, (s) => !s.busy && s.status === 'ready', {
      timeoutMs: 6000,
    });
    expect(
      native.url === nativeGridUrl,
      `原生后退：网格 URL 应恢复为 ${nativeGridUrl}，实际 ${native.url}`,
    );
    expect(
      Math.abs(native.scrollY - nativeCell.scrollY) <= 80,
      `原生后退：滚动应恢复到 ${nativeCell.scrollY}，实际 ${native.scrollY}`,
    );
    expect(native.activeInside, '原生后退：网格内应存在恢复的焦点');
    checks.push(
      `native back: no motion frames, url kept, scroll ${nativeCell.scrollY}→${native.scrollY}, focus in grid`,
    );

    const modCell = await pickCell();
    // CDP Input modifiers 位掩码：Ctrl=2、Meta=4；macOS 以 Meta 开新标签，其余平台用 Ctrl。
    const modMask = process.platform === 'darwin' ? 4 : 2;
    frames = await runScenario(async () => {
      await mouseClick(modCell.x, modCell.y, modMask);
      await evaluate(`new Promise((resolve) => setTimeout(resolve, 800))`);
      await evaluate('window.__routeMotionStop = 1');
    });
    expect(
      frames.every((f) => (f.anims ?? []).length === 0),
      '修饰键点击：不得启动退场动画',
    );
    expect(
      frames.every((f) => !f.routeMotion && !f.travelTitles),
      '修饰键点击：无 data-route-motion 或 travelTitle',
    );
    const modUrl = await evaluate('location.pathname + location.search');
    expect(
      modUrl === nativeGridUrl,
      `修饰键点击：当前页 URL 应保持 ${nativeGridUrl}，实际 ${modUrl}`,
    );
    checks.push(
      `modifier click (mask ${modMask}): page unchanged, navigation left to browser default`,
    );

    await openGrid(base);
    const held = await scrollForBatches(3, 10);
    const heldBefore = held.cells;
    let heldCell = null;
    try {
      await cdp.send('Network.enable', {}, { timeoutMs: 5000 });
      await cdp.send(
        'Network.emulateNetworkConditions',
        {
          offline: false,
          latency: 1400,
          downloadThroughput: 2 * 1024 * 1024,
          uploadThroughput: 768 * 1024,
        },
        { timeoutMs: 5000 },
      );
      await evaluate(`window.scrollTo(0, Math.round(window.scrollY) + 1600)`);
      await evaluate(`new Promise((resolve) => setTimeout(resolve, 250))`);
      heldCell = await cellInView();
      frames = await runScenario(() => mouseClick(heldCell.x, heldCell.y));
      expect(exitBeforeCommit(frames, gridUrl), '限速追加→详情：退场期间 URL 不得提前切换');
      expect(settledClean(frames, heldCell.path), '限速追加→详情：结束后无动效残留');
      await evaluate(`new Promise((resolve) => setTimeout(resolve, 800))`);
    } finally {
      try {
        await cdp.send(
          'Network.emulateNetworkConditions',
          { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
          { timeoutMs: 5000 },
        );
        await cdp.send('Network.disable', {}, { timeoutMs: 5000 });
      } catch {
        // 尽力恢复网络；失败也已在上方收集断言，不掩盖原始结果。
      }
    }
    // Throttled in-flight requests can still be settling here; poll for the back link.
    const heldBack = await waitFor(
      `(() => {
        const nav = document.querySelector('nav[aria-label="作品导航"]');
        const el = nav?.querySelector('a:not([data-direction])') || nav?.querySelector('a');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, href: el.getAttribute('href'), path: el.pathname };
      })()`,
      (back) => !!back,
      { timeoutMs: 8000 },
    );
    if (heldBack) {
      frames = await runScenario(() => mouseClick(heldBack.x, heldBack.y));
      expect(settledClean(frames, gridUrl), '限速追加返回：结束后无动效残留');
      const restored = await waitFor(
        GRID_STATE,
        (s) => !s.busy && s.status === 'ready' && s.cells >= heldBefore,
        { timeoutMs: 6000 },
      );
      expect(
        !restored.busy && restored.status === 'ready',
        `限速追加返回：状态行应回到 ready 而非卡在更新（status=${restored.status}，busy=${restored.busy}）`,
      );
      expect(
        restored.cells === restored.unique,
        `限速追加返回：不得重复追加卡片（唯一 ${restored.unique}/${restored.cells}）`,
      );
      expect(
        restored.cells <= heldBefore + 48,
        `限速追加返回：卡片数不得异常翻倍（${heldBefore}→${restored.cells}）`,
      );
      expect(
        Math.abs(restored.scrollY - heldCell.scrollY) <= 80,
        `限速追加返回：滚动应恢复到 ${heldCell.scrollY}，实际 ${restored.scrollY}`,
      );
      const regrowBase = restored.cells;
      await evaluate(`window.scrollTo(0, Math.round(window.scrollY) + 2400)`);
      const regrown = await waitFor(GRID_STATE, (s) => s.cells > regrowBase, { timeoutMs: 5000 });
      expect(
        regrown.cells > regrowBase,
        `限速追加返回：sentinel 应能再次触发追加（${regrowBase}→${regrown.cells}）`,
      );
      expect(
        regrown.cells === regrown.unique,
        `限速追加返回：再次追加不得重复卡片（唯一 ${regrown.unique}/${regrown.cells}）`,
      );
      checks.push(
        `network hold: ${heldBefore}→${restored.cells}→${regrown.cells} cells, unique ids, status ready`,
      );
    } else issues.push('限速追加：详情页缺少返回链接，未覆盖返回恢复');

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await tab.goto(base + '/products/muse');
    await tab.playwright
      .locator('section[aria-label="灵感浏览"] a[id^="muse-"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 20000 });
    const reducedCell = await pickCell();
    frames = await runScenario(() => mouseClick(reducedCell.x, reducedCell.y));
    expect(
      frames.every((f) => f.anims.length === 0 && !f.routeMotion && !f.travelTitles),
      '减少动态效果：指针点击不得创建空间动画',
    );
    // Instant navigation means no animation before the switch; arrival itself is polled,
    // since suite load can commit the route after the recorder window closes.
    const reducedArrived = await waitFor(
      'location.pathname + location.search',
      (url) => url.startsWith(reducedCell.path),
      { timeoutMs: 6000 },
    );
    expect(
      !!reducedArrived && reducedArrived.startsWith(reducedCell.path),
      `减少动态效果：应即时切换到目标详情（${reducedArrived}）`,
    );
    checks.push('reduced motion pointer: instant navigation, no motion artifacts');

    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
