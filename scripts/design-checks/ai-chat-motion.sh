#!/bin/sh
# Same local provider/setup as ai-chat.sh; output includes paused real animation frames.
set -eu
{
node --input-type=module <<'CONFIG'
console.log('const config = ' + JSON.stringify({ base: process.env.DESIGN_BASE_URL || 'http://localhost:3107', space: process.env.EGO_TASK_SPACE ? Number(process.env.EGO_TASK_SPACE) : null, root: process.cwd() }) + ';');
CONFIG
cat <<'JS'
const assert=(await import('node:assert/strict')).default;
const fs=await import('node:fs/promises');
const task=await taskSpace(config.space || 'AI 问答动效回归');console.log({spaceId:task.spaceId});
const p=task.page('p1');
const output=config.root+'/docs/design/execution/evidence/ai-chat-motion';await fs.mkdir(output,{recursive:true});
const result={base:config.base,checks:[],frames:[]};
const check=name=>{result.checks.push(name);console.log('PASS '+name);};
const nextFrames=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const settled=selector=>p.waitForFunction(s=>{const e=document.querySelector(s);return !e||e.getAnimations({subtree:true}).every(a=>a.playState==='finished'||a.playState==='idle');},selector);
// Drive actual app handlers, pause actual CSS/WAAPI timelines, capture their early movement frame.
async function frame(name,selector,trigger) {
  const state=await p.evaluate(async ({selector,trigger})=>{
    document.documentElement.dataset.input='pointer';
    document.querySelector(trigger).click();
    // Exits start synchronously and have a wall-clock safety deadline. Capture before yielding a frame.
    if (!(selector==='#agent-creation' && trigger.includes('返回'))) await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const element=document.querySelector(selector);
    const animations=element?.getAnimations({subtree:true}) || [];
    const records=animations.map(a=>({duration:Number(a.effect.getTiming().duration),frames:a.effect.getKeyframes(),pseudo:a.effect.pseudoElement||null}));
    window.__heldChatAnimations=animations;
    for(const a of animations){a.pause();a.currentTime=Number(a.effect.getTiming().duration)*.25;}
    return {animations:records,display:element&&getComputedStyle(element).display,transform:element&&getComputedStyle(element).transform,opacity:element&&getComputedStyle(element).opacity,containerScroll:element?.parentElement?.scrollLeft,children:element?.textContent?.slice(0,180),clipped:element&&getComputedStyle(element).overflow};
  },{selector,trigger});
  assert(state.animations.length>0,`${name}: missing motion`);
  assert(state.animations.some(a=>a.frames.some(f=>f.transform!==undefined||f.opacity!==undefined)),`${name}: no spatial/opacity evidence`);
  if(selector==='#agent-creation')assert.equal(state.containerScroll,0,'focus scrolled the mobile frame during creation motion');
  result.frames.push({name,...state});
  const capture=await p.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await fs.writeFile(output+'/'+name+'.png',Buffer.from(capture.data,'base64'));
  await p.evaluate(()=>{for(const a of window.__heldChatAnimations||[])a.play();window.__heldChatAnimations=[];});
  await settled(selector);
}
try {
  await p.goto(config.base+'/products/ai-chat');
  await p.evaluate(()=>{localStorage.removeItem('personal-design:ai-chat:v1');localStorage.setItem('theme','light');});
  await p.reload();await p.waitForSelector('button[aria-controls="ai-agent-list"]');
  await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await p.cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  console.log(await p.snapshot());
  await frame('desktop-picker-enter','#ai-agent-list','button[aria-controls="ai-agent-list"]');
  await frame('desktop-picker-exit','#ai-agent-list','button[aria-controls="ai-agent-list"]');
  assert(await p.evaluate(()=>!document.querySelector('[popover]:popover-open')));check('picker enters/exits with native layer retention');
  await frame('desktop-drawer-enter','dialog','button[aria-label="打开导航"]');
  assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('dialog')).overflow),'hidden');
  assert(await p.evaluate(()=>{const a=document.querySelector('dialog').getBoundingClientRect(),b=document.querySelector('main').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;}));
  await frame('desktop-drawer-exit','dialog','dialog button[aria-label="关闭"]');
  assert(result.frames.at(-1).children.includes('对话记录'),'drawer content disappeared before exit finished');
  assert(await p.evaluate(()=>!document.querySelector('dialog[open]')));check('drawer panel stays clipped to mobile frame and keeps exit content');
  await p.click('button[aria-controls="ai-agent-list"]');await settled('#ai-agent-list');
  console.log(await p.snapshot());
  await frame('desktop-create-enter','#agent-creation','#ai-agent-list > button');
  assert(await p.evaluate(()=>document.querySelector('#agent-creation').offsetParent===document.querySelector('main')));
  assert(await p.evaluate(()=>document.querySelector('#agent-creation').previousElementSibling.inert));
  await frame('desktop-create-exit','#agent-creation','button[aria-label="返回智能体列表"]');
  await p.waitForFunction(()=>!document.querySelector('#agent-creation')&&!!document.querySelector('[popover]:popover-open'));
  await settled('#ai-agent-list');check('creation enters inside frame and exits before state changes');

  // Reverse during the entrance, rather than snapping to the resting transform.
  const reversal=await p.evaluate(()=>new Promise(resolve=>{
    document.documentElement.dataset.input='pointer';
    const observer=new MutationObserver(()=>{
      const editor=document.querySelector('#agent-creation');if(!editor)return;
      observer.disconnect();
      const entry=editor.getAnimations()[0];entry.pause();entry.currentTime=60;
      const before=getComputedStyle(editor).transform;
      editor.querySelector('input').focus();
      const focusedScroll=editor.parentElement.scrollLeft;
      editor.querySelector('button').click();
      const frames=editor.getAnimations().find(a=>a.effect.getTiming().fill==='forwards')?.effect.getKeyframes();
      resolve({before,frames,retained:editor.isConnected,focusedScroll});
    });
    observer.observe(document.querySelector('main'),{childList:true,subtree:true});
    document.querySelector('#ai-agent-list > button').click();
  }));
  assert.equal(reversal.focusedScroll,0,'input focus shifted the frame during entrance');
  assert(reversal.retained&&reversal.frames?.length);assert.equal(reversal.frames[0].transform,reversal.before);
  await p.waitForFunction(()=>!document.querySelector('#agent-creation'));await settled('#ai-agent-list');check('quick reverse continues from current transform');

  await p.keyboard.press('Escape');
  await p.focus('button[aria-controls="ai-agent-list"]');await p.keyboard.press('Enter');
  assert(await p.evaluate(()=>document.querySelector('[popover]:popover-open').getAnimations().length===0));
  await p.focus('#ai-agent-list > button');await p.keyboard.press('Enter');
  assert(await p.evaluate(()=>document.querySelector('#agent-creation').getAnimations().length===0));
  await p.keyboard.press('Escape');
  assert(await p.evaluate(()=>!document.querySelector('#agent-creation')));await p.keyboard.press('Escape');check('keyboard open/back/Escape are immediate');

  await p.click('button[aria-controls="ai-agent-list"]');await settled('#ai-agent-list');
  await p.click('#ai-agent-list > button');await settled('#agent-creation');
  await p.evaluate(()=>{document.documentElement.dataset.input='pointer';document.querySelector('button[aria-label="返回智能体列表"]').click();});
  await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await p.waitForFunction(()=>!document.querySelector('#agent-creation'));
  await p.click('#ai-agent-list > button');
  assert(await p.evaluate(()=>document.querySelector('#agent-creation').getAnimations().length===0));
  await p.click('button[aria-label="返回智能体列表"]');await p.keyboard.press('Escape');check('reduced motion settles active exit and skips next entrance');

  await p.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await p.click('button[aria-controls="ai-agent-list"]');await settled('#ai-agent-list');
  await p.click('#ai-agent-list > button');await settled('#agent-creation');
  await p.fill('input[name="name"]','动效检查');await p.fill('textarea[name="prompt"]','用中文回答');
  await p.evaluate(()=>{document.documentElement.dataset.input='pointer';const b=document.querySelector('#agent-creation button[type="submit"]');b.click();b.click();});
  await p.waitForFunction(()=>!document.querySelector('#agent-creation'));
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('personal-design:ai-chat:v1')).agents.length===2);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('personal-design:ai-chat:v1')).agents.filter(a=>a.name==='动效检查').length),1);
  check('repeated submit commits exactly once');

  await p.evaluate(()=>{window.__chatTransitionRuns=[];document.addEventListener('transitionrun',e=>{if(e.target.matches('article[data-arriving]'))window.__chatTransitionRuns.push({id:e.target.getAttribute('aria-label'),property:e.propertyName});});});
  await p.fill('textarea[aria-label="发消息给动效检查"]','慢速回答');await p.click('button[aria-label="发送消息"]');
  await p.waitForSelector('button[aria-label="停止生成"]');await nextFrames();
  assert(await p.evaluate(()=>[...document.querySelectorAll('[role="status"] i')].some(e=>e.getAnimations().some(a=>a.playState==='running'))));
  await p.waitForFunction(()=>!!document.querySelector('article[aria-label$="的回答"]'));
  await nextFrames();
  const initialRuns=await p.evaluate(()=>window.__chatTransitionRuns.filter(e=>e.id.endsWith('的回答')).length);
  assert(initialRuns>0,'assistant entry did not animate');
  await p.waitForFunction(()=>document.querySelector('article[aria-label$="的回答"]')?.textContent.includes('需求确认'));
  assert.equal(await p.evaluate(()=>window.__chatTransitionRuns.filter(e=>e.id.endsWith('的回答')).length),initialRuns);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForFunction(()=>document.querySelector('main').hasAttribute('data-motion-paused'));
  assert(await p.evaluate(()=>[...document.querySelectorAll('[role="status"] i')].every(e=>e.getAnimations().length===0)));
  await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await p.click('button[aria-label="停止生成"]');await p.waitForSelector('button[aria-label="发送消息"]');
  check('new-message arrival does not replay per chunk; waiting stops in simulated background');

  await p.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await frame('mobile-drawer-enter','dialog','button[aria-label="打开导航"]');
  await frame('mobile-drawer-exit','dialog','dialog button[aria-label="关闭"]');
  await p.click('button[aria-controls="ai-agent-list"]');await settled('#ai-agent-list');
  await frame('mobile-create-enter','#agent-creation','#ai-agent-list > button');
  await frame('mobile-create-exit','#agent-creation','button[aria-label="返回智能体列表"]');
  await p.keyboard.press('Escape');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth));check('mobile paired motion and no horizontal overflow');
  await p.click('button[aria-label="打开导航"]');await settled('dialog');
  await p.click('dialog button[aria-label="关闭"]');await settled('dialog');
  await p.click('a[aria-label="AI 问答，返回首页"]');await p.waitForURL(config.base+'/');
  await p.waitForFunction(()=>!document.querySelector('[data-route-motion]'));
  assert(await p.evaluate(()=>!document.querySelector('dialog[open], [popover]:popover-open')));
  await p.evaluate(()=>document.querySelector('a[aria-label="进入AI 问答"]').scrollIntoView({block:'nearest',inline:'center',behavior:'instant'}));
  await p.click('a[aria-label="进入AI 问答"]');await p.waitForURL(config.base+'/products/ai-chat');
  await p.waitForFunction(()=>!document.querySelector('[data-route-motion]'));
  await p.click('button[aria-controls="ai-agent-list"]');await settled('#ai-agent-list');
  await p.click('#ai-agent-list > button');await settled('#agent-creation');
  await p.evaluate(()=>history.back());await p.waitForURL(config.base+'/');
  assert(await p.evaluate(()=>!document.querySelector('dialog[open], [popover]:popover-open')));
  await p.evaluate(()=>history.forward());await p.waitForURL(config.base+'/products/ai-chat');
  await p.waitForFunction(()=>{const e=document.querySelector('#agent-creation');return !e||(e.getBoundingClientRect().width>0&&!e.inert);});
  if(await p.evaluate(()=>!!document.querySelector('#agent-creation'))){await p.keyboard.press('Escape');await p.keyboard.press('Escape');}
  check('home return and native back/forward leave no modal or inert residue');
  result.passed=true;
} catch(error) {result.passed=false;result.error=String(error.stack);throw error;}
finally {await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({passed:result.passed,checks:result.checks}));
if(!config.space) await task.finish({keep:[]});
JS
} | ego-browser nodejs
