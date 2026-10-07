import { access } from 'node:fs/promises';
import { designOrigin, manifest, runSuites } from './runner.mjs';

const { http } = manifest;
const names = process.argv.slice(2);
if (names.length === 1 && names[0] === '--list') {
  for (const suite of http) console.log(`${suite.id}: ${suite.file}${suite.origin ? ` (requires ${suite.origin} and fixture provider)` : ''}`);
} else {
  const base = designOrigin();
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
  const failed = await runSuites(selected, base, (suite, code) => console.log(`${suite.id}: ${code === 0 ? 'PASS' : 'FAIL'}`));
  console.log(failed.length ? `Failed HTTP checks: ${failed.map((suite) => suite.id).join(', ')}` : 'Selected HTTP checks passed. Browser and visual acceptance are separate.');
}
