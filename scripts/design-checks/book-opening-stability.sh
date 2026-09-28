#!/bin/sh
set -eu
# Reuse an existing task space when iterating; otherwise close the created space.
ego-browser nodejs <<JS
const assert = (await import('node:assert/strict')).default;
const spaceId = '${EGO_TASK_SPACE:-}';
const task = await taskSpace(spaceId ? Number(spaceId) : '开书连续性回归');
const page = task.page('p1');
await page.goto('${DESIGN_BASE_URL:-http://localhost:3000}/products/layout-compositions');
await page.waitForSelector('#book-0');
await page.hover('#book-0');
await page.waitForFunction(() => document.getAnimations().every(a => a.playState === 'finished'));
await page.evaluate(() => {
  const book = document.querySelector('#book-0');
  window.openingStart = { before: book.getBoundingClientRect().toJSON() };
  book.addEventListener('animationstart', event => {
    if (event.target !== book) return;
    const animation = book.getAnimations().find(a => a.animationName?.includes('shelf-book-extract'));
    if (!animation) return;
    const time = animation.currentTime;
    animation.currentTime = 0;
    window.openingStart.after = book.getBoundingClientRect().toJSON();
    animation.currentTime = time;
  });
});
await page.click('#book-0');
await page.waitForFunction(() => window.openingStart.after);
const result = await page.evaluate(() => window.openingStart);
const jump = Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(result.before[key] - result.after[key])));
console.log(JSON.stringify({ ...result, jump }, null, 2));
assert.ok(jump < 1, 'Opening jumps ' + jump.toFixed(2) + 'px from the hovered spine');
await page.waitForFunction(() => document.querySelector('[data-book-spread]') && !document.querySelector('[aria-busy="true"]'));
if (!spaceId) await task.finish({ keep: [] });
JS
