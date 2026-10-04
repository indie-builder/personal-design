import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../scripts/db.mjs';

// Original homepage selection is the oracle, including duplicate video entries.
function originalPreviews(posts, limit = 3) {
  const previews = posts
    .flatMap((post) => {
      const media = post.media[0];
      const src = media?.thumb ?? media?.poster;
      return src ? [{ src, alt: post.title }] : [];
    })
    .slice(0, limit);
  const post = posts.find((post) => post.media[0]?.type === 'video' && post.media[0]?.src);
  const media = post?.media[0];
  if (post && media?.src)
    previews.unshift({
      src: media.thumb ?? media.poster ?? '',
      alt: post.title,
      videoSrc: media.previewSrc ?? media.src,
    });
  return previews;
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inspora-home-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'packages/inspora');
  await mkdir(path.join(pkg, 'src'), { recursive: true });
  await copyFile(new URL('./index.ts', import.meta.url), path.join(pkg, 'src/index.ts'));
  const publicDir = path.join(root, 'apps/web/public/inspora');
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, 'local.mp4'), 'video fixture');
  await writeFile(path.join(publicDir, 'thumb.webp'), 'thumbnail fixture');
  await writeFile(path.join(publicDir, 'poster.webp'), 'poster fixture');
  const { db } = openDatabase(path.join(pkg, 'inspora.db'));
  t.after(() => db.close());
  const postInsert = db.prepare(`INSERT INTO posts
    (id, slug, title, created_at, synced_at, source, tweet_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const mediaInsert = db.prepare(`INSERT INTO media
    (id, post_id, position, type, url, poster_url, local_path, local_thumb_path, local_poster_path, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  function add(id, media = [], options = {}) {
    postInsert.run(
      id,
      id,
      id,
      options.date ?? '2026-10-04',
      '2026-10-04',
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
        item.url ?? `https://example.test/${mediaId}.mp4`,
        item.poster ?? null,
        item.local ?? null,
        item.thumb ?? null,
        item.localPoster ?? null,
        item.raw === undefined ? JSON.stringify({ id: mediaId }) : item.raw,
      );
    });
  }
  const api = await import(pathToFileURL(path.join(pkg, 'src/index.ts')).href);
  return { api, add };
}

function compare(api, limits = [0, 1, 3, 10]) {
  const posts = api.listPosts();
  for (const limit of limits)
    assert.deepEqual(api.listPostPreviews(limit), originalPreviews(posts, limit));
  assert.deepEqual(api.listPostPreviews(), originalPreviews(posts));
}

test('empty, missing media, sparse positions, same-date ordering and secondary videos', async (t) => {
  const { api, add } = await fixture(t);
  compare(api);
  add('empty');
  add('blank', [{ url: '', poster: '' }]);
  add('first-image', [{ position: 8 }, { position: 12, type: 'video' }]);
  add('same-position', [{ position: 4 }, { position: 4, type: 'video' }]);
  add('older', [{ position: 99 }], { date: '2026-10-01' });
  add('newer', [{}], { date: '2026-10-05' });
  compare(api);
  assert.equal(
    api.listPostPreviews().some((p) => p.videoSrc),
    false,
  );
});

test('only visible originals qualify and the first playable video is prepended without deduplication', async (t) => {
  const { api, add } = await fixture(t);
  add('hidden-collectui', [{ type: 'video' }], {
    tweet: '1',
    source: 'collectui',
    date: '2026-10-06',
  });
  add('hidden-bestx', [{ type: 'video' }], { tweet: '1', source: 'bestx', date: '2026-10-06' });
  add('original', [{}], { tweet: '1' });
  add('z-same-source', [{ type: 'video' }], { tweet: '2', source: 'bestx', date: '2026-10-06' });
  add('a-same-source', [{}], { tweet: '2', source: 'bestx' });
  add('motion', [{ type: 'video' }], { date: '2026-10-05' });
  add('later-motion', [{ type: 'video' }], { date: '2026-10-03' });
  compare(api);
  assert.deepEqual(
    api.listPostPreviews().map((p) => p.alt),
    ['motion', 'motion', 'original', 'a-same-source'],
  );
});

