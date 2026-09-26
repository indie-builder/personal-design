#!/bin/sh
# Uses an isolated localhost origin and the captured case. No real model calls.
set -eu
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;if(!/^http:\/\/localhost:\d+$/.test(base||''))throw new Error('Use an isolated localhost origin');
console.log('const config='+JSON.stringify({base,space:Number(process.env.EGO_TASK_SPACE),root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');
const task=await taskSpace(config.space);const p=task.page('p1');const fixture=JSON.parse(await fs.readFile(config.root+'/scripts/design-checks/fixtures/ai-chat-case.json','utf8'));
const out=config.root+'/docs/design/execution/evidence/ai-chat-mobile';await fs.mkdir(out,{recursive:true});const checks=[];
await p.goto(config.base+'/products/ai-chat');
await p.evaluate(c=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(x=>!['case-fixture','component-fixture'].includes(x.id)))throw new Error('Contains user records');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[c]}));},fixture);
for(const [width,theme] of [[320,'light'],[390,'dark'],[1440,'light']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<640});await p.reload();await p.waitForSelector('[data-mobile-editable]');
 await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert(await p.evaluate(()=>![...document.querySelectorAll('[role="status"]')].some(e=>e.textContent.includes('未能'))));
 const sizes=await p.evaluate(()=>({buttons:[...document.querySelectorAll('.ai-openui .openui-button-base')].map(e=>e.getBoundingClientRect().height),choices:[...document.querySelectorAll('.ai-openui .openui-radio-item-container,.ai-openui .openui-checkbox-item-container')].map(e=>e.getBoundingClientRect().height)}));
 assert(sizes.buttons.every(h=>h>=44));assert(sizes.choices.every(h=>h>=44));
 assert(await p.evaluate(()=>{const r=document.querySelector('[role="slider"]').getBoundingClientRect();return r.width>=44&&r.height>=44;}));
 assert(await p.evaluate(()=>!document.querySelector('[data-mobile-editable] table')&&document.querySelectorAll('[data-mobile-editable] details').length===3));
 const date='input[type="date"]';await p.fill(date,'2026-10-05');await p.press(date,'ArrowUp');await p.press(date,'ArrowDown');
 assert.equal(await p.evaluate(()=>document.querySelector('input[type="date"]').value),'2026-10-05');
 const select='[data-mobile-editable] details[open] select >> nth=0';const previous=await p.evaluate(()=>document.querySelector('[data-mobile-editable] details[open] select').value);
 await p.selectOption(select,{index:2});await p.waitForSelector('button:text-is("撤销修改")');await p.click('button:text-is("撤销修改")');
 assert.equal(await p.evaluate(()=>document.querySelector('[data-mobile-editable] details[open] select').value),previous);
 const input='[data-mobile-editable] details[open] input[type="text"]';await p.fill(input,'移动端试点项目');
 await p.screenshot({path:out+'/'+width+'-'+theme+'-editor.png'});
 await p.reload();await p.waitForSelector('[data-mobile-editable]');
 assert.equal(await p.evaluate(()=>document.querySelector('[data-mobile-editable] input[type="text"]').value),'移动端试点项目');
 assert.equal(await p.evaluate(()=>document.querySelector('input[type="date"]').value),'2026-10-05');
 checks.push(width+'px '+theme+': touch targets, native pickers, editable row cards, reset and refresh persistence, no overflow');
}
await p.evaluate(()=>{window.__mobileRequest=null;const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/ai-chat')){window.__mobileRequest=JSON.parse(args[1].body);return new Response([{role:'assistant'},{content:'root = Stack([TextContent("已收到修改后的试点任务。")]);'},{}].map((delta,i)=>JSON.stringify({choices:[{index:0,delta,finish_reason:i===2?'stop':null}]})).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});}return original(...args);};});
await p.fill('[data-mobile-editable] details[open] input[type="text"]','确认后的移动端项目');await p.click('button:text-is("确认修改")');
await p.waitForFunction(()=>!!window.__mobileRequest&&!document.querySelector('[data-generation-status]'));
assert(await p.evaluate(()=>window.__mobileRequest.messages.at(-1).parts[0].text.includes('确认后的移动端项目')));
checks.push('confirm edits sends values through the official action callback');
await p.reload();await p.cdp('Emulation.clearDeviceMetricsOverride');
await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks);
JS
} | ego-browser nodejs
