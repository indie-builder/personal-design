import { button as buttons, cdpEvaluate } from './harness.cjs';
// Run with a compatible production tab adapter and CDP session:
// const { verifyWordArcade } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/word-arcade.browser.mjs');
// await verifyWordArcade(tab, await tab.capabilities.get('cdp'));
// The caller supplies the browser connection.
export async function verifyWordArcade(tab, cdp) {
  const results = [];
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const button = buttons(tab.playwright);
  const state = () => tab.playwright.evaluate(() => ({ ...document.querySelector('[data-arcade-stage]').dataset }));
  // Keyboard activates native controls; a DOM pointer event supplies aim coordinates.
  // This avoids the in-app panel's screen/CSS coordinate offset during browser QA.
  const move = (x, y) => cdpEvaluate(cdp, `document.querySelector('[data-arcade-stage]').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:${x},clientY:${y}}))`, { parameters: {}, exception: 'ignore', raw: true });
  const changedScore = () => tab.playwright.locator('[data-arcade-stage]:not([data-score="0"])').waitFor({state:'visible',timeoutMs:15000});
  for (const name of ['打砖块','贪吃蛇','文字射击','飞字打靶','文字跑酷']) {
    await button(name).press('Enter');
    await button('重新开始').press('Enter');
    await button('开始游戏').press('Enter');
    expect((await state()).gameState === 'playing', `${name}: start`);
    if (name === '飞字打靶') {
      await tab.playwright.locator('[data-game-target="true"]').first().waitFor({state:'visible',timeoutMs:4000});
      // Read moving geometry in the same browser frame; locator serialization can lag an active target.
      const geometry = await cdpEvaluate(cdp, '(()=>{const e=document.querySelector("[data-game-target=true]");const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()', { parameters: { returnByValue: true }, exception: 'ignore', raw: true });
      const target = geometry.result.value;
      await move(target.x, target.y);
      await tab.playwright.getByRole('region',{name:'飞字打靶游戏区域',exact:true}).press('Space');
    } else if (name === '贪吃蛇') {
      const target = await tab.playwright.locator('[data-game-letter]').nth(5).evaluate(el => {
        const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
      });
      await move(target.x,target.y);
    } else if (name === '文字跑酷') {
      await tab.playwright.getByRole('region',{name:'文字跑酷游戏区域',exact:true}).press('Space');
    }
    await changedScore();
    const scored = await state();
    expect(Number(scored.score) > 0, `${name}: real gameplay must score`);
    const region = tab.playwright.getByRole('region',{name:`${name}游戏区域`,exact:true});
    await region.press('Escape');
    const paused = await state();
    expect(['paused','miss','over'].includes(paused.gameState), `${name}: pause / round end`);
    await button('重新开始').press('Enter');
    expect((await state()).gameState === 'idle' && (await state()).score === '0', `${name}: reset`);
    expect(await tab.playwright.locator('[data-game-letter]').evaluateAll(els=>els.every(el=>el.style.opacity==='1')), `${name}: reset restores all letters`);
    results.push({game:name,scored:Number(scored.score),reset:true});
  }
  const errors = await tab.dev.logs({levels:['error'],limit:20});
  expect(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  return {results,errors};
}

// Call while a runner letter is rolling, or after pausing that state.
export async function verifyRunnerAlignment(tab) {
  const geometry = await tab.playwright.evaluate(() => {
    const stage = document.querySelector('[data-arcade-stage]').getBoundingClientRect();
    const el = document.querySelector('[data-game-target="true"]');
    if (!el) throw new Error('Start runner and wait for a rolling letter first');
    const rect = el.getBoundingClientRect();
    return { actual: rect.y + rect.height / 2, expected: stage.bottom - 31 };
  });
  if (Math.abs(geometry.actual - geometry.expected) > 2)
    throw new Error(`Rolling letter drifts from collision center: ${JSON.stringify(geometry)}`);
  return geometry;
}

// Call immediately after restarting a failed later wave.
export async function verifyRestartHeadline(tab) {
  const heading = await tab.playwright.getByRole('heading', { name:'任何想法，一键开玩。', exact:true }).count();
  if (!heading) throw new Error('A new run must restore the first-wave headline');
  return { restored:true };
}

export async function verifyPointerCancel(tab, cdp) {
  const state = await tab.playwright.locator('[data-arcade-stage]').getAttribute('data-game-state');
  if (state !== 'playing') throw new Error('Start a game before testing pointer interruption');
  await cdpEvaluate(cdp, 'document.querySelector("[data-arcade-stage]").dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerType:"touch"}))', { parameters: {}, exception: 'ignore', raw: true });
  const after = await tab.playwright.locator('[data-arcade-stage]').getAttribute('data-game-state');
  if (after !== 'paused') throw new Error(`Interrupted touch keeps running: ${after}`);
  return { state:after };
}

// Assisted playthrough, not a manual difficulty measurement. Reads only rendered pixels /
// letter geometry and sends normal input events; never edits score, lives or engine state.
export async function startVisiblePlaythrough(cdp, kind) {
  if (!['breakout', 'runner'].includes(kind)) throw new Error('Unsupported visual controller');
  return cdpEvaluate(cdp, `(() => {
    const kind=${JSON.stringify(kind)};
    const area=document.querySelector('[data-arcade-stage]'), canvas=area.querySelector('canvas');
    if(area.dataset.game!==kind||area.dataset.gameState!=='playing')throw Error('Start the requested game first');
    const started=performance.now();let lastBall=null,lastTarget=null;
    window.arcadePlaytest={kind,state:'running',method:'assisted, visible output only'};
    const timer=setInterval(()=>{
      const now=performance.now(),state=area.dataset.gameState;
      if(state!=='playing'||now-started>90000||!area.isConnected){
        clearInterval(timer);window.arcadePlaytest={kind,state,score:Number(area.dataset.score),seconds:(now-started)/1000,method:'assisted, visible output only'};return;
      }
      const r=area.getBoundingClientRect();
      if(kind==='runner'){
        const target=[...area.querySelectorAll('[data-game-target="true"]')].filter(e=>e.style.transform.includes('rotate(-')).map(e=>({el:e,r:e.getBoundingClientRect()})).filter(b=>b.r.x+b.r.width/2>r.x+60).sort((a,b)=>a.r.x-b.r.x)[0];
        if(target){const x=target.r.x+target.r.width/2-r.x;
          const speed=lastTarget?.el===target.el?Math.max(80,(lastTarget.x-x)/((now-lastTarget.time)/1000)):0;
          if(speed&&x-60<speed*.23+24) {area.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));area.dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true}));}
          lastTarget={el:target.el,x,time:now};
        }
      }else{
        const scale=canvas.width/r.width, image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let ball=null;
        for(let y=0;y<r.height&&!ball;y++){
          let start=-1;
          for(let x=0;x<=r.width;x++){
            const alpha=x<r.width?image[(Math.floor(y*scale)*canvas.width+Math.floor(x*scale))*4+3]:0;
            if(alpha>240&&start<0)start=x;
            if(alpha<=240&&start>=0){if(x-start===10){ball={x:start+5,y:y+5};break;}start=-1;}
          }
        }
        if(ball){let offset=0;
          if(lastBall&&ball.y>lastBall.y){const targets=[...area.querySelectorAll('[data-game-letter]')].filter(e=>e.style.opacity!=='0').map(e=>e.getBoundingClientRect()).sort((a,b)=>Math.abs(a.x+a.width/2-r.x-ball.x)-Math.abs(b.x+b.width/2-r.x-ball.x));
            const t=targets[0];if(t){let angle=Math.atan2(t.x+t.width/2-r.x-ball.x,r.height-38-(t.y-r.y));if(Math.abs(angle)<.16)angle=.35;offset=Math.max(-44,Math.min(44,angle/(Math.PI/3)*48));}}
          area.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.x+ball.x-offset,clientY:r.bottom-50}));lastBall=ball;
        }
      }
    },50);
  })()`, { parameters: {}, exception: 'ignore', raw: true });
}
