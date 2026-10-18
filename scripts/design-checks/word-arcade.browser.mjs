import { button as buttons, cdpEvaluate } from './harness.cjs';
import {
  activeTargetCenter,
  aliveLetterCenter,
  ballCenter,
  band,
  canvasSnapshot,
  invaderPlayerCenter,
  letterStyles,
  runnerTop,
} from './word-arcade-probe.mjs';
// Run on /products/word-arcade with the production preview already open:
// const { verifyWordArcade } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/word-arcade.browser.mjs');
// await verifyWordArcade(tab, await tab.capabilities.get('cdp'));
// The caller supplies the browser connection and a compatible tab adapter (dev.logs, playwright).
//
// State and score come only from public output: the stage's accessible live region
// (`role=status`), the prompt button/title, and the rendered letter spans/canvas pixels.
// The old data-game-state/data-score/data-game-target attributes no longer exist.
const GAME_NAMES = ['打砖块', '贪吃蛇', '文字射击', '飞字打靶', '文字跑酷'];
const IDENTITY = 'translate(0px, 0px) rotate(0rad) scale(1)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readStage(tab) {
  return tab.playwright.evaluate(() => {
    const area = document.querySelector('[data-arcade-stage]');
    if (!area) throw new Error('Word Arcade stage not found');
    const status = area.parentElement?.querySelector('[role="status"]')?.textContent ?? '';
    const promptButton = area.querySelector('button');
    const prompt = promptButton?.textContent?.trim() ?? '';
    const promptDisabled = promptButton?.disabled ?? false;
    const title = area.querySelector('p')?.textContent?.trim() ?? '';
    const playing = status.includes('游戏进行中');
    const inferred = playing
      ? 'playing'
      : title === '已暂停'
        ? 'paused'
        : prompt === '开始游戏'
          ? 'idle'
          : prompt === '再来一次'
            ? 'over'
            : prompt === '下一关'
              ? 'cleared'
              : prompt === '继续'
                ? 'miss'
                : 'unknown';
    const number = (pattern) => {
      const match = pattern.exec(status);
      return match ? Number(match[1]) : NaN;
    };
    return {
      state: inferred,
      playing,
      score: number(/得分\s*(\d+)/),
      remaining: number(/剩余\s*(\d+)\s*字/),
      prompt,
      promptDisabled,
      title,
      status,
    };
  });
}

async function waitFor(tab, predicate, message, timeoutMs = 9000) {
  const started = Date.now();
  let snapshot = await readStage(tab);
  while (Date.now() - started < timeoutMs) {
    if (predicate(snapshot)) return snapshot;
    await sleep(80);
    snapshot = await readStage(tab);
  }
  throw new Error(`${message}: ${JSON.stringify(snapshot)}`);
}

async function waitGeometry(read, message, timeoutMs = 4000, accept = Boolean) {
  const started = Date.now();
  let value = null;
  while (Date.now() - started < timeoutMs) {
    value = await read();
    if (accept(value)) return value;
    await sleep(80);
  }
  throw new Error(`${message} not rendered: ${JSON.stringify(value)}`);
}

// The reset re-measures and repaints in a fresh effect; poll until every letter is home.
async function lettersRestored(tab, timeoutMs = 3000) {
  const started = Date.now();
  let letters = [];
  while (Date.now() - started < timeoutMs) {
    letters = await letterStyles(tab);
    if (
      letters.length > 0 &&
      letters.every((letter) => letter.opacity === '1' && letter.transform === IDENTITY)
    )
      return letters;
    await sleep(80);
  }
  throw new Error(`Reset must restore all letters: ${JSON.stringify(letters)}`);
}

