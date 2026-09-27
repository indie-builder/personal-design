#!/bin/sh
: "${EGO_SPACE_ID:?Set the active ego-browser task space id}"
ego-browser nodejs <<JS
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(${EGO_SPACE_ID});const page=task.page('p1');
await page.goto('${DESIGN_BASE_URL:-http://localhost:3001}');
await page.waitForSelector('[aria-label="向后浏览作品"]');
await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
for(const width of [2560,1440,1280,640,639,390]) {
 await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 for(const theme of ['light','dark']) {
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.querySelector('#home-timeline').scrollTo({left:0,behavior:'instant'})},theme);
  await page.waitForFunction(()=>document.querySelector('[aria-label="向前浏览作品"]').disabled);
  await page.click('[aria-label="向后浏览作品"]');
  await page.waitForFunction(()=>document.querySelector('#home-timeline').scrollLeft>0);
  await page.click('[aria-label="向前浏览作品"]');
  await page.waitForFunction(()=>document.querySelector('#home-timeline').scrollLeft===0);
  assert(await page.evaluate(()=>!document.querySelector('input[type=range]') && document.documentElement.scrollWidth===innerWidth));
  assert(await page.evaluate(()=>[...document.querySelectorAll('footer button')].every(b=>b.getBoundingClientRect().height>=44)));
  assert(await page.evaluate(()=>Math.abs(document.querySelector('main a h2').getBoundingClientRect().left-document.querySelector('[title="来一段太极"] img').getBoundingClientRect().left)<1),'first project must align with avatar image');
  await page.mouse.move(10,100);
  await page.screenshot({path:\`/tmp/home-arrows-\${width}-\${theme}.png\`});
 }
}
await page.evaluate(()=>{const e=document.querySelector('#home-timeline');e.scrollTo({left:e.scrollWidth,behavior:'instant'})});
await page.waitForFunction(()=>document.querySelector('[aria-label="向后浏览作品"]').disabled);
await page.focus('[aria-label="向前浏览作品"]');await page.keyboard.press('Enter');
await page.waitForFunction(()=>!document.querySelector('[aria-label="向后浏览作品"]').disabled);
console.log('PASS: six widths and avatar alignment, both themes, previous/next, edge disabling, keyboard activation, 44px targets, no slider or overflow.');
JS
