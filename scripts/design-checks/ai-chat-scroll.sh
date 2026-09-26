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
await p.evaluate(()=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(c=>c.id!=='scroll-fixture'))throw new Error('Test origin already contains user conversations.');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[{id:'scroll-fixture',agentId:'general',title:'滚动验收',messages:[{id:'answer',role:'assistant',parts:[{type:'text',text:'root = Stack(['+Array.from({length:40},(_,i)=>'Text("滚动验收段落 '+i+'：这是用于检查阅读区域与顶部栏的独立测试内容。")').join(',')+']);'}]}]}]}));});
const checks=[];await p.cdp('Emulation.setEmulatedMedia',{features:[]});
for(const width of [1440,390]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<640});await p.reload();await p.waitForSelector('[data-answer-body]');
 await p.waitForFunction(()=>document.querySelector('[aria-label="对话"] > div').scrollTop>100);
 assert(!await p.evaluate(()=>document.querySelector('main header').inert),'automatic initial scroll keeps header visible');
 const box=await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().toJSON());
 await p.mouse.move(box.x+box.width/2,box.y+200);await p.mouse.wheel(0,-400);
 await p.waitForSelector('button[aria-label="回到最新消息"]');
 assert(await p.evaluate(()=>{const a=document.querySelector('main').getBoundingClientRect(),b=document.querySelector('button[aria-label="回到最新消息"]').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1;}));
 await p.mouse.wheel(0,100);await p.waitForFunction(()=>document.querySelector('main header').inert);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('main header')).opacity==='0');
 const before=await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().height);
 await p.screenshot({path:out+'/'+width+'-hidden.png'});
 await p.mouse.wheel(0,-100);await p.waitForFunction(()=>!document.querySelector('main header').inert);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('main header')).opacity==='1');
 assert.equal(await p.evaluate(()=>document.querySelector('[aria-label="对话"] > div').getBoundingClientRect().height),before);
 await p.screenshot({path:out+'/'+width+'-visible.png'});
 await p.mouse.wheel(0,100);await p.waitForFunction(()=>document.querySelector('main header').inert);
 await p.click('button[aria-label="回到最新消息"]');await p.waitForFunction(()=>!document.querySelector('main header').inert&&!document.querySelector('button[aria-label="回到最新消息"]'));
 checks.push(width+': centered button, directional hide/show, stable viewport, return-to-latest restores bar');
}
await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
assert(await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('main header')).transitionDuration)<=0.001));checks.push('reduced motion disables toolbar transition');
await p.cdp('Emulation.clearDeviceMetricsOverride');await p.cdp('Emulation.setEmulatedMedia',{features:[]});
await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks);await task.finish({keep:[]});
JS
} | ego-browser nodejs
