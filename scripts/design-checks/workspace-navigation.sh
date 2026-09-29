#!/bin/sh
# Run against a production build; reuse the current QA space when supplied.
set -eu
motion_config=$(node -e 'console.log(JSON.stringify({ space: process.env.EGO_TASK_SPACE || "", base: process.env.DESIGN_BASE_URL || "http://localhost:3012" }))')
ego-browser nodejs <<JS
const config = $motion_config;
$(cat <<'CODE'
const target = path => new URL(path, config.base).href;
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(config.space ? Number(config.space) : '回退动效修复');
console.log({ spaceId: task.spaceId });
const pages = await task.pages();
const page = pages.find(page => page.label === 'p1') ?? await task.newPage();
await page.goto(target('/'), { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.evaluate(() => {
  window.__motionLog = [];
  const original = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = original.apply(this, args);
    const entry = { target: this.id || this.tagName, frames: animation.effect.getKeyframes(), cancelled: false };
    window.__motionLog.push(entry);
    void animation.finished.catch(() => { entry.cancelled = true; });
    if (this.matches('h1[aria-hidden="true"],h2[aria-hidden="true"]') && window.__interruptRoute) {
      const action = window.__interruptRoute;
      window.__interruptRoute = null;
      queueMicrotask(() => {
        if (action === 'keyboard') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        else document.querySelector('a[aria-label$="，返回首页"]').click();
      });
    }
    return animation;
  };
});
const resetMotion = () => page.evaluate(() => { window.__motionLog = []; });
const routeMotion = () => page.evaluate(() => window.__motionLog.filter(entry => entry.target === 'workspace-content'));
const assertRestored = async () => assert.equal(await page.evaluate(() =>
  document.querySelectorAll('h1[style*="visibility"],h2[style*="visibility"],h1[aria-hidden="true"],h2[aria-hidden="true"]').length), 0);
for (const theme of ['light', 'dark']) {
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
  for (const [name, slug] of [['布局参考', 'layout-compositions'], ['灵感集', 'muse'], ['个人网站', 'personal-sites']]) {
    await resetMotion();
    await page.click(`a[aria-label="进入${name}"]`);
    await page.waitForURL(`**/products/${slug}`);
    await page.waitForTimeout(650);
    const heading = await page.evaluate(() => {
      const h = document.querySelector('h1:not([aria-hidden])');
      return { text: h?.textContent, visible: h && getComputedStyle(h).visibility !== 'hidden' };
    });
    const motion = await routeMotion();
    assert.equal(motion.length, 1, `${name}: pointer navigation must animate`);
    assert.notEqual(motion[0].frames[0].transform, motion[0].frames.at(-1).transform);
    assert.equal(await page.evaluate(() => window.__motionLog.filter(entry => entry.target === 'H2').length), 1, 'selected title must travel');
    await assertRestored();
    assert.equal(heading.text, name);
    assert.ok(heading.visible, `${name}: title must be restored after navigation`);
    await resetMotion();
    await page.click(`a[aria-label="${name}，返回首页"]`);
    await page.waitForURL(target('/'));
    await page.waitForTimeout(650);
    assert.equal((await routeMotion()).length, 2, 'return must animate outgoing and incoming surfaces');
    assert.equal(Number((await routeMotion())[0].frames.at(-1).opacity), 0, 'old page must leave before navigation');
    await assertRestored();
    console.log(`PASS: ${theme} ${name} navigation`);
  }
}
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await resetMotion();
await page.click('a[aria-label="进入灵感集"]');
await page.waitForURL('**/products/muse');
assert.equal((await routeMotion()).length, 0, 'instant navigation must not animate');
await assertRestored();
await page.click('a[aria-label="灵感集，返回首页"]');
await page.waitForURL(target('/'));
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await resetMotion();
await page.press('a[aria-label="进入布局参考"]', 'Enter');
await page.waitForURL('**/products/layout-compositions');
assert.equal((await routeMotion()).length, 0, 'instant navigation must not animate');
await assertRestored();

console.log('PASS: keyboard and reduced-motion route skips');
await resetMotion();
await page.press('#book-0', 'Enter');
await page.waitForSelector('[data-book-spread]', { state: 'visible', timeout: 2000 });
assert.equal(await page.evaluate(() => document.querySelector('[aria-busy]')?.getAttribute('aria-busy')), 'false');
assert.equal(await page.evaluate(() => window.__motionLog.length), 0, 'keyboard opening must skip all WAAPI');
const contrast = await page.evaluate(() => {
  const pageNumber = document.querySelector('span[aria-label="第1页"]');
  const luminance = color => {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return rgb.reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  };
  const values = [getComputedStyle(pageNumber).color, getComputedStyle(pageNumber.parentElement).backgroundColor].map(luminance).sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
});
assert.ok(contrast >= 4.5, `folio contrast: ${contrast}`);
console.log('PASS: keyboard opening and folio contrast');
await page.press('[aria-label$="画册"]', 'Escape');
await page.waitForSelector('#book-0', { state: 'visible' });
await page.click('#book-0');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('[aria-busy]')?.getAttribute('aria-busy') === 'false');
assert.equal(await page.evaluate(() => !!document.querySelector('[data-book-spread]')), false, 'Escape during extraction must remain at shelf');
await page.click('#book-0');
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.waitForSelector('[data-book-spread]', { state: 'visible' });
await page.waitForFunction(() => document.querySelector('[aria-busy]')?.getAttribute('aria-busy') === 'false');
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.press('[aria-label$="画册"]', 'Escape');
await page.press('a[aria-label="布局参考，返回首页"]', 'Enter');
await page.waitForURL(target('/'));
await page.keyboard.press('Tab');
await page.waitForTimeout(700);
const bookQueue = () => page.evaluate(() => {
  const host = document.querySelector('[class*="bookMotion"]');
  return { running: host.dataset.running, books: [...host.querySelectorAll('[data-book-active]')].map(e => ({ active: e.dataset.bookActive, animations: e.getAnimations().map(a => ({ state: a.playState, time: a.currentTime })) })) };
});
const stoppedQueue = await bookQueue();
assert.equal(stoppedQueue.running, 'false', 'keyboard must stop book queue');
assert.ok(stoppedQueue.books.every(book => book.animations.every(a => a.state !== 'running')), 'keyboard must pause preview timelines');
await page.waitForTimeout(700);
assert.deepEqual(await bookQueue(), stoppedQueue, 'book queue must keep its current book and progress while stopped');
// Inject changes exactly during the title transition; no timing race with the automation bridge.
for (const action of ['keyboard', 'return']) {
  await resetMotion();
  await page.evaluate(action => { window.__interruptRoute = action; }, action);
  await page.click('a[aria-label="进入灵感集"]');
  await page.waitForURL(action === 'return' ? target('/') : '**/products/muse');
  if (action === 'return') await page.waitForFunction(() => location.pathname === '/' && window.__motionLog.filter(entry => entry.target === 'workspace-content').length >= 3);
  await page.waitForTimeout(700);
  assert.ok((await routeMotion()).length > 0);
  assert.ok(await page.evaluate(() => window.__motionLog.some(entry => entry.cancelled)), 'interruption must cancel the active animation');
  await assertRestored();
  if (action === 'keyboard') {
    await page.press('a[aria-label="灵感集，返回首页"]', 'Enter');
    await page.waitForURL(target('/'));
  }
}
console.log('PASS: pointer transitions, shared titles, return, both themes, keyboard/reduced-motion skips, opening cancellation, preview queue stop, interruption/reentry cleanup, folio contrast');
if (!config.space) await task.finish({ keep: [] });
CODE
)
JS
