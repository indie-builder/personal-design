import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const manifest = JSON.parse(await readFile(new URL('./current-checks.json', import.meta.url), 'utf8'));
export const regressionSuites = [...manifest.http, ...manifest.browser]
  .filter((suite) => suite.regression)
  .sort((a, b) => a.regression - b.regression);

export function designOrigin() {
  const base = new URL(process.env.DESIGN_BASE_URL ?? 'https://personal-design.localhost');
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password)
    throw new Error('DESIGN_BASE_URL must be an HTTP(S) origin. Use the Portless startup URL.');
  return base;
}

export async function runSuites(suites, base, report, { cwd = root, stdio = 'inherit' } = {}) {
  const failed = [];
  for (const suite of suites) {
    const startedAt = Date.now();
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL(`../../${suite.file}`, import.meta.url))], {
        cwd, stdio,
        env: { ...process.env, DESIGN_BASE_URL: base.origin, PORTFOLIO_API_BASE: base.origin },
      });
      child.once('error', (error) => { console.error(error.message); resolve(1); });
      child.once('exit', (status) => resolve(status ?? 1));
    });
    report(suite, code, ((Date.now() - startedAt) / 1000).toFixed(1));
    if (code !== 0) failed.push(suite);
  }
  process.exitCode = failed.length ? 1 : 0;
  return failed;
}