test('video search continues beyond the still limit and skips unplayable first media', async (t) => {
  const { api, add } = await fixture(t);
  for (let i = 0; i < 12; i++) add(`still-${i}`, [{}]);
  add('unplayable', [{ type: 'video', url: '', poster: 'https://example.test/poster.webp' }]);
  add('motion', [{ type: 'video', poster: '' }]);
  compare(api);
  assert.equal(api.listPostPreviews()[0].alt, 'motion');
  assert.equal(
    api.listPostPreviews()[0].src,
    '',
    'empty thumbnail does not fall back to video URL',
  );
});

test('local media, poster/thumbnail precedence, missing files and lightweight video fallback', async (t) => {
  const cases = [
    {
      local: '/inspora/local.mp4',
      thumb: '/inspora/thumb.webp',
      localPoster: '/inspora/poster.webp',
    },
    {
      local: '/inspora/missing.mp4',
      thumb: '/inspora/missing.webp',
      poster: 'https://example.test/poster.webp',
    },
    { url: '', local: '/inspora/local.mp4', localPoster: '/inspora/poster.webp' },
    { raw: '{broken' },
    {
      raw: JSON.stringify({
        id: 'other',
        videoPreview: { url: 'https://example.test/preview.mp4' },
      }),
    },
    {
      raw: JSON.stringify({
        id: 'motion-0',
        videoPreview: { url: 'http://example.test/preview.mp4' },
      }),
    },
    {
      raw: JSON.stringify({
        id: 'motion-0',
        videoPreview: { url: 'https://example.test/preview.mp4' },
      }),
    },
    {
      raw: JSON.stringify({
        id: 'motion-0',
        sizeBytes: 100,
        videoPreview: { url: 'https://example.test/preview.mp4', bytes: 200 },
      }),
    },
  ];
  for (const [index, item] of cases.entries())
    await t.test(`fallback ${index}`, async (t) => {
      const { api, add } = await fixture(t);
      add('motion', [{ type: 'video', ...item }]);
      add('still', [{ thumb: '/inspora/thumb.webp', localPoster: '/inspora/poster.webp' }]);
      compare(api);
    });
});

test('bounded conversion: older and secondary media JSON are never parsed, including when no video exists', async (t) => {
  const { api, add } = await fixture(t);
  for (let i = 0; i < 1000; i++) add(`post-${i}`, [{ type: 'image' }, { type: 'video' }]);
  const expected = originalPreviews(api.listPosts());
  const parsed = [];
  const parse = JSON.parse;
  const spy = t.mock.method(JSON, 'parse', (value, ...args) => {
    parsed.push(value);
    return parse(value, ...args);
  });
  assert.deepEqual(api.listPostPreviews(), expected);
  assert.equal(
    parsed.length,
    0,
    'image-only preview selection must not parse secondary video or post metadata',
  );
  spy.mock.restore();
  add('motion', [{ type: 'video' }, { type: 'video' }], { date: '2026-10-01' });
  const withVideo = originalPreviews(api.listPosts());
  parsed.length = 0;
  t.mock.method(JSON, 'parse', (value, ...args) => {
    parsed.push(value);
    return parse(value, ...args);
  });
  assert.deepEqual(api.listPostPreviews(), withVideo);
  assert.deepEqual(parsed, [JSON.stringify({ id: 'motion-0' })]);
});

test('preview limit rejects values that could disable SQL/output bounds', async (t) => {
  const { api } = await fixture(t);
  for (const limit of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.listPostPreviews(limit), RangeError);
  }
});

test('repository data stays exactly equivalent to the original homepage selection', async (t) => {
  const api = await import('./index.ts');
  const oldStart = performance.now();
  const posts = api.listPosts();
  const expected = originalPreviews(posts);
  const oldMs = performance.now() - oldStart;
  const start = performance.now();
  assert.deepEqual(api.listPostPreviews(), expected);
  const newMs = performance.now() - start;
  t.diagnostic(
    `actual data: ${posts.length} posts / ${posts.reduce((sum, p) => sum + p.media.length, 0)} media; original ${oldMs.toFixed(1)}ms, bounded ${newMs.toFixed(1)}ms (single run, not a benchmark)`,
  );
});
