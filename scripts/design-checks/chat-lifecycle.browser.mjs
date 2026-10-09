import { button as buttons, cdpEvaluate } from './harness.cjs';
// Compatible browser tab adapter; production preview uses fixtures/ai-chat-provider.mjs on :3907.
// const { verifyChatLifecycle } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/chat-lifecycle.browser.mjs');
// await verifyChatLifecycle(tab, await tab.capabilities.get('cdp'));
export async function verifyChatLifecycle(tab, cdp) {
  const origin = new URL(await tab.url()).origin;
  if (new URL(origin).hostname !== 'upgrade-check.personal-design.localhost') throw new Error('Use the isolated test origin');
  const results = [];
  const key = 'personal-design:ai-chat:v2';
  const legacyKey = 'personal-design:ai-chat:v1';
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const evaluate = (expression) => cdpEvaluate(cdp, expression, { timeoutMs: 15000, exception: 'text' });
  const button = buttons(tab.playwright);
  const error = () => tab.playwright.getByRole('region', { name: '对话', exact: true }).getByRole('alert');
  const wait = (locator, state = 'visible') => locator.waitFor({ state, timeoutMs: 10000 });
  const send = async text => {
    await tab.playwright.locator('textarea[aria-label^="发消息给"]').fill(text);
    await button('发送消息').press('Enter');
  };
  const finished = async () => {
    await wait(button('重新生成'));
    check(await error().count() === 0, 'Successful send must clear the error');
    const answer = await tab.playwright.evaluate(() => [...document.querySelectorAll('[data-answer-body]')].at(-1)?.innerText);
    check(answer?.includes('需求确认') && answer.includes('团队预算为3000元'), 'Fixture answer must render as readable UI');
  };
  const stored = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).conversations[0]`);
  const checkTranscript = conversation => {
    check(conversation.messages.every(m => typeof m.text === 'string' && !('parts' in m) && !m.metadata?.memory), 'Each message must use text and must not duplicate conversation memory');
    check(conversation.memory?.summary.includes('3000'), 'Conversation must persist one summary');
  };
  await tab.goto(`${origin}/`);
  const before = await evaluate(`({current:localStorage.getItem(${JSON.stringify(key)}),legacy:localStorage.getItem(${JSON.stringify(legacyKey)}),theme:document.documentElement.dataset.theme})`);
  // Observe requests on each loaded chat page; navigation discards the probe.
  const install = () => evaluate(`
    window.__chatLifecycle={requests:[],aborted:false,holdMemory:false};
    const originalFetch=window.fetch;
    window.fetch=(...args)=>{
      if(!String(args[0]).endsWith('/api/ai-chat'))return originalFetch(...args);
      const state=window.__chatLifecycle,signal=args[1]?.signal;
      state.requests.push(JSON.parse(args[1].body));
      signal?.addEventListener('abort',()=>state.aborted=true,{once:true});
      return originalFetch(...args).then(response=>{
        if(!state.holdMemory||!response.headers.has('x-ai-memory'))return response;
        state.memoryReceived=true;
        response.body?.cancel().catch(()=>{});
        return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}}),{status:response.status,headers:response.headers});
      });
    };
    window.__restoreChatLifecycle=()=>{window.fetch=originalFetch;delete window.__chatLifecycle;delete window.__restoreChatLifecycle;};
  `);
  let seededLegacy;
  const legacyIntact = async () => check(await evaluate(`localStorage.getItem(${JSON.stringify(legacyKey)})`) === seededLegacy, 'App must leave v1 storage untouched');
  try {
    await evaluate(`localStorage.removeItem(${JSON.stringify(key)});localStorage.setItem(${JSON.stringify(legacyKey)},JSON.stringify({agents:[],conversations:[{id:'legacy-sentinel',agentId:'general',title:'不读取旧记录',messages:[{id:'legacy-message',role:'user',parts:[{type:'text',text:'不读取旧记录'}]}]}]}));`);
    seededLegacy = await evaluate(`localStorage.getItem(${JSON.stringify(legacyKey)})`);
    await tab.goto(`${origin}/products/ai-chat`);
    await install();
    await wait(tab.playwright.locator('textarea[aria-label^="发消息给"]'));
    check(await tab.playwright.locator('[data-answer-body]').count() === 0, 'Fresh v2 storage must ignore v1 history');
    await legacyIntact();
    await button('新建对话').press('Enter');
    await send('触发服务错误');
    await wait(error());
    await send('普通回答：错误后继续');
    await finished();
    results.push('error → normal send clears error and renders answer');
    await button('新建对话').press('Enter');
    await send('慢速回答：停止检查');
    await wait(button('停止生成'));
    await button('停止生成').press('Enter');
    await wait(button('停止生成'), 'hidden');
    await send('普通回答：停止后继续');
    await finished();
    results.push('stop → normal send works');
    await button('新建对话').press('Enter');
    await evaluate('window.__chatLifecycle.aborted=false');
    await send('慢速回答：离页检查');
    await wait(button('停止生成'));
    await tab.playwright.getByRole('link', { name: 'AI 问答，返回首页', exact: true }).press('Enter');
    await wait(tab.playwright.getByRole('link', { name: '作品时间轴首页', exact: true }));
    check(await evaluate('window.__chatLifecycle.aborted') === true, 'Leaving during generation must abort its request');
    await legacyIntact();
    await tab.goto(`${origin}/products/ai-chat`);
    await install();
    await wait(button('新建对话'));
    await send('普通回答：返回后继续');
    await finished();
    results.push('leave during generation aborts → return and continue works');

    const fixture = { id: 'lifecycle-memory', agentId: 'general', title: '摘要验收', messages: Array.from({ length: 16 }, (_, i) => ({ id: `seed-${i}`, role: i % 2 ? 'assistant' : 'user', text: i % 2 ? 'root = Stack([TextContent("历史回答")]);' : `第${i}条需求，团队预算3000元。` })) };
    await legacyIntact();
    await tab.goto(`${origin}/`);
    await evaluate(`{const saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));saved.conversations=[${JSON.stringify(fixture)}];localStorage.setItem(${JSON.stringify(key)},JSON.stringify(saved));}`);
    await tab.goto(`${origin}/products/ai-chat`);
    await install();
    await wait(button('重新生成'));
    await send('整理以上需求并继续');
    await finished();
    const summarized = await stored();
    checkTranscript(summarized);
    check(summarized.messages.length === 18 && summarized.memory.throughId === 'seed-10', 'Summary must preserve full local transcript and summarize through the expected message');
    await legacyIntact();
    await tab.goto(`${origin}/products/ai-chat`);
    await install();
    await wait(button('重新生成'));
    await send('刷新后复用摘要继续');
    await finished();
    const resumed = await stored();
    checkTranscript(resumed);
    const request = await evaluate('window.__chatLifecycle.requests.at(-1)');
    check(JSON.stringify(request.memory) === JSON.stringify(summarized.memory), 'Reloaded conversation must send the saved memory');
    check(request.messages.length === 8 && request.messages[0].id === 'seed-11' && request.messages.at(-1).text === '刷新后复用摘要继续', 'Reload must transport only original messages after throughId and the new question');
    check(resumed.messages.length === 20 && JSON.stringify(resumed.memory) === JSON.stringify(summarized.memory), 'Response without a memory header must retain existing memory');
    const lastAnswer = resumed.messages.at(-1).id;
    await button('重新生成').press('Enter');
    await finished();
    const regenerated = await stored();
    checkTranscript(regenerated);
    check(regenerated.messages.length === 20 && regenerated.messages.at(-1).id !== lastAnswer, 'Regenerate must replace only the last assistant answer');
    check(regenerated.messages.slice(0, -1).every((m, i) => m.id === resumed.messages[i].id), 'Regenerate must retain earlier message identities');
    check(JSON.stringify((await evaluate('window.__chatLifecycle.requests.at(-1)')).memory) === JSON.stringify(summarized.memory), 'Regenerate must reuse conversation memory');
    results.push('one conversation memory persists → reload reuses it → last-turn regeneration replaces only the answer');

    await send('主题图表验收');
    await finished();
    for (const [theme, palette] of [['dark', ['rgb(176, 197, 210)', 'rgb(120, 143, 159)', 'rgb(163, 185, 165)', 'rgb(195, 172, 142)']], ['light', ['rgb(82, 108, 123)', 'rgb(138, 155, 167)', 'rgb(120, 143, 126)', 'rgb(161, 139, 110)']]]) {
      const rendered = await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};
        new Promise((resolve,reject)=>{const end=Date.now()+5000;const check=()=>{
          const answer=[...document.querySelectorAll('[data-answer-body]')].at(-1);
          const bars=[...(answer?.querySelectorAll('.openui-bar-chart-container svg path.openui-bar-chart-bar[fill]')||[])].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});
          const fills=bars.map(el=>getComputedStyle(el).fill);
          const styles=document.querySelectorAll('style[data-openui-theme]').length;
          if(fills.length===2&&fills.every(fill=>${JSON.stringify(palette)}.includes(fill))&&styles===1)return resolve({fills,styles});
          if(Date.now()>end)return reject(new Error('Rendered chart theme did not update: '+JSON.stringify({fills,styles})));
          requestAnimationFrame(check);
        };check();})`);
      check(rendered.styles === 1 && rendered.fills.length === 2, 'Two visible chart bars must share one theme stylesheet');
    }
    results.push('multiple answers share one ThemeProvider; visible SVG bars change to the dark and light chart palettes');

    // Receive a valid summary header while withholding every response delta.
    await legacyIntact();
    await tab.goto(`${origin}/`);
    await evaluate(`{const saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));saved.conversations=[${JSON.stringify(fixture)}];localStorage.setItem(${JSON.stringify(key)},JSON.stringify(saved));}`);
    await tab.goto(`${origin}/products/ai-chat`);
    await install();
    await wait(button('重新生成'));
    await evaluate('window.__chatLifecycle.holdMemory=true');
    await send('收到摘要后停止');
    await wait(button('停止生成'));
    // A bounded condition wait, with no fixed timing dependency on the provider.
    await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{const c=JSON.parse(localStorage.getItem(${JSON.stringify(key)})).conversations[0];if(window.__chatLifecycle.memoryReceived&&c.memory)return resolve();if(Date.now()>end)return reject(new Error('Summary was not persisted before the first delta'));setTimeout(check,25);};check();})`);
    await button('停止生成').press('Enter');
    await wait(button('停止生成'), 'hidden');
    const stopped = await stored();
    checkTranscript(stopped);
    check(stopped.messages.length === 17 && stopped.messages.at(-1).role === 'user', 'Stopping before the first delta must preserve memory without creating an assistant message');
    await evaluate('window.__chatLifecycle.holdMemory=false');
    await send('停止后复用新摘要继续');
    await finished();
    check(JSON.stringify((await evaluate('window.__chatLifecycle.requests.at(-1)')).memory) === JSON.stringify(stopped.memory), 'A summary received before stop must be reused by the next request');
    results.push('summary header is saved before first delta; stop preserves it for the next request');
    await legacyIntact();
    results.push('v2 initializes without importing v1 history and leaves v1 storage unchanged');
    return { origin, results };
  } finally {
    await tab.goto(`${origin}/`);
    await evaluate(`window.__restoreChatLifecycle?.();for(const [key,value] of ${JSON.stringify([[key, before.current], [legacyKey, before.legacy]])}){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}document.documentElement.dataset.theme=${JSON.stringify(before.theme || 'light')};`);
  }
}
