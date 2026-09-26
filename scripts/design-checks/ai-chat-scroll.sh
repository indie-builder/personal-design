#!/bin/sh
# Isolated test origin only: DESIGN_BASE_URL=http://localhost:<local-preview-port>
set -eu
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;
if(!/^http:\/\/localhost:\d+$/.test(base||'')) throw new Error('Use an isolated localhost port for the scroll fixture.');
console.log('const config='+JSON.stringify({base,space:process.env.EGO_TASK_SPACE?Number(process.env.EGO_TASK_SPACE):null,root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');
const task=await taskSpace(config.space||'AI 问答 · 滚动交互验收');console.log({spaceId:task.spaceId});const p=task.page('p1');
const out=config.root+'/docs/design/execution/evidence/ai-chat-scroll';await fs.mkdir(out,{recursive:true});
await p.goto(config.base+'/products/ai-chat');
await p.evaluate(()=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(c=>c.id!=='scroll-fixture'))throw new Error('Test origin already contains user conversations.');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[{id:'scroll-fixture',agentId:'general',title:'滚动验收',messages:[{id:'answer',role:'assistant',parts:[{type:'text',text:'root = Stack(['+Array.from({length:40},(_,i)=>'TextContent("滚动验收段落 '+i+'：这是用于检查阅读区域与顶部栏的独立测试内容。")').join(',')+']);'}]}]}]}));});
const capture=()=>p.evaluate(()=>{const id=window.__chromeCapture=(window.__chromeCapture||0)+1;window.__chromeFrames=[];const panel=document.querySelector('[data-composer-panel]');panel.addEventListener('transitionrun',()=>{const start=performance.now();const tick=()=>{if(window.__chromeCapture!==id)return;window.__chromeFrames.push({t:performance.now()-start,opacity:Number(getComputedStyle(panel).opacity),transform:getComputedStyle(panel).transform});if(performance.now()-start<500)requestAnimationFrame(tick);};tick();},{once:true});});
const checks=[];await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
for(const width of [1440,390]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<640});await p.reload();await p.waitForSelector('[data-answer-body]');
 await p.waitForFunction(()=>document.querySelector('[aria-label="对话"] > div').scrollTop>100);
 assert(!await p.evaluate(()=>document.querySelector('main header').inert||document.querySelector('[data-composer-panel]').inert),'latest messages start with visible controls');
 const box=await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().toJSON());
 await p.mouse.click(box.x+box.width/2,box.y+200);await capture();await p.mouse.wheel(0,-400);
 await p.waitForFunction(()=>document.querySelector('[data-composer-panel]').inert&&getComputedStyle(document.querySelector('[data-composer-panel]')).opacity==='0');
 const hideFrames=await p.evaluate(()=>window.__chromeFrames);assert(hideFrames.some(f=>f.opacity>0&&f.opacity<1),'composer exit has intermediate frames');
 await p.waitForSelector('button[aria-label="回到最新消息"]');assert(await p.evaluate(()=>{const a=document.querySelector('main').getBoundingClientRect(),b=document.querySelector('button[aria-label="回到最新消息"]').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&b.bottom<=a.bottom;}));
 const before=await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().height);
 await p.mouse.wheel(0,100);assert(await p.evaluate(()=>document.querySelector('[data-composer-panel]').inert),'downward motion alone must not reveal composer while away');
 await p.screenshot({path:out+'/'+width+'-hidden.png'});
 await p.mouse.wheel(0,-100);assert(await p.evaluate(()=>document.querySelector('[data-composer-panel]').inert),'reversing direction while reading history keeps composer hidden');
 await capture();await p.click('button[aria-label="回到最新消息"]');await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-composer-panel]')).opacity==='1'&&!document.querySelector('button[aria-label="回到最新消息"]'));
 const showFrames=await p.evaluate(()=>window.__chromeFrames);assert(showFrames.some(f=>f.opacity>0&&f.opacity<1),'composer entrance has intermediate frames');
 assert.equal(await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().height),before);
 await fs.writeFile(out+'/'+width+'-motion.json',JSON.stringify({hideFrames,showFrames},null,2)+'\n');await p.screenshot({path:out+'/'+width+'-visible.png'});
 await p.fill('textarea[aria-label^="发消息给"]','保留尚未发送的草稿');await p.mouse.click(box.x+box.width/2,box.y+200);await p.mouse.wheel(0,-300);await p.waitForFunction(()=>document.querySelector('[data-composer-panel]').inert);
 assert.equal(await p.evaluate(()=>document.querySelector('textarea[aria-label^="发消息给"]').value),'保留尚未发送的草稿');
 await p.focus('button[aria-label="回到最新消息"]');await p.keyboard.press('Enter');await p.waitForFunction(()=>!document.querySelector('[data-composer-panel]').inert);
 assert(await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('[data-composer-panel]')).transitionDuration)===0));
 await p.fill('textarea[aria-label^="发消息给"]','第一行\n第二行\n第三行\n第四行');await p.waitForFunction(()=>{const a=document.querySelector('[data-composer-panel]').getBoundingClientRect().height;const h=parseFloat(getComputedStyle(document.querySelector('[aria-label="对话"]')).getPropertyValue('--composer-height'));return Math.abs(a-h)<1;});await p.fill('textarea[aria-label^="发消息给"]','');
 // Natural downward scrolling, without pressing the jump button, also restores it.
 await p.mouse.click(box.x+box.width/2,box.y+200);await p.mouse.wheel(0,-250);await p.waitForFunction(()=>document.querySelector('[data-composer-panel]').inert);await p.mouse.wheel(0,1000);await p.waitForFunction(()=>!document.querySelector('[data-composer-panel]').inert);
 checks.push(width+': hide away from latest, stay hidden on either direction, restore only at latest, animated in/out, draft preserved, stable viewport, keyboard return and multiline inset');
}
await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
assert(await p.evaluate(()=>[document.querySelector('main header'),document.querySelector('[data-composer-panel]')].every(e=>parseFloat(getComputedStyle(e).transitionDuration)<=0.001)));checks.push('reduced motion disables toolbar transition');
await p.cdp('Emulation.clearDeviceMetricsOverride');await p.cdp('Emulation.setEmulatedMedia',{features:[]});
await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks);if(!config.space)await task.finish({keep:[]});
JS
} | ego-browser nodejs
