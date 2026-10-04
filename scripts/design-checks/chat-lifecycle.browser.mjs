// Built-in browser REPL; production preview must use fixtures/ai-chat-provider.mjs on :3907.
// const { verifyChatLifecycle } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/chat-lifecycle.browser.mjs');
// await verifyChatLifecycle(tab, await tab.capabilities.get('cdp'));
export async function verifyChatLifecycle(tab, cdp) {
  const origin = new URL(await tab.url()).origin;
  if (new URL(origin).hostname !== 'upgrade-check.personal-design.localhost') throw new Error('Use the isolated test origin');
  const results = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const button = name => tab.playwright.getByRole('button', { name, exact: true });
  const error = () => tab.playwright.getByRole('region', { name: '对话', exact: true }).getByRole('alert');
  const wait = (locator, state = 'visible') => locator.waitFor({ state, timeoutMs: 5000 });
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
  await tab.goto(`${origin}/products/ai-chat`);
  await wait(tab.playwright.locator('textarea[aria-label^="发消息给"]'));
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
  await cdp.send('Runtime.evaluate', { expression: `window.__chatLifecycleFetch=window.fetch;window.__chatLifecycleAborted=false;
    window.fetch=(...args)=>{if(String(args[0]).endsWith('/api/ai-chat'))args[1]?.signal?.addEventListener('abort',()=>window.__chatLifecycleAborted=true,{once:true});return window.__chatLifecycleFetch(...args);}` });
  try {
    await send('慢速回答：离页检查');
    await wait(button('停止生成'));
    await tab.playwright.getByRole('link', { name: 'AI 问答，返回首页', exact: true }).press('Enter');
    await wait(tab.playwright.getByRole('link', { name: '作品时间轴首页', exact: true }));
    const aborted = await cdp.send('Runtime.evaluate', { expression: 'window.__chatLifecycleAborted', returnByValue: true });
    check(aborted.result?.value === true, 'Leaving during generation must abort its request');
  } finally {
    await cdp.send('Runtime.evaluate', { expression: 'if(window.__chatLifecycleFetch)window.fetch=window.__chatLifecycleFetch;delete window.__chatLifecycleFetch;delete window.__chatLifecycleAborted;' });
  }
  await tab.goto(`${origin}/products/ai-chat`);
  await wait(button('新建对话'));
  await send('普通回答：返回后继续');
  await finished();
  results.push('leave during generation aborts → return and continue works');
  return { origin, results };
}
