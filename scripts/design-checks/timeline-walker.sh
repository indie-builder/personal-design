#!/bin/sh
: "${EGO_SPACE_ID:?Set the active ego-browser task space id}"
ego-browser nodejs <<JS
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(${EGO_SPACE_ID});const page=task.page('p1');
await page.goto('${DESIGN_BASE_URL:-http://localhost:3001}');
await page.reload();
await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
await page.mouse.move(300,180);
await page.waitForFunction(()=>document.querySelector('[data-timeline-walker]')?.dataset.running==='true');
for(const width of [1440,390]) {
 await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null)))));
 const result=await page.evaluate(()=>{
  const el=document.querySelector('[data-timeline-walker]');const animations=el.getAnimations({subtree:true});const route=el.getAnimations()[0];
  const duration=route.effect.getTiming().duration;const arrival=duration-4000;
  animations.forEach(a=>{a.pause();a.currentTime=500});
  const enteringOpacity=Number(getComputedStyle(el.querySelector('svg')).opacity);
  animations.forEach(a=>a.currentTime=arrival);
  const marker=document.querySelector('[data-timeline-end]');const v=document.querySelector('#home-timeline');v.scrollTo({left:v.scrollWidth,behavior:'instant'});
  return {duration,arrival,enteringOpacity,count:document.querySelectorAll('[data-timeline-stop]').length,x:new DOMMatrix(getComputedStyle(el).transform).m41,end:marker.offsetLeft};
 });
 assert(result.enteringOpacity>0 && result.enteringOpacity<1,'emergence must fade in');
 assert.equal(result.duration,7000+result.count*3000);assert(Math.abs(result.x-result.end)<1,'route must reach future marker');
 for(const [offset,look] of [[500,'left'],[1500,'right'],[1900,'left']]) {
  await page.evaluate(time=>document.querySelector('[data-timeline-walker]').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=time}),result.arrival+offset);
  await page.waitForFunction(look=>document.querySelector('[data-timeline-walker] svg').dataset.look===look,look);
  await page.screenshot({path:\`/tmp/walker-end-\${width}-\${look}.png\`});
 }
 await page.evaluate(time=>document.querySelector('[data-timeline-walker]').getAnimations({subtree:true}).forEach(a=>a.currentTime=time),result.arrival+3000);
 await page.waitForFunction(()=>document.querySelector('[data-timeline-walker] svg').dataset.look==='left');
 const opacity=await page.evaluate(()=>Number(getComputedStyle(document.querySelector('[data-timeline-walker] svg')).opacity));
 assert(opacity>0 && opacity<1,'descent must fade out');
 assert(await page.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-timeline-walker]')).transform).m42>25));
}
// Fixture: two extra portfolio entries must extend the route and its destination.
await page.evaluate(()=>{const end=document.querySelector('[data-timeline-end]');const sample=document.querySelector('[data-timeline-stop]');for(let i=0;i<2;i++)end.before(sample.cloneNode(true))});
await page.waitForFunction(()=>document.querySelector('[data-timeline-walker]').getAnimations()[0].effect.getTiming().duration===7000+document.querySelectorAll('[data-timeline-stop]').length*3000);
assert(await page.evaluate(()=>{const el=document.querySelector('[data-timeline-walker]');const a=el.getAnimations()[0];a.pause();a.currentTime=a.effect.getTiming().duration-4000;return Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41-document.querySelector('[data-timeline-end]').offsetLeft)<1}));
console.log('PASS: desktop/mobile future marker, two whole-body flips, descent, and added portfolio entries extending the route.');
JS
