import { button as buttons } from './harness.cjs';
// With a compatible production preview tab adapter:
// const { verifyShallowNavigation } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/shallow-navigation.browser.mjs');
// await verifyShallowNavigation(tab, await tab.capabilities.get('cdp'), await browser.capabilities.get('viewport'));
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function verifyShallowNavigation(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const checks = [];
  const screenshots = [];
  const directory = new URL('../../.impeccable/review/shallow-modules/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const button = buttons(tab.playwright);
  const back = () => tab.playwright.getByRole('link', { name: '返回灵感集', exact: true });
  const search = () => tab.playwright.getByRole('searchbox');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  try {
    await viewport.set({ width: 1440, height: 900 });
    await tab.goto(base + '/products/muse');
    await search().fill('zzzz-no-match-928');
    await tab.playwright.getByRole('heading', { name: '没有找到匹配的灵感' }).waitFor({ state: 'visible' });
    await tab.reload();
    assert.equal(await search().getAttribute('value'), 'zzzz-no-match-928');
    await button('查看全部灵感').press('Enter');
    await tab.playwright.locator('a[id^="muse-"]').first().waitFor({ state: 'visible' });
    checks.push('empty search, URL reload and clear');

    await button('产品设计').press('Enter');
    await search().fill('dashboard');
    const card = tab.playwright.locator('a[id^="muse-"][href*="cat=Product"][href*="q=dashboard"]').first();
    await card.waitFor({ state: 'visible' });
    const href = await card.getAttribute('href');
    const id = await card.getAttribute('id');
    await card.press('Enter');
    await back().waitFor({ state: 'visible' });
    for (const link of [back(), tab.playwright.getByRole('link', { name: /^下一件：/ })]) {
      const params = new URL(await link.getAttribute('href'), base).searchParams;
      assert.equal(params.get('cat'), 'Product');
      assert.equal(params.get('q'), 'dashboard');
    }
    await back().press('Enter');
    await tab.playwright.locator(`#${id}:focus`).waitFor({ state: 'visible' });
    assert.equal(await search().getAttribute('value'), 'dashboard');
    await card.press('Enter');
    await back().waitFor({ state: 'visible' });
    await tab.back();
    await tab.playwright.locator(`#${id}:focus`).waitFor({ state: 'visible' });
    assert.equal(await search().getAttribute('value'), 'dashboard');
    checks.push('category/search in adjacent links, in-app return and native Back restore focus');

    await tab.goto(new URL(href.replace('browse=2', 'browse=1'), base).href);
    await back().waitFor({ state: 'visible' });
    assert.equal(new URL(await back().getAttribute('href'), base).searchParams.has('q'), false);
    checks.push('retired browse=1 falls back to category navigation');

    for (const [width, theme] of [[1440, 'light'], [1280, 'dark'], [390, 'light'], [320, 'dark']]) {
      await viewport.set({ width, height: 900 });
      for (const [surface, path] of [['list', '/products/muse?q=dashboard&cat=Product'], ['detail', href]]) {
        await tab.goto(new URL(path, base).href);
        await (surface === 'list' ? search() : back()).waitFor({ state: 'visible' });
        const toggle = button(theme === 'dark' ? '切换为深色主题' : '切换为浅色主题');
        if (await toggle.count()) await toggle.press('Enter');
        const geometry = await tab.playwright.evaluate(() => ({
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          theme: document.documentElement.dataset.theme,
          controls: [...document.querySelectorAll('nav[aria-label="作品导航"] a, nav[aria-label="作品导航"] button')].map(el => ({
            height: el.getBoundingClientRect().height,
            right: el.getBoundingClientRect().right,
          })),
        }));
        assert.equal(geometry.width, width);
        assert.equal(geometry.theme, theme);
        assert.equal(geometry.overflow, false, `${surface} at ${width}`);
        assert(geometry.controls.every(item => item.height >= 44 && item.right <= width));
        const filename = `${surface}-${width}-${theme}.png`;
        await writeFile(new URL(filename, directory), await tab.screenshot({ fullPage: false }));
        screenshots.push(filename);
      }
      checks.push(`${width}px ${theme}: list/detail fit, navigation hit targets`);
    }
    return { passed: true, checks, screenshots, reducedMotion: true };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
