#!/bin/sh
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config='+JSON.stringify({space:Number(process.env.EGO_TASK_SPACE),base:process.env.DESIGN_BASE_URL,root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');const t=await taskSpace(config.space),p=t.page('p1');const out=config.root+'/docs/design/execution/evidence/ai-chat-catalog';const checks=[];
for(const [width,theme] of [[320,'light'],[390,'dark'],[1440,'light']]){
 await p.cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<640});await p.goto(config.base+'/products/ai-chat');await p.waitForSelector('[aria-controls="ai-agent-list"]');await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await p.click('[aria-controls="ai-agent-list"]');await p.click('button:text-is("创建智能体")');await p.waitForSelector('#agent-creation-title');await p.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const result=await p.evaluate(()=>{const title=document.querySelector('#agent-creation-title'),back=document.querySelector('[aria-label="返回智能体列表"]'),frame=document.querySelector('main').getBoundingClientRect(),screen=document.querySelector('#agent-creation').getBoundingClientRect();const top=e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));};return {titleVisible:top(title),backVisible:top(back),titleSize:getComputedStyle(title).fontSize,inside:screen.left>=frame.left&&screen.right<=frame.right};});assert(result.titleVisible&&result.backVisible&&result.inside);assert.equal(result.titleSize,'15px');checks.push({width,theme,...result});await p.screenshot({path:out+`/create-${width}-${theme}.png`});if(width===390)await p.screenshot({path:out+'/create.png'});await p.click('[aria-label="返回智能体列表"]');await p.waitForSelector('#ai-agent-list:popover-open');
}
await fs.writeFile(out+'/create-layer.json',JSON.stringify({passed:true,checks},null,2)+'\n');console.log(checks);await p.cdp('Emulation.clearDeviceMetricsOverride');
JS
} | ego-browser nodejs
