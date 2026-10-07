import { button as buttons, cdpEvaluate } from './harness.cjs';
// Pass a compatible production tab, CDP session and viewport adapter.
// await verifyCurrentSite(tab, await tab.capabilities.get('cdp'), await browser.capabilities.get('viewport'));
import assert from 'node:assert/strict';
import { verifyTimelineBounds } from './home-performance.browser.mjs';

export async function verifyCurrentSite(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin, checks = [], issues = [];
  const ui = tab.playwright;
  const button = buttons(ui);
  const evaluate = (expression) => cdpEvaluate(cdp, expression, { timeoutMs: 35000 });
  const until = (condition, timeout = 10000) => evaluate(`new Promise((resolve,reject)=>{
    const started=performance.now();function tick(){if(${condition})return resolve(true);
    if(performance.now()-started>${timeout})return reject(Error(${JSON.stringify(condition)}));requestAnimationFrame(tick)}tick();})`);
  const media = value => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const theme = () => ui.evaluate(() => document.documentElement.dataset.theme);
  const setTheme = async value => {
    if (await theme() !== value) await ui.locator('button[title="切换明暗主题"]').press('Enter');
    await until(`document.documentElement.dataset.theme===${JSON.stringify(value)}`);
  };
  const visit = async (path, selector, width) => {
    await tab.goto(base + path);
    await tab.playwright.waitForLoadState({state: 'domcontentloaded'});
    await tab.playwright.domSnapshot();
    await ui.locator(selector).waitFor({ state: 'visible', timeoutMs: 20000 });
    const bounds = await ui.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(bounds.width, width);
    assert(bounds.scroll <= width, `${path}: page overflows at ${width}px (${bounds.scroll})`);
    assert.equal(new URL(await tab.url()).origin, base);
  };
  await tab.goto(base + '/');
  await tab.playwright.waitForLoadState({state: 'domcontentloaded'});
  await ui.locator('#home-timeline').waitFor({ state: 'visible' });
  const initialTheme = await theme();
  try {
    for (const [width, selectedTheme] of [[1440, 'light'], [390, 'dark']]) {
      await viewport.set({ width, height: 900 });
      await media('reduce');
      await visit('/', '#home-timeline', width);
      await setTheme(selectedTheme);
      const timeline = ui.locator('#home-timeline');
      const step = await timeline.evaluate(el => el.querySelector('[data-timeline-stop]').getBoundingClientRect().width);
      await button('向后浏览作品').waitFor({ state: 'visible' });
      const bounds = await verifyTimelineBounds(cdp);
      assert(bounds[0].max > step, 'Timeline must overflow by at least one product');
      await evaluate('document.getElementById("home-timeline").scrollTo({left:0,behavior:"instant"})');
      await until('document.querySelector("[data-direction=previous]").disabled');
      await button('向后浏览作品').press('Enter');
      await until(`Math.abs(document.getElementById('home-timeline').scrollLeft-${step})<=1`);
      await timeline.press('ArrowLeft');
      await until('document.getElementById("home-timeline").scrollLeft<=1');
      await timeline.press('ArrowRight');
      await until(`Math.abs(document.getElementById('home-timeline').scrollLeft-${step})<=1`);
      assert.equal(await ui.locator('[data-timeline-stop] a').count(), 7);
      assert.equal(await ui.locator('[data-timeline-end]').count(), 1);
      await ui.getByRole('link', { name: '跳至内容', exact: true }).press('Enter');
      await until('document.activeElement.id==="workspace-content"');
      checks.push({ width, theme: selectedTheme, home: 'bounds, button, arrows, seven products, skip link' });

      await visit('/products/design-engineer-tools', 'section[aria-label="设计工程工具目录"]', width);
      const tools = await ui.evaluate(() => [...document.querySelectorAll('section[aria-label="设计工程工具目录"] a')].map(a => ({ href: a.href, name: a.textContent.trim(), target: a.target, rel: a.rel })));
      assert(tools.length >= 100 && tools.every(a => /^https?:/.test(a.href) && a.name && a.target === '_blank' && a.rel.includes('noopener')));
      assert.equal(await theme(), selectedTheme, 'Theme persists across routes');
      checks.push({ width, tools: tools.length, externalLinks: 'valid href, name and safe new tab; not opened' });

      await media('no-preference');
      await visit('/products/personal-sites', 'section[aria-label="个人网站动态展示"] video', width);
      const video = ui.locator('section[aria-label="个人网站动态展示"] video');
      const videoQuery = 'document.querySelector("section[aria-label=\\"个人网站动态展示\\"] video")';
      await until(`(()=>{const v=${videoQuery};return v.readyState>=2&&!v.paused&&v.currentTime>0})()`, 30000);
      assert.equal(await video.getAttribute('aria-label'), '暂停个人网站宣传片');
      await video.press('Space');
      await until(`(()=>{const v=${videoQuery};return v.paused&&v.getAttribute('aria-label')==='播放个人网站宣传片'})()`);
      await video.press('Enter');
      await until(`(()=>{const v=${videoQuery};return !v.paused&&v.getAttribute('aria-label')==='暂停个人网站宣传片'})()`);
      const site = ui.getByRole('link', { name: '打开个人网站（新标签页）', exact: true });
      assert.equal(await site.getAttribute('target'), '_blank');
      assert.match(await site.getAttribute('rel'), /noopener/);
      assert.equal(await site.getAttribute('href'), 'https://default-coder.lovemyrmb.cn/');
      await media('reduce');
      await visit('/products/personal-sites', 'section[aria-label="个人网站动态展示"] video', width);
      await until(`${videoQuery}.readyState>=2`, 30000);
      assert(await video.evaluate(el => el.paused), 'Reduced motion prevents autoplay');
      await video.press('Enter');
      await until(`!${videoQuery}.paused`);
      checks.push({ width, promo: 'autoplay, Space pause, Enter resume, reduced-motion manual play, external link' });

      await visit('/products/ai-coding-dictionary', 'iframe[title="AI Coding 词典知识图谱与中英对照"]', width);
      await until(`(()=>{const f=document.querySelector('iframe[title="AI Coding 词典知识图谱与中英对照"]'),c=f.contentDocument?.querySelector('canvas');return !!c&&c.width>0&&f.contentWindow.__dictionaryCatalog?.entries.length===71})()`, 30000);
      try {
        await until(`document.querySelector('iframe[title="AI Coding 词典知识图谱与中英对照"]').contentDocument.documentElement.dataset.theme===${JSON.stringify(selectedTheme)}`, 2000);
      } catch {
        issues.push({width,surface:'dictionary',expectedTheme:selectedTheme,state:await evaluate(`({host:document.documentElement.dataset.theme,frame:document.querySelector('iframe[title="AI Coding 词典知识图谱与中英对照"]').contentDocument.documentElement.dataset.theme})`)});
      }
      checks.push({ width, dictionary: 'local graph canvas and 71 entries; theme results recorded separately' });

      await visit('/products/word-arcade', '[data-arcade-stage]', width);
      assert.equal(await ui.locator('[role="group"][aria-label="选择小游戏"] button').count(), 5);
      await button('打砖块').press('Enter');
      await button('开始游戏').waitFor({ state: 'visible', timeoutMs: 10000 });
      await button('开始游戏').press('Enter');
      await until('!document.querySelector(\'button[aria-label="暂停游戏"]\').disabled');
      await button('暂停游戏').press('Enter');
      await button('继续').waitFor({ state: 'visible' });
      await button('重新开始').press('Enter');
      await button('开始游戏').waitFor({ state: 'visible' });
      checks.push({ width, arcade: 'five choices, start, pause, reset' });

      await visit('/products/layout-compositions/1', 'main h1', width);
      await ui.getByRole('heading', { name: '找不到这个页面', exact: true }).waitFor({ state: 'visible' });
      await ui.getByRole('link', { name: '回到首页', exact: true }).press('Enter');
      await ui.locator('#home-timeline').waitFor({ state: 'visible' });
      checks.push({ width, retiredRoute: '404 and home return' });
    }
    return { passed: issues.length === 0, base, checks, issues };
  } catch (error) {
    const state = await evaluate(`({url:location.href,theme:document.documentElement.dataset.theme,saved:localStorage.getItem('theme'),frames:[...document.querySelectorAll('iframe')].map(f=>({title:f.title,theme:f.contentDocument?.documentElement.dataset.theme,host:f.contentWindow.parent.document.documentElement.dataset.theme}))})`);
    throw new Error(error.message + ' State: ' + JSON.stringify(state));
  } finally {
    await tab.goto(base + '/');
  await tab.playwright.waitForLoadState({state: 'domcontentloaded'});
    await ui.locator('#home-timeline').waitFor({ state: 'visible' });
    await setTheme(initialTheme);
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
