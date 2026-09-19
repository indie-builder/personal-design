import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 全站浏览器回归套件入口：对运行中的生产构建逐个执行 scripts/design-checks
// 下的行为脚本与根 verify 脚本，汇总 PASS/FAIL，任一失败即非零退出。
// 前置：pnpm build && pnpm start（或等价预览），用 DESIGN_BASE_URL 指定地址。
// muse-performance / layout-first-paint 需要 MEDIA_VERSION 版本化构建，不纳入
// 默认套件，按 docs/design/README.md「验收要求」单独运行。
const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';

const suites = [
  '../verify-design.mjs',
  '../verify-design-routes.mjs',
  'home.mjs',
  'layouts-check.mjs',
  'layouts-states.mjs',
  'muse-behavior.mjs',
  'muse-recovery.mjs',
  'shared-browser.cjs',
  'shared-autoplay.cjs',
  'journeys.mjs',
  'personal-sites.mjs',
].filter((name) => {
  try {
    statSync(join(here, name));
    return true;
  } catch {
    return false;
  }
});

const failed = [];
for (const suite of suites) {
  const startedAt = Date.now();
  const exit = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, suite)], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, DESIGN_BASE_URL: base },
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n=== ${suite.split('/').pop()} ${exit === 0 ? 'PASS' : `FAIL (exit ${exit})`} ${seconds}s ===\n`);
  if (exit !== 0) failed.push(suite);
}

console.log(failed.length ? `FAILED: ${failed.join(', ')}` : `ALL ${suites.length} SUITES PASSED`);
process.exitCode = failed.length ? 1 : 0;
