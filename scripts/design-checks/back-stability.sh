#!/bin/sh
# Run against a production build; reuse the current QA space when supplied.
set -eu
motion_config=$(node -e 'console.log(JSON.stringify({ space: process.env.EGO_TASK_SPACE || "", base: process.env.DESIGN_BASE_URL || "http://localhost:3012" }))')
ego-browser nodejs <<JS
const config = $motion_config;
$(cat <<'CODE'
const target = path => new URL(path, config.base).href;
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(config.space ? Number(config.space) : '回退抖动修复');
console.log({ spaceId: task.spaceId });
const page=task.page('p1');
await page.goto(target('/products/layout-compositions?cat=%E6%9E%84%E5%9B%BE%E9%80%BB%E8%BE%91'),{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{
  window.__liveResets=[];
  const original=Element.prototype.animate;
  Element.prototype.animate=function(...args){
    const animation=original.apply(this,args);
    if(this.matches('[aria-label$="画册"]')) {
      const cancel=animation.cancel.bind(animation);
      animation.cancel=()=>{
        const before=Number(getComputedStyle(this).opacity);
        cancel();
        if(this.isConnected)window.__liveResets.push({before,after:Number(getComputedStyle(this).opacity)});
      };
    }
    return animation;
  };
});
await page.click('button[aria-label="返回书架"]');
await page.waitForSelector('#book-0',{state:'visible'});
assert.equal(await page.evaluate(()=>window.__liveResets.length),0,'outgoing reader animation must remain attached until the old reader unmounts');
await page.waitForFunction(()=>document.activeElement?.id==='book-0');
await page.evaluate(()=>{
  window.__homeLayers=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){
    if(this.id==='workspace-content' && location.pathname==='/')window.__homeLayers=[...document.querySelectorAll('a[aria-label^="进入"]')].map(e=>({translate:getComputedStyle(e).translate,animations:e.getAnimations().map(a=>a.transitionProperty||a.animationName)}));
    return animate.apply(this,args);
  };
});
await page.click('a[aria-label="布局参考，返回首页"]');
await page.waitForURL(target('/'));
const layers=await page.evaluate(()=>window.__homeLayers);
assert.ok(layers.length>0,'route entry must capture the home project links');
assert.ok(layers.every(x=>x.translate==='none' && !x.animations.includes('translate')), 'route entry must not stack project starting-style movement');
await page.waitForFunction(()=>!document.querySelector('[data-route-motion]'));
console.log('PASS: reader stays hidden until replacement, shelf focus restores, route entry has one movement owner');
if (!config.space) await task.finish({ keep: [] });
CODE
)
JS
