#!/bin/sh
set -eu
# Run against a production build. EGO_TASK_SPACE reuses the current QA space.
ego-browser nodejs <<JS
const task = await taskSpace('${EGO_TASK_SPACE:-}' ? Number('${EGO_TASK_SPACE:-}') : '动效策略回归');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
const results = [];
const record = (name, pass, evidence) => { results.push({ name, pass, evidence }); console.log({ name, pass, evidence }); };
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: \`
  if (!window.previewObservers) {
  window.previewObservers = [];
  const Original = window.IntersectionObserver;
  window.IntersectionObserver = class extends Original {
    constructor(callback, options) { super(callback, options); this.record = { targets: [], disconnected: false }; window.previewObservers.push(this.record); }
    observe(target) { this.record.targets.push(target); super.observe(target); }
    disconnect() { this.record.disconnected = true; super.disconnect(); }
  };
  }
\` });
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await page.goto('${DESIGN_BASE_URL:-http://localhost:3000}/');
await page.waitForSelector('[data-book-active="true"]');
const resume = await page.evaluate(async () => {
  const host = document.querySelector('[class*="bookMotion"]');
  const book = host.querySelector('[data-book-active="true"]');
  const animation = book.getAnimations()[0];
  animation.currentTime = 2200;
  document.querySelector('#home-timeline').scrollLeft = 1200;
  await new Promise(resolve => setTimeout(resolve, 150));
  const paused = animation.playState;
  document.querySelector('#home-timeline').scrollLeft = 0;
  await new Promise(resolve => setTimeout(resolve, 150));
  return { paused, sameAnimation: book.getAnimations()[0] === animation, time: book.getAnimations()[0]?.currentTime };
});
record('书籍预览暂停后续播', resume.paused === 'paused' && resume.sameAnimation && resume.time >= 2200, resume);
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, undefined, { timeout: 15000 });
await page.keyboard.press('Tab');
await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
const videoPaused = await page.evaluate(() => document.querySelector('video').paused);
record('键盘停止自动视频预览', videoPaused, { videoPaused });
await page.click('a[aria-label="进入设计工程工具"]');
await page.waitForSelector('a[aria-label="设计工程工具，返回首页"]');
const oldObservers = await page.evaluate(() => window.previewObservers.filter(r => r.targets.some(e => /bookMotion|toolPreview|dictionaryRuntime|ai-chat-preview/.test(e.className))).map(r => r.disconnected));
record('离开首页释放预览监听器', oldObservers.length >= 4 && oldObservers.every(Boolean), oldObservers);
await page.click('a[aria-label="设计工程工具，返回首页"]');
await page.waitForSelector('#home-timeline');
const activeObservers = await page.evaluate(() => window.previewObservers.filter(r => !r.disconnected && r.targets.some(e => /bookMotion|toolPreview|dictionaryRuntime|ai-chat-preview/.test(e.className))).length);
record('返回首页不累积监听器', activeObservers === 4, { activeObservers });
await page.goto('${DESIGN_BASE_URL:-http://localhost:3000}/products/layout-compositions?cat=%E6%9E%84%E5%9B%BE%E9%80%BB%E8%BE%91');
await page.waitForSelector('[data-book-spread]');
const flip = await page.evaluate(async () => {
  document.documentElement.dataset.input = 'pointer';
  document.querySelector('[data-direction="next"]').click();
  await new Promise(requestAnimationFrame);
  document.documentElement.dataset.input = 'keyboard';
  await new Promise(resolve => setTimeout(resolve, 80));
  return { status: document.querySelector('[aria-label$="画册"] [role="status"]').getAttribute('aria-label'), disabled: document.querySelector('[data-direction="next"]').disabled, leaf: !!document.querySelector('[class*="leaf"]') };
});
record('翻页切换键盘即时完成', flip.status === '第3至4页，共86页' && !flip.disabled && !flip.leaf, flip);
await page.evaluate(async () => {
  document.documentElement.dataset.input = 'pointer';
  document.querySelector('[data-direction="next"]').click();
  await new Promise(requestAnimationFrame);
});
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
const reducedFlip = await page.evaluate(() => ({ status: document.querySelector('[aria-label$="画册"] [role="status"]').getAttribute('aria-label'), leaf: !!document.querySelector('[class*="leaf"]') }));
record('翻页途中减少动态效果完成当前跨页', reducedFlip.status === '第5至6页，共86页' && !reducedFlip.leaf, reducedFlip);
await page.goto('${DESIGN_BASE_URL:-http://localhost:3000}/products/personal-sites');
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, undefined, { timeout: 15000 });
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.waitForFunction(() => matchMedia('(prefers-reduced-motion:reduce)').matches && document.querySelector('video').paused);
const manualBefore = await page.evaluate(() => document.querySelector('video').paused);
await page.press('video', 'Enter');
await page.waitForFunction(() => !document.querySelector('video').paused);
await page.keyboard.press('Tab');
await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
const manualAfter = await page.evaluate(() => document.querySelector('video').paused);
record('减少动态效果仍允许键盘手动播放', manualBefore && !manualAfter, { manualBefore, manualAfter });
await page.evaluate(() => { document.querySelector('video').style.transform = 'translateY(2000px)'; });
await page.waitForFunction(() => document.querySelector('video').paused);
await page.evaluate(() => { document.querySelector('video').style.removeProperty('transform'); });
await page.waitForFunction(() => !document.querySelector('video').paused);
record('手动播放离屏后在减少动态效果下恢复', true);
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
console.log(JSON.stringify(results, null, 2));
if (!'${EGO_TASK_SPACE:-}') await task.finish({ keep: [] });
if (results.some(result => !result.pass)) throw new Error('Motion policy regression failed');
JS
