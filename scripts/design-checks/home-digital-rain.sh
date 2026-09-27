#!/bin/sh
# Reuse the task space created for this review; never create a second one.
: "${EGO_SPACE_ID:?Set the active ego-browser task space id}"
ego-browser nodejs <<JS
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(${EGO_SPACE_ID});
const page = task.page('p2');
await page.goto('${DESIGN_BASE_URL:-http://localhost:3000}');
await page.waitForSelector('[data-digital-rain]');
for (const width of [2560, 1440, 1280, 390]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {width, height:900, deviceScaleFactor:1, mobile:false});
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await page.waitForFunction(() => document.querySelector('[data-digital-rain]').dataset.playing === 'false');
    await page.waitForFunction(()=>{const c=document.querySelector('[data-digital-rain]');return c.width===Math.round(c.clientWidth*Math.min(devicePixelRatio||1,2))});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(null)))));
    const inspect = () => {
      const canvas = document.querySelector('[data-digital-rain]');
      const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const edgePainted = x => canvas.getContext('2d').getImageData(x,0,Math.min(80,canvas.width),Math.min(160,canvas.height)).data.some((value,index)=>index%4===3 && value>0);
      return {fullWidth:Math.abs(canvas.getBoundingClientRect().width-innerWidth)<1, edges:edgePainted(0)&&edgePainted(canvas.width-Math.min(80,canvas.width)), image:canvas.toDataURL(), painted:pixels.some((value,index)=>index%4===3 && value>0), hidden:canvas.getAttribute('aria-hidden'), pointer:getComputedStyle(canvas.parentElement).pointerEvents, overflow:document.documentElement.scrollWidth>innerWidth};
    };
    const first = await page.evaluate(inspect);
    assert(first.fullWidth); assert(first.edges); assert(first.painted); assert.equal(first.hidden,'true'); assert.equal(first.pointer,'none'); assert.equal(first.overflow,false);
    await page.screenshot({path:\`/tmp/home-rain-\${width}-\${theme}.png\`});
    assert((await page.evaluate(inspect)).image===first.image,'reduced motion must remain static');
  }
}
await page.cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
await page.cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
await page.mouse.move(500,100);
await page.waitForFunction(() => document.querySelector('[data-digital-rain]').dataset.playing === 'true');
const initial = await page.evaluate(()=>document.querySelector('[data-digital-rain]').toDataURL());
await page.waitForFunction(image=>document.querySelector('[data-digital-rain]').toDataURL()!==image,initial);
await page.focus('[aria-label="作品时间轴，左右方向键浏览"]');
await page.keyboard.press('ArrowRight');
await page.waitForFunction(()=>document.querySelector('[data-digital-rain]').dataset.playing==='false');
assert(await page.evaluate(()=>document.querySelector('[aria-label="作品时间轴，左右方向键浏览"]').scrollLeft>0));
await page.click('a[href="/products/design-engineer-tools"]');
await page.waitForURL('**/products/design-engineer-tools');
await page.waitForFunction(()=>{const canvas=document.querySelector('[data-digital-rain]');return !canvas || (!canvas.checkVisibility() && canvas.dataset.playing==='false')});
await page.click('[aria-label="设计工程工具，返回首页"]');
await page.waitForURL(new URL('/', '${DESIGN_BASE_URL:-http://localhost:3000}').href);
await page.waitForSelector('[data-digital-rain]');
await page.mouse.move(650,140);
await page.waitForFunction(()=>document.querySelector('[data-digital-rain]').checkVisibility() && document.querySelector('[data-digital-rain]').dataset.playing==='true');
console.log('PASS: four widths, both themes, painted/static reduced motion, live animation, keyboard scrolling, route cleanup and return.');
JS
