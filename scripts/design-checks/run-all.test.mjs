import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

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

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'design-run-all-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const here = join(root, 'scripts/design-checks');
  mkdirSync(here, { recursive: true });
  const runner = join(here, 'run-all.mjs');
  writeFileSync(runner, readFileSync(new URL('./run-all.mjs', import.meta.url)));
  for (const suite of suites) {
    const file = join(here, suite);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      'console.log(JSON.stringify({design:process.env.DESIGN_BASE_URL,portfolio:process.env.PORTFOLIO_API_BASE}));\n',
    );
  }
  return (overrides = {}) => {
    const env = { ...process.env };
    delete env.DESIGN_BASE_URL;
    delete env.PORTFOLIO_API_BASE;
    const result = spawnSync(process.execPath, [runner], {
      cwd: root,
      env: { ...env, DESIGN_RUN_ALL_FIXTURE: '1', ...overrides },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.error, undefined);
    const children = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line));
    return { ...result, children };
  };
}

function assertChildren(result, origin) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.children.length, 12);
  for (const child of result.children) {
    assert.deepEqual(child, { design: origin, portfolio: origin });
  }
}

test('overrides a stale portfolio API origin for every browser and API child', (t) => {
  const result = fixture(t)({
    DESIGN_BASE_URL: 'https://branch.personal-design.localhost:7443',
    PORTFOLIO_API_BASE: 'https://personal-design.localhost',
  });
  assertChildren(result, 'https://branch.personal-design.localhost:7443');
});

test('passes the canonical origin to both environment variables', (t) => {
  const result = fixture(t)({ DESIGN_BASE_URL: 'https://BRANCH.personal-design.localhost:443/' });
  assertChildren(result, 'https://branch.personal-design.localhost');
});

test('uses the default design origin instead of an inherited API override', (t) => {
  const result = fixture(t)({ PORTFOLIO_API_BASE: 'https://elsewhere.localhost' });
  assertChildren(result, 'https://personal-design.localhost');
});

test('accepts an HTTP origin and preserves its port', (t) => {
  assertChildren(
    fixture(t)({ DESIGN_BASE_URL: 'http://127.0.0.1:7443/' }),
    'http://127.0.0.1:7443',
  );
});

test('rejects invalid origins before starting any suite', (t) => {
  const run = fixture(t);
  for (const base of [
    '',
    'not-a-url',
    'ftp://branch.personal-design.localhost',
    'https://branch.personal-design.localhost/products/ai-chat',
    'https://branch.personal-design.localhost?check=1',
    'https://branch.personal-design.localhost#check',
    'https://user:password@branch.personal-design.localhost',
  ]) {
    const result = run({ DESIGN_BASE_URL: base });
    assert.notEqual(result.status, 0, base);
    assert.deepEqual(result.children, [], base);
  }
});

test('fails outside fixture mode when a registered motion module is missing', (t) => {
  const result = fixture(t)({ DESIGN_RUN_ALL_FIXTURE: '' });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /registered module not found/);
});
