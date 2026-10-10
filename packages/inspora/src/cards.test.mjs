import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../scripts/db.ts';

function originalCards(posts) {
  return posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    creatorName: post.creatorName,
    category: post.category,
    industries: post.industries,
    styles: post.styles,
    createdAt: post.createdAt,
    media: post.media.slice(0, 1),
    mediaCount: post.media.length,
  }));
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inspora-cards-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'packages/inspora');
  await mkdir(path.join(pkg, 'src'), { recursive: true });
  await copyFile(new URL('./index.ts', import.meta.url), path.join(pkg, 'src/index.ts'));
  const publicDir = path.join(root, 'apps/web/public/inspora');
  await mkdir(publicDir, { recursive: true });
  for (const name of ['local.mp4', 'thumb.webp', 'poster.webp'])
    await writeFile(path.join(publicDir, name), 'fixture');
  const { db } = openDatabase(path.join(pkg, 'inspora.db'));
  t.after(() => db.close());
  const postInsert = db.prepare(`INSERT INTO posts
    (id, slug, title, creator_name, category, industries, styles, created_at, synced_at, source, tweet_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const mediaInsert = db.prepare(`INSERT INTO media
    (id, post_id, position, type, url, poster_url, local_path, local_thumb_path, local_poster_path, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  function add(id, media = [], options = {}) {
    postInsert.run(
      id,
      id,
      id,
      options.creator ?? null,
      options.category ?? null,
      options.industries ?? null,
      options.styles ?? null,
      options.date ?? '2026-10-10',
      '2026-10-10',
      options.source ?? 'inspora',
      options.tweet ?? null,
    );
    media.forEach((item, index) => {
      const mediaId = `${id}-${index}`;
      mediaInsert.run(
        mediaId,
        id,
        item.position ?? index,
        item.type ?? 'image',
        item.url ?? `https://example.test/${mediaId}`,
        item.poster ?? null,
        item.local ?? null,
        item.thumb ?? null,
        item.localPoster ?? null,
        item.raw ?? JSON.stringify({ id: mediaId }),
      );
    });
  }
  const api = await import(pathToFileURL(path.join(pkg, 'src/index.ts')).href);
  return { api, add };
}

test('cards preserve visibility, order, missing media, full counts and search metadata', async (t) => {
  const { api, add } = await fixture(t);
  assert.deepEqual(api.listPostCards(), []);
  add('empty', [], { industries: '["design",1,null]', styles: '{broken' });
  add('sparse', [{ position: 9 }, { position: 3 }, { position: 3, type: 'video' }], {
    creator: '',
    category: '',
    industries: '[]',
    styles: '["minimal"]',
  });
  add('older', [{}], { date: '2026-10-01' });
  add('hidden-collectui', [{}], { source: 'collectui', tweet: '1' });
  add('hidden-bestx', [{}], { source: 'bestx', tweet: '1' });
  add('original', [{}], { tweet: '1', category: 'Web' });
  add('z-hidden', [{}], { source: 'bestx', tweet: '2' });
  add('a-visible', [{}], { source: 'bestx', tweet: '2' });
  assert.deepEqual(api.listPostCards(), originalCards(api.listPosts()));
  assert.deepEqual(
    api.listPostCards().map((p) => p.slug),
    ['empty', 'sparse', 'original', 'a-visible', 'older'],
  );
  assert.equal(api.listPostCards()[1].mediaCount, 3);
});

test('cards preserve local URLs, empty strings, video preview and fallback rules', async (t) => {
  const { api, add } = await fixture(t);
  add('local', [
    {
      type: 'video',
      local: '/inspora/local.mp4',
      thumb: '/inspora/thumb.webp',
      localPoster: '/inspora/poster.webp',
    },
  ]);
  add('missing', [{ local: '/inspora/missing', poster: 'https://example.test/poster' }]);
  add('blank', [{ url: '', poster: '' }]);
  add('preview', [
    {
      type: 'video',
      raw: JSON.stringify({
        id: 'preview-0',
        videoPreview: { url: 'https://example.test/preview.mp4' },
      }),
    },
  ]);
  add('invalid-preview', [{ type: 'video', raw: '{broken' }]);
  add('wrong-preview', [
    {
      type: 'video',
      raw: JSON.stringify({
        id: 'different',
        videoPreview: { url: 'https://example.test/preview.mp4' },
      }),
    },
  ]);
  assert.deepEqual(api.listPostCards(), originalCards(api.listPosts()));
});

test('cards never parse secondary media', async (t) => {
  const { api, add } = await fixture(t);
  add('post', [{}, { type: 'video', raw: 'secondary-media-must-not-be-parsed' }]);
  const expected = originalCards(api.listPosts());
  const parse = JSON.parse;
  const parsed = [];
  const mock = t.mock.method(JSON, 'parse', (value, ...args) => {
    parsed.push(value);
    return parse(value, ...args);
  });
  try {
    assert.deepEqual(api.listPostCards(), expected);
  } finally {
    mock.mock.restore();
  }
  // 在 mock 外断言：生产 try/catch 会吞掉 mock 内抛出的断言错误
  assert.ok(!parsed.includes('secondary-media-must-not-be-parsed'));
});

test('all repository cards exactly match the full-post projection', async (t) => {
  const api = await import('./index.ts');
  const posts = api.listPosts();
  assert.deepEqual(api.listPostCards(), originalCards(posts));
  t.diagnostic(`Compared every field of ${posts.length} visible cards against listPosts`);
});
