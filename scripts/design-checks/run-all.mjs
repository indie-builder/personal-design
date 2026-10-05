import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Existing Playwright regression suite, plus HTTP/API checks. This is not full product coverage.
// Run against pnpm build + pnpm start, with DESIGN_BASE_URL set to the actual Portless URL.
const here = dirname(fileURLToPath(import.meta.url));
const base = new URL(process.env.DESIGN_BASE_URL ?? 'https://personal-design.localhost');
if (
  !['http:', 'https:'].includes(base.protocol) ||
  base.pathname !== '/' ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
) {
  throw new Error('DESIGN_BASE_URL must be an HTTP(S) origin. Use the Portless startup URL.');
}
const suites = [
  '../verify-design.mjs',
  '../verify-design-routes.mjs',
  '../portfolio-api.test.mjs',
  'home.mjs',
  'layouts-check.mjs',
  'layouts-states.mjs',
  'muse-behavior.mjs',
  'muse-recovery.mjs',
  'shared-browser.cjs',
  'shared-autoplay.cjs',
  'journeys.mjs',
  'personal-sites.mjs',
];
const failed = [];
for (const suite of suites) {
  const startedAt = Date.now();
  const exit = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, suite)], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, DESIGN_BASE_URL: base.origin, PORTFOLIO_API_BASE: base.origin },
    });
    child.once('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 1));
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n=== ${suite.split('/').pop()} ${exit === 0 ? 'PASS' : `FAIL (exit ${exit})`} ${seconds}s ===\n`,
  );
  if (exit !== 0) failed.push(suite);
}
console.log(
  failed.length
    ? `FAILED: ${failed.join(', ')}`
    : `ALL ${suites.length} SUITES PASSED (see acceptance index for remaining coverage)`,
);
process.exitCode = failed.length ? 1 : 0;
