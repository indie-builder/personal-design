#!/bin/sh
set -eu
# Production regression: mixed-media geometry, interruption, and same-paint return restoration.
{
node --input-type=module <<'CONFIG'
console.log('const config = ' + JSON.stringify({ base: process.env.DESIGN_BASE_URL || 'http://localhost:3012', space: process.env.EGO_TASK_SPACE ? Number(process.env.EGO_TASK_SPACE) : null }) + ';');
CONFIG
cat <<'JS'
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(config.space || '灵感动效回归');
const page = task.page('p1');
const base = config.base;
const results = [];
const record = (name, evidence) => { results.push({ name, evidence }); console.log({ name, evidence }); };
console.log({ spaceId: task.spaceId });
const viewport = width => page.cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
await viewport(1440);
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.goto(base + '/products/muse/x-2100178721978327136');
await page.waitForSelector('[aria-roledescription="轮播"]', { state: 'visible' });
console.log(await page.snapshot());
const sample = async (action, duration = 1000) => page.evaluate(async ({ action, duration }) => {
  const track = document.querySelector('[aria-roledescription="轮播"]');
  const stage = track.parentElement;
  document.documentElement.dataset.input = 'pointer';
  const samples = [];
  const start = performance.now();
  const read = () => ({ t: performance.now() - start, width: track.clientWidth, left: track.scrollLeft, current: [...track.children].findIndex(slide => !slide.inert) });
  samples.push(read());
  document.querySelector('[aria-label="下一张媒体"]').click();
  if (action === 'reverse') setTimeout(() => document.querySelector('[aria-label="上一张媒体"]').click(), 80);
  if (action === 'keyboard') setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })), 80);
  while (performance.now() - start < duration) {
    await new Promise(requestAnimationFrame);
    samples.push(read());
  }
  return { samples, stage: stage.getBoundingClientRect().width, counter: stage.parentElement.querySelector('[aria-live]')?.textContent };
}, { action, duration });
const changedWidths = samples => samples.reduce((count, value, index) => count + (index > 0 && value.width !== samples[index - 1].width ? 1 : 0), 0);
const forward = await sample('forward');
assert.equal(forward.samples.at(-1).current, 1);
assert.ok(Math.abs(forward.samples.at(-1).left - forward.samples.at(-1).width) < 2);
assert.ok(changedWidths(forward.samples) <= 1, 'media geometry must not oscillate during smooth scrolling');
record('视频切图片只提交一次尺寸变化，页码与画面一致', { changes: changedWidths(forward.samples), last: forward.samples.at(-1) });
await page.press('[aria-roledescription="轮播"]', 'Home');
await page.waitForFunction(() => !document.querySelector('[aria-roledescription="轮播"]').children[0].inert);
const reverse = await sample('reverse');
assert.equal(reverse.samples.at(-1).current, 0);
assert.ok(reverse.samples.at(-1).left < 2);
record('快速反向切换回到正确媒体', reverse.samples.at(-1));
const keyboard = await sample('keyboard');
assert.equal(keyboard.samples.at(-1).current, 1);
assert.ok(keyboard.samples.filter(s => s.t > 160).every(s => Math.abs(s.left - s.width) < 2));
record('滑动途中键盘策略即时收尾', keyboard.samples.find(s => s.t > 160));
await page.press('[aria-roledescription="轮播"]', 'Home');
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.click('[aria-label="下一张媒体"]');
await page.waitForFunction(() => !document.querySelector('[aria-roledescription="轮播"]').children[1].inert);
await viewport(1280);
await page.waitForFunction(() => {
  const track = document.querySelector('[aria-roledescription="轮播"]');
  return Math.abs(track.scrollLeft - track.clientWidth) < 2;
});
record('减少动态效果与视口改变保持当前媒体', true);
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await viewport(1440);

