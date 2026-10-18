import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { testFixture } from './test-fixture.mjs';

const script = fileURLToPath(new URL('./check-staged-tokens.mjs', import.meta.url));
const attributes = new URL('../.gitattributes', import.meta.url);
const hook = new URL('../.githooks/pre-commit', import.meta.url);

function fixture(t) {
  const f = testFixture(t, 'staged-tokens-');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: f.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Hook Test');
  git('config', 'user.email', 'hook@example.test');
  git('config', 'core.hooksPath', '/dev/null');
  const check = () => spawnSync(process.execPath, [script], { cwd: f.root, encoding: 'utf8' });
  return { ...f, git, check };
}

test('allows exactly 20,000 bytes and rejects 20,001 UTF-8 bytes with split instructions', (t) => {
  const f = fixture(t);
  f.write('limit.ts', 'a'.repeat(20_000));
  f.git('add', '--', 'limit.ts');
  assert.equal(f.check().status, 0);
  f.write('limit.ts', '界'.repeat(6_667));
  f.git('add', '--', 'limit.ts');
  const result = f.check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /limit\.ts.*5000\.25 tokens.*20001 bytes/);
  assert.match(result.stderr, /20,000 bytes/);
  for (const instruction of [/components/i, /helpers/i, /data/i, /imports/i, /git add/i]) {
    assert.match(result.stderr, instruction);
  }
});

test('checks the staged blob, ignoring unstaged edits, untracked files and unchanged files', (t) => {
  const f = fixture(t);
  f.write('unchanged.ts', 'a'.repeat(20_001));
  f.git('add', '--', 'unchanged.ts');
  f.git('commit', '-m', 'baseline');
  f.write('untracked.ts', 'a'.repeat(20_001));
  assert.equal(f.check().status, 0);
  f.write('partial.ts', 'small');
  f.git('add', '--', 'partial.ts');
  f.write('partial.ts', 'a'.repeat(20_001));
  assert.equal(f.check().status, 0);
  f.git('add', '--', 'partial.ts');
  f.write('partial.ts', 'small');
  assert.equal(f.check().status, 1);
});

test('handles spaces, newlines, leading dashes, renames and staged deletions', (t) => {
  const f = fixture(t);
  const original = '-large file\nname.ts';
  f.write(original, 'a'.repeat(20_001));
  f.git('add', '--', original);
  assert.match(f.check().stderr, /-large file\\nname\.ts/);
  f.git('commit', '-m', 'baseline');
  f.git('mv', '--', original, 'renamed.ts');
  assert.equal(f.check().status, 1);
  f.git('rm', '--cached', '--', 'renamed.ts');
  assert.equal(f.check().status, 0);
});

test('exempts repository lockfiles, codegen, imported content and binary blobs', (t) => {
  const f = fixture(t);
  f.write('.gitattributes', readFileSync(attributes));
  for (const file of [
    'pnpm-lock.yaml',
    'apps/web/src/routeTree.gen.ts',
    'src/client.generated.ts',
    'packages/design-engineer-tools/catalog.json',
    'docs/design/open-design/source/example.ts',
    '.agents/skills/setup-pre-commit/SKILL.md',
  ]) {
    f.write(file, 'a'.repeat(20_001));
  }
  f.write('image.bin', Buffer.alloc(20_001));
  f.git('add', '.');
  assert.equal(f.check().status, 0, f.check().stderr);
  for (const file of [
    'src/authored.json',
    '.agents/skills/harness-code-check/SKILL.md',
    'packages/ai-coding-dictionary/runtime/bridge.js',
    'docs/design/execution/evidence/notes.md',
  ]) {
    f.write(file, 'a'.repeat(20_001));
    f.git('add', '--', file);
    const result = f.check();
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(file), result.stderr);
  }
});

test('uses staged attributes rather than unstaged exemptions', (t) => {
  const f = fixture(t);
  f.write('.gitattributes', 'large.ts linguist-generated\n');
  f.write('large.ts', 'a'.repeat(20_001));
  f.git('add', '.');
  f.write('.gitattributes', 'large.ts -linguist-generated\n');
  assert.equal(f.check().status, 0);
  f.git('add', '--', '.gitattributes');
  f.write('.gitattributes', 'large.ts linguist-generated\n');
  assert.equal(f.check().status, 1);
});

test('unstaged diff attributes cannot exempt a staged oversized text file', (t) => {
  const f = fixture(t);
  f.write('large.ts', 'a'.repeat(20_001));
  f.git('add', '--', 'large.ts');
  f.write('.gitattributes', 'large.ts -diff\n');
  const result = f.check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /large\.ts/);
});

test('installed pre-commit blocks a real commit and permits it after splitting', (t) => {
  const f = fixture(t);
  f.write('.githooks/pre-commit', readFileSync(hook));
  chmodSync(`${f.root}/.githooks/pre-commit`, 0o755);
  f.write('scripts/check-staged-tokens.mjs', readFileSync(script));
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const installed = spawnSync(scripts.prepare, { cwd: f.root, encoding: 'utf8', shell: true });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(f.git('config', '--get', 'core.hooksPath').trim(), '.githooks');
  f.write('large.ts', 'a'.repeat(20_001));
  f.git('add', '.');
  const result = spawnSync('git', ['commit', '-m', 'blocked'], {
    cwd: f.root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /large\.ts/);
  f.write('large.ts', 'a'.repeat(10_000));
  f.write('helper.ts', 'a'.repeat(10_001));
  f.git('add', '--', 'large.ts', 'helper.ts');
  f.git('commit', '-m', 'split files');
  assert.equal(f.git('log', '-1', '--format=%s').trim(), 'split files');
});
