import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const reads = { refs: 0 };
globalThis.__museDetailReads = reads;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/lib/'))
      return nextResolve(
        new URL(`./${specifier.slice('@/lib/'.length)}.ts`, import.meta.url).href,
        context,
      );
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.includes('/packages/inspora/src/index.ts')) {
      return {
        ...result,
        source:
          String(result.source)
            .replace(/export function listPosts\(/, 'export function listPostsBlocked(')
            .replace(
              /export function listPostRefs\(\): InsporaPostRef\[\] \{/,
              'export function listPostRefs(): InsporaPostRef[] { globalThis.__museDetailReads.refs++;',
            ) +
          '\nexport function listPosts() { throw new Error("Detail must not load the full catalog"); }\n',
      };
    }
    return result;
  },
});

// Failure modes: detail imports initialize all posts and media, or navigation loses
// its bounded window while switching back to the lightweight refs index.
test('muse detail uses lightweight refs without loading the full catalog', async () => {
  const { museBrowseEntries, museMediaOf, museDetailOf } = await import('./muse-detail.ts');
  assert.equal(reads.refs, 0);
  const { getPostBySlug, listPostRefs } = await import('@personal-design/inspora');
  const postRefs = listPostRefs();
  const post = getPostBySlug('isometric-ai-computer');
  assert(post);
  const navigation = museBrowseEntries(post, postRefs);
  assert.equal(navigation.currentHref, '/products/muse/isometric-ai-computer');
  assert(navigation.entries.length > 0);
  assert(navigation.entries.length <= 481);
  assert(navigation.entries.some((entry) => entry.href === navigation.currentHref));
  assert.equal(navigation.contextHref, null);
  assert(museMediaOf(post).length > 0);
  const detail = museDetailOf(post, postRefs);
  assert.deepEqual(detail.navigation, navigation);
  assert.deepEqual(detail.media, museMediaOf(post));
  assert.equal(detail.post.creatorAvatar, post.creatorAvatar);
  assert.equal(reads.refs, 1);
  assert.deepEqual(museBrowseEntries(post, postRefs), navigation);
  assert.equal(reads.refs, 1);
});

// Sparse matches must survive filtering before the navigation payload is bounded.
test('muse detail keeps distant adjacent matches from the full lightweight index', async () => {
  const { museBrowseEntries, museDetailOf } = await import('./muse-detail.ts');
  const refs = Array.from({ length: 700 }, (_, index) => ({
    slug: String(index),
    title: [0, 350, 699].includes(index) ? 'Sparse match' : 'Other work',
    creatorName: null,
    category: 'Web',
    industries: [],
    styles: [],
  }));
  const query = 'browse=2&cat=Web&q=Sparse';
  const navigation = museBrowseEntries(refs[350], refs, query);
  assert.deepEqual(museDetailOf({ ...refs[350], media: [] }, refs, query).navigation, navigation);
  assert.equal(navigation.contextHref, '/products/muse?q=Sparse&cat=Web');
  assert.deepEqual(
    navigation.entries.map((entry) => entry.href),
    ['/products/muse/0', '/products/muse/350', '/products/muse/699'],
  );
});

