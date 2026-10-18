import { designOrigin, regressionSuites, runSuites } from './runner.mjs';
import { openMotionBrowser } from './motion-browser.mjs';
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
  ['outward-links.browser.mjs', 'verifyOutwardLinks'],
];
const label = (suite) =>
  suite.file.replace(/^scripts\/design-checks\//, '').replace(/^scripts\//, '../');
const failed = (
  await runSuites(
    suites,
    base,
    (suite, code, seconds) => {
      console.log(
        `\n=== ${suite.file.split('/').pop()} ${code === 0 ? 'PASS' : `FAIL (exit ${code})`} ${seconds}s ===\n`,
      );
    },
    { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] },
  )
).map(label);

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
        context = await openMotionBrowser(chromium, base.origin);
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
          for (const issue of result?.issues ?? ['check returned no result'])
            console.error(`  ! ${issue}`);
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
