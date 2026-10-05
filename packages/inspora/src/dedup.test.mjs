import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { openDatabase } from '../scripts/db.ts';

test('三源相同原作只显示一份，详情、导航、分类计数一致；同源重复也只显示一份', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inspora-dedup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'));
  await copyFile(new URL('./index.ts', import.meta.url), path.join(root, 'src/index.ts'));
  const { db, stmts } = openDatabase(path.join(root, 'inspora.db'));
  const add = (id, source, tweetId, category = 'Motion', date = '2026-09-30T06:00:00Z') =>
    stmts.upsertPost({
      id,
      slug: id,
      title: id,
      category,
      source,
      tweetId,
      sourceUrl: tweetId ? `https://x.com/author/status/${tweetId}` : null,
      createdAt: date,
      syncedAt: '2026-09-30T06:00:00Z',
    });
  add('inspora-original', 'inspora', '1');
  add('x-original', 'bestx', '1', 'hidden');
  add('c-original', 'collectui', '1', 'hidden');
  add('x-second', 'bestx', '2');
  add('c-second', 'collectui', '2', 'hidden');
  add('c-new', 'collectui', '3');
  add('c-duplicate', 'collectui', '3');
  add('no-tweet', 'inspora', null);
  add('web-a', 'inspora', null, 'Web', '2026-10-02T06:00:00Z');
  add('web-b', 'inspora', null, 'Web', '2026-10-02T06:00:00Z');
  add('product-a', 'inspora', null, 'Product', '2026-10-01T06:00:00Z');
  add('product-b', 'inspora', null, 'Product', '2026-10-01T06:00:00Z');
  for (const id of ['uncategorized-a', 'uncategorized-b', 'uncategorized-c'])
    add(id, 'inspora', null, null);
  add('uncategorized-label', 'inspora', null, '未分类');
  db.close();
  const api = await import(pathToFileURL(path.join(root, 'src/index.ts')).href);
  const posts = api.listPosts();
  assert.equal(posts.length, 12);
  assert.equal(new Set(posts.filter((p) => p.tweetId).map((p) => p.tweetId)).size, 3);
  assert.equal(api.getPostBySlug('c-original'), undefined);
  assert.equal(api.getPostBySlug('x-original'), undefined);
  assert.equal(api.getPostBySlug('c-second'), undefined);
  assert.equal(api.getPostBySlug('c-new'), undefined);
  assert.equal(api.getPostBySlug('c-duplicate').source, 'collectui');
  assert.deepEqual(
    api.listPostRefs().map((p) => p.slug),
    posts.map((p) => p.slug),
  );
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@personal-design/inspora')
        return nextResolve(pathToFileURL(path.join(root, 'src/index.ts')).href, context);
      if (specifier.startsWith('@/lib/'))
        return nextResolve(
          new URL(`../../../apps/web/lib/${specifier.slice('@/lib/'.length)}.ts`, import.meta.url)
            .href,
          context,
        );
      return nextResolve(specifier, context);
    },
  });
  t.after(() => hooks.deregister());
  const { museItems, museTabs } = await import('../../../apps/web/lib/muse-catalog.ts');
  assert.equal(museItems.length, posts.length, '缺少媒体仍保留作品与分类计数');
  assert.deepEqual(
    museTabs,
    [
      { name: 'Motion', count: 4 },
      { name: 'Web', count: 2 },
      { name: 'Product', count: 2 },
      { name: '未分类', count: 4 },
    ],
    '只统计去重后的可见作品，同数保留首次出现顺序，未分类合并并置后',
  );
});
