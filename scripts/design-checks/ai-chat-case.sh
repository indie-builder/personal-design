#!/bin/sh
# Replay the captured real GLM case in an isolated local origin; no model calls.
# EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<preview-port> sh scripts/design-checks/ai-chat-case.sh
set -eu
{
node --input-type=module <<'CONFIG'
const base=process.env.DESIGN_BASE_URL;
if(!/^http:\/\/localhost:\d+$/.test(base||''))throw new Error('Use an isolated localhost origin.');
console.log('const config='+JSON.stringify({base,space:process.env.EGO_TASK_SPACE?Number(process.env.EGO_TASK_SPACE):null,root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');
const task=await taskSpace(config.space||'AI 问答 · 业务流程回归');console.log({spaceId:task.spaceId});const p=task.page('p1');
const fixture=JSON.parse(await fs.readFile(config.root+'/scripts/design-checks/fixtures/ai-chat-case.json','utf8'));
const output=config.root+'/docs/design/execution/evidence/ai-chat-case';await fs.mkdir(output,{recursive:true});
await p.goto(config.base+'/products/ai-chat');
await p.evaluate(c=>{const key='personal-design:ai-chat:v1';const old=JSON.parse(localStorage.getItem(key)||'{}');if(old.conversations?.some(x=>x.id!=='case-fixture'))throw new Error('Origin contains user records');localStorage.setItem(key,JSON.stringify({agents:[],conversations:[c]}));},fixture);
const checks=[];
for (const width of [1440,390]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<640});await p.reload();
 await p.waitForFunction(()=>document.querySelectorAll('[data-answer-body]').length===6);
 assert(await p.evaluate(()=>![...document.querySelectorAll('[role="status"],[role="alert"]')].some(e=>/未能|不可用/.test(e.textContent))));
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await p.evaluate(()=>document.querySelector('input[name="团队人数"]').value),'3');
 assert.equal(await p.evaluate(()=>document.querySelector('input[name="活跃项目数"]').value),'5');
 assert.equal(await p.evaluate(()=>document.querySelector('[role="slider"]').getAttribute('aria-valuenow')),'85');
 assert(await p.evaluate(()=>document.querySelectorAll('table').length>=2));
 for(const name of ['趋势','前后对比','任务分布']){
  await p.click(`loc=role:tab[name="${name}"]`);
  await p.waitForFunction(n=>[...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent===n&&t.getAttribute('aria-selected')==='true'),name);
  await p.waitForFunction(()=>document.querySelector('[role="tabpanel"][data-state="active"] svg')!==null);
  const box=await p.evaluate(()=>document.querySelector('[role="tabpanel"][data-state="active"]').getBoundingClientRect().toJSON());
  await p.mouse.move(Math.min(width-30,box.x+100),Math.max(170,box.y+40));await p.mouse.wheel(0,Math.max(0,box.y-175));
  await p.screenshot({path:output+'/'+width+'-'+name+'.png'});
 }
 assert(await p.evaluate(()=>document.querySelector('article:last-child [data-answer-body]').innerText.includes('延长试用')));
 checks.push(`${width}px: six stages, persisted form/slider state, tables, line/bar/pie tabs, decision summary, no overflow`);
}
await p.cdp('Emulation.clearDeviceMetricsOverride');
await fs.writeFile(output+'/result.json',JSON.stringify({passed:true,source:'Captured live Pi/GLM-5.3-Flash workflow; replayed with official OpenUI library',checks},null,2)+'\n');
console.log(checks);if(!config.space) await task.finish({keep:[]});
JS
} | ego-browser nodejs
