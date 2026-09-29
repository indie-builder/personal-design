#!/bin/sh
set -eu
# Failure modes: interrupted enter/exit, stale close timers, lost focus/locks,
# keyboard-triggered spatial WAAPI, and policy changes during the avatar sequence.
# Visibility is simulated here; real tab suspension remains a manual check.
ego-browser nodejs <<JS
const task = await taskSpace('${EGO_TASK_SPACE:-}' ? Number('${EGO_TASK_SPACE:-}') : '灯箱与头像动效回归');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
const results = [];
const record = (name, evidence, pass) => { results.push({ name, pass, evidence }); console.log({ name, pass, evidence }); };
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await page.goto('${DESIGN_BASE_URL:-http://localhost:3012}/products/layout-compositions?cat=%E6%9E%84%E5%9B%BE%E9%80%BB%E8%BE%91');
await page.waitForSelector('button[data-page-id]');
console.log(await page.snapshot());
const entrance = await page.evaluate(async () => {
  document.documentElement.dataset.input = 'pointer';
  document.querySelector('button[data-page-id]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.documentElement.dataset.input = 'keyboard';
  await new Promise(resolve => setTimeout(resolve, 80));
  const dialog = document.querySelector('[role=dialog]');
  const image = dialog?.querySelector('img');
  return { open: !!dialog, transform: image && getComputedStyle(image).transform, transition: image && getComputedStyle(image).transitionDuration, focused: dialog?.contains(document.activeElement), locked: document.body.style.overflow };
});
record('灯箱进入中键盘即时展开', entrance, entrance.open && entrance.transform === 'none' && entrance.transition === '0s' && entrance.focused && entrance.locked === 'hidden');
const closeDuring = async (policy) => page.evaluate(async (policy) => {
  document.documentElement.dataset.input = 'pointer';
  document.querySelector('[role=dialog] button[aria-label="关闭"]').click();
  await new Promise(resolve => setTimeout(resolve, 25));
  if (policy === 'keyboard') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  else { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }
  await new Promise(resolve => setTimeout(resolve, 55));
  const result = { open: !!document.querySelector('[role=dialog]'), overflow: document.body.style.overflow, inert: [...document.body.children].some(el => el.inert), focus: document.activeElement?.getAttribute('data-page-id') };
  if (policy !== 'keyboard') { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }
  return result;
}, policy);
const closeKeyboard = await closeDuring('keyboard');
record('灯箱关闭中改键盘立即解除模态锁', closeKeyboard, !closeKeyboard.open && closeKeyboard.overflow !== 'hidden' && !closeKeyboard.inert && !!closeKeyboard.focus);
await page.click('button[data-page-id] >> nth=0');
await page.waitForFunction(() => document.querySelector('[role=dialog] img')?.style.transform === 'none');
const closeHidden = await closeDuring('hidden');
record('灯箱关闭中后台收尾', closeHidden, !closeHidden.open && closeHidden.overflow !== 'hidden' && !closeHidden.inert);
await page.click('button[data-page-id] >> nth=0');
await page.waitForFunction(() => document.querySelector('[role=dialog] img')?.style.transform === 'none');
await page.evaluate(() => { document.documentElement.dataset.input = 'pointer'; document.querySelector('[role=dialog] button[aria-label="关闭"]').click(); });
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.waitForSelector('[role=dialog]', { state: 'detached' });
await page.click('button[data-page-id] >> nth=0');
await page.keyboard.press('Escape');
const escaped = await page.evaluate(() => ({ open: !!document.querySelector('[role=dialog]'), overflow: document.body.style.overflow, focus: document.activeElement?.getAttribute('data-page-id') }));
record('减少动态效果重新打开和 Esc 恢复焦点', escaped, !escaped.open && escaped.overflow !== 'hidden' && !!escaped.focus);
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.goto('${DESIGN_BASE_URL:-http://localhost:3012}/products/muse/product-comps');
await page.waitForSelector('button[aria-label^="放大查看"]');
await page.click('button[aria-label^="放大查看"] >> nth=0');
await page.waitForFunction(() => document.querySelector('[role=dialog] img')?.style.transform === 'none');
const interrupted = await page.evaluate(async () => {
  const dialog = document.querySelector('[role=dialog]');
  const source = dialog.querySelector('img').src;
  document.documentElement.dataset.input = 'pointer';
  dialog.querySelector('button[aria-label="关闭"]').click();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 280));
  return { open: !!document.querySelector('[role=dialog]'), changed: document.querySelector('[role=dialog] img')?.src !== source };
});
record('关闭中翻图取消旧卸载计时器', interrupted, interrupted.open && interrupted.changed);
await page.keyboard.press('Escape');
await page.goto('${DESIGN_BASE_URL:-http://localhost:3012}/');
await page.waitForSelector('button[title="来一段太极"]');
await page.focus('button[title="来一段太极"]');
await page.keyboard.press('Enter');
const keyboard = await page.evaluate(() => {
  const actor = document.querySelector('[class*="taichi-avatar"] [class*="actor"]');
  const animations = actor?.getAnimations({ subtree: true }) ?? [];
  return { running: animations.length, duration: animations.map(a => a.effect.getTiming().duration), transforms: animations.flatMap(a => a.effect.getKeyframes().map(f => f.transform)) };
});
record('头像键盘只保留短静态反馈', keyboard, keyboard.running === 1 && keyboard.duration[0] <= 1000 && new Set(keyboard.transforms).size === 1);
await page.keyboard.press('Escape');
await page.click('button[title="来一段太极"]');
const pointer = await page.evaluate(() => document.querySelector('[class*="taichi-avatar"] [class*="actor"]')?.getAnimations({ subtree: true }).map(a => a.effect.getTiming().duration) ?? []);
record('头像指针保留原有太极动作', pointer, pointer.length === 10 && pointer.every(duration => duration === 9200));
await page.keyboard.press('Tab');
await page.waitForFunction(() => !document.querySelector('[class*="taichi-avatar"] [class*="actor"]'));
record('头像表演中改键盘及时收起', true, true);
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.click('button[title="来一段太极"]');
const reduced = await page.evaluate(() => document.querySelector('[class*="taichi-avatar"] [class*="actor"]')?.getAnimations({ subtree: true }).map(a => a.effect.getTiming().duration) ?? []);
record('头像减少动态效果不创建关节动画', reduced, reduced.length === 1 && reduced[0] <= 1000);
await page.keyboard.press('Escape');
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
console.log(JSON.stringify(results, null, 2));
if (!'${EGO_TASK_SPACE:-}') await task.finish({ keep: [] });
if (results.some(result => !result.pass)) throw new Error('Lightbox/avatar motion regression failed');
JS
