import assert from 'node:assert/strict';
import test from 'node:test';
import { openMotionBrowser } from './motion-browser.mjs';

function fixture(failAt) {
  const calls = [];
  const record =
    (name, result) =>
    (...args) => {
      calls.push([name, ...args]);
      if (name === failAt) throw new Error(`failed: ${name}`);
      return result;
    };
  const locator = {
    waitFor: record('waitFor'),
    click: record('click'),
    press: record('press'),
    focus: record('focus'),
    count: record('count', 1),
    getAttribute: record('getAttribute', 'value'),
    isVisible: record('isVisible', true),
    evaluate: record('locator.evaluate', 'evaluated'),
  };
  for (const method of ['first', 'last', 'locator', 'getByRole']) {
    locator[method] = record(`locator.${method}`, locator);
  }
  const session = { send: record('send', Promise.resolve({ ok: true })) };
  const page = {
    url: record('url', 'https://branch.personal-design.localhost/'),
    goto: record('goto'),
    goBack: record('goBack'),
    evaluate: record('evaluate'),
    waitForLoadState: record('waitForLoadState'),
    context: () => ({ newCDPSession: record('newCDPSession', session) }),
  };
  for (const method of ['locator', 'getByRole', 'getByText', 'getByPlaceholder']) {
    page[method] = record(method, locator);
  }
  const browser = { newPage: record('newPage', page), close: record('close') };
  const chromium = { launch: record('launch', browser) };
  return { calls, chromium, session, page };
}

const origin = 'https://branch.personal-design.localhost';

test('opens one production page and exposes navigation without leaking the Playwright page', async () => {
  const f = fixture();
  const browser = await openMotionBrowser(f.chromium, origin);
  assert.deepEqual(f.calls.slice(0, 4), [
    ['launch', { headless: true }],
    ['newPage', { viewport: { width: 1440, height: 900 } }],
    ['goto', origin, { waitUntil: 'domcontentloaded' }],
    ['newCDPSession', f.page],
  ]);
  assert.equal(await browser.tab.url(), `${origin}/`);
  await browser.tab.goto(`${origin}/products/muse`);
  await browser.tab.back();
  await browser.tab.playwright.waitForLoadState({ state: 'networkidle' });
  assert.ok(f.calls.some(([name, value]) => name === 'goto' && value.endsWith('/products/muse')));
  assert.ok(f.calls.some(([name]) => name === 'goBack'));
  assert.ok(
    f.calls.some(([name, state]) => name === 'waitForLoadState' && state === 'networkidle'),
  );
  await browser.close();
  assert.equal(f.calls.filter(([name]) => name === 'close').length, 1);
});

for (const failure of ['newPage', 'goto', 'newCDPSession']) {
  test(`closes the browser when initialization fails at ${failure}`, async () => {
    const f = fixture(failure);
    await assert.rejects(openMotionBrowser(f.chromium, origin), new RegExp(failure));
    assert.equal(f.calls.filter(([name]) => name === 'close').length, 1);
  });
}

test('maps locator chains and timeoutMs to the native locator contract', async () => {
  const f = fixture();
  const browser = await openMotionBrowser(f.chromium, origin);
  try {
    const locator = browser.tab.playwright
      .getByRole('button', { name: 'Next' })
      .first()
      .last()
      .locator('span')
      .getByRole('link');
    await locator.waitFor({ state: 'visible', timeoutMs: 321 });
    await locator.click({ modifiers: ['Shift'] });
    await locator.press('Enter');
    await locator.focus();
    assert.equal(await locator.count(), 1);
    assert.equal(await locator.getAttribute('href'), 'value');
    assert.equal(await locator.isVisible(), true);
    assert.equal(await locator.evaluate(() => 'evaluated'), 'evaluated');
    assert.deepEqual(
      f.calls.find(([name]) => name === 'waitFor'),
      ['waitFor', { state: 'visible', timeout: 321 }],
    );
    for (const method of ['locator', 'getByText', 'getByPlaceholder']) {
      assert.equal(await browser.tab.playwright[method]('target').count(), 1);
    }
  } finally {
    await browser.close();
  }
});

test('maps viewport changes and propagates CDP results, failures and deadlines', async () => {
  const f = fixture();
  const browser = await openMotionBrowser(f.chromium, origin);
  try {
    await browser.viewport.set({ width: 390, height: 844 });
    await browser.viewport.reset();
    assert.deepEqual(
      f.calls.find(
        ([name, method]) => name === 'send' && method === 'Emulation.setDeviceMetricsOverride',
      ),
      [
        'send',
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: false },
      ],
    );
    assert.ok(
      f.calls.some(
        ([name, method]) => name === 'send' && method === 'Emulation.clearDeviceMetricsOverride',
      ),
    );
    assert.deepEqual(await browser.cdp.send('Runtime.evaluate', { expression: '1' }), { ok: true });
    assert.deepEqual(await browser.cdp.send('Runtime.evaluate', {}, { timeoutMs: 100 }), {
      ok: true,
    });
    f.session.send = async () => {
      throw new Error('CDP unavailable');
    };
    await assert.rejects(
      browser.cdp.send('Runtime.evaluate', {}, { timeoutMs: 100 }),
      /CDP unavailable/,
    );
    f.session.send = () => new Promise(() => {});
    await assert.rejects(
      browser.cdp.send('Runtime.evaluate', {}, { timeoutMs: 5 }),
      /Runtime.evaluate timed out after 5ms/,
    );
  } finally {
    await browser.close();
  }
});
