import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../scripts/db.mjs';

test('三源相同原作只显示一份，详情、导航、分类计数一致；同源重复也只显示一份', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inspora-dedup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'));
  await copyFile(new URL('./index.ts', import.meta.url), path.join(root, 'src/index.ts'));
  const { db, stmts } = openDatabase(path.join(root, 'inspora.db'));
  const add = (id, source, tweetId, category = 'Motion') =>
    stmts.upsertPost.run(
      id,
      id,
      id,
      null,
      null,
      null,
      null,
      category,
      null,
      null,
      null,
      tweetId ? `https://x.com/author/status/${tweetId}` : null,
      '2026-09-30T06:00:00Z',
      null,
      0,
      null,
      null,
      '2026-09-30T06:00:00Z',
      source,
      tweetId,
    );
  add('inspora-original', 'inspora', '1');
  add('x-original', 'bestx', '1', 'hidden');
  add('c-original', 'collectui', '1', 'hidden');
  add('x-second', 'bestx', '2');
  add('c-second', 'collectui', '2', 'hidden');
  add('c-new', 'collectui', '3');
  add('c-duplicate', 'collectui', '3');
  add('no-tweet', 'inspora', null);
  db.close();
  const api = await import(pathToFileURL(path.join(root, 'src/index.ts')).href);
  const posts = api.listPosts();
  assert.equal(posts.length, 4);
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
  assert.deepEqual(api.listCategories(), [{ name: 'Motion', count: 4 }]);
});