async function waitScored(tab, name, drive, resume, timeoutMs = 15000) {
  const started = Date.now();
  let snapshot = await readStage(tab);
  while (Date.now() - started < timeoutMs) {
    if (snapshot.score > 0) return snapshot;
    if (snapshot.playing) await drive();
    else if (['继续', '再来一次', '开始游戏', '下一关'].includes(snapshot.prompt)) {
      await buttons(tab.playwright)(snapshot.prompt).press('Enter');
      await resume();
    } else throw new Error(`${name}: stopped without a scored round: ${JSON.stringify(snapshot)}`);
    await sleep(120);
    snapshot = await readStage(tab);
  }
  throw new Error(
    `${name}: no real gameplay score within ${timeoutMs}ms: ${JSON.stringify(snapshot)}`,
  );
}

export async function verifyWordArcade(tab, cdp) {
  const results = [];
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const button = buttons(tab.playwright);
  const region = (name) =>
    tab.playwright.getByRole('region', { name: `${name}游戏区域`, exact: true });
  // Keyboard activates native controls; a DOM pointer event supplies aim/steer coordinates.
  // Dispatching a real PointerEvent avoids the in-app panel's screen/CSS coordinate offset.
  const move = (x, y) =>
    cdpEvaluate(
      cdp,
      `document.querySelector('[data-arcade-stage]').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:${x},clientY:${y}}))`,
      { parameters: {}, exception: 'ignore', raw: true },
    );

  for (const name of GAME_NAMES) {
    await button(name).press('Enter');
    // Reset first: re-selecting the game that is already playing/paused leaves that run live,
    // so waiting for idle before reset can never settle.
    await button('重新开始').press('Enter');
    await waitFor(
      tab,
      (state) => state.state === 'idle' && !state.promptDisabled,
      `${name}: ready`,
      10000,
    );
    await button('开始游戏').press('Enter');
    await waitFor(tab, (state) => state.playing, `${name}: start`);

    // Pause, then prove no visible physics advanced while paused.
    await region(name).press('Escape');
    const paused = await waitFor(
      tab,
      (state) => state.state === 'paused',
      `${name}: Escape pauses`,
    );
    await sleep(120);
    const frozen = await canvasSnapshot(tab);
    // Canvas pixels miss DOM-only motion, so letter transforms/opacity must hold too.
    const frozenLetters = JSON.stringify(await letterStyles(tab));
    await sleep(400);
    expect((await canvasSnapshot(tab)) === frozen, `${name}: paused canvas kept advancing`);
    expect(
      JSON.stringify(await letterStyles(tab)) === frozenLetters,
      `${name}: paused letter spans kept moving`,
    );
    await button(paused.prompt).press('Enter');
    await waitFor(tab, (state) => state.playing, `${name}: resume`);

    let input;
    if (name === '打砖块') {
      // The ball auto-aims at a letter, so a score alone cannot prove pointer input works.
      // Steer the paddle visibly away from its start before re-aiming at the ball.
      const paddle = await waitGeometry(() => band(tab, 0, true), `${name}: rendered paddle`);
      await move(paddle.left + 20, paddle.y);
      await waitGeometry(
        () => band(tab, 0, true),
        `${name}: paddle follows pointermove`,
        3000,
        (next) => next !== null && next.x < paddle.x - 24,
      );
      const ball = await waitGeometry(() => ballCenter(tab), `${name}: rendered ball`);
      await move(ball.x, ball.y);
      input = 'pointermove visibly moves the rendered paddle and re-aims it at the rendered ball';
    } else if (name === '贪吃蛇') {
      const target = await waitGeometry(() => aliveLetterCenter(tab), `${name}: rendered letter`);
      await move(target.x, target.y);
      input = 'pointermove steers the snake toward a rendered letter';
    } else if (name === '文字射击') {
      const before = await waitGeometry(() => invaderPlayerCenter(tab), `${name}: rendered player`);
      await region(name).press('ArrowRight');
      await sleep(300);
      const after = await waitGeometry(() => invaderPlayerCenter(tab), `${name}: rendered player`);
      expect(
        after.x > before.x + 6,
        `${name}: ArrowRight must move the rendered player (${before.x} -> ${after.x})`,
      );
      input = 'ArrowRight moves the rendered player; auto-fire scores';
    } else if (name === '飞字打靶') {
      const target = await waitGeometry(() => activeTargetCenter(tab), `${name}: live target`);
      await move(target.x, target.y);
      await region(name).press('Space');
      input = 'pointermove aims and Space fires at a live target';
    } else {
      const before = await waitGeometry(() => runnerTop(tab), `${name}: rendered sprite`);
      await region(name).press('Space');
      await sleep(140);
      const after = await waitGeometry(() => runnerTop(tab), `${name}: rendered sprite`);
      expect(
        after < before - 8,
        `${name}: Space must lift the rendered sprite (${before} -> ${after})`,
      );
      input = 'Space lifts the rendered runner sprite; distance scores';
    }

    const scored = await waitScored(
      tab,
      name,
      async () => {
        if (name === '打砖块') {
          const ball = await ballCenter(tab);
          if (ball) await move(ball.x, ball.y);
        } else if (name === '贪吃蛇') {
          const target = await aliveLetterCenter(tab);
          if (target) await move(target.x, target.y);
        } else if (name === '飞字打靶') {
          const target = await activeTargetCenter(tab);
          if (target) {
            await move(target.x, target.y);
            await region(name).press('Space');
          }
        }
      },
      async () => {
        if (name === '飞字打靶')
          await waitGeometry(
            () => activeTargetCenter(tab),
            `${name}: live target after resume`,
            6000,
          );
      },
    );
    expect(Number(scored.score) > 0, `${name}: real gameplay must score`);

    await button('重新开始').press('Enter');
    const reset = await waitFor(
      tab,
      (state) => state.state === 'idle' && state.score === 0,
      `${name}: reset`,
    );
    const letters = await lettersRestored(tab);
    expect(
      reset.remaining === letters.length,
      `${name}: reset restores remaining targets (${reset.remaining}/${letters.length})`,
    );
    results.push({
      game: name,
      scored: Number(scored.score),
      input,
      pauseFrozen: true,
      reset: true,
    });
  }

  const errors = await tab.dev.logs({ levels: ['error'], limit: 20 });
  expect(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  return { results, errors };
}

// Call while a runner letter is rolling on the ground, or after pausing that state.
export async function verifyRunnerAlignment(tab) {
  const geometry = await tab.playwright.evaluate(() => {
    const stage = document.querySelector('[data-arcade-stage]');
    const box = stage.getBoundingClientRect();
    const el = [...stage.querySelectorAll('[data-game-letter]')].find(
      (node) =>
        node.style.opacity === '1' &&
        node.style.transform.includes('rotate(-') &&
        node.getBoundingClientRect().left > box.left + 60,
    );
    if (!el) throw new Error('Start runner and wait for a rolling letter first');
    const rect = el.getBoundingClientRect();
    // Rotation is about the span center, so rect center is the collision center. Runner
    // scales every rolling letter to a 30px height at `floor = height - 16`.
    return { actual: rect.top + rect.height / 2, expected: box.bottom - 16 - 15 };
  });
  if (Math.abs(geometry.actual - geometry.expected) > 2)
    throw new Error(`Rolling letter drifts from collision center: ${JSON.stringify(geometry)}`);
  return geometry;
}

// Call immediately after restarting a failed later wave.
export async function verifyRestartHeadline(tab) {
  const heading = await tab.playwright
    .getByRole('heading', { name: '任何想法，一键开玩。', exact: true })
    .count();
  if (!heading) throw new Error('A new run must restore the first-wave headline');
  return { restored: true };
}

export async function verifyPointerCancel(tab, cdp) {
  const before = await readStage(tab);
  if (!before.playing) throw new Error('Start a game before testing pointer interruption');
  await cdpEvaluate(
    cdp,
    'document.querySelector("[data-arcade-stage]").dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerType:"touch"}))',
    { parameters: {}, exception: 'ignore', raw: true },
  );
  const after = await waitFor(
    tab,
    (state) => state.state === 'paused',
    'Interrupted touch must pause the game',
    3000,
  );
  return { state: after.state };
}

// Assisted playthrough, not a manual difficulty measurement. Reads only rendered pixels /
// letter geometry and the public status text; sends normal input events and never edits
// score, lives or engine state.
export async function startVisiblePlaythrough(cdp, kind) {
  if (!['breakout', 'runner'].includes(kind)) throw new Error('Unsupported visual controller');
  return cdpEvaluate(
    cdp,
    `(() => {
    const kind=${JSON.stringify(kind)};
    const area=document.querySelector('[data-arcade-stage]'),canvas=area.querySelector('canvas');
    const snapshot=()=>{
      const text=(area.parentElement?.querySelector('[role="status"]')?.textContent)??'';
      const playing=text.includes('游戏进行中');
      const prompt=area.querySelector('button')?.textContent?.trim()??'';
      const title=area.querySelector('p')?.textContent?.trim()??'';
      const state=playing?'playing':title==='已暂停'?'paused':prompt==='开始游戏'?'idle':prompt==='再来一次'?'over':prompt==='下一关'?'cleared':prompt==='继续'?'miss':'unknown';
      return {state,score:Number((/得分 (\\d+)/.exec(text)||[])[1]||0)};
    };
    if(area.dataset.game!==kind||snapshot().state!=='playing')throw Error('Start the requested game first');
    const started=performance.now();let lastBall=null,lastTarget=null;
    window.arcadePlaytest={kind,state:'running',method:'assisted, visible output only'};
    const timer=setInterval(()=>{
      const now=performance.now(),{state,score}=snapshot();
      if(state!=='playing'||now-started>90000||!area.isConnected){
        clearInterval(timer);window.arcadePlaytest={kind,state,score,seconds:(now-started)/1000,method:'assisted, visible output only'};return;
      }
      const r=area.getBoundingClientRect();
      if(kind==='runner'){
        const target=[...area.querySelectorAll('[data-game-letter]')].filter(e=>e.style.opacity==='1'&&e.style.transform.includes('rotate(-')).map(e=>({el:e,r:e.getBoundingClientRect()})).filter(b=>b.r.x+b.r.width/2>r.x+60).sort((a,b)=>a.r.x-b.r.x)[0];
        if(target){const x=target.r.x+target.r.width/2-r.x;
          const speed=lastTarget?.el===target.el?Math.max(80,(lastTarget.x-x)/((now-lastTarget.time)/1000)):0;
          if(speed&&x-60<speed*.23+24) {area.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));area.dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true}));}
          lastTarget={el:target.el,x,time:now};
        }
      }else{
        const scale=canvas.width/r.width, image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        const alpha=(x,y)=>image[(Math.floor(y*scale)*canvas.width+Math.floor(x*scale))*4+3];
        let ball=null;
        for(let y=0;y<r.height&&!ball;y++){
          let start=-1;
          for(let x=0;x<=r.width;x++){
            const on=x<r.width&&alpha(x,y)>240;
            if(on&&start<0)start=x;
            if(!on&&start>=0){if(Math.abs(x-start-10)<=1){ball={x:start+(x-start)/2,y:y+0.5};break;}start=-1;}
          }
        }
        if(ball){let offset=0;
          if(lastBall&&ball.y>lastBall.y){const targets=[...area.querySelectorAll('[data-game-letter]')].filter(e=>e.style.opacity!=='0').map(e=>e.getBoundingClientRect()).sort((a,b)=>Math.abs(a.x+a.width/2-r.x-ball.x)-Math.abs(b.x+b.width/2-r.x-ball.x));
            const t=targets[0];if(t){let angle=Math.atan2(t.x+t.width/2-r.x-ball.x,r.height-38-(t.y-r.y));if(Math.abs(angle)<.16)angle=.35;offset=Math.max(-44,Math.min(44,angle/(Math.PI/3)*48));}}
          area.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.x+ball.x-offset,clientY:r.bottom-50}));lastBall=ball;
        }
      }
    },50);
  })()`,
    { parameters: {}, exception: 'ignore', raw: true },
  );
}
