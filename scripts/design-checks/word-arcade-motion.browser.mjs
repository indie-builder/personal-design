import assert from 'node:assert/strict';
import { cdpEvaluate } from './harness.cjs';

// Run on the ready production /products/word-arcade page. Only public DOM, animation
// keyframes and input are observed; no score, physics or private React state is edited.
export async function verifyWordArcadeMotion(tab, cdp) {
  const reduced = await tab.playwright.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const evaluate = (expression) => cdpEvaluate(cdp, expression, { timeoutMs: 35000 });
  const media = (value) =>
    cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
  try {
    await media('no-preference');
    const authored = await evaluate(`(async () => {
      const assert=(value,message)=>{if(!value)throw Error(message)};
      const area=document.querySelector('[data-arcade-stage]');
      const modes=[...document.querySelectorAll('[aria-label="选择小游戏"] button')];
      const scene=()=>area.querySelector('canvas').parentElement;
      const prompt=()=>area.querySelector('button')?.parentElement;
      const live=()=>area.parentElement.querySelector('[role="status"]').textContent;
      const playing=()=>live().includes('游戏进行中');
      const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      const until=async(test,message)=>{const end=performance.now()+3000;while(!test()){assert(performance.now()<end,message);await frame()}};
      const pointer=(el)=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));el.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))};
      const key=(el,key)=>{document.documentElement.dataset.input='keyboard';el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key}))};
      const click=(name)=>pointer([...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===name||el.textContent.trim()===name));
      const mode=(index)=>pointer(modes[index]);
      const active=()=>scene().getAnimations().filter(a=>a.playState!=='finished'&&a.playState!=='idle');
      const reset=async()=>{click('重新开始');await until(()=>!playing()&&area.querySelector('button')?.textContent.trim()==='开始游戏','reset must restore prompt');await frame()};
      await until(()=>area.querySelector('button')&&!area.querySelector('button').disabled,'game ready');
      await reset();
      // Keep measurement reads observable without exposing engine state. The engine clears
      // each letter transform before measuring; its scene must already have no transform.
      const original=Element.prototype.getBoundingClientRect;
      const contaminated=[];
      Element.prototype.getBoundingClientRect=function(){
        if(this.matches?.('[data-game-letter]')&&!this.style.transform&&getComputedStyle(scene()).transform!=='none')contaminated.push(getComputedStyle(scene()).transform);
        return original.call(this);
      };
      try {
        const ids=['breakout','snake','invaders','ducks','runner'];
        const old=area.dataset.game,oldIndex=ids.indexOf(old),target=(oldIndex+1)%5;
        const outgoingCanvas=area.querySelector('canvas'),outgoingHeading=area.querySelector('h1');
        const footer=area.nextElementSibling;
        const hudBox=()=>[...area.children].find(el=>el.getAttribute('aria-hidden')==='true').getBoundingClientRect();
        const hudBefore=hudBox(),footerBox=footer.getBoundingClientRect();
        mode(target);
        assert(area.dataset.game===old,'pointer mode must keep outgoing DOM before commit');
        assert(area.querySelector('canvas')===outgoingCanvas&&area.querySelector('h1')===outgoingHeading,'outgoing canvas and heading must stay mounted');
        await frame();
        assert(modes[target].getAttribute('aria-pressed')==='true','selection feedback must precede mode commit');
        const exit=active()[0];
        assert(exit&&exit.effect.getTiming().duration===100,'scene exit must last 100ms');
        const exitFrames=exit.effect.getKeyframes();
        const direction=Math.sign(target-oldIndex);
        assert(exitFrames.at(-1).opacity==='0'&&exitFrames.at(-1).transform==='translateX('+(-direction*8)+'px)','scene exit must fade and travel 8px along mode order');
        assert(hudBox().x===hudBefore.x&&footer.getBoundingClientRect().y===footerBox.y,'HUD and footer must stay stable');
        exit.finish();
        await until(()=>area.dataset.game===ids[target]&&active().length,'new mode must enter after exit');
        const enter=active()[0],entryFrames=enter.effect.getKeyframes();
        assert(enter.effect.getTiming().duration===180,'entry must last 180ms');
        assert(entryFrames[0].opacity==='0'&&entryFrames[0].transform==='translateX('+(direction*8)+'px)','entry must start opposite exit');
        enter.currentTime=60;enter.pause();
        const measuredHomes=[...area.querySelectorAll('[data-game-letter]')].map(el=>el.getBoundingClientRect().x-new DOMMatrix(getComputedStyle(scene()).transform).m41);
        const visible=getComputedStyle(scene()).transform,opacity=getComputedStyle(scene()).opacity;
        const reverse=oldIndex;
        mode(reverse);
        const reversed=active()[0].effect.getKeyframes()[0];
        assert(reversed.transform===visible&&Math.abs(Number(reversed.opacity)-Number(opacity))<.001,'interruption must continue from actual visible entry frame');
        const latest=(target+2)%5;
        mode(latest);
        await until(()=>area.dataset.game===ids[latest],'latest rapid mode must win');
        await until(()=>!active().length,'scene must settle');
        assert(!playing(),'mode handoff must stop gameplay');
        mode(latest);
        assert(!active().length,'same mode must be a no-op');
        const homes=[...area.querySelectorAll('[data-game-letter]')].map(el=>el.getBoundingClientRect().x);
        assert(homes.every((x,i)=>Math.abs(x-measuredHomes[i])<.5),'entry completion must not drift headline geometry');
        assert(hudBox().x===hudBefore.x&&footer.getBoundingClientRect().y===footerBox.y,'HUD and footer must remain stable after commit');
        await reset();
        assert([...area.querySelectorAll('[data-game-letter]')].every((el,i)=>Math.abs(el.getBoundingClientRect().x-homes[i])<.5),'reset must not drift measured letters');
        mode((latest+1)%5);
        await frame();
        area.style.width=(area.clientWidth-32)+'px';
        await frame();await frame();
        area.style.width='';
        await until(()=>!active().length,'resize must settle scene safely');
        await reset();
        assert(!contaminated.length,'scene transform contaminated engine measurement: '+JSON.stringify(contaminated));

        const testPrompt=async(stageClick=false)=>{
          const outgoing=prompt();
          if(stageClick)pointer(area);else pointer(area.querySelector('button'));
          assert(!playing()&&prompt()===outgoing,'prompt must remain mounted before physical start');
          const exit=outgoing.getAnimations().find(a=>a.effect.getTiming().duration===100);
          assert(exit&&exit.effect.getKeyframes().at(-1).opacity==='0','prompt exit must fade for 100ms');
          exit.finish();
          await until(playing,'physical game must start after prompt exit');
        };
        await testPrompt();
        key(area,'Escape');await until(()=>!playing(),'Escape must pause');
        await testPrompt(true);
        key(area,'Escape');await until(()=>!playing(),'Escape must pause again');
        pointer(area.querySelector('button'));
        key(area,'Escape');
        await new Promise(resolve=>setTimeout(resolve,260));
        assert(!playing()&&prompt()&&getComputedStyle(prompt()).opacity==='1','Escape must cancel pending prompt start');
        // Focus leaving a child prompt button never bubbles a stage blur; only leaving the
        // stage itself may cancel the pending start.
        const outside=document.createElement('button');outside.type='button';outside.textContent='outside';
        area.parentElement.append(outside);
        try {
          const startButton=()=>area.querySelector('button');
          startButton().focus();
          const moving=prompt();
          pointer(startButton());
          assert(moving.getAnimations().some(a=>a.effect.getTiming().duration===100),'pointer start must animate before focus moves');
          area.focus();
          await new Promise(resolve=>setTimeout(resolve,260));
          assert(playing(),'prompt→stage focus move must not cancel a pending start');
          key(area,'Escape');await until(()=>!playing(),'focus-move start must pause');
          // The keyboard policy pass is deferred by a task. It must settle the pending
          // start through its own path without the internal focus move canceling it.
          startButton().focus();
          pointer(startButton());
          document.documentElement.dataset.input='keyboard';
          assert(prompt().getAnimations().some(a=>a.effect.getTiming().duration===100),'pointer start must animate before the deferred policy runs');
          area.focus();
          await new Promise(resolve=>setTimeout(resolve,260));
          assert(playing(),'deferred keyboard policy must settle the start without canceling it');
          pointer(area);key(area,'Escape');await until(()=>!playing(),'deferred-policy start must pause');
          startButton().focus();
          pointer(startButton());
          outside.focus();
          await new Promise(resolve=>setTimeout(resolve,260));
          assert(!playing()&&getComputedStyle(prompt()).opacity==='1','focus leaving the stage must cancel a pending start');
        } finally {outside.remove()}
        await reset();
        pointer(area.querySelector('button'));click('重新开始');
        pointer(area);
        const hidden=Object.getOwnPropertyDescriptor(document,'hidden');
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
        try {
          document.dispatchEvent(new Event('visibilitychange'));
          await new Promise(resolve=>setTimeout(resolve,260));
          assert(!playing()&&prompt(),'background must cancel pending start and keep game stopped');
        } finally {
          if(hidden)Object.defineProperty(document,'hidden',hidden);else delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
        }
        await reset();
        mode((ids.indexOf(area.dataset.game)+1)%5);
        const keyStarted=performance.now();
        key(area,'Enter');
        await until(playing,'keyboard during handoff must start immediately');
        assert(performance.now()-keyStarted<100,'keyboard start must not wait for pointer exit');
        assert(!active().length,'keyboard must settle scene motion');
        key(area,'Escape');await until(()=>!playing(),'keyboard pause');
        const start=area.querySelector('button');
        start.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));
        await frame();
        assert(playing(),'keyboard prompt activation must not wait for exit');
        await reset();
        const next=(ids.indexOf(area.dataset.game)+1)%5;
        modes[next].dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));
        await frame();
        assert(area.dataset.game===ids[next]&&!active().length,'keyboard mode selection must commit without scene motion');
        mode((next+1)%5);await frame();
        const restoring=scene().getAnimations()[0];restoring.pause();restoring.currentTime=35;
        const reversingFrom=getComputedStyle(scene()).transform;
        mode(next);
        assert(active()[0].effect.getKeyframes()[0].transform===reversingFrom,'reverse to outgoing mode must use its visible frame');
        await until(()=>!active().length,'outgoing reverse must settle');
        assert(area.dataset.game===ids[next],'reversing before commit must retain outgoing mode');
        // Exit completion commits the next mode; a reverse in that same batch can coalesce
        // back to the mounted kind, leaving kind/round unchanged after measurement was owed.
        const raceFrom=ids.indexOf(area.dataset.game),raceTo=(raceFrom+1)%5;
        mode(raceTo);
        const raceExit=scene().getAnimations().find(a=>a.effect.getTiming().duration===100);
        assert(raceExit,'mode exit must be observable for the coalesced commit race');
        let reversedOnFinish=false;
        raceExit.addEventListener('finish',()=>{if(!reversedOnFinish){reversedOnFinish=true;mode(raceFrom)}});
        raceExit.finish();
        await until(()=>reversedOnFinish,'exit finish must dispatch the reverse commit');
        await until(()=>scene().getAnimations().some(a=>a.effect.getTiming().duration===180),'coalesced mode commit must still measure and enter');
        assert(area.dataset.game===ids[raceFrom],'coalesced mode commit must keep the mounted mode');
        assert(modes[raceFrom].getAttribute('aria-pressed')==='true','coalesced mode commit must keep selection in sync');
        await until(()=>!active().length,'coalesced handoff must settle');
        pointer(area);
        await until(playing,'pointer start must work after a coalesced mode commit');
        key(area,'Escape');await until(()=>!playing(),'coalesced commit must pause');
        await reset();
        pointer(area.querySelector('button'));click('重新开始');
        await new Promise(resolve=>setTimeout(resolve,260));
        assert(!playing()&&area.querySelector('button')?.textContent.trim()==='开始游戏','reset must cancel pending prompt start');
        return {outgoingDOM:true,entryKeyframes:true,reverseFromVisual:true,latestIntent:true,measurementUntransformed:true,resize:true,promptButton:true,promptStage:true,escapeCancel:true,backgroundCancel:true,resetCancel:true,keyboard:true};
      } finally {Element.prototype.getBoundingClientRect=original;area.style.width='';}
    })()`);
    assert(authored?.outgoingDOM, 'Authored motion assertions did not execute');
    await media('reduce');
    const instant = await evaluate(`(async()=>{
      const area=document.querySelector('[data-arcade-stage]');
      const buttons=[...document.querySelectorAll('[aria-label="选择小游戏"] button')];
      const target=buttons.find(el=>el.getAttribute('aria-pressed')!=='true');
      const pointer=el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));el.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))};
      pointer(target);await new Promise(resolve=>requestAnimationFrame(resolve));
      if(target.getAttribute('aria-pressed')!=='true'||area.querySelector('canvas').parentElement.getAnimations().length)throw Error('Reduced-motion mode must be immediate');
      pointer(area.querySelector('button'));
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(!area.parentElement.querySelector('[role="status"]').textContent.includes('游戏进行中'))throw Error('Reduced-motion start must be immediate');
      return {reducedMotion:true};
    })()`);
    return { ...authored, ...instant };
  } finally {
    await media(reduced ? 'reduce' : 'no-preference');
  }
}
