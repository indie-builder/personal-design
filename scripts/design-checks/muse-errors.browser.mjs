// Built-in browser only: import this module, then await verifyMuseErrors(tab, await tab.capabilities.get('cdp')).
// Failures: HTTP/network/malformed/empty pages, stale filter errors, missing retry, lost append listener.
export async function verifyMuseErrors(tab, cdp) {
  const evaluate = (expression) =>
    cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const cards = () =>
    tab.playwright.locator('section[aria-label="灵感浏览"] a[id^="muse-"]').count();
  const install = (mode) =>
    evaluate(`window.__museFetch = window.fetch; window.fetch = async (...args) => {
    if (String(args[0]).startsWith('/products/muse/api/posts')) {
      ${mode === 'network' ? "throw new TypeError('test network failure');" : mode === 'malformed' ? 'return Response.json({items:null,total:100});' : mode === 'empty' ? 'return Response.json({items:[],total:100});' : "return new Response('',{status:503});"}
    }
    return window.__museFetch(...args);
  }`);
  const restore = () => evaluate('window.fetch = window.__museFetch');
  const results = [];
  for (const mode of ['http', 'network', 'malformed', 'empty']) {
    await tab.goto('http://localhost:3000/products/muse');
    await tab.playwright.getByPlaceholder('搜索灵感').waitFor({ state: 'visible' });
    const before = await cards();
    await install(mode);
    try {
      await evaluate('window.scrollTo(0,document.body.scrollHeight)');
      await tab.playwright
        .getByRole('button', { name: '重试加载', exact: true })
        .waitFor({ state: 'visible', timeoutMs: 5000 });
      check((await cards()) === before, `${mode}: existing cards preserved`);
      await restore();
      await tab.playwright.getByRole('button', { name: '重试加载', exact: true }).press('Enter');
      await tab.playwright
        .locator(`section[aria-label="灵感浏览"] a[id^="muse-"]:nth-child(${before + 1})`)
        .waitFor({ state: 'attached', timeoutMs: 10000 });
      check((await cards()) > before, `${mode}: append resumes`);
      results.push(`${mode}: error, keyboard retry, append recovered`);
    } finally {
      await restore();
    }
  }
  await tab.goto('http://localhost:3000/products/muse');
  await tab.playwright.getByPlaceholder('搜索灵感').waitFor({ state: 'visible' });
  await install('http');
  try {
    await tab.playwright.getByPlaceholder('搜索灵感').fill('harness-no-match-92847');
    await tab.playwright
      .getByRole('button', { name: '重试加载', exact: true })
      .waitFor({ state: 'visible', timeoutMs: 5000 });
    check(
      !(await tab.playwright.getByText('没有找到匹配的灵感', { exact: true }).isVisible()),
      'failure must not be presented as empty success',
    );
    await restore();
    await tab.playwright.getByRole('button', { name: '重试加载', exact: true }).press('Enter');
    await tab.playwright
      .getByText('没有找到匹配的灵感', { exact: true })
      .waitFor({ state: 'visible', timeoutMs: 10000 });
    results.push('filter failure differs from successful empty response');
  } finally {
    await restore();
  }
  return results;
}
