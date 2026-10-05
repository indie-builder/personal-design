import assert from 'node:assert/strict';
import { symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkNavigation } from './check-navigation.mjs';
import { testFixture } from './test-fixture.mjs';
const utilities = JSON.parse(readFileSync(new URL('./design-checks/current-checks.json', import.meta.url))).utilities;

const manifestPath = 'scripts/design-checks/current-checks.json';
function fixture(t) {
  const { root, write } = testFixture(t, 'navigation-');
  const manifest = {
    documents: ['AGENTS.md', 'docs/current.md'],
    utilities,
    http: [{ id: 'http', file: 'scripts/design-checks/http.mjs' }],
    browser: [{ id: 'browser', file: 'scripts/design-checks/browser.mjs', exports: ['verify'] }],
  };
  const save = () => write(manifestPath, JSON.stringify(manifest));
  write('AGENTS.md', '[Current](docs/current.md)');
  write('docs/current.md', '[Home](../AGENTS.md#rules)\n[History](history.md)');
  write('docs/history.md', '[Retired](missing.md)\nnode scripts/design-checks/run-all.mjs');
  write('scripts/design-checks/http.mjs', "throw new Error('must never execute');\n");
  write(
    'scripts/design-checks/browser.mjs',
    'export async function verify(tab) { return tab.playwright.domSnapshot(); }',
  );
  save();
  return { root, write, manifest, save, errors: () => checkNavigation(root).join('\n') };
}

test('accepts registered documents and supplied browser APIs without executing scripts or checking history', (t) => {
  const f = fixture(t);
  f.write('docs/space name.md', '# Exists');
  f.write(
    'docs/current.md',
    [
      '[Encoded](space%20name.md#anchor)',
      '[Angle](<space name.md>)',
      '[Directory](../scripts/)',
      '[External](https://example.com/missing.md)',
      '[Mail](mailto:user@example.com)',
      '[Anchor](#heading)',
      '[History](history.md)',
      '[Protocol relative](//example.com/file.md)',
      '`node scripts/design-checks/http.mjs`',
      '`scripts/design-checks/current-checks.json`',
    ].join('\n'),
  );
  assert.deepEqual(checkNavigation(f.root), []);
});

test('reports malformed JSON and invalid manifest fields', (t) => {
  const f = fixture(t);
  f.write(manifestPath, '{');
  assert.match(f.errors(), /manifest|JSON/i);
  for (const invalid of [
    null,
    [],
    {},
    { documents: 'AGENTS.md', http: [], browser: [] },
    { documents: [12], http: [], browser: [] },
    { documents: [], http: [null], browser: [] },
    { documents: [], http: [{ id: 1, file: 'x' }], browser: [] },
    { documents: [], http: [], browser: [{ id: 'x', file: 'x', exports: [12] }] },
  ]) {
    f.write(manifestPath, JSON.stringify(invalid && typeof invalid === 'object' && !Array.isArray(invalid)
      ? { utilities: [], ...invalid } : invalid));
    assert.notEqual(f.errors(), '', JSON.stringify(invalid));
  }
});

test('requires globally unique check IDs', (t) => {
  const f = fixture(t);
  f.manifest.browser[0].id = 'http';
  f.save();
  assert.match(f.errors(), /duplicate.*http/i);
});

test('registered paths must be confined relative regular files', (t) => {
  const f = fixture(t);
  for (const file of [
    '/etc/passwd',
    '../outside.md',
    'docs/../AGENTS.md',
    'C:\\outside.md',
    'docs',
    'missing.md',
  ]) {
    f.manifest.documents = [file];
    f.save();
    assert.notEqual(f.errors(), '', file);
  }
  symlinkSync(tmpdir(), join(f.root, 'outside'));
  f.manifest.documents = ['outside'];
  f.save();
  assert.match(f.errors(), /outside|escape|confined/i);
});

test('registered document links must exist and cannot escape the repository', (t) => {
  const f = fixture(t);
  for (const target of [
    'missing.md#heading',
    '../../outside.md',
    '/etc/passwd',
    '%2e%2e/%2e%2e/outside.md',
    'bad%ZZ.md',
  ]) {
    f.write('docs/current.md', `[Broken](${target})`);
    assert.notEqual(f.errors(), '', target);
  }
  symlinkSync(tmpdir(), join(f.root, 'outside'));
  f.write('docs/current.md', '[Escape](../outside/)');
  assert.notEqual(f.errors(), '');
});

