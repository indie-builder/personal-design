const wrapLocator = (locator) => ({
  waitFor: ({ state, timeoutMs } = {}) => locator.waitFor({ state, timeout: timeoutMs }),
  click: (options) => locator.click(options),
  press: (keyName) => locator.press(keyName),
  focus: () => locator.focus(),
  count: () => locator.count(),
  getAttribute: (name) => locator.getAttribute(name),
  isVisible: () => locator.isVisible(),
  evaluate: (fn, arg) => locator.evaluate(fn, arg),
  first: () => wrapLocator(locator.first()),
  last: () => wrapLocator(locator.last()),
  locator: (selector) => wrapLocator(locator.locator(selector)),
  getByRole: (...args) => wrapLocator(locator.getByRole(...args)),
});

/** Own one browser and adapt its page to the injected motion-check interface. */
export async function openMotionBrowser(chromium, origin) {
  const browser = await chromium.launch({ headless: true });
  // A throw between launch and context assignment must still close the browser.
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Checks derive the origin from the open page (about:blank would yield "null").
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const session = await page.context().newCDPSession(page);
    const tab = {
      url: () => page.url(),
      goto: (url) => page.goto(url, { waitUntil: 'domcontentloaded' }),
      back: () => page.goBack(),
      playwright: {
        locator: (selector) => wrapLocator(page.locator(selector)),
        getByRole: (...args) => wrapLocator(page.getByRole(...args)),
        getByText: (...args) => wrapLocator(page.getByText(...args)),
        getByPlaceholder: (...args) => wrapLocator(page.getByPlaceholder(...args)),
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        waitForLoadState: ({ state } = {}) => page.waitForLoadState(state),
      },
    };
    const cdp = {
      send: (method, params, options) => {
        const call = session.send(method, params);
        if (!options?.timeoutMs) return call;
        let timer;
        const guard = new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${method} timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          );
        });
        return Promise.race([call, guard]).finally(() => clearTimeout(timer));
      },
    };
    const viewport = {
      set: ({ width, height }) =>
        session.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        }),
      reset: () => session.send('Emulation.clearDeviceMetricsOverride'),
    };
    return { close: () => browser.close(), tab, cdp, viewport };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
