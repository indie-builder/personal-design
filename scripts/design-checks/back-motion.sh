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
const page = task.page('p1');
await page.goto(target('/products/layout-compositions?cat=%E6%9E%84%E5%9B%BE%E9%80%BB%E8%BE%91'), {waitUntil:'domcontentloaded'});
await page.evaluate(() => {
  window.__exits=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){
    const result=animate.apply(this,args);
    const frames=result.effect.getKeyframes();
    if(Number(frames.at(-1)?.opacity)===0)window.__exits.push({path:location.pathname,query:location.search,frames});
    return result;
  };
});
await page.click('button[aria-label="返回书架"]');
await page.waitForFunction(()=>!new URLSearchParams(location.search).has('cat'));
assert.ok(await page.evaluate(()=>window.__exits.some(x=>x.query.includes('cat='))), 'reader must animate out before returning to shelf');
await page.evaluate(()=>{window.__exits=[];});
await page.click('a[aria-label="布局参考，返回首页"]');
await page.waitForURL(target('/'));
assert.ok(await page.evaluate(()=>window.__exits.some(x=>x.path==='/products/layout-compositions')), 'product must animate out before returning home');
await page.goto(target('/products/muse/onboarding-screen?browse=2&q=screen'), {waitUntil:'domcontentloaded'});
await page.evaluate(() => {
  window.__exits=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){const a=animate.apply(this,args);if(Number(a.effect.getKeyframes().at(-1)?.opacity)===0)window.__exits.push(location.pathname);return a;};
});
await page.click('nav[aria-label="作品导航"] a[href="/products/muse?q=screen"]');
await page.waitForURL(target('/products/muse?q=screen'));
assert.ok(await page.evaluate(()=>window.__exits.includes('/products/muse/onboarding-screen')), 'detail must animate out before returning to results');
await page.waitForSelector('input[type="search"]',{state:'visible'});
assert.equal(await page.evaluate(()=>document.querySelector('input[type="search"]')?.value),'screen');
console.log('PASS: reader → shelf, product → home, detail → filtered results all animate out before leaving');
if (!config.space) await task.finish({ keep: [] });
CODE
)
JS
