import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tweetIdOf, deriveTitle, mapBestxPost } from './source-bestx.mjs';

test('从 post_url 提取推文 id，无法提取时返回 null', () => {
  assert.equal(tweetIdOf('/vikingmute/status/2098773990495916513'), '2098773990495916513');
  assert.equal(tweetIdOf('https://x.com/a/status/123'), '123');
  assert.equal(tweetIdOf('/handle/likes/1'), null);
  assert.equal(tweetIdOf(undefined), null);
});

test('标题取首个非链接行并截断，空推文回退 @handle', () => {
  assert.equal(
    deriveTitle('https://ambientcss.vercel.app\n\nAmbient CSS is great', 'vikingmute'),
    'Ambient CSS is great',
  );
  assert.equal(deriveTitle('Mac Duo ', 'AVIROK1'), 'Mac Duo');
  assert.equal(deriveTitle(`${'长'.repeat(200)}`, 'a'), `${'长'.repeat(119)}…`);
  assert.equal(deriveTitle('', 'hello'), '@hello');
  assert.equal(deriveTitle(undefined, undefined), '@unknown');
});

test('photo 行映射为 image，链接与宽高来自 CDN 字段', () => {
  const post = mapBestxPost({
    id: 11062,
    author_name: 'Aviorrok',
    handle: 'AVIROK1',
    tweet_text: 'Mac Duo',
    time: '2026-09-11T17:06:00+00:00',
    post_url: '/AVIROK1/status/2098458045827232119',
    avatar: 'https://cdn.bestdesignsonx.com/avatars/461287239.jpg',
    featured: false,
    published_at: '2026-09-13T08:00:06.18+00:00',
    media: [
      {
        type: 'photo',
        image: 'https://cdn.bestdesignsonx.com/media/HR92.avif',
        width: '1200',
        height: '679',
      },
    ],
  });
  assert.equal(post.id, 'bestx-2098458045827232119');
  assert.equal(post.slug, 'x-2098458045827232119');
  assert.equal(post.tweetId, '2098458045827232119');
  assert.equal(post.sourceUrl, 'https://x.com/AVIROK1/status/2098458045827232119');
  assert.equal(post.creatorUrl, 'https://x.com/AVIROK1');
  assert.equal(post.createdAt, new Date('2026-09-11T17:06:00+00:00').toISOString());
  assert.equal(post.category, null);
  assert.equal(post.description, null); // 说明与标题相同，不留占位
  assert.deepEqual(post.media, [
    {
      id: 'bestx-2098458045827232119-0',
      type: 'image',
      url: 'https://cdn.bestdesignsonx.com/media/HR92.avif',
      posterUrl: null,
      width: 1200,
      height: 679,
      raw: {
        type: 'photo',
        image: 'https://cdn.bestdesignsonx.com/media/HR92.avif',
        width: '1200',
        height: '679',
      },
    },
  ]);
});

test('video 与 animated_gif 都按视频处理，封面作 poster', () => {
  const post = mapBestxPost({
    handle: 'a',
    post_url: '/a/status/1',
    tweet_text: 't',
    time: '2026-09-11T17:06:00+00:00',
    media: [
      {
        type: 'video',
        cover: 'https://cdn.bestdesignsonx.com/t/cover.avif',
        video_url: 'https://cdn.bestdesignsonx.com/t/v.mp4',
        width: '1920',
        height: '1080',
      },
      {
        type: 'animated_gif',
        cover: 'https://cdn.bestdesignsonx.com/t/g.avif',
        video_url: 'https://cdn.bestdesignsonx.com/t/g.mp4',
        width: '1024',
        height: '1280',
      },
      { type: 'unknown', foo: 'bar' },
    ],
  });
  assert.deepEqual(
    post.media.map((m) => [m.type, m.url, m.posterUrl]),
    [
      [
        'video',
        'https://cdn.bestdesignsonx.com/t/v.mp4',
        'https://cdn.bestdesignsonx.com/t/cover.avif',
      ],
      [
        'video',
        'https://cdn.bestdesignsonx.com/t/g.mp4',
        'https://cdn.bestdesignsonx.com/t/g.avif',
      ],
    ],
  );
});

test('无法提取推文 id 或时间的行被丢弃；说明只在多于标题时保留', () => {
  assert.equal(mapBestxPost({ handle: 'a', post_url: '/a/likes/9', tweet_text: 'x' }), null);
  assert.equal(mapBestxPost({ handle: 'a', post_url: '/a/status/3', tweet_text: 'x' }), null);
  const post = mapBestxPost({
    handle: 'a',
    post_url: '/a/status/2',
    tweet_text: '标题\n第二行说明',
    time: '2026-09-11T17:06:00+00:00',
  });
  assert.equal(post.title, '标题');
  assert.equal(post.description, '标题\n第二行说明');
});
