#!/bin/sh
# Real local model request; preserves existing conversations. Requires an active Ego space.
# EGO_TASK_SPACE=<space> sh scripts/design-checks/ai-chat-actions.sh
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config='+JSON.stringify({space:Number(process.env.EGO_TASK_SPACE),root:process.cwd(),base:process.env.DESIGN_BASE_URL||'https://personal-design.localhost'})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;
const fs=await import('node:fs/promises');
const task=await taskSpace(config.space);const p=task.page('p1');
const out=config.root+'/docs/design/execution/evidence/ai-chat-actions';await fs.mkdir(out,{recursive:true});
await p.goto(config.base+'/products/ai-chat');
await p.click('button[aria-label="新建对话"]');
await p.fill('textarea[aria-label="发消息给生成式 UI 助手"]','用一张卡片和两条简短清单，介绍一个移动端待办工具。');
await p.click('button[aria-label="发送消息"]');
await p.waitForSelector('[data-generation-status]');
assert(!await p.evaluate(()=>document.querySelector('article:last-child [aria-label="回答操作"]')));
await p.waitForFunction(()=>!document.querySelector('[data-generation-status]')&&!!document.querySelector('button[aria-label="重新生成"]'),undefined,{timeout:55000});
assert(!await p.evaluate(()=>document.querySelector('[role="alert"]')));
const body=await p.evaluate(()=>document.querySelector('article:last-child [data-answer-body]').innerText);
assert(body.length>10);
// Capture the value passed to the clipboard API without changing the user's clipboard.
await p.evaluate(()=>{window.__copiedAnswer='';navigator.clipboard.writeText=async text=>{window.__copiedAnswer=text;};});
await p.click('article:last-child button[aria-label="复制回答"]');
await p.waitForFunction(()=>document.querySelector('article:last-child [role="status"]')?.textContent==='已复制');
assert.equal(await p.evaluate(()=>window.__copiedAnswer),body);
assert(!body.includes('root ='));
await p.screenshot({path:out+'/completed-desktop.png'});
await p.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Clipboard unavailable');};});
await p.click('article:last-child button[aria-label="复制回答"]');
await p.waitForFunction(()=>document.querySelector('article:last-child [role="status"]')?.textContent==='复制失败，请重试');
await p.click('button[aria-label="重新生成"]');
await p.waitForSelector('[data-generation-status]');
assert(!await p.evaluate(()=>document.querySelector('article:last-child [aria-label="回答操作"]')));
await p.waitForFunction(()=>!document.querySelector('[data-generation-status]')&&!!document.querySelector('article:last-child [aria-label="回答操作"]'),undefined,{timeout:55000});
await p.fill('textarea[aria-label="发消息给生成式 UI 助手"]','继续详细展开成二十条开发步骤。');
await p.click('button[aria-label="发送消息"]');
await p.waitForSelector('button[aria-label="停止生成"]');
await p.click('button[aria-label="停止生成"]');
await p.waitForSelector('button[aria-label="发送消息"]');
assert(!await p.evaluate(()=>document.querySelector('[data-generation-status]')));
await p.reload();
await p.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await p.waitForSelector('button[aria-label="复制回答"]');
assert(!await p.evaluate(()=>document.querySelector('[data-generation-status]')));
assert(await p.evaluate(()=>[...document.querySelectorAll('[aria-label="回答操作"] button')].every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)));
await p.screenshot({path:out+'/completed-mobile.png'});
await p.cdp('Emulation.clearDeviceMetricsOverride');
await fs.writeFile(out+'/result.json',JSON.stringify({passed:true,checks:['status only during generation','completed icon actions','copy rendered text with success/failure feedback','regenerate and stop clear transient state','reload and mobile touch targets'],provider:'live Coding Plan'},null,2)+'\n');
console.log('PASS message actions and generation lifecycle');
JS
} | ego-browser nodejs