test('explicit script references must exist and current docs cannot prescribe legacy drivers', (t) => {
  const f = fixture(t);
  f.write('docs/current.md', '`node scripts/missing.mjs`');
  assert.match(f.errors(), /scripts\/missing\.mjs/);
  for (const file of ['old.sh', 'shared-browser.cjs']) {
    f.write(`scripts/design-checks/${file}`, '// historical');
    f.write('docs/current.md', `\`node scripts/design-checks/${file}\``);
    assert.match(f.errors(), /unregistered|legacy/i);
    f.write('docs/current.md', `[Driver](../scripts/design-checks/${file})`);
    assert.match(f.errors(), /unregistered|legacy/i);
  }
  for (const file of utilities) f.write(file, '// current utility');
  f.write(
    'docs/current.md',
    '`node scripts/design-checks/run-http.mjs`\n`scripts/design-checks/fixtures/ai-chat-provider.mjs`',
  );
  assert.deepEqual(checkNavigation(f.root), []);
});

test('checks declared browser exports statically and ignores commented declarations', (t) => {
  const f = fixture(t);
  f.manifest.browser[0].exports.push('missing');
  f.save();
  f.write(
    'scripts/design-checks/browser.mjs',
    'export function verify() {}\n// export async function missing() {}',
  );
  assert.match(f.errors(), /missing.*export|export.*missing/i);
});

test('allows browser tools and launchers without binding checks to an agent', (t) => {
  const f = fixture(t);
  for (const lane of ['http', 'browser']) {
    const entry = f.manifest[lane][0].file;
    f.write(entry, "import './helper.mjs';\nexport async function verify() {}\n");
    f.write('scripts/design-checks/helper.mjs', "export { run } from './nested.mjs';");
    for (const code of [
      "import { chromium } from 'playwright';",
      "import p from 'puppeteer-core';",
      "const p = await import('@playwright/test');",
      "const p = require('ego-browser');",
      'chromium.launch();',
      'browser.launchPersistentContext();',
      "execSync('ego-lite open https://example.com');",
    ]) {
      f.write('scripts/design-checks/nested.mjs', code);
      assert.deepEqual(checkNavigation(f.root), [], `${lane}: ${code}`);
    }
    f.write(entry, 'export async function verify(tab) { return tab.playwright.domSnapshot(); }');
  }
});

test('follows compact static imports and re-exports', (t) => {
  const f = fixture(t);
  f.write('scripts/design-checks/http.mjs', "import{run}from'./helper.mjs';");
  f.write('scripts/design-checks/helper.mjs', "export{run}from'./nested.mjs';");
  f.write('scripts/design-checks/nested.mjs', "import'./missing.mjs';");
  assert.match(f.errors(), /missing\.mjs/);
});

test('checks optional current runner and provider utilities when present', (t) => {
  const f = fixture(t);
  for (const file of utilities) {
    f.write(file, "import './missing.mjs';");
    assert.match(f.errors(), /missing\.mjs/);
    f.write(file, '// safe utility');
    assert.deepEqual(checkNavigation(f.root), []);
  }
});

test('does not traverse installed dependency or vendor implementation', (t) => {
  const f = fixture(t);
  f.write(
    'scripts/design-checks/http.mjs',
    "import '../../apps/web/node_modules/library/index.mjs';\nimport '../../vendor/library.mjs';",
  );
  f.write('apps/web/node_modules/library/index.mjs', "import 'playwright';");
  f.write('vendor/library.mjs', "import 'puppeteer';");
  assert.deepEqual(checkNavigation(f.root), []);
});

test('handles import cycles and reports missing or escaping local imports', (t) => {
  const f = fixture(t);
  f.write('scripts/design-checks/http.mjs', "import './helper.mjs';");
  f.write('scripts/design-checks/helper.mjs', "import './http.mjs';");
  assert.deepEqual(checkNavigation(f.root), []);
  f.write('scripts/design-checks/helper.mjs', "import './missing.mjs';");
  assert.match(f.errors(), /missing\.mjs/);
  f.write('scripts/design-checks/helper.mjs', "import '../../../outside.mjs';");
  assert.notEqual(f.errors(), '');
});
