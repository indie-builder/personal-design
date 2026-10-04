import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from './db.mjs';
import { mapCollectuiPost, syncBestx } from './source-bestx.mjs';

const row = (id, tweet = '123', index = 0) => ({
  id,
  source_url: `https://x.com/designer/status/${tweet}`,
  title: '作品\n完整说明',
  created_at: '2026-09-30T06:00:00Z',
  published_at: '2026-09-30T07:00:00Z',
  media_type: 'video',
  media_url: `https://cdn.collectui.com/${id}.mp4`,
  thumbnail: `https://cdn.collectui.com/${id}-thumbnail.mp4`,
  media_index: index,
  categories: ['button', 'ui-interaction'],
  designer: {
    name: 'Designer',
    username: 'designer',
    profile_image_url: 'https://cdn.collectui.com/avatar',
  },
  metadata: {
    entities: {
      media: [
        {
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          original_info: { width: 1920, height: 1080 },
        },
      ],
    },
  },
});

test('Collect UI 保留原作与作者，视频封面使用图片，不把 mp4 当作图片', () => {
  const post = mapCollectuiPost(row('first'));
  assert.equal(post.id, 'collectui-123');
  assert.equal(post.slug, 'c-123');
  assert.equal(post.tweetId, '123');
  assert.equal(post.creatorName, 'Designer');
  assert.equal(post.creatorUrl, 'https://x.com/designer');
  assert.equal(post.sourceUrl, 'https://x.com/designer/status/123');
  assert.equal(post.description, '作品\n完整说明');
  assert.deepEqual(post.styles, ['button', 'ui-interaction']);
  assert.equal(post.media[0].posterUrl, 'https://pbs.twimg.com/poster.jpg');
  assert.equal(post.media[0].width, 1920);
  const image = mapCollectuiPost({ ...row('image'), media_type: 'image', thumbnail: null });
  assert.equal(image.media[0].type, 'image');
  assert.equal(mapCollectuiPost({ ...row('invalid'), source_url: 'https://example.com/' }), null);
  assert.equal(mapCollectuiPost({ ...row('invalid'), created_at: 'bad' }), null);
});

test('Collect UI 使用当前作者关联并保存作者头像', async (t) => {
  const { db, stmts } = openDatabase(':memory:');
  t.after(() => db.close());
  const post = row('current');
  post.designer = {
    name: 'Designer',
    username: 'designer',
    avatar_url: 'https://cdn.collectui.com/current-avatar',
  };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const select = new URL(url).searchParams.get('select');
    return select === '*,designer:designer_x_profile_id(*)'
      ? Response.json([post])
      : Response.json({ code: 'PGRST200' }, { status: 400 });
  });
  assert.deepEqual(await syncBestx({ db, stmts, source: 'collectui', pageSleepMs: 0 }), {
    discovered: 1,
    inserted: 1,
  });
  const saved = db.prepare('SELECT creator_name, creator_avatar FROM posts').get();
  assert.equal(saved.creator_name, 'Designer');
  assert.equal(saved.creator_avatar, post.designer.avatar_url);
});

test('Collect UI 合并跨页的同原作媒体，按媒体序号排序；重跑增量不重复写入', async (t) => {
  const { db, stmts } = openDatabase(':memory:');
  t.after(() => db.close());
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    urls.push(parsed);
    return Response.json(
      parsed.searchParams.get('offset') === '0'
        ? [row('second', '123', 1)]
        : parsed.searchParams.get('offset') === '1'
          ? [row('first', '123', 0)]
          : [],
    );
  });
  const result = await syncBestx({ db, stmts, source: 'collectui', pageSize: 1, pageSleepMs: 0 });
  assert.deepEqual(result, { discovered: 1, inserted: 1 });
  assert.equal(urls[0].pathname.endsWith('/collectui_posts'), true);
  assert.equal(urls[0].searchParams.get('order'), 'created_at.desc,id.desc');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1);
  assert.deepEqual(
    db
      .prepare('SELECT id FROM media ORDER BY position')
      .all()
      .map((r) => r.id),
    ['collectui-first', 'collectui-second'],
  );
  assert.deepEqual(
    await syncBestx({ db, stmts, source: 'collectui', pageSize: 1, pageSleepMs: 0 }),
    { discovered: 0, inserted: 0 },
  );
});

test('Collect UI 后续分页失败时不写半批；单次事务失败回滚作品与媒体', async (t) => {
  const { db, stmts } = openDatabase(':memory:');
  t.after(() => db.close());
  t.mock.method(globalThis, 'fetch', async (url) =>
    new URL(url).searchParams.get('offset') === '0'
      ? Response.json([row('new')])
      : new Response('', { status: 503 }),
  );
  await assert.rejects(
    syncBestx({ db, stmts, source: 'collectui', pageSize: 1, pageSleepMs: 0 }),
    /503/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0);
  t.mock.method(globalThis, 'fetch', async () => Response.json([row('new')]));
  await assert.rejects(
    syncBestx({
      db,
      stmts: {
        ...stmts,
        upsertMedia: {
          run() {
            throw Error('write failed');
          },
        },
      },
      source: 'collectui',
      pageSleepMs: 0,
    }),
    /write failed/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0);
});
