import { button as buttons, waitForReadingStatus } from './harness.cjs';
// Pass a compatible production tab, CDP session and viewport adapter.
// await verifyCurrentLayouts(tab, await tab.capabilities.get('cdp'), await browser.capabilities.get('viewport'));
import assert from 'node:assert/strict';

export async function verifyCurrentLayouts(tab, cdp, viewport) {
  const base = new URL(await tab.url()).origin;
  const path = '/products/layout-compositions';
  const checks = [];
  const button = buttons(tab.playwright);
  const picker = () => tab.playwright.getByRole('combobox', { name: '跳转到图鉴', exact: true });
  const wait = (locator, state = 'visible') => locator.waitFor({ state, timeoutMs: 8000 });
  const settled = () => wait(tab.playwright.locator('[data-opening]'), 'hidden');
  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await viewport.set({ width: 1440, height: 900 });
    await tab.goto(base + path);
    await wait(tab.playwright.locator('#book-0'));
    assert.equal(await tab.playwright.locator('[class*="shelf"] button').count(), 8);
    await tab.playwright.locator('#book-0').click();
    await wait(picker());
    await settled();
    await waitForReadingStatus(tab.playwright, '第1至2页，共86页');
    await button('下一页').click();
    await waitForReadingStatus(tab.playwright, '第3至4页，共86页');

    const page = tab.playwright.locator('button[data-page-id]').first();
    const id = await page.getAttribute('data-page-id');
    await page.click();
    const dialog = tab.playwright.getByRole('dialog');
    await wait(dialog);
    assert.equal(await dialog.getByRole('link', { name: '查看详情', exact: true }).count(), 0);
    await dialog.press('Escape');
    await wait(dialog, 'hidden');
    await wait(tab.playwright.locator(`button[data-page-id="${id}"]:focus`));
    await button('返回书架').click();
    await wait(picker(), 'hidden');
    await wait(tab.playwright.locator('#book-0:focus'));
    checks.push('pointer open/flip/zoom, Escape restores page focus, header return restores spine focus');

    await tab.playwright.locator('#book-0').press('Enter');
    await wait(picker());
    await tab.back();
    await wait(tab.playwright.locator('#book-0:focus'));
    checks.push('keyboard open and native Back restore spine focus');

    await tab.goto(base + path + '?cat=构图逻辑&page=003&zoom=003');
    await wait(picker());
    await waitForReadingStatus(tab.playwright, '第3至4页，共86页');
    assert.equal(await dialog.count(), 0);
    assert.equal(await tab.playwright.locator('[data-opening]').count(), 0);
    await tab.goto(base + path + '?cat=构图逻辑&page=063');
    await wait(tab.playwright.locator('button[data-page-id="063"]:disabled'));
    assert.equal(await dialog.count(), 0);
    checks.push('cat/page opens directly, retired zoom is ignored, missing image stays disabled');

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    for (const width of [1280, 390, 320]) {
      await viewport.set({ width, height: 900 });
      await tab.goto(base + path);
      await wait(tab.playwright.locator('#book-0'));
      assert(await tab.playwright.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await tab.playwright.locator('#book-0').press('Enter');
      await wait(picker());
      assert(await tab.playwright.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await tab.playwright.locator('[aria-label$="画册"]').press('ArrowRight');
      await waitForReadingStatus(tab.playwright, '第3至4页，共86页');
      await tab.playwright.locator('[aria-label$="画册"]').press('Escape');
      await wait(tab.playwright.locator('#book-0:focus'));
      checks.push(`${width}px reduced motion: shelf/reader fit, arrow flip and Escape restore focus`);
    }
    return { passed: true, base, checks };
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await viewport.reset();
  }
}
