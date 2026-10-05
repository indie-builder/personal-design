import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect } from 'effect';
import { openDatabase } from './db.ts';
import { syncBestx } from './source-bestx.ts';

const bestx = {
  id: 'upstream',
  post_url: '/a/status/987',
  tweet_text: 'work',
  time: '2026-09-30T06:00:00Z',
  media: [{ type: 'photo', image: 'https://example.test/photo.jpg', width: '100', height: '200' }],
};
const collectui = {
  id: 'upstream',
  source_url: 'https://x.com/a/status/987',
  title: 'work',
  created_at: '2026-09-30T06:00:00Z',
  media_type: 'image',
  media_url: 'https://example.test/photo.jpg',
};
const cases = [
  [
    'bestx',
    'nullable dimensions',
    { ...bestx, media: [{ ...bestx.media[0], width: null, height: null }] },
  ],
  ['bestx', 'unused video URL', { ...bestx, media: [{ ...bestx.media[0], video_url: null }] }],
  [
    'bestx',
    'ignored empty media',
    { ...bestx, media: [...bestx.media, { type: null, image: null }] },
  ],
  ['bestx', 'nullable featured', { ...bestx, featured: null }],
  ['collectui', 'nullable author name', { ...collectui, designer: { name: null, username: 'a' } }],
  [
    'collectui',
    'avatar fallback',
    {
      ...collectui,
      designer: {
        username: 'a',
        avatar_url: null,
        profile_image_url: 'https://example.test/avatar.jpg',
      },
    },
  ],
  [
    'collectui',
    'handle fallback',
    { ...collectui, designer: { name: 'A', username: null }, designer_username: 'a' },
  ],
  ['collectui', 'nullable metadata', { ...collectui, metadata: null }],
  ['collectui', 'nullable metadata author', { ...collectui, metadata: { author: null } }],
  ['collectui', 'nullable entities', { ...collectui, metadata: { entities: null } }],
  [
    'collectui',
    'nullable original info',
    { ...collectui, metadata: { entities: { media: [{ original_info: null }] } } },
  ],
  [
    'collectui',
    'nullable original dimensions',
    {
      ...collectui,
      metadata: { entities: { media: [{ original_info: { width: null, height: null } }] } },
    },
  ],
  ['collectui', 'nullable categories', { ...collectui, categories: null }],
  ['collectui', 'nullable media index', { ...collectui, media_index: null }],
  ['collectui', 'nullable featured', { ...collectui, featured: null }],
  ['collectui', 'numeric upstream ID', { ...collectui, id: 5 }],
  ['collectui', 'numeric featured flag', { ...collectui, featured: 0 }],
  [
    'collectui',
    'string dimensions',
    {
      ...collectui,
      metadata: { entities: { media: [{ original_info: { width: '1920', height: '1080' } }] } },
    },
  ],
] as const;

for (const [source, name, row] of cases) {
  test(`${source} preserves valid works with ${name}`, async (t) => {
    const { db, stmts } = openDatabase(':memory:');
    t.after(() => db.close());
    t.mock.method(globalThis, 'fetch', async () => Response.json([row]));
    assert.deepEqual(await Effect.runPromise(syncBestx({ db, stmts, source, pageSleepMs: 0 })), {
      discovered: 1,
      inserted: 1,
    });
    const saved = db.prepare('SELECT title, creator_avatar, creator_url FROM posts').all();
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.title, 'work');
    if (name === 'numeric upstream ID')
      assert.equal(db.prepare('SELECT id FROM media').get()!.id, 'collectui-5');
    if (name === 'numeric featured flag')
      assert.equal(db.prepare('SELECT is_featured FROM posts').get()!.is_featured, 0);
    if (name === 'string dimensions') {
      const dimensions = db.prepare('SELECT width, height FROM media').get()!;
      assert.deepEqual({ ...dimensions }, { width: 1920, height: 1080 });
    }
    const media = db.prepare('SELECT type, url FROM media').all();
    assert.deepEqual(
      media.map((item) => ({ ...item })),
      [{ type: 'image', url: 'https://example.test/photo.jpg' }],
    );
    if (name === 'avatar fallback')
      assert.equal(saved[0]!.creator_avatar, 'https://example.test/avatar.jpg');
    if (name === 'handle fallback') assert.equal(saved[0]!.creator_url, 'https://x.com/a');
  });
}

test('known Collect UI rows with nullable metadata stop incremental sync before older works', async (t) => {
  const { db, stmts } = openDatabase(':memory:');
  t.after(() => db.close());
  stmts.upsertPost({
    id: 'collectui-987',
    slug: 'c-987',
    title: 'known',
    createdAt: collectui.created_at,
    source: 'collectui',
    tweetId: '987',
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      { ...collectui, metadata: null },
      { ...collectui, id: 'older', source_url: 'https://x.com/a/status/986' },
    ]),
  );
  assert.deepEqual(
    await Effect.runPromise(syncBestx({ db, stmts, source: 'collectui', pageSleepMs: 0 })),
    { discovered: 0, inserted: 0 },
  );
  assert.deepEqual(
    db
      .prepare('SELECT id FROM posts')
      .all()
      .map((row) => row.id),
    ['collectui-987'],
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media').get()!.n, 0);
});
