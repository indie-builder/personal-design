import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { testFixture } from './test-fixture.mjs';

const original = readFileSync(new URL('../.impeccable/design.json', import.meta.url), 'utf8');
const generator = new URL('./generate-design-snapshot.mjs', import.meta.url);

function fixture(t) {
  const f = testFixture(t, 'design-snapshot-');
  const script = `${f.root}/scripts/generate-design-snapshot.mjs`;
  f.write('scripts/generate-design-snapshot.mjs', readFileSync(generator));
  const metadata = JSON.parse(
    readFileSync(new URL('../.impeccable/design/metadata.json', import.meta.url), 'utf8'),
  );
  for (const file of [
    'metadata.json',
    'extensions.json',
    'narrative.json',
    ...metadata.componentFiles,
  ]) {
    f.write(
      `.impeccable/design/${file}`,
      readFileSync(new URL(`../.impeccable/design/${file}`, import.meta.url)),
    );
  }
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { ...f, run, script };
}

test('split design sources reproduce the existing snapshot byte for byte', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(`${f.root}/.impeccable/design.json`, 'utf8'), original);
  assert.equal(f.run('--check').status, 0);
});

test('check reports missing or stale output without rewriting it', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--check').status, 1);
  f.write('.impeccable/design.json', '{}\n');
  const result = f.run('--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /generate:design/);
  assert.equal(readFileSync(`${f.root}/.impeccable/design.json`, 'utf8'), '{}\n');
});

test('preserves the previous snapshot when a source is invalid or missing', (t) => {
  const f = fixture(t);
  f.write('.impeccable/design.json', original);
  f.write('.impeccable/design/narrative.json', '{');
  assert.equal(f.run().status, 1);
  assert.equal(readFileSync(`${f.root}/.impeccable/design.json`, 'utf8'), original);
  f.remove('.impeccable/design/narrative.json');
  assert.equal(f.run().status, 1);
  assert.equal(readFileSync(`${f.root}/.impeccable/design.json`, 'utf8'), original);
});

test('design snapshot generator resolves sources independently of shell working directory', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(generator), '--check'], {
    cwd: '/',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