// Failure modes: category validation against a truncated index, result-external current
// posts retaining a trail, unbounded payloads, or search/category semantics drifting.
test('muse navigation resolves filters, fallback and bounds before serializing titles', async () => {
  const { museBrowseEntries } = await import('./muse-detail.ts');
  const { browseHref, browseMemoryKey } = await import('./browse-context.ts');
  const refs = Array.from({ length: 700 }, (_, index) => ({
    slug: String(index),
    title: `Work ${index}`,
    creatorName: 'Author',
    category: [0, 350, 699].includes(index) ? 'Web' : 'Motion',
    industries: ['Design'],
    styles: ['Minimal'],
  }));
  const hrefs = (navigation) => navigation.entries.map((entry) => entry.href);
  const expected = [0, 350, 699].map((index) => `/products/muse/${index}`);
  for (const query of [
    'browse=2&cat=Web',
    'browse=2&cat=Web&q=+AUTHOR+',
    'browse=2&cat=Web&q=Design',
    'browse=2&cat=Web&q=Minimal',
    'browse=2&cat=Web&q=网页',
    'browse=2&cat=Web&q=Work',
    'browse=2&cat=Web&q=Author+Web',
  ]) {
    for (const index of [0, 350, 699]) {
      const navigation = museBrowseEntries(refs[index], refs, query);
      assert.deepEqual(hrefs(navigation), expected);
      assert.equal(
        navigation.entries.findIndex((entry) => entry.href === navigation.currentHref),
        [0, 350, 699].indexOf(index),
      );
      assert(navigation.contextHref);
      assert(navigation.entries.every((entry) => Object.keys(entry).join(',') === 'href,title'));
    }
  }

  const navigation = museBrowseEntries(refs[350], refs, 'browse=2&cat=Web&q=+AUTHOR+&unused=1');
  assert.equal(navigation.contextHref, '/products/muse?q=+AUTHOR+&cat=Web');
  assert.equal(
    browseHref(navigation.entries[2].href, navigation.contextHref),
    '/products/muse/699?browse=2&cat=Web&q=+AUTHOR+',
  );
  assert.equal(
    browseMemoryKey('muse-return', navigation.contextHref),
    browseMemoryKey('muse-return', '/products/muse?cat=Web&q=+AUTHOR+'),
  );

  for (const query of ['', 'browse=1&cat=Web', 'browse=2&cat=Motion', 'browse=2&q=missing']) {
    const fallback = museBrowseEntries(refs[350], refs, query);
    assert.equal(fallback.contextHref, null);
    assert.deepEqual(hrefs(fallback), expected);
  }
  // Unknown categories are discarded against the complete index, preserving q.
  const unknown = museBrowseEntries(refs[350], refs, 'browse=2&cat=missing&q=Work');
  assert.equal(unknown.contextHref, '/products/muse?q=Work');
  assert.deepEqual(
    hrefs(unknown),
    refs.slice(110, 591).map((entry) => `/products/muse/${entry.slug}`),
  );
  // Motion exists outside the unfiltered window around 350; it must not be discarded.
  const outside = refs.map((entry, index) => ({
    ...entry,
    category: index === 0 ? 'Motion' : 'Web',
  }));
  assert.equal(museBrowseEntries(outside[350], outside, 'browse=2&cat=Motion').contextHref, null);
  const missing = museBrowseEntries({ slug: 'missing', category: null }, refs, 'browse=2');
  assert.equal(missing.contextHref, null);
  assert.equal(missing.entries.length, 240);
  const uncategorized = refs.map((entry) => ({ ...entry, category: null }));
  const all = museBrowseEntries(uncategorized[350], uncategorized, 'browse=2&cat=未分类');
  assert.equal(all.contextHref, '/products/muse?cat=%E6%9C%AA%E5%88%86%E7%B1%BB');
  assert.equal(all.entries.length, 481);
  assert.equal(museBrowseEntries(uncategorized[350], uncategorized).entries.length, 481);
});

