#!/bin/sh
# Use a dedicated localhost origin; inspect the full registered component catalog.
set -eu
node scripts/design-checks/fixtures/ai-chat-components.mjs
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;if(!/^http:\/\/localhost:\d+$/.test(base||''))throw Error('Use isolated localhost');console.log('const config='+JSON.stringify({base,space:Number(process.env.EGO_TASK_SPACE),root:process.cwd(),assert:process.env.CATALOG_ASSERT==='1'})+';');
CONFIG
cat <<'JS'
const fs=await import('node:fs/promises');const assert=(await import('node:assert/strict')).default;
const task=await taskSpace(config.space);const p=task.page('p1');const out=config.root+'/docs/design/execution/evidence/ai-chat-catalog';await fs.mkdir(out,{recursive:true});
const fixture=JSON.parse(await fs.readFile(config.root+'/scripts/design-checks/fixtures/ai-chat-components.json','utf8'));
await p.goto(config.base+'/products/ai-chat');await p.evaluate(c=>{const key='personal-design:ai-chat:v1';if(JSON.parse(localStorage.getItem(key)||'{}').conversations?.some(x=>!['component-fixture','case-fixture'].includes(x.id)))throw Error('Contains user records');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[c]}));},fixture);await p.reload();await p.waitForSelector('.ai-openui');
const checks=[];
for(const [width,theme] of [[320,'light'],[390,'dark'],[1440,'light']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const result=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,errors:[...document.querySelectorAll('[role=status]')].filter(e=>e.textContent.includes('未能')).map(e=>e.textContent),fonts:[...document.querySelectorAll('.ai-openui *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>({tag:e.tagName,class:e.getAttribute('class'),font:getComputedStyle(e).fontSize,text:e.textContent.slice(0,35)})).filter(e=>!['12px','13px','15px','16px','18px'].includes(e.font)),switches:[...document.querySelectorAll('[role=switch]')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),buttons:[...document.querySelectorAll('.ai-openui button')].filter(e=>!['radio','checkbox','switch'].includes(e.role)&&e.getBoundingClientRect().height).filter(e=>e.getBoundingClientRect().height<44).map(e=>({text:e.textContent,h:e.getBoundingClientRect().height}))}));
 checks.push({theme,...result});if(config.assert){assert(!result.overflow);assert.equal(result.errors.length,0);assert.equal(result.fonts.length,0);assert.equal(result.buttons.length,0);assert(result.switches.every(e=>e.w===44&&e.h===44));}
 for(const index of [2,5,6,7,8,9]){await p.evaluate(i=>{const s=document.querySelector('[aria-label="对话"]>div'),el=document.querySelectorAll('.ai-openui')[i];s.scrollTop+=el.getBoundingClientRect().top-s.getBoundingClientRect().top-96;},index);await p.screenshot({path:`${out}/${width}-${theme}-${index}.png`});}
}
for(const [name,selector] of [['code','.openui-code-block-wrapper'],['options','.openui-option-cards'],['composite','.openui-composite-card']]){await p.evaluate(sel=>{const s=document.querySelector('[aria-label="对话"]>div'),el=document.querySelector(sel);s.scrollTop+=el.getBoundingClientRect().top-s.getBoundingClientRect().top-96;},selector);await p.screenshot({path:out+'/'+name+'.png'});}
await fs.writeFile(out+'/result.json',JSON.stringify({checks},null,2)+'\n');console.log(checks);
await p.cdp('Emulation.clearDeviceMetricsOverride');
JS
} | ego-browser nodejs
