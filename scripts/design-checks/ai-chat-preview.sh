#!/bin/sh
# Homepage preview playback, pause policy, reduced motion and native navigation.
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config='+JSON.stringify({base:process.env.DESIGN_BASE_URL||'https://personal-design.localhost',space:process.env.EGO_TASK_SPACE?Number(process.env.EGO_TASK_SPACE):null,root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');
const task=await taskSpace(config.space||'首页 · AI 问答生成动效');console.log({spaceId:task.spaceId});const p=task.page('p1');
const output=config.root+'/docs/design/execution/evidence/ai-chat-preview';await fs.mkdir(output,{recursive:true});const checks=[];
await p.goto(config.base+'/');await p.waitForSelector('[data-chat-preview]',{state:'attached'});
await p.evaluate(()=>{document.documentElement.dataset.input='pointer';document.querySelector('[aria-label="作品时间轴，左右方向键浏览"]').scrollLeft=0;});
await p.waitForFunction(()=>!document.querySelector('[data-chat-preview]').hasAttribute('data-running'));
await p.evaluate(()=>document.querySelector('a[aria-label="进入AI 问答"]').scrollIntoView({block:'center',inline:'center'}));
await p.waitForFunction(()=>document.querySelector('[data-chat-preview]').hasAttribute('data-running'));
assert.equal(await p.evaluate(()=>document.querySelector('[data-chat-preview]').getAnimations({subtree:true}).length),6);checks.push('visible preview animates six coordinated elements');
await p.evaluate(()=>{document.querySelector('[aria-label="作品时间轴，左右方向键浏览"]').scrollLeft=0;});
await p.waitForFunction(()=>document.querySelector('[data-chat-preview]').getAnimations({subtree:true}).every(a=>a.playState==='paused'));checks.push('offscreen animations pause');
await p.evaluate(()=>document.querySelector('a[aria-label="进入AI 问答"]').scrollIntoView({block:'center',inline:'center'}));await p.waitForFunction(()=>document.querySelector('[data-chat-preview]').hasAttribute('data-running'));
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>!document.querySelector('[data-chat-preview]').hasAttribute('data-running'));
assert(await p.evaluate(()=>document.querySelector('[data-chat-preview]').getAnimations({subtree:true}).every(a=>a.playState==='paused')));checks.push('background visibility policy pauses playback');
await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>document.querySelector('[data-chat-preview]').hasAttribute('data-running'));
for(const [width,height] of [[1440,900],[390,844]]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
 await p.evaluate(()=>document.querySelector('a[aria-label="进入AI 问答"]').scrollIntoView({block:'center',inline:'center'}));
 for(const [name,time] of [['thinking',1200],['rendering',3300],['complete',5600]]){
  await p.evaluate(t=>{for(const a of document.querySelector('[data-chat-preview]').getAnimations({subtree:true})){a.pause();a.currentTime=t;}},time);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=await p.evaluate(()=>{const root=document.querySelector('[data-chat-preview]'),reply=root.lastElementChild,answer=reply.lastElementChild;return{box:root.getBoundingClientRect().toJSON(),thinking:Number(getComputedStyle(reply.firstElementChild).opacity),answer:Number(getComputedStyle(answer).opacity),action:Number(getComputedStyle(answer.lastElementChild).opacity),fits:answer.getBoundingClientRect().bottom<=root.getBoundingClientRect().bottom};});
  assert(state.fits);if(name==='thinking'){assert(state.thinking>.9);assert(state.answer<.1);}if(name==='complete'){assert(state.answer>.9);assert(state.action>.9);}
  const shot=await p.cdp('Page.captureScreenshot',{format:'png',clip:{x:state.box.x,y:state.box.y,width:state.box.width,height:state.box.height,scale:1}});await fs.writeFile(`${output}/${width}-${name}.png`,Buffer.from(shot.data,'base64'));
 }
 checks.push(width+'px: thinking, card reveal and completed chart/action frames');
}
await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await p.waitForFunction(()=>!document.querySelector('[data-chat-preview]').hasAttribute('data-motion'));
assert(await p.evaluate(()=>{const root=document.querySelector('[data-chat-preview]');return root.getAnimations({subtree:true}).length===0&&getComputedStyle(root.lastElementChild.lastElementChild).opacity==='1';}));checks.push('reduced motion shows the completed static preview');
await p.cdp('Emulation.setEmulatedMedia',{features:[]});await p.evaluate(()=>document.documentElement.dataset.input='keyboard');await p.waitForFunction(()=>!document.querySelector('[data-chat-preview]').hasAttribute('data-motion'));
assert(await p.evaluate(()=>!document.querySelector('[data-chat-preview] button,[data-chat-preview] a')&&!performance.getEntriesByType('resource').some(e=>e.name.includes('/api/ai-chat'))));checks.push('one native project link; no model requests or nested controls');
await p.click('a[aria-label="进入AI 问答"]');await p.waitForURL(config.base+'/products/ai-chat');checks.push('project opens normally');
await p.cdp('Emulation.clearDeviceMetricsOverride');await fs.writeFile(output+'/result.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks);if(!config.space)await task.finish({keep:[]});
JS
} | ego-browser nodejs
