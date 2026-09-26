#!/bin/sh
# Capture the same answers at each viewport; preserve business content and interactions.
set -eu
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;if(!/^http:\/\/localhost:\d+$/.test(base||''))throw new Error('Use isolated localhost preview');
console.log('const config='+JSON.stringify({base,space:Number(process.env.EGO_TASK_SPACE),root:process.cwd()})+';');
CONFIG
cat <<'JS'
const fs=await import('node:fs/promises');const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(config.space);const p=task.page('p1');
const out=config.root+'/.impeccable/review/ai-chat-visual';await fs.mkdir(out,{recursive:true});
const fixture=JSON.parse(await fs.readFile(config.root+'/scripts/design-checks/fixtures/ai-chat-case.json','utf8'));
await p.goto(config.base+'/products/ai-chat');await p.evaluate(c=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(x=>x.id!=='case-fixture'))throw new Error('Contains user records');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[c]}));},fixture);await p.reload();await p.waitForSelector('[data-answer-body]');
const measurements=[];
for(const [width,height,theme,index,file] of [[1440,900,'light',0,'desktop.png'],[817,860,'light',0,'user-width-817.png'],[390,844,'light',0,'mobile.png'],[320,844,'light',0,'mobile-320.png'],[390,844,'light',3,'mobile-data.png'],[390,844,'dark',2,'mobile-dark-editor.png']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await p.evaluate(i=>{const s=document.querySelector('[aria-label="对话"] > div'),t=document.querySelectorAll('[data-answer-body]')[i];s.scrollTop+=t.getBoundingClientRect().top-s.getBoundingClientRect().top-96;},index);
 if(file==='mobile-dark-editor.png'){
  await p.fill('[data-mobile-editable] details[open] input[type=text]','修改后的试点项目');await p.waitForSelector('button:text-is("确认修改")');
  await p.evaluate(()=>{const s=document.querySelector('[aria-label="对话"] > div'),t=document.querySelector('[data-mobile-editable]');s.scrollTop+=t.getBoundingClientRect().top-s.getBoundingClientRect().top-96;});
 }
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const m=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,inputs:[...document.querySelectorAll('.ai-openui input:not([type=checkbox]):not([type=radio]),.ai-openui select')].map(e=>({height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize,emptySelect:e.tagName==='SELECT'&&!e.value})),buttons:[...document.querySelectorAll('.ai-openui .openui-button-base')].map(e=>({height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize})),errors:[...document.querySelectorAll('[role=status]')].filter(e=>e.textContent.includes('未能')).length}));
 assert(!m.overflow);assert.equal(m.errors,0);assert(m.inputs.filter(x=>x.height).every(x=>x.height>=44&&x.font==='13px'));assert(m.buttons.filter(x=>x.height).every(x=>x.height>=44&&x.font==='13px'));
 const hints=await p.evaluate(()=>[...document.querySelectorAll('.ai-openui .openui-hint,.ai-openui .openui-header-bottom,.ai-openui .openui-text-block__secondary')].map(e=>getComputedStyle(e,e.hasAttribute('placeholder')?'::placeholder':null).fontSize));assert(hints.every(size=>size==='12px'));const placeholders=await p.evaluate(()=>[...document.querySelectorAll('.ai-openui input[placeholder],.ai-openui textarea[placeholder]')].map(e=>getComputedStyle(e,'::placeholder').fontSize));assert(placeholders.every(size=>size==='13px'));
 measurements.push({file,...m});await p.screenshot({path:out+'/'+file});
}
await p.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
const chartChecks=[];
for(const [theme,tab,file,expected] of [['light','趋势','mobile-chart.png','rgb(138, 155, 167)'],['light','任务分布','mobile-distribution.png','rgb(138, 155, 167)'],['dark','趋势','mobile-chart-dark.png','rgb(120, 143, 159)'],['dark','任务分布','mobile-distribution-dark.png','rgb(120, 143, 159)']]){
 await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.click(`loc=role:tab[name="${tab}"]`);
 await p.waitForFunction(color=>[...document.querySelectorAll('[role="tabpanel"][data-state="active"] svg path')].some(e=>getComputedStyle(e).stroke===color||getComputedStyle(e).fill===color),expected);
 await p.evaluate(()=>{const s=document.querySelector('[aria-label="对话"] > div'),t=document.querySelector('[role="tabpanel"][data-state="active"]');s.scrollTop+=t.getBoundingClientRect().top-s.getBoundingClientRect().top-100;});
 await p.screenshot({path:out+'/'+file});chartChecks.push({theme,tab,expected,passed:true});
}
await p.cdp('Emulation.clearDeviceMetricsOverride');await fs.writeFile(out+'/measurements.json',JSON.stringify({passed:true,measurements,chartChecks},null,2)+'\n');console.log(measurements.map(m=>({file:m.file,overflow:m.overflow,inputSizes:[...new Set(m.inputs.map(x=>x.font))],buttonSizes:[...new Set(m.buttons.map(x=>x.font))]})));
JS
} | ego-browser nodejs
