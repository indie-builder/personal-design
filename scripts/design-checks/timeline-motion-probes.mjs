// Internal browser setup and probes; expressions stay in the page execution context.
export function createTimelineMotionProbe(tab, cdp) {
  const evaluate = async (expression) => {
    const result = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      { timeoutMs: 20000 },
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
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
  const pointerMove = async () => {
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 600, y: 300 },
      { timeoutMs: 5000 },
    );
  };
  const waitWalker = async () => {
    await tab.playwright
      .locator('[data-timeline-walker]')
      .waitFor({ state: 'attached', timeoutMs: 20000 });
    await evaluate(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  };
  const WAIT_ROUTE = `new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      const scene = document.querySelector('[data-timeline-walker]');
      if ((scene && scene.getAnimations().length > 0) || performance.now() - started > 6000)
        resolve(!!(scene && scene.getAnimations().length > 0));
      else setTimeout(poll, 100);
    };
    poll();
  })`;
  const matrixXY = (matrix) => {
    const match = /matrix\(([^)]+)\)/.exec(matrix || '');
    if (!match) return null;
    const n = match[1].split(',').map(Number);
    return { x: n[4], y: n[5] };
  };
  const INSTALL_RECORDER = `(() => {
    window.__walkerLog = null;
    const scene = document.querySelector('[data-timeline-walker]');
    const svg = scene ? scene.querySelector('svg') : null;
    const stops = [...document.querySelectorAll('[data-timeline-stop]')];
    const date = stops[0] ? stops[0].querySelector('time') : null;
    const log = [];
    const start = performance.now();
    const xy = (matrix) => {
      const match = /matrix\\(([^)]+)\\)/.exec(matrix || '');
      if (!match) return null;
      const n = match[1].split(',').map(Number);
      return { x: Math.round(n[4]), y: Math.round(n[5]) };
    };
    const sample = () => {
      const route = scene ? scene.getAnimations()[0] : null;
      const reveal = svg ? svg.getAnimations()[0] : null;
      log.push({
        t: Math.round(performance.now() - start),
        ct: route ? Math.round(Number(route.currentTime)) : -1,
        revealCt: reveal ? Math.round(Number(reveal.currentTime)) : -1,
        play: route ? route.playState : null,
        pos: scene ? xy(getComputedStyle(scene).transform) : null,
        look: svg ? svg.dataset.look : null,
        step: svg ? svg.dataset.step : null,
        run: scene ? scene.dataset.running ?? null : null,
        hit: stops.findIndex((s) => s.dataset.hit === 'true'),
        bump: date ? getComputedStyle(date).animationName.includes('timeline-date-bump') : false,
      });
      const last = log[log.length - 1];
      if ((last.ct >= 6200 && last.hit === -1) || performance.now() - start > 9500) {
        window.__walkerLog = { log, stops: stops.length };
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`;
  const HARVEST = `new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      if (window.__walkerLog || performance.now() - started > 11000)
        resolve(window.__walkerLog || null);
      else setTimeout(poll, 80);
    };
    poll();
  })`;
  const STATIC_PROBE = `(async () => {
    const scene = document.querySelector('[data-timeline-walker]');
    const svg = scene.querySelector('svg');
    await new Promise((resolve) => setTimeout(resolve, 550));
    const route = scene.getAnimations()[0];
    const reveal = svg.getAnimations()[0];
    const ct1 = route ? Math.round(Number(route.currentTime)) : -1;
    const rv1 = reveal ? Math.round(Number(reveal.currentTime)) : -1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const route2 = scene.getAnimations()[0];
    return {
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      instant: scene.dataset.instant ?? null,
      run: scene.dataset.running ?? null,
      play: route2 ? route2.playState : null,
      ct1,
      ct2: route2 ? Math.round(Number(route2.currentTime)) : -2,
      rv1,
      rv2: svg.getAnimations()[0] ? Math.round(Number(svg.getAnimations()[0].currentTime)) : -2,
      visibility: getComputedStyle(scene).visibility,
      hits: document.querySelectorAll('[data-timeline-stop][data-hit]').length,
      bumping: [...document.querySelectorAll('[data-timeline-stop] time')].some((el) =>
        getComputedStyle(el).animationName.includes('timeline-date-bump'),
      ),
    };
  })()`;

  const pauseOffscreen = () =>
    evaluate(`(async () => {
      const scene = document.querySelector('[data-timeline-walker]');
      const track = document.getElementById('home-timeline');
      const route = scene.getAnimations()[0];
      const before = {
        ct: Math.round(Number(route.currentTime)),
        play: route.playState,
        run: scene.dataset.running ?? null,
      };
      track.scrollTo({ left: track.scrollWidth, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const paused = scene.getAnimations()[0];
      const ct1 = Math.round(Number(paused.currentTime));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const still = scene.getAnimations()[0];
      return {
        before,
        ct1,
        ct2: Math.round(Number(still.currentTime)),
        run: scene.dataset.running ?? null,
        play: still.playState,
        matrix: getComputedStyle(scene).transform,
      };
    })()`);
  const resumeOnscreen = () =>
    evaluate(`(async () => {
      const scene = document.querySelector('[data-timeline-walker]');
      const track = document.getElementById('home-timeline');
      const frozen = Math.round(Number(scene.getAnimations()[0].currentTime));
      const pausedMatrix = getComputedStyle(scene).transform;
      track.scrollTo({ left: 0, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const route = scene.getAnimations()[0];
      const ct1 = Math.round(Number(route.currentTime));
      const matrix = getComputedStyle(scene).transform;
      await new Promise((resolve) => setTimeout(resolve, 350));
      const ct2 = Math.round(Number(scene.getAnimations()[0].currentTime));
      return { frozen, ct1, ct2, pausedMatrix, matrix, run: scene.dataset.running ?? null, play: route.playState };
    })()`);
  const finishRoute = () =>
    evaluate(`(async () => {
      const scene = document.querySelector('[data-timeline-walker]');
      const svg = scene.querySelector('svg');
      // A paused (IO-clipped) animation never fires onfinish; bring the walker into view first.
      scene.scrollIntoView({ block: 'nearest', inline: 'center' });
      const waitStart = performance.now();
      while (performance.now() - waitStart < 2000 && scene.dataset.running !== 'true')
        await new Promise((resolve) => setTimeout(resolve, 50));
      const wasRunning = scene.dataset.running === 'true';
      // The route clock is the only multi-second animation; [0] ordering is not guaranteed.
      const longOf = (list) =>
        list.filter((a) => Number(a.effect?.getTiming().duration ?? 0) >= 7000);
      const [route] = longOf(scene.getAnimations());
      const [reveal] = longOf(svg.getAnimations());
      if (!route || !reveal) return { error: 'route/reveal animation missing' };
      const total = Number(route.effect.getTiming().duration);
      // Teleporting the sprite strands it outside the IO clip at the timeline end; re-center
      // on it (and nudge the scroller if the IO has not re-evaluated) so the last stretch
      // actually plays and onfinish can fire.
      for (const anim of [route, reveal])
        anim.currentTime = Number(anim.effect.getTiming().duration) - 400;
      const timeline = document.querySelector('#home-timeline');
      scene.scrollIntoView({ block: 'nearest', inline: 'center' });
      let settleStart = performance.now();
      while (performance.now() - settleStart < 1200 && scene.dataset.running !== 'true')
        await new Promise((resolve) => setTimeout(resolve, 60));
      if (scene.dataset.running !== 'true') {
        timeline.scrollLeft += 80;
        await new Promise((resolve) => setTimeout(resolve, 150));
        timeline.scrollLeft -= 80;
        scene.scrollIntoView({ block: 'nearest', inline: 'center' });
        settleStart = performance.now();
        while (performance.now() - settleStart < 1200 && scene.dataset.running !== 'true')
          await new Promise((resolve) => setTimeout(resolve, 60));
      }
      const started = performance.now();
      while (performance.now() - started < 2600 && scene.dataset.complete !== 'true')
        await new Promise((resolve) => setTimeout(resolve, 100));
      const anims = scene.getAnimations().concat(svg.getAnimations());
      return {
        wasRunning,
        total,
        stops: document.querySelectorAll('[data-timeline-stop]').length,
        complete: scene.dataset.complete ?? null,
        run: scene.dataset.running ?? null,
        visibility: getComputedStyle(scene).visibility,
        plays: anims.map((a) => a.playState),
      };
    })()`);
  return {
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
  };
}
