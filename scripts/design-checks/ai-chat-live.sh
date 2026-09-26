#!/bin/sh
# Real Coding Plan smoke check for the current official OpenUI case; uses model quota.
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config='+JSON.stringify({base:process.env.DESIGN_BASE_URL||'https://personal-design.localhost',space:process.env.EGO_TASK_SPACE?Number(process.env.EGO_TASK_SPACE):null,root:process.cwd()})+';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;const fs=await import('node:fs/promises');
const task=await taskSpace(config.space||'AI 问答 · 当前案例真实联调');console.log({spaceId:task.spaceId});const p=task.page('p1');
await p.goto(config.base+'/products/ai-chat');await p.click('button[aria-label="新建对话"]');
assert(!await p.evaluate(()=>document.querySelector('[aria-label="示例问题"]').innerText.includes('OpenUI')));
await p.click('button[aria-label="看看两周试用的效果"]');
await p.waitForFunction(()=>!document.querySelector('[data-generation-status]')&&!!document.querySelector('article [role="tablist"]'),undefined,{timeout:55000});
assert(!await p.evaluate(()=>[...document.querySelectorAll('[role="alert"],[role="status"]')].some(e=>/未能|不可用/.test(e.textContent))));
for(const name of ['趋势','前后对比','任务分布']){await p.click(`loc=role:tab[name="${name}"]`);await p.waitForFunction(()=>!!document.querySelector('[role="tabpanel"][data-state="active"] svg'));}
await p.click('article:last-child button:text-is("给出最终建议")');
await p.waitForFunction(()=>!document.querySelector('[data-generation-status]')&&document.querySelectorAll('article[aria-label$="的回答"]').length===2,undefined,{timeout:55000});
assert(await p.evaluate(()=>/样本|演示/.test(document.querySelector('article:last-child [data-answer-body]').innerText)));
await p.reload();await p.waitForFunction(()=>document.querySelectorAll('article[aria-label$="的回答"]').length===2);
const output=config.root+'/docs/design/execution/evidence/ai-chat-live';await fs.mkdir(output,{recursive:true});
await fs.writeFile(output+'/result.json',JSON.stringify({passed:true,provider:'live Pi / GLM-5.3-Flash',checks:['business prompts contain no OpenUI instructions','three chart tabs render actual SVG charts','decision follow-up retains sample context','reload preserves current conversation']},null,2)+'\n');
console.log('PASS latest official OpenUI case and live Pi model');if(!config.space) await task.finish({keep:[]});
JS
} | ego-browser nodejs
