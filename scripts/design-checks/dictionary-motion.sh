#!/bin/sh
set -eu
# Production browser regression; failures cover initial/interrupt motion, stale demand frames,
# search and selection, theme updates, offscreen/hidden rendering, and pointer resumption.
ego-browser nodejs <<EOF
const config = $(node -e 'console.log(JSON.stringify({space:process.env.EGO_TASK_SPACE,base:process.env.DESIGN_BASE_URL,output:process.env.DESIGN_EVIDENCE_DIR}))');
$(cat <<'JS'
const assert = (await import('node:assert/strict')).default;
const { mkdir } = await import('node:fs/promises');
const task = await taskSpace(config.space ? Number(config.space) : '词典动效回归');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
const base = config.base || 'http://localhost:3012';
const output = config.output || '/tmp/dictionary-motion';
await mkdir(output, { recursive: true });
const hook = await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.atlasMotionProbe = { draws: 0, matrices: new Map(), colors: new Map() };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const names = new WeakMap();
    const getUniformLocation = proto.getUniformLocation;
    proto.getUniformLocation = function (program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (location) names.set(location, name);
      return location;
    };
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (!proto[method]) continue;
      const original = proto[method];
      proto[method] = function (...args) { window.atlasMotionProbe.draws++; return original.apply(this, args); };
    }
    const matrix = proto.uniformMatrix4fv;
    proto.uniformMatrix4fv = function (location, transpose, value) {
      if (names.get(location) === 'modelViewMatrix') window.atlasMotionProbe.matrices.set(location, Array.from(value, v => +v.toFixed(4)));
      return matrix.call(this, location, transpose, value);
    };
    const color = proto.uniform3f;
    proto.uniform3f = function (location, ...value) {
      window.atlasMotionProbe.colors.set(names.get(location), value);
      return color.call(this, location, ...value);
    };
  }
