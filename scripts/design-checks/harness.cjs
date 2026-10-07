const { mkdir, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path');
const { fileURLToPath } = require('node:url');

exports.baseUrl = (fallback = 'http://localhost:3000') =>
  (process.env.DESIGN_BASE_URL ?? fallback).replace(/\/+$/, '');

exports.capturePageErrors = (page, errors) =>
  page.on('pageerror', (error) => errors.push(error.message));

exports.withBrowser = async (fn, { evidence, pageOptions = {}, contextOptions } = {}) => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = contextOptions && await browser.newContext(contextOptions);
    const page = context ? await context.newPage() : await browser.newPage(pageOptions);
    const errors = evidence?.pageErrors ?? [];
    exports.capturePageErrors(page, errors);
    return await fn({ browser, context: context ?? page.context(), page, errors });
  } finally {
    await browser.close();
  }
};

exports.writeEvidence = async (file, data, echo = false) => {
  const serialized = JSON.stringify(data, null, 2);
  await mkdir(dirname(file instanceof URL ? fileURLToPath(file) : file), { recursive: true });
  await writeFile(file, serialized + '\n');
  if (echo) console.log(serialized);
};

exports.cdpEvaluate = async (cdp, expression, {
  timeoutMs, exception = 'json', raw = false,
  parameters = { returnByValue: true, awaitPromise: true },
} = {}) => {
  const params = { expression, ...parameters };
  const reply = timeoutMs === undefined
    ? await cdp.send('Runtime.evaluate', params)
    : await cdp.send('Runtime.evaluate', params, { timeoutMs });
  if (reply.exceptionDetails && exception !== 'ignore')
    throw new Error(exception === 'text'
      ? reply.exceptionDetails.text || 'Browser evaluation failed'
      : JSON.stringify(reply.exceptionDetails));
  return raw ? reply : reply.result?.value;
};

exports.button = (ui) => (name) => ui.getByRole('button', { name, exact: true });
exports.settle = (page) => page.waitForTimeout(900);
exports.readingStatus = (page) =>
  page.locator('[aria-label$="画册"] p[role="status"]').getAttribute('aria-label');
exports.waitForStatus = (page, previous) => page.waitForFunction(
  (prev) => document.querySelector('[aria-label$="画册"] p[role="status"]')?.getAttribute('aria-label') !== prev,
  previous, { timeout: 5000 },
);
exports.waitForReadingStatus = (ui, label) =>
  ui.locator(`[role="status"][aria-label="${label}"]`).waitFor({ state: 'visible', timeoutMs: 8000 });
exports.go = async (page, base, path, delay) => {
  await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(delay);
};
