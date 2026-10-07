import { designOrigin, regressionSuites, runSuites } from './runner.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Existing Playwright regression suite, plus HTTP/API checks. This is not full product coverage.
// Run against pnpm build + pnpm start, with DESIGN_BASE_URL set to the actual Portless URL.
// Motion checks below are the injected tab/cdp modules from docs/design/execution/README.md;
// the Playwright adapter wraps a headless page to that documented interface.
const here = dirname(fileURLToPath(import.meta.url));
const base = designOrigin();
const suites = regressionSuites;
const motionChecks = [
  ['route-motion.browser.mjs', 'verifyRouteMotion'],
  ['lightbox-motion.browser.mjs', 'verifyLightboxMotion'],
  ['book-opening-performance.mjs', 'verifyBookOpeningPerformance'],
  ['preview-loops.browser.mjs', 'verifyPreviewLoops'],
  ['timeline-motion.browser.mjs', 'verifyTimelineMotion'],
  ['taichi-motion.browser.mjs', 'verifyTaichiMotion'],
];
const label = (suite) => suite.file.replace(/^scripts\/design-checks\//, '').replace(/^scripts\//, '../');
const failed = (await runSuites(suites, base, (suite, code, seconds) => {
  console.log(`\n=== ${suite.file.split('/').pop()} ${code === 0 ? 'PASS' : `FAIL (exit ${code})`} ${seconds}s ===\n`);
}, { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] })).map(label);

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

async function runMotionChecks() {
  let context = null;
  let executed = 0;
  try {
    for (const [file, entry] of motionChecks) {
      const startedAt = Date.now();
      if (!existsSync(join(here, file))) {
        // Fixture mode lets run-all tests exercise the runner without shipping the checks;
        // a real checkout must fail loudly instead of silently dropping a registered check.
        if (process.env.DESIGN_RUN_ALL_FIXTURE === '1') {
          console.error(`\n=== ${file} SKIPPED (module not found; fixture mode) ===\n`);
          continue;
        }
        console.error(`\n=== ${file} FAIL (registered module not found) ===\n`);
        failed.push(file);
        continue;
      }
      executed += 1;
      if (!context) {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        // A throw between launch and context assignment must still close the browser.
        try {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
          // Checks derive the origin from the open page (about:blank would yield "null").
          await page.goto(base.origin, { waitUntil: 'domcontentloaded' });
          const session = await page.context().newCDPSession(page);
          const close = () => browser.close();
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
        context = { close, tab, cdp, viewport };
        } catch (error) {
          await browser.close();
          throw error;
        }
      }
      try {
        const module = await import(pathToFileURL(join(here, file)).href);
        const result = await module[entry](context.tab, context.cdp, context.viewport);
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        if (result?.passed) {
          console.log(`\n=== ${file} PASS ${seconds}s ===\n`);
          for (const line of result.checks ?? []) console.log(`  - ${line}`);
        } else {
          console.error(`\n=== ${file} FAIL ${seconds}s ===`);
          for (const issue of result?.issues ?? ['check returned no result']) console.error(`  ! ${issue}`);
          failed.push(file);
        }
      } catch (error) {
        console.error(`\n=== ${file} FAIL (thrown) ===\n${error.stack ?? error.message}\n`);
        failed.push(file);
      }
    }
  } finally {
    await context?.close();
  }
  return executed;
}

let motionExecuted = 0;
try {
  motionExecuted = await runMotionChecks();
} catch (error) {
  console.error(`\nbrowser motion checks could not run: ${error.message}\n`);
  failed.push('browser motion checks (playwright)');
}

console.log(
  failed.length
    ? `FAILED: ${failed.join(', ')}`
    : `ALL ${suites.length + motionExecuted} SUITES PASSED (see acceptance index for remaining coverage)`,
);
process.exitCode = failed.length ? 1 : 0;
