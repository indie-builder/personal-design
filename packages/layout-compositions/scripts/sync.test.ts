import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

function runSync(script: string, args: string[] = []) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(process.execPath, [script, ...args], { timeout: 10_000 }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== 'number' || error.killed)) {
        reject(error);
        return;
      }
      resolve({ code: error && typeof error.code === 'number' ? error.code : 0, stdout, stderr });
    });
  });
}

test('真实入口隔离单项失败，完成后续条目并汇总非零退出，支持高清图和增量恢复', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'layout-sync-'));
  const pkg = path.join(root, 'packages/layout-compositions');
  const scripts = path.join(pkg, 'scripts');
  const repo = path.join(pkg, '.upstream/extracted/repo');
  const out = path.join(root, 'apps/web/public/layout-compositions');
  try {
    await mkdir(scripts, { recursive: true });
    await mkdir(repo, { recursive: true });
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ type: 'module' }));
    await symlink(path.join(packageDir, 'node_modules'), path.join(pkg, 'node_modules'), 'dir');
    for (const name of ['sync.ts', 'download.ts']) {
      await copyFile(path.join(packageDir, 'scripts', name), path.join(scripts, name));
    }
    await writeFile(path.join(pkg, '.upstream/repo.tar.gz'), Buffer.alloc(1024 * 1024 + 1));
    await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
      .png()
      .toFile(path.join(repo, 'source.png'));
    const items = Array.from({ length: 11 }, (_, index) => ({
      id: String(index + 1).padStart(3, '0'),
      name: `布局 ${index + 1}`,
      category_slug: 'category',
      image: 'source.png',
      thumbnail: 'unused.jpg',
      sha256: index === 0 ? 'incorrect hash' : '',
    }));
    await writeFile(path.join(pkg, 'catalog.json'), JSON.stringify(items));
    await writeFile(
      path.join(pkg, 'corrections.json'),
      JSON.stringify({ '010': { missing: true } }),
    );
    const thumbs = path.join(out, 'thumbnails/category');
    await mkdir(thumbs, { recursive: true });
    await writeFile(path.join(thumbs, '011.webp'), 'existing thumbnail');

    const result = await runSync(path.join(scripts, 'sync.ts'));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /001.*sha256/);
    assert.match(result.stdout, /新转换 8，跳过 1，上游缺失 1，失败 1/);
    assert.match(result.stdout, /进度 11\/11/);
    assert.equal((await sharp(path.join(thumbs, '009.webp')).metadata()).format, 'webp');
    assert.equal(await readFile(path.join(thumbs, '011.webp'), 'utf8'), 'existing thumbnail');
    assert.deepEqual((await readdir(out)).sort(), ['images', 'thumbnails']);
    assert.deepEqual(await readdir(path.join(out, 'images/category')), []);
    assert.equal((await readdir(thumbs)).filter((name) => name.endsWith('.part')).length, 0);

    const withImages = await runSync(path.join(scripts, 'sync.ts'), ['--with-images']);
    assert.equal(withImages.code, 1);
    assert.match(withImages.stdout, /新转换 9，跳过 0，上游缺失 1，失败 1/);
    assert.equal((await sharp(path.join(out, 'images/category/009.webp')).metadata()).width, 8);
    assert.equal((await readdir(path.join(out, 'images/category'))).length, 9);

    const first = items[0];
    assert.ok(first);
    first.sha256 = createHash('sha256')
      .update(await readFile(path.join(repo, 'source.png')))
      .digest('hex');
    await writeFile(path.join(pkg, 'catalog.json'), JSON.stringify(items));
    const recovered = await runSync(path.join(scripts, 'sync.ts'), ['--with-images']);
    assert.equal(recovered.code, 0);
    assert.match(recovered.stdout, /新转换 1，跳过 9，上游缺失 1，失败 0/);
    assert.equal((await sharp(path.join(thumbs, '001.webp')).metadata()).format, 'webp');

    const repeated = await runSync(path.join(scripts, 'sync.ts'), ['--with-images']);
    assert.equal(repeated.code, 0);
    assert.match(repeated.stdout, /新转换 0，跳过 10，上游缺失 1，失败 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
