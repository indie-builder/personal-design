#!/bin/sh
# Run against the local production preview; does not send model requests or clear history.
# EGO_TASK_SPACE=<active space> sh scripts/design-checks/ai-chat-navigation.sh
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config = ' + JSON.stringify({base:process.env.DESIGN_BASE_URL || 'https://personal-design.localhost',space:Number(process.env.EGO_TASK_SPACE),root:process.cwd()}) + ';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;
const fs=await import('node:fs/promises');
const task=await taskSpace(config.space || 'AI 问答 · 外层返回导航');const p=task.page('p1');
console.log({spaceId:task.spaceId});
const out=config.root+'/docs/design/execution/evidence/ai-chat-navigation';await fs.mkdir(out,{recursive:true});
const checks=[];
for(const [width,height,theme] of [[1440,900,'dark'],[1280,800,'light'],[390,844,'light'],[390,600,'dark']]) {
  await p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
  await p.goto(config.base+'/products/ai-chat');
  await p.waitForSelector('button[aria-label="打开导航"]');
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const bounds=await p.evaluate(()=>{
    const link=document.querySelector('a[aria-label="AI 问答，返回首页"]');const frame=document.querySelector('main');
    return {link:link.getBoundingClientRect().toJSON(),header:link.closest('header').getBoundingClientRect().toJSON(),frame:frame.getBoundingClientRect().toJSON(),inside:frame.contains(link),overflow:document.documentElement.scrollHeight>innerHeight+1};
  });
  assert(!bounds.inside);if(width<800) assert(bounds.header.bottom<=bounds.frame.top);assert.equal(bounds.header.height,72);assert(!bounds.overflow);
  if(width>639) {assert(bounds.link.left<bounds.frame.left);assert.equal(bounds.frame.top,width>=800?16:88);assert.equal(bounds.frame.width,480);}
  else {assert.equal(bounds.frame.top,72);assert.equal(bounds.frame.width,width);}
  await p.screenshot({path:`${out}/${width}-${height}-${theme}.png`});
  await p.click('button[aria-label="打开导航"]');
  await p.waitForSelector('dialog[open]');
  assert(await p.evaluate(()=>{const a=document.querySelector('main').getBoundingClientRect(),b=document.querySelector('dialog[open]').getBoundingClientRect();return Math.abs(a.top-b.top)<1&&Math.abs(a.left-b.left)<1&&!document.querySelector('dialog[open] a[href="/"]')&&document.querySelector('#ai-panel-title').textContent==='对话';}));
  await p.keyboard.press('Escape');
  await p.click('button[aria-controls="ai-agent-list"]');
  await p.waitForFunction(()=>!!document.querySelector('[popover]:popover-open'));
  assert(await p.evaluate(()=>{const a=document.querySelector('button[aria-controls="ai-agent-list"]').getBoundingClientRect(),b=document.querySelector('[popover]:popover-open').getBoundingClientRect();return b.top>=a.bottom-2;}));
  await p.click('text="创建智能体"');
  await p.waitForSelector('input[name="name"]');
  assert(await p.evaluate(()=>{const a=document.querySelector('main').getBoundingClientRect(),b=document.querySelector('#agent-creation').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom+1;}));
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  checks.push(`${width}x${height} ${theme}: external header, bounded drawer/picker/editor, no overflow`);
}
await p.cdp('Emulation.clearDeviceMetricsOverride');
await p.goto(config.base+'/products/personal-sites');
const sibling=await p.evaluate(()=>{const a=document.querySelector('header a[aria-label$="返回首页"]');return {left:a.getBoundingClientRect().left,font:getComputedStyle(a).fontSize};});
await p.goto(config.base+'/products/ai-chat');
assert.deepEqual(await p.evaluate(()=>{const a=document.querySelector('header a[aria-label$="返回首页"]');return {left:a.getBoundingClientRect().left,font:getComputedStyle(a).fontSize};}),sibling);
await p.click('a[aria-label="AI 问答，返回首页"]');
await p.waitForURL(config.base+'/');
assert(await p.evaluate(()=>!document.querySelector('#workspace-content').inert));
await p.evaluate(()=>history.back());
await p.waitForURL(config.base+'/products/ai-chat');
await p.waitForSelector('button[aria-label="打开导航"]');
checks.push('shared header matches sibling project; return home and browser back work');
await fs.writeFile(out+'/result.json',JSON.stringify({base:config.base,checks,passed:true},null,2)+'\n');
console.log(checks);
await task.finish({keep:[]});
JS
} | ego-browser nodejs
