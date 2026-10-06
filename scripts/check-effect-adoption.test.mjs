import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Effect 迁移的结构性回归门禁：防止旧模式回潮。
 * 这些断言对应 .audit/effect-adoption.tsv 迁移判据，改动前先读该轨迹。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migratedPackages = [
  'personal-sites',
  'layout-compositions',
  'design-engineer-tools',
  'inspora',
  'ai-chat',
];
const scriptsDir = (pkg) => path.join(root, 'packages', pkg, 'scripts');

function readScripts(pkg, filter = (name) => name.endsWith('.ts') && !name.endsWith('.test.ts')) {
  const dir = scriptsDir(pkg);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => filter(name))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }));
}

test('迁移包的 scripts 目录不再保留 .mjs（测试与允许名单除外）', () => {
  // render-promo.mjs 是 Remotion 渲染入口，不属于同步管线，保持原样。
  const allowlist = new Set(['render-promo.mjs']);
  for (const pkg of migratedPackages) {
    const leftovers = readdirSync(scriptsDir(pkg)).filter(
      (name) => name.endsWith('.mjs') && !name.includes('.test.') && !allowlist.has(name),
    );
    assert.deepEqual(leftovers, [], `${pkg} 仍有未迁移的 .mjs: ${leftovers.join(', ')}`);
  }
});

test('事务三连只存在于 inspora db.ts 的唯一 helper', () => {
  for (const pkg of ['inspora']) {
    for (const { name, text } of readScripts(pkg)) {
      if (name === 'db.ts') continue;
      assert.equal(/\b(BEGIN|COMMIT|ROLLBACK)\b/.test(text), false, `${pkg}/${name} 出现裸事务关键字`);
    }
  }
});

test('browser.close 在 source-inspora.ts 只有一条释放路径', () => {
  const [source] = readScripts('inspora', (name) => name === 'source-inspora.ts');
  const count = (source?.text ?? '').match(/browser\.close/g)?.length ?? 0;
  assert.equal(count, 1, `期望单一 browser.close 释放路径，实际 ${count} 处`);
});

test('同步入口均指向 .ts', () => {
  for (const pkg of migratedPackages) {
    const pkgJson = JSON.parse(
      readFileSync(path.join(scriptsDir(pkg), '..', 'package.json'), 'utf8'),
    );
    for (const [key, command] of Object.entries(pkgJson.scripts ?? {})) {
      if (!key.startsWith('sync')) continue;
      assert.match(command, /scripts\/[\w-]+\.ts/, `${pkg} 的 ${key} 未指向 .ts: ${command}`);
    }
  }
});

test('脚本内每个 fetch 都带超时或中断信号，且所在文件有重试覆盖', () => {
  for (const pkg of migratedPackages) {
    for (const { name, text } of readScripts(pkg)) {
      const fetches = [...text.matchAll(/fetch\(/g)];
      if (fetches.length === 0) continue;
      assert.match(
        text,
        /Effect\.retry|Schedule\./,
        `${pkg}/${name} 含 fetch 但无 Effect.retry/Schedule 重试覆盖`,
      );
      for (const match of fetches) {
        const call = text.slice(match.index ?? 0, (match.index ?? 0) + 400);
        assert.match(
          call,
          /AbortSignal\.timeout|signal/,
          `${pkg}/${name} 的 fetch 调用缺少超时或中断信号`,
        );
      }
    }
  }
});
