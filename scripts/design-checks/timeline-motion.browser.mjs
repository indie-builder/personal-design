import { createTimelineMotionProbe } from './timeline-motion-probes.mjs';

// Pass a compatible production tab, CDP session and viewport adapter on the homepage.
// Timeline pixel-walker per DESIGN.md 时间轴像素精灵 and the homepage contract: one WAAPI
// clock drives transform/gait/date bump, offscreen pauses keep progress, keyboard and
// reduced motion stay static, and the one-shot route exits instead of looping.
// Failures collect into issues; callers must check `passed`.
export async function verifyTimelineMotion(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const issues = [];
  const checks = [];
  const expect = (ok, message) => {
    if (!ok) issues.push(message);
    return ok;
  };
  const {
    evaluate,
    key,
    pointerMove,
    waitWalker,
    WAIT_ROUTE,
    matrixXY,
    INSTALL_RECORDER,
    HARVEST,
    STATIC_PROBE,
    pauseOffscreen,
    resumeOnscreen,
    finishRoute,
  } = createTimelineMotionProbe(tab, cdp);

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });

    await viewport.set({ width: 1440, height: 220 });
    await tab.goto(base + '/');
    await waitWalker();
    const ready = await evaluate(WAIT_ROUTE);
    expect(ready, '低视口下漫步者路线动画应已创建（组件挂载且未启动）');
    // 批量共享页面时，路由滚动恢复会把时间轴的横向滚动还原到上一检查离开的位置，
    // 漫步者可能被横向裁剪而保持暂停（IO 不可见）。把它滚进视口并等运行态到达——
    // 那是指针段全部断言的前提；键盘／减少动态段各自需要静止态，不做此等待
    await evaluate(`(async () => {
      const scene = document.querySelector('[data-timeline-walker]');
      scene?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
      const started = performance.now();
      while (performance.now() - started < 6000 && scene?.dataset.running !== 'true')
        await new Promise((resolve) => setTimeout(resolve, 100));
      return scene?.dataset.running ?? null;
    })()`);
    await evaluate(INSTALL_RECORDER);
    await viewport.set({ width: 1440, height: 900 });
    const walk = await evaluate(HARVEST);
    const frames = walk ? walk.log : [];
    const first = frames[0] ?? {};
    const last = frames[frames.length - 1] ?? {};
    expect(frames.length > 30, `漫步者采样帧不足（${frames.length} 帧），无法判定路线行为`);
    expect(
      walk && walk.stops >= 3,
      `时间轴作品站点数不足（${walk ? walk.stops : 0}），检查前提失效`,
    );
    expect(Number(first.ct) <= 800, `采样开始过晚（首帧 currentTime=${first.ct}），爬出段未被覆盖`);
    expect(
      frames.filter((f) => f.run === 'true').length > 10 &&
        last.run === 'true' &&
        last.play === 'running',
      `指针模式可见时漫步者应持续运行（run=${last.run}, play=${last.play}）`,
    );
    const monotonic = frames.every(
      (f, i) => i === 0 || Number(f.ct) + 2 >= Number(frames[i - 1].ct),
    );
    const wall = Number(last.t) - Number(first.t);
    const clock = Number(last.ct) - Number(first.ct);
    expect(monotonic, '路线时钟不得回退');
    expect(Math.abs(clock - wall) <= 450, `路线时钟应与墙钟同速（${clock}ms/${wall}ms）`);
    expect(
      Math.abs(Number(last.revealCt) - Number(last.ct)) <= 150,
      `reveal 与路线应共享时钟（reveal=${last.revealCt}, route=${last.ct}）`,
    );
    const looks = new Set(frames.map((f) => f.look));
    expect(
      looks.has('left') && looks.has('right'),
      `张望朝向应左右翻转（observed ${[...looks].join(',')}）`,
    );
    expect(
      frames.every((f) => f.look !== 'left' || (Number(f.ct) >= 1250 && Number(f.ct) <= 2250)) &&
        frames.some((f) => f.look === 'right' && Number(f.ct) > 2250),
      '向左张望只应出现在 1300–2150ms 窗口（朝向跟随同一动画时钟）',
    );
    const steps = new Set(frames.map((f) => f.step));
    expect(
      steps.has('0') && steps.has('1') && frames.some((f) => f.step === '1' && Number(f.ct) > 3000),
      `行走段步态 data-step 应两帧交替（observed ${[...steps].join(',')}）`,
    );
    expect(
      frames.some((f) => Number(f.ct) <= 200 && f.pos && f.pos.y >= 34),
      '开局应从线下 y≈47 起步爬出',
    );
    expect(
      frames.some(
        (f) =>
          Number(f.ct) >= 1100 && Number(f.ct) <= 2900 && f.pos && f.pos.y >= 8 && f.pos.y <= 22,
      ),
      '站稳段应停在线上（y≈15）',
    );
    expect(
      frames.some((f) => Number(f.ct) >= 3600 && Number(f.ct) <= 4150 && f.pos && f.pos.y <= 5),
      '首个日期下方应上跳（y 到 -10 一带）',
    );
    expect(
      frames.some((f) => f.hit === 0) &&
        frames.some((f) => f.bump && Number(f.ct) >= 3650 && Number(f.ct) <= 4350),
      '到达日期下方应触发 timeline-date-bump（520ms）动画',
    );
    expect(
      frames.every((f) => f.hit <= 0),
      '采样窗口内不应推进到第二个日期',
    );
    expect(
      frames.every((f) => Number(f.ct) <= 4450 || (f.hit === -1 && !f.bump)),
      'date bump 窗口结束后应清除 data-hit',
    );
    expect(
      Number(first.pos ? first.pos.x : 999) <= 20 && Number(last.pos ? last.pos.x : 0) >= 240,
      `漫步者应沿时间轴前进（x ${first.pos && first.pos.x}→${last.pos && last.pos.x}）`,
    );
    checks.push(
      `pointer route: crawl+stand+look-flip+gait+jump+date-bump across ${frames.length} frames, x→${last.pos && last.pos.x}`,
    );

    const pause = await pauseOffscreen();
    expect(
      pause.before.run === 'true' && pause.before.play === 'running',
      '离屏暂停前漫步者应在运行',
    );
    expect(
      pause.run === 'false' && pause.play === 'paused',
      `离屏（时间轴横向滚出）应暂停（run=${pause.run}, play=${pause.play}）`,
    );
    expect(
      pause.ct1 === pause.ct2 && pause.ct2 >= pause.before.ct - 10,
      `离屏期间时钟应冻结并保留进度（${pause.before.ct}→${pause.ct1}→${pause.ct2}）`,
    );
    const resume = await resumeOnscreen();
    const resumedXY = matrixXY(resume.matrix);
    const pausedXY = matrixXY(resume.pausedMatrix);
    expect(
      resume.run === 'true' && resume.play === 'running',
      `回屏后应恢复运行（run=${resume.run}, play=${resume.play}）`,
    );
    expect(
      resume.ct1 >= resume.frozen - 5 && resume.ct1 - resume.frozen <= 1600,
      `恢复应从原进度继续，不重播不跳（frozen=${resume.frozen}, ct1=${resume.ct1}）`,
    );
    expect(resume.ct2 > resume.ct1, '恢复后时钟应继续前进');
    expect(
      resumedXY &&
        pausedXY &&
        Math.abs(resumedXY.x - pausedXY.x) <= 120 &&
        Math.abs(resumedXY.y - pausedXY.y) <= 60,
      `恢复瞬间不得跳变或重播（${JSON.stringify(pausedXY)}→${JSON.stringify(resumedXY)}）`,
    );
    checks.push(
      `offscreen pause/resume: frozen at ${resume.frozen}ms, continued to ${resume.ct2}ms without replay`,
    );

    const done = await finishRoute();
    if (done.error) {
      issues.push(`完成态检查失败：${done.error}`);
    } else {
      expect(
        Math.abs(done.total - (7000 + done.stops * 3000)) <= 2,
        `路线总时长应为 7s+3s×作品数（${done.total}ms, ${done.stops} 作品）`,
      );
      expect(
        done.wasRunning,
        '快进前漫步者应处于运行态（IO 裁剪下暂停的动画设 currentTime 不会触发 onfinish）',
      );
      expect(done.complete === 'true', `走完路线应置 data-complete（${done.complete}）`);
      expect(
        done.run === 'false' && done.visibility === 'hidden',
        `完成后应退出并不再运行（run=${done.run}, visibility=${done.visibility}）`,
      );
      expect(
        done.plays.every((p) => p !== 'running'),
        `完成后不应有常驻运行动画（${done.plays.join(',')}）`,
      );
      checks.push(
        `completion: ${done.total}ms route exits with data-complete, hidden, no running animations`,
      );
    }

    await viewport.set({ width: 1440, height: 220 });
    await tab.goto(base + '/');
    await waitWalker();
    expect(await evaluate(WAIT_ROUTE), '键盘场景下路线动画应已创建');
    await key({ key: 'Shift', code: 'ShiftLeft', code0: 16 });
    const kbInput = await evaluate(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const scene = document.querySelector('[data-timeline-walker]');
      return {
        input: document.documentElement.dataset.input ?? null,
        instant: scene.dataset.instant ?? null,
      };
    })()`);
    expect(
      kbInput.input === 'keyboard' && kbInput.instant === 'true',
      `可信 keydown 应切 data-input=keyboard 且漫步者进入即时策略（input=${kbInput.input}, instant=${kbInput.instant}）`,
    );
    await viewport.set({ width: 1440, height: 900 });
    const kbState = await evaluate(STATIC_PROBE);
    expect(
      kbState.run === 'false' && kbState.play === 'paused' && kbState.visibility === 'hidden',
      `键盘模式不应启动路线（run=${kbState.run}, play=${kbState.play}, visibility=${kbState.visibility}）`,
    );
    expect(
      kbState.ct1 === kbState.ct2 && kbState.ct2 <= 50 && kbState.rv1 === kbState.rv2,
      `键盘模式时钟应静止（route ${kbState.ct1}→${kbState.ct2}, reveal ${kbState.rv1}→${kbState.rv2}）`,
    );
    expect(kbState.hits === 0 && !kbState.bumping, '键盘模式 onHit 不得推进 date bump');
    checks.push('keyboard: trusted keydown keeps walker hidden, clocks frozen, no date bump');

    await pointerMove();
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await viewport.set({ width: 1440, height: 220 });
    await tab.goto(base + '/');
    await waitWalker();
    expect(await evaluate(WAIT_ROUTE), '减少动态场景下路线动画应已创建');
    await viewport.set({ width: 1440, height: 900 });
    const rmState = await evaluate(STATIC_PROBE);
    expect(rmState.reduced, '模拟 prefers-reduced-motion 未生效');
    expect(
      rmState.instant === 'true' &&
        rmState.run === 'false' &&
        rmState.play === 'paused' &&
        rmState.visibility === 'hidden',
      `减少动态效果下路线应保持隐藏静止（instant=${rmState.instant}, run=${rmState.run}, visibility=${rmState.visibility}）`,
    );
    expect(
      rmState.ct1 === rmState.ct2 && rmState.ct2 <= 50 && rmState.rv1 === rmState.rv2,
      `减少动态效果下时钟应静止（route ${rmState.ct1}→${rmState.ct2}）`,
    );
    expect(rmState.hits === 0 && !rmState.bumping, '减少动态效果下不得推进 date bump');
    checks.push('reduced motion: walker hidden via media query, clocks frozen, no date bump');

    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    issues.push(`unexpected: ${error.message}`);
    return { passed: false, base, checks, issues };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
