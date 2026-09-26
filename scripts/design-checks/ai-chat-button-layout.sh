#!/bin/sh
# Follow catalog replay in the same isolated browser task space.
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config='+JSON.stringify({space:Number(process.env.EGO_TASK_SPACE),root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default,fs=await import('node:fs/promises');const t=await taskSpace(config.space),p=t.page('p1');const out=config.root+'/docs/design/execution/evidence/ai-chat-button-layout';await fs.mkdir(out,{recursive:true});const checks=[];
await p.fill('[data-mobile-editable] details[open] input[type=text]','测试修改');await p.waitForSelector('button:text-is("确认修改")');
for(const [width,theme]of [[320,'light'],[390,'dark'],[1440,'light']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<640});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 const groups=await p.evaluate(()=>[...document.querySelectorAll('.openui-buttons,[class*="mobileEditActions"]')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,columns:getComputedStyle(e).gridTemplateColumns.split(' ').length,primary:e.querySelectorAll('.openui-button-base-primary').length,buttons:[...e.children].filter(x=>x.tagName==='BUTTON').map(b=>{const a=b.getBoundingClientRect();return{label:b.textContent,width:a.width,height:a.height,left:a.left-r.left,top:a.top-r.top,radius:getComputedStyle(b).borderRadius,font:getComputedStyle(b).fontSize};})};}));
 assert(groups.some(g=>g.buttons.length===1));assert(groups.some(g=>g.buttons.length===2));assert(groups.some(g=>g.buttons.length===3));
 for(const g of groups){assert(g.width>0);for(const [i,b]of g.buttons.entries()){const full=g.columns===1||(g.buttons.length%2===1&&i===g.buttons.length-1);assert(g.primary<=1);assert(Math.abs(b.width-(full?g.width:(g.width-8)/2))<1,JSON.stringify(g));assert(b.height>=44);assert.equal(b.radius,'10px');assert.equal(b.font,'13px');}}
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push({width,theme,groups});
 for(const [name,count]of [['single',1],['double',2],['triple',3]]){await p.evaluate(n=>{const target=[...document.querySelectorAll('.openui-buttons')].find(e=>e.children.length===n);const s=document.querySelector('[aria-label="对话"]>div');s.scrollTop+=target.getBoundingClientRect().top-s.getBoundingClientRect().top-140;},count);await p.screenshot({path:out+`/${width}-${theme}-${name}.png`});}
 await p.evaluate(()=>{const el=document.querySelector('[class*="mobileEditActions"]'),s=document.querySelector('[aria-label="对话"]>div');s.scrollTop+=el.getBoundingClientRect().top-s.getBoundingClientRect().top-220;});await p.screenshot({path:out+`/${width}-${theme}-editor.png`});
}
await p.cdp('Emulation.clearDeviceMetricsOverride');await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks.map(c=>({width:c.width,theme:c.theme,groups:c.groups.length,passed:true})));
JS
} | ego-browser nodejs