// Every recorded frame is taken before its paint. Hidden Activity trees are excluded.
const armReturn = () => page.evaluate(() => {
  window.museReturnFrames = [];
  const start = performance.now();
  const tick = () => {
    const section = [...document.querySelectorAll('section[aria-label="灵感浏览"]')].find(el => el.getClientRects().length);
    const links = section && [...section.querySelectorAll('a[id^="muse-"]')].filter(el => getComputedStyle(el).visibility !== 'hidden');
    if (location.pathname === '/products/muse' && links?.length && section.getAttribute('aria-busy') !== 'true') {
      window.museReturnFrames.push({ y: scrollY, focus: document.activeElement?.id, count: links.length, unique: new Set(links.map(a => a.id)).size });
    }
    if (window.museReturnFrames.length < 3 && performance.now() - start < 15000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
for (const mode of ['link', 'native', 'reload']) {
  await page.goto(base + '/products/muse');
  await page.waitForSelector('a[id^="muse-"]', { state: 'visible' });
  if (mode !== 'link') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => [...document.querySelectorAll('a[id^="muse-"]')].filter(el => el.getClientRects().length).length >= 48);
  }
  const target = await page.evaluate(mode => {
    const links = [...document.querySelectorAll('a[id^="muse-"]')].filter(el => el.getClientRects().length);
    const link = links[mode === 'link' ? 12 : 32];
    link.scrollIntoView({ block: 'center' });
    return { id: link.id, href: link.href };
  }, mode);
  await page.click('#' + target.id);
  await page.waitForSelector('nav[aria-label="作品导航"]', { state: 'visible' });
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('muse-return:/products/muse')));
  assert.ok(saved.y > 500);
  if (mode === 'reload') { await page.reload(); await page.waitForSelector('nav[aria-label="作品导航"]', { state: 'visible' }); }
  await armReturn();
  if (mode === 'native') await page.evaluate(() => history.back());
  else await page.click('nav[aria-label="作品导航"] > a:first-child');
  await page.waitForFunction(id => document.activeElement?.id === id && window.museReturnFrames?.length >= 3, target.id);
  const frames = await page.evaluate(() => window.museReturnFrames);
  assert.ok(frames.every(frame => Math.abs(frame.y - saved.y) < 2), JSON.stringify({ mode, saved, frames }));
  assert.ok(frames.every(frame => frame.count === frame.unique), 'Activity return must not duplicate the loaded window');
  record('列表返回首次绘制恢复位置和焦点：' + mode, { saved: saved.y, first: frames[0] });
}
// A complete filtered result smaller than one batch must restore without asking
// for a nonexistent next page (which could otherwise hide it for 15 seconds).
const shortQuery = await page.evaluate(async () => {
  const initial = await (await fetch('/products/muse/api/posts?limit=24')).json();
  for (const item of initial.items) {
    if (!item.name) continue;
    const query = new URLSearchParams({ q: item.name });
    const result = await (await fetch('/products/muse/api/posts?' + query)).json();
    if (result.total > 0 && result.total < 24) return { query: query.toString(), total: result.total };
  }
  throw new Error('No short filtered result found for the restoration fixture');
});
await page.goto(base + '/products/muse?' + shortQuery.query);
await page.waitForSelector('a[id^="muse-"]', { state: 'visible' });
const shortTarget = await page.evaluate(() => document.querySelector('a[id^="muse-"]').id);
await page.click('#' + shortTarget);
await page.waitForSelector('nav[aria-label="作品导航"]', { state: 'visible' });
await page.evaluate(() => {
  window.museReturnRequests = [];
  window.museOriginalFetch = window.fetch;
  window.fetch = (...args) => {
    if (String(args[0]).includes('/products/muse/api/posts')) window.museReturnRequests.push(String(args[0]));
    return window.museOriginalFetch(...args);
  };
});
await page.click('nav[aria-label="作品导航"] > a:first-child');
await page.waitForFunction(id => document.activeElement?.id === id, shortTarget);
const shortReturn = await page.evaluate(() => {
  window.fetch = window.museOriginalFetch;
  const section = [...document.querySelectorAll('section[aria-label="灵感浏览"]')].find(el => el.getClientRects().length);
  return { requests: window.museReturnRequests, busy: section.getAttribute('aria-busy'), count: section.querySelectorAll('a[id^="muse-"]').length };
});
assert.deepEqual(shortReturn.requests, [], 'A fully cached short result must not fetch another page');
assert.equal(shortReturn.busy, 'false');
assert.equal(shortReturn.count, shortQuery.total);
record('不足一批的完整筛选结果无需补页即可返回', shortReturn);
console.log(JSON.stringify({ pass: true, results }, null, 2));
if (!config.space) await task.finish({ keep: [] });
JS
} | ego-browser nodejs