` });
const frames = (count = 4) => page.evaluate(count => new Promise((resolve, reject) => {
  let frame;
  const timeout = setTimeout(() => {
    cancelAnimationFrame(frame);
    reject(new Error('Browser did not deliver the requested animation frames within 8 seconds'));
  }, 8000);
  const next = () => {
    if (count--) frame = requestAnimationFrame(next);
    else { clearTimeout(timeout); resolve(); }
  };
  frame = requestAnimationFrame(next);
}), count);
const waitPaint = (before, changed = 'matrices') => {
  console.log(`WAIT WebGL ${changed} update`);
  return page.waitForFunction(({ before, changed }) => {
  const probe = document.querySelector('iframe').contentWindow.atlasMotionProbe;
  const value = changed === 'matrices' ? [...probe.matrices.values()] : [...probe.colors];
  return probe.draws > before.draws && JSON.stringify(value) !== before[changed];
}, { before, changed }, { timeout: 15000 });
};
const waitDraw = before => {
  console.log('WAIT next WebGL draw');
  return page.waitForFunction(before => document.querySelector('iframe').contentWindow.atlasMotionProbe.draws > before.draws, before, { timeout: 15000 });
};
const probe = () => page.evaluate(() => {
  const w = document.querySelector('iframe').contentWindow;
  return { instant: w.__atlasInstant, draws: w.atlasMotionProbe.draws,
    matrices: JSON.stringify([...w.atlasMotionProbe.matrices.values()]),
    colors: JSON.stringify([...w.atlasMotionProbe.colors]),
    query: w.__atlasJourney.getState().query, focused: w.__atlasJourney.getState().focusedSlug,
    count: w.__atlasJourney.getState().matchCount };
});
const steady = async (label, stopped = false) => {
  console.log(`CHECK ${label}`);
  // A stopped/hidden document cannot be the clock used to verify that it stopped.
  const sampleInterval = () => new Promise(resolve => setTimeout(resolve, 350));
  await (stopped ? sampleInterval() : frames());
  const before = await probe();
  await (stopped ? sampleInterval() : frames(6));
  const after = await probe();
  assert.equal(after.matrices, before.matrices, `${label}: camera and graph settle immediately`);
  assert.equal(after.draws, before.draws, `${label}: no continuous WebGL draws`);
  console.log(`PASS ${label}`);
  return after;
};
try {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.cdp('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
  console.log('STEP load reduced-motion atlas');
  await page.goto(`${base}/products/ai-coding-dictionary`);
  console.log('WAIT first graph matrix');
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.atlasMotionProbe?.matrices.size > 0, undefined, { timeout: 15000 });
  await frames();
  let before = await steady('reduced initial camera');
  assert.equal(before.instant, true);
  assert.ok(before.matrices.length > 2, 'WebGL graph was painted');
  console.log('STEP search agent');
  await page.waitForSelector('button[aria-label="搜索词典"]');
  await page.click('button[aria-label="搜索词典"]');
  await page.click('#atlas-search');
  await page.fill('#atlas-search', 'agent');
  await page.waitForFunction(() => document.querySelector('iframe').contentWindow.__atlasJourney.getState().query === 'agent');
  await waitPaint(before);
  let after = await steady('reduced search repack');
  assert.ok(after.count > 0 && after.draws > before.draws, 'search redraws the graph');
  assert.notEqual(after.matrices, before.matrices, 'search updates the camera');
  before = after;
  console.log('STEP select agent');
  await page.evaluate(() => document.querySelector('iframe').contentWindow.__atlasJourney.getState().focusNode('agent'));
  await waitPaint(before);
  after = await steady('reduced selected graph and particles');
  assert.equal(after.focused, 'agent');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.dictionary-detail').dataset.open), 'true');
  before = after;
  console.log('STEP change theme');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await waitPaint(before, 'colors');
  after = await steady('theme updates while demand rendering');
  assert.ok(after.draws > before.draws, 'theme repaint is requested');
  assert.notEqual(after.colors, before.colors, 'shader colors change');
  before = after;
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitDraw(before);
  await steady('resize preserves demand rendering');
  console.log('STEP capture reduced-dark-selected');
  await page.screenshot({ path: `${output}/reduced-dark-selected.png` });
  await page.cdp('Emulation.setEmulatedMedia', { features: [] });
  await page.evaluate(() => { document.documentElement.dataset.input = 'pointer'; });
  before = await probe(); await waitDraw(before); after = await probe();
  assert.ok(after.draws > before.draws, 'pointer restores original animated graph');
  before = await probe();
  await page.evaluate(() => { document.documentElement.dataset.input = 'keyboard'; });
  await waitDraw(before);
  await steady('keyboard interrupts and settles active graph');
  await page.evaluate(() => { document.documentElement.dataset.input = 'pointer'; document.querySelector('iframe').style.transform = 'translateY(2000px)'; });
  await steady('offscreen canvas stops', true);
  await page.evaluate(() => { document.querySelector('iframe').style.removeProperty('transform'); });
  before = await probe(); await waitDraw(before); after = await probe();
  assert.ok(after.draws > before.draws, 'onscreen canvas resumes');
  await page.evaluate(() => { const d = document.querySelector('iframe').contentDocument; Object.defineProperty(d, 'hidden', { configurable: true, value: true }); d.dispatchEvent(new Event('visibilitychange')); });
  await steady('simulated hidden document stops', true);
  await page.evaluate(() => { const d = document.querySelector('iframe').contentDocument; delete d.hidden; d.dispatchEvent(new Event('visibilitychange')); });
  before = await probe(); await waitDraw(before); after = await probe();
  assert.ok(after.draws > before.draws, 'visible document resumes');
  await page.evaluate(() => { document.documentElement.dataset.input = 'keyboard'; });
  console.log('STEP reload with keyboard policy');
  await page.evaluate(() => document.querySelector('iframe').contentWindow.location.reload());
  console.log('WAIT first graph matrix');
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.atlasMotionProbe?.matrices.size > 0, undefined, { timeout: 15000 });
  await frames();
  await steady('keyboard initial camera');
  console.log('STEP capture keyboard-selected');
  await page.screenshot({ path: `${output}/keyboard-selected.png` });
  console.log(`Evidence: ${output}`);
} finally {
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier });
  await page.cdp('Emulation.clearDeviceMetricsOverride');
  await page.cdp('Emulation.setEmulatedMedia', { features: [] });
}
if (!config.space) await task.finish({ keep: [] });
JS
)
EOF
