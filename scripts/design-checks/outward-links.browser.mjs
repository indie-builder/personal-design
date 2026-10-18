import { mkdir, writeFile } from 'node:fs/promises';
import { cdpEvaluate } from './harness.cjs';

// Outward-link intent motion: tools favicon→arrow enters from (-2,2), the personal-site
// arrow from (2,-2); no-icon entries stay visible and still. Real CDP mouse input and real
// Tab keys drive data-input and :focus-visible (never scripted DOM focus).
const evidenceURL = new URL('../../.impeccable/review/motion-additions/outward-links.json', import.meta.url);
const toolLink = `[...document.querySelectorAll('main a[target="_blank"]')].find((a) => !a.querySelector('[data-fallback]'))`;
const toolArrow = `(${toolLink})?.querySelector('svg')`;
const fallbackLink = `[...document.querySelectorAll('main a[target="_blank"]')].find((a) => a.querySelector('[data-fallback]'))`;
const fallbackArrow = `(${fallbackLink})?.querySelector('span[data-fallback] svg')`;
const siteLink = `document.querySelector('main a[target="_blank"]')`;
const siteArrow = `(${siteLink})?.querySelector('svg')`;
// rel is a space-separated token list, not one substring.
const safeRel = (rel) => {
  const tokens = typeof rel === 'string' ? rel.split(/\s+/) : [];
  return tokens.includes('noopener') && tokens.includes('noreferrer');
};


const sample = (element) => `(() => {
  const el = ${element};
  if (!el) throw new Error('motion probe target missing');
  window.__outwardSample = { frames: [], done: false };
  const start = performance.now();
  const tick = () => {
    const cs = getComputedStyle(el);
    window.__outwardSample.frames.push({
      t: Math.round(performance.now() - start), transform: cs.transform, opacity: cs.opacity,
      animations: el.getAnimations().map((a) => ({
        property: a.transitionProperty ?? null,
        duration: Number(a.effect?.getTiming().duration ?? 0),
      })),
    });
    if (performance.now() - start < 320) requestAnimationFrame(tick);
    else window.__outwardSample.done = true;
  };
  requestAnimationFrame(tick);
  return true;
})()`;
const stylesOf = (element) => `(() => {
  const el = ${element};
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    transform: cs.transform, opacity: cs.opacity, duration: cs.transitionDuration,
    running: el.getAnimations().filter((a) => Number(a.effect?.getTiming().duration ?? 0) > 1).length,
  };
})()`;
const parseMatrix = (transform) => {
  const match = /matrix\(([^)]+)\)/.exec(transform ?? '');
  if (!match) return null;
  const [a, b, c, d, e, f] = match[1].split(',').map(Number);
  return { a, b, c, d, e, f };
};
const between = (value, from, to) => value > Math.min(from, to) + 0.01 && value < Math.max(from, to) - 0.01;
const close = (value, target) => Math.abs(value - target) < 0.05;
const isRest = (transform, rest, none) => {
  if (none) return transform === 'none';
  const value = parseMatrix(transform);
  return !!value && close(value.e, rest[0]) && close(value.f, rest[1]);
};
const frameTransforms = (frames) => [...new Set(frames.map((frame) => frame.transform))];