// Failure modes: serializing internal post/media fields or a second raw media array,
// dropping author/head content or navigation tags, substituting video previews,
// changing media order, nullable dimensions, poster fallback or empty-string semantics.
test('muse detail exposes only page/head content, bounded navigation and display media', async (t) => {
  const { museDetailOf } = await import('./muse-detail.ts');
  const rawMedia = {
    id: 'video',
    postId: 'internal-post',
    position: 2,
    type: 'video',
    url: 'https://provider.test/internal-original',
    posterUrl: 'internal-poster-url',
    sizeBytes: 12345,
    alt: 'internal-alt',
    src: 'https://media.test/full.mp4',
    previewSrc: 'https://media.test/preview.mp4',
    poster: '',
    thumb: '/video-thumb.webp',
    width: null,
    height: null,
    raw_json: 'internal-media-json',
  };
  const post = {
    id: 'internal-post',
    slug: 'work',
    title: '作品',
    creatorName: '作者',
    creatorUrl: 'https://author.test',
    creatorAvatar: '/avatar.webp',
    description: '  作品说明  ',
    category: 'Motion',
    sourceUrl: 'https://original.test/work',
    industries: ['Design'],
    styles: ['Minimal'],
    colors: ['#123456'],
    createdAt: 'internal-created',
    publishedAt: 'internal-published',
    isFeatured: true,
    source: 'collectui',
    tweetId: 'internal-tweet',
    raw: 'internal-post-json',
    media: [
      { ...rawMedia, id: 'missing', src: null },
      rawMedia,
      { ...rawMedia, id: 'blank', src: '' },
      {
        ...rawMedia,
        id: 'image',
        type: 'image',
        src: '/full.webp',
        poster: null,
        thumb: '/image-thumb.webp',
        width: 1600,
        height: 900,
      },
    ],
  };
  const refs = [
    {
      slug: 'before',
      title: '前作',
      creatorName: null,
      category: 'Web',
      industries: [],
      styles: [],
    },
    {
      slug: 'work',
      title: '作品',
      creatorName: '作者',
      category: 'Motion',
      industries: ['Design'],
      styles: ['Minimal'],
    },
    {
      slug: 'after',
      title: '后作',
      creatorName: '',
      category: 'Motion',
      industries: [],
      styles: [],
    },
  ];
  const detail = museDetailOf(post, refs);
  assert.deepEqual(detail, {
    post: {
      slug: 'work',
      title: '作品',
      creatorName: '作者',
      creatorUrl: 'https://author.test',
      creatorAvatar: '/avatar.webp',
      description: '  作品说明  ',
      category: 'Motion',
      sourceUrl: 'https://original.test/work',
    },
    navigation: {
      currentHref: '/products/muse/work',
      contextHref: null,
      entries: [
        { href: '/products/muse/work', title: '作品' },
        { href: '/products/muse/after', title: '后作' },
      ],
    },
    media: [
      {
        id: 'video',
        type: 'video',
        src: 'https://media.test/full.mp4',
        poster: '',
        width: null,
        height: null,
        alt: '作品 · 第 1 件',
      },
      {
        id: 'image',
        type: 'image',
        src: '/full.webp',
        poster: '/image-thumb.webp',
        width: 1600,
        height: 900,
        alt: '作品 · 第 2 件',
      },
    ],
  });
  const serialized = JSON.stringify(detail);
  assert.doesNotMatch(serialized, /internal-|preview\.mp4/);
  assert.equal(Object.hasOwn(detail.post, 'media'), false);
  assert.equal(serialized.split('https://media.test/full.mp4').length - 1, 1);

  for (const value of [null, '']) {
    const empty = museDetailOf(
      {
        ...post,
        title: '',
        creatorName: value,
        creatorUrl: value,
        creatorAvatar: value,
        description: value,
        category: value,
        sourceUrl: value,
        media: [],
      },
      [],
    );
    assert.deepEqual(empty, {
      post: {
        slug: 'work',
        title: '',
        creatorName: value,
        creatorUrl: value,
        creatorAvatar: value,
        description: value,
        category: value,
        sourceUrl: value,
      },
      navigation: { currentHref: '/products/muse/work', contextHref: null, entries: [] },
      media: [],
    });
  }
  const single = museDetailOf(
    { ...post, media: [{ ...rawMedia, poster: null, thumb: null }] },
    refs,
  );
  assert.deepEqual(single.media, [
    {
      id: 'video',
      type: 'video',
      src: 'https://media.test/full.mp4',
      poster: null,
      width: null,
      height: null,
      alt: '作品',
    },
  ]);
  t.diagnostic(
    `Fixture payload: ${Buffer.byteLength(JSON.stringify({ post, navigation: detail.navigation, media: detail.media }))} -> ${Buffer.byteLength(serialized)} bytes`,
  );
});
