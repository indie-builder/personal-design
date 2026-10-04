import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// HTTP/API only. Browser checks have separate entries in the acceptance index.
const root = fileURLToPath(new URL('../../', import.meta.url));
const { http } = JSON.parse(await readFile(new URL('./current-checks.json', import.meta.url), 'utf8'));
const names = process.argv.slice(2);
if (names.length === 1 && names[0] === '--list') {
  for (const suite of http) console.log(`${suite.id}: ${suite.file}${suite.origin ? ` (requires ${suite.origin} and fixture provider)` : ''}`);
} else {
  const base = new URL(process.env.DESIGN_BASE_URL ?? 'https://personal-design.localhost');
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new Error('DESIGN_BASE_URL must be an HTTP(S) origin. Use the Portless startup URL.');
  }
  const selected = names.length ? names.map((name) => {
    const suite = http.find((entry) => entry.id === name);
    if (!suite) throw new Error(`Unknown HTTP check: ${name}. Use --list.`);
    return suite;
  }) : http.filter((suite) => !suite.origin);
  // Validate every selection before starting any check; missing scripts never count as skipped passes.
  for (const suite of selected) {
    await access(new URL(`../../${suite.file}`, import.meta.url));
    if (suite.origin) {
      const required = new URL(suite.origin);
      if (base.protocol !== required.protocol || base.hostname !== required.hostname) throw new Error(`${suite.id} requires ${suite.origin} (use the active proxy port if present)`);
    }
  }
  console.log(`HTTP checks: ${selected.map((suite) => suite.id).join(', ')} at ${base.origin}`);
  const failed = [];
  for (const suite of selected) {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [suite.file], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, DESIGN_BASE_URL: base.origin, PORTFOLIO_API_BASE: base.origin },
      });
      child.once('error', (error) => { console.error(error.message); resolve(1); });
      child.once('exit', (status) => resolve(status ?? 1));
    });
    console.log(`${suite.id}: ${code === 0 ? 'PASS' : 'FAIL'}`);
    if (code !== 0) failed.push(suite.id);
  }
  console.log(failed.length ? `Failed HTTP checks: ${failed.join(', ')}` : 'Selected HTTP checks passed. Browser and visual acceptance are separate.');
  process.exitCode = failed.length ? 1 : 0;
}