export async function verifyOutwardLinks(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const issues = [];
  const checks = [];
  const evidence = { base, frames: {}, midpoints: {}, settled: {}, reduced: {}, keyboard: {} };
  const expect = (ok, message) => {
    if (!ok) issues.push(message);
    return ok;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const evaluate = (expression) => cdpEvaluate(cdp, expression, { timeoutMs: 20000 });
  const hover = (x, y) =>
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, { timeoutMs: 5000 });
  const media = (value) =>
    cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const input = () => evaluate('document.documentElement.dataset.input ?? null');
  const active = () =>
    evaluate(`(() => {
      const el = document.activeElement;
      return { href: el ? el.getAttribute('href') : null, input: document.documentElement.dataset.input ?? null };
    })()`);
  const rectOf = (element) =>
    evaluate(`(() => {
      const el = ${element};
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
        href: el.href, target: el.target, rel: el.getAttribute('rel'),
      };
    })()`);
  const pageStyles = (element) => evaluate(stylesOf(element));
  const startSample = (element) => evaluate(sample(element));
  const finishSample = async () => {
    await evaluate(`new Promise((resolve) => {
      const poll = () => (window.__outwardSample?.done ? resolve(true) : requestAnimationFrame(poll));
      poll();
    })`);
    const frames = await evaluate('window.__outwardSample.frames');
    return frames.filter(
      (frame, index) =>
        index === 0 ||
        frame.transform !== frames[index - 1].transform ||
        frame.opacity !== frames[index - 1].opacity,
    );
  };
  // Pause running CSS transitions at half duration for a deterministic midpoint, then
  // let them finish; frame samples separately prove values move between endpoints.
  const midpoint = (element, properties) => evaluate(`(async () => {
    const el = ${element};
    if (!el) return null;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let animations = [];
    for (let i = 0; i < 60; i += 1) {
      animations = el.getAnimations().filter(
        (a) => a.transitionProperty && ${JSON.stringify(properties)}.includes(a.transitionProperty),
      );
      if (animations.some((a) => a.transitionProperty === 'transform')) break;
      await frame();
    }
    if (!animations.length) return null;
    const durations = animations.map((a) => ({
      property: a.transitionProperty, duration: Number(a.effect.getComputedTiming().duration),
    }));
    animations.forEach((a) => {
      a.pause();
      a.currentTime = durations[0].duration / 2;
    });
    await frame();
    await frame();
    const cs = getComputedStyle(el);
    const mid = { transform: cs.transform, opacity: cs.opacity };
    el.getAnimations().forEach((a) => {
      try {
        a.finish();
      } catch {}
    });
    await frame();
    await frame();
    return { durations, mid };
  })()`);
  // After finishing a paused transition, one more frame is needed before :hover styles
  // and removed animations agree; reading immediately would report the pre-hover value.
  const settleFrame = () =>
    evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const quiet = (element) => evaluate(`new Promise((resolve) => {
    const el = ${element};
    const start = performance.now();
    const poll = () => {
      const running = el ? el.getAnimations().filter((a) => a.playState === 'running').length : 0;
      if (!running || performance.now() - start > 500) resolve(running);
      else requestAnimationFrame(poll);
    };
    poll();
  })`);
  const ensurePointer = async () => {
    for (let i = 0; i < 40; i += 1) {
      await hover(4, 4);
      if ((await input()) === 'pointer') return true;
      await sleep(100);
    }
    return false;
  };
  const goto = async (path) => {
    await tab.goto(base + path);
    await tab.playwright
      .locator('main a[target="_blank"]')
      .first()
      .waitFor({ state: 'visible', timeoutMs: 8000 });
  };
  const pressTab = async () => {
    for (const type of ['keyDown', 'keyUp'])
      await cdp.send(
        'Input.dispatchKeyEvent',
        { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
        { timeoutMs: 5000 },
      );
  };
  const focusByTab = async (href, limit = 40) => {
    for (let i = 0; i < limit; i += 1) {
      await pressTab();
      if ((await active()).href === href) return true;
    }
    return false;
  };
  const enter = async (label, arrow, point, expected) => {
    // A fresh pointer arrives with residual :hover state from the previous target.
    await quiet(arrow);
    const rest = await pageStyles(arrow);
    if (!expect(!!rest, `${label}: arrow missing`)) return;
    expect(rest.opacity === String(expected.restOpacity), `${label}: rest opacity ${rest.opacity}`);
    expect(isRest(rest.transform, expected.restTransform, expected.restNone), `${label}: rest transform ${rest.transform}`);
    await startSample(arrow);
    await hover(point.x, point.y);
    const mid = await midpoint(arrow, expected.properties);
    await settleFrame();
    await quiet(arrow);
    const settled = await pageStyles(arrow);
    const frames = await finishSample();
    evidence.midpoints[`${label}Enter`] = mid;
    evidence.frames[`${label}Enter`] = frames;
    evidence.settled[`${label}Enter`] = settled;
    expect(!!mid, `${label}: hover creates no transform transition`);
    if (mid) {
      // Transition start time is imprecise; allow 140ms ± one frame.
      const duration = mid.durations.find((entry) => entry.property === 'transform')?.duration;
      expect(Math.abs(duration - 140) <= 17, `${label}: enter transform duration ${duration} !== 140ms`);
      for (const property of expected.properties)
        expect(
          mid.durations.some((entry) => entry.property === property),
          `${label}: enter missing ${property} transition`,
        );
      const matrix = parseMatrix(mid.mid.transform);
      expect(!!matrix, `${label}: enter midpoint transform missing`);
      if (matrix) {
        expect(
          between(matrix.e, expected.restTransform[0], expected.hoverTransform[0]) &&
            between(matrix.f, expected.restTransform[1], expected.hoverTransform[1]),
          `${label}: enter midpoint ${matrix.e},${matrix.f} not between endpoints`,
        );
      }
      if (expected.restOpacity !== expected.hoverOpacity) {
        expect(
          between(Number(mid.mid.opacity), expected.restOpacity, expected.hoverOpacity),
          `${label}: enter midpoint opacity ${mid.mid.opacity} not between endpoints`,
        );
      }
    }
    expect(settled?.opacity === String(expected.hoverOpacity), `${label}: settled opacity ${settled?.opacity}`);
    expect(
      isRest(settled?.transform, expected.hoverTransform, expected.hoverNone),
      `${label}: settled transform ${settled?.transform} !== (${expected.hoverTransform})`,
    );
    expect(frameTransforms(frames).length >= 3, `${label}: frame samples lack start/mid/end values`);
  };
  const leave = async (label, arrow, expected) => {
    await startSample(arrow);
    await hover(4, 4);
    const mid = await midpoint(arrow, ['transform']);
    await quiet(arrow);
    const settled = await pageStyles(arrow);
    const frames = await finishSample();
    evidence.midpoints[`${label}Leave`] = mid;
    evidence.frames[`${label}Leave`] = frames;
    evidence.settled[`${label}Leave`] = settled;
    expect(!!mid, `${label}: leave creates no transform transition`);
    if (mid) {
      const duration = mid.durations.find((entry) => entry.property === 'transform')?.duration;
      expect(Math.abs(duration - 100) <= 17, `${label}: leave transform duration ${duration} !== 100ms`);
      const matrix = parseMatrix(mid.mid.transform);
      expect(!!matrix, `${label}: leave midpoint transform missing`);
      if (matrix) {
        expect(
          between(matrix.e, expected.hoverTransform[0], expected.restTransform[0]) &&
            between(matrix.f, expected.hoverTransform[1], expected.restTransform[1]),
          `${label}: leave midpoint ${matrix.e},${matrix.f} not between endpoints`,
        );
      }
    }
    expect(isRest(settled?.transform, expected.restTransform, expected.restNone), `${label}: leave settled ${settled?.transform}`);
    expect(settled?.opacity === String(expected.restOpacity), `${label}: leave settled opacity ${settled?.opacity}`);
    expect(frameTransforms(frames).length >= 3, `${label}: leave samples lack start/mid/end values`);
  };

  try {
    await viewport.set({ width: 1440, height: 900 });
    await media('no-preference');
    expect(
      await evaluate(`matchMedia('(hover:hover) and (pointer:fine)').matches`),
      'desktop emulation needs hover:hover and pointer:fine',
    );

    // Tools directory: favicon crossfades to an arrow that enters along (-2,2)→(0,0).
    await goto('/products/design-engineer-tools');
    expect(await ensurePointer(), 'tools: real pointer movement must set data-input=pointer');
    const toolPoint = await rectOf(toolLink);
    const fallbackPoint = await rectOf(fallbackLink);
    const nativeLinks = await evaluate(`(() => {
      const links = [...document.querySelectorAll('main a[target="_blank"]')];
      return {
        count: links.length,
        rels: [...new Set(links.map((a) => a.getAttribute('rel')))],
        invalid: links.filter((a) => a.target !== '_blank' || !/^https?:/.test(a.href)).length,
      };
    })()`);
    expect(
      nativeLinks.count > 0 && nativeLinks.invalid === 0 && nativeLinks.rels.every(safeRel),
      `tools native links: ${JSON.stringify(nativeLinks)}`,
    );
    if (expect(!!toolPoint, 'tools link missing')) {
      const endpoints = {
        restOpacity: 0, hoverOpacity: 1, restTransform: [-2, 2], hoverTransform: [0, 0], hoverNone: true,
      };
      await enter('toolsArrow', toolArrow, toolPoint, { ...endpoints, properties: ['transform', 'opacity'] });
      await leave('toolsArrow', toolArrow, endpoints);
    }
    if (expect(!!fallbackPoint, 'tools no-icon fallback missing')) {
      const before = await pageStyles(fallbackArrow);
      const hasImage = await evaluate(`!!(${fallbackLink})?.querySelector('img')`);
      await hover(fallbackPoint.x, fallbackPoint.y);
      await sleep(180);
      const after = await pageStyles(fallbackArrow);
      evidence.fallback = { before, after, hasImage };
      expect(!hasImage, 'no-icon fallback must not render an image');
      for (const [state, value] of [['before', before], ['after', after]]) {
        expect(value?.opacity === '1', `fallback ${state} opacity ${value?.opacity} !== 1`);
        expect(value?.transform === 'none', `fallback ${state} transform ${value?.transform} !== none`);
        expect(value?.running === 0, `fallback ${state} must not animate (${value?.running} running)`);
      }
    }

    // Keyboard: Tab focus shows the tools arrow immediately, with native link semantics.
    await goto('/products/design-engineer-tools');
    const keyboardToolPoint = await rectOf(toolLink);
    if (expect(!!keyboardToolPoint, 'tools keyboard target missing')) {
      const focused = await focusByTab(keyboardToolPoint.href);
      const state = await active();
      const arrow = await pageStyles(toolArrow);
      evidence.keyboard.tools = { focused, input: state.input, arrow };
      expect(focused, 'tools: Tab must reach the first tool link');
      expect(state.input === 'keyboard', `tools: Tab input ${state.input} !== keyboard`);
      expect(arrow?.opacity === '1', `tools keyboard: arrow opacity ${arrow?.opacity} !== 1`);
      expect(arrow?.transform === 'none', `tools keyboard: arrow transform ${arrow?.transform} !== none`);
      expect(arrow?.running === 0, `tools keyboard: arrow must not animate (${arrow?.running} running)`);
      const rel = keyboardToolPoint.rel ?? '';
      expect(
        keyboardToolPoint.target === '_blank' && safeRel(rel),
        `tools keyboard: native target/rel ${keyboardToolPoint.target}/${rel}`,
      );
    }

    // Personal site: the visible arrow travels (0,0)→(2,-2) on hover and back.
    await goto('/products/personal-sites');
    expect(await ensurePointer(), 'site: real pointer movement must set data-input=pointer');
    const sitePoint = await rectOf(siteLink);
    if (expect(!!sitePoint, 'personal-site link missing')) {
      const rel = sitePoint.rel ?? '';
      expect(sitePoint.target === '_blank', `site: target ${sitePoint.target}`);
      expect(
        sitePoint.target === '_blank' && safeRel(rel),
        `site: rel ${rel}`,
      );
      const endpoints = { restOpacity: 1, hoverOpacity: 1, restTransform: [0, 0], restNone: true, hoverTransform: [2, -2] };
      await enter('siteArrow', siteArrow, sitePoint, { ...endpoints, properties: ['transform'] });
      await leave('siteArrow', siteArrow, endpoints);
    }

    // Keyboard interruption zeroes pointer hover displacement.
    await goto('/products/personal-sites');
    await ensurePointer();
    const keyboardSitePoint = await rectOf(siteLink);
    if (expect(!!keyboardSitePoint, 'site keyboard target missing')) {
      await hover(keyboardSitePoint.x, keyboardSitePoint.y);
      await sleep(220);
      const hovered = await pageStyles(siteArrow);
      await pressTab();
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const afterKey = await pageStyles(siteArrow);
      const focused = await focusByTab(keyboardSitePoint.href, 10);
      const focusedStyles = await pageStyles(siteArrow);
      evidence.keyboard.site = { hovered, afterKey, focused, focusedStyles, input: (await active()).input };
      expect(parseMatrix(hovered?.transform)?.e === 2, `site keyboard: hover setup transform ${hovered?.transform}`);
      expect(afterKey?.transform === 'none', `site keyboard: hover displacement ${afterKey?.transform} !== none`);
      expect(afterKey?.running === 0, `site keyboard: displacement must not animate (${afterKey?.running} running)`);
      expect(focused, 'site: Tab must reach the external link');
      expect(focusedStyles?.transform === 'none', `site keyboard focus: transform ${focusedStyles?.transform}`);
    }

    // Reduced motion: hover still reaches the visible arrow/end state, without motion.
    await media('reduce');
    await sleep(50);
    await goto('/products/design-engineer-tools');
    await ensurePointer();
    const reducedToolPoint = await rectOf(toolLink);
    if (expect(!!reducedToolPoint, 'reduced tools target missing')) {
      await hover(reducedToolPoint.x, reducedToolPoint.y);
      await sleep(120);
      const state = await pageStyles(toolArrow);
      evidence.reduced.tools = state;
      expect(state?.opacity === '1', `reduced tools: arrow opacity ${state?.opacity} !== 1`);
      expect(state?.transform === 'none', `reduced tools: arrow transform ${state?.transform} !== none`);
      expect(state?.running === 0, `reduced tools: arrow must not animate (${state?.running} running)`);
    }
    await goto('/products/personal-sites');
    await ensurePointer();
    const reducedSitePoint = await rectOf(siteLink);
    if (expect(!!reducedSitePoint, 'reduced site target missing')) {
      await hover(reducedSitePoint.x, reducedSitePoint.y);
      await sleep(120);
      const state = await pageStyles(siteArrow);
      evidence.reduced.site = state;
      expect(state?.transform === 'none', `reduced site: arrow transform ${state?.transform} !== none`);
      expect(state?.running === 0, `reduced site: arrow must not animate (${state?.running} running)`);
    }
  } catch (error) {
    issues.push(`check threw: ${error.stack ?? error.message}`);
  } finally {
    await media('no-preference').catch(() => {});
    await viewport.reset().catch(() => {});
    try {
      await mkdir(new URL('.', evidenceURL), { recursive: true });
      await writeFile(
        evidenceURL,
        JSON.stringify(
          { passed: issues.length === 0, issues, checks, ...evidence, capturedAt: new Date().toISOString() },
          null,
          2,
        ) + '\n',
      );
    } catch (error) {
      issues.push(`evidence write failed: ${error.message}`);
    }
  }
  if (!issues.length)
    checks.push('tools and site arrows: paired hover enter/leave, fallback, keyboard, reduced motion');
  return { passed: issues.length === 0, issues, checks, evidence: evidenceURL.pathname };
}
