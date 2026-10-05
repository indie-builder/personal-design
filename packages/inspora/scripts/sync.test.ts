import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scripts, '../../..');
const effect = import.meta.resolve('effect');

test('同步入口保留 0/1/2 退出码、单源隔离与 DB 释放', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'inspora-cli-test-'));
  try {
    for (const mode of ['success', 'failure', 'invalid']) {
      const sources = `import {Data,Effect} from ${JSON.stringify(effect)};
class SourceError extends Data.TaggedError('ProbeSource') {}
export const syncBestx = ({source = 'bestx'}) => ${JSON.stringify(mode)} === 'failure' && source === 'bestx' ? Effect.fail(new SourceError({message:'fixture failure'})) : Effect.succeed({discovered:0,inserted:0});
export const syncInspora = () => Effect.succeed({newPosts:0});
export const tweetIdOf = (url) => /\\/status\\/(\\d+)/.exec(url ?? '')?.[1] ?? null;`;
      const bootstrap = `import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
  if (url === ${JSON.stringify(new URL('./db.ts', import.meta.url).href)}) {
    const loaded = next(url,context);
    if (!String(loaded.source).includes('const db = new DatabaseSync(dbPath);')) throw Error('DB isolation hook no longer matches');
    return {format: loaded.format, source: String(loaded.source).replace('const db = new DatabaseSync(dbPath);', "console.log('DB_OPEN'); const db = new DatabaseSync(':memory:'); const close = db.close.bind(db); db.close = () => { console.log('DB_CLOSE'); close(); };"), shortCircuit:true};
  }
  if ([${JSON.stringify(new URL('./source-bestx.ts', import.meta.url).href)},${JSON.stringify(new URL('./source-inspora.ts', import.meta.url).href)}].includes(url)) return {format:'module',source:${JSON.stringify(sources)},shortCircuit:true};
  return next(url,context);
}});`;
      const preload = path.join(dir, `cli-${mode}.mjs`);
      await writeFile(preload, bootstrap);
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          preload,
          path.join(scripts, 'sync.ts'),
          ...(mode === 'invalid' ? ['--source=invalid'] : []),
        ],
        { cwd: root, encoding: 'utf8', timeout: 10000 },
      );
      assert.equal(
        result.status,
        mode === 'invalid' ? 2 : mode === 'failure' ? 1 : 0,
        result.stdout + result.stderr,
      );
      assert.equal((result.stdout.match(/DB_OPEN/g) ?? []).length, mode === 'invalid' ? 0 : 1);
      assert.equal((result.stdout.match(/DB_CLOSE/g) ?? []).length, mode === 'invalid' ? 0 : 1);
      if (mode === 'failure') {
        assert.ok(result.stderr.includes('bestx 失败: fixture failure'), result.stderr);
        assert.ok(
          result.stdout.includes('collectui 完成:') && result.stdout.includes('inspora 完成:'),
          result.stdout,
        );
        assert.ok(
          result.stderr.includes('以下来源未同步成功，下次运行会继续: bestx'),
          result.stderr,
        );
      }
      if (mode === 'invalid')
        assert.equal(result.stderr.trim(), '未知来源: invalid（可选 inspora | bestx | collectui）');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
