import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Failure modes: unrelated requests initialize all muse cards; layouts resolve media
// before paging; filtering, missing images or public response fields change.
const fixture = {
  cardReads: 0,
  imageReads: [],
  presenceReads: [],
  catalog: Array.from({ length: 350 }, (_, index) => ({
    id: String(index + 1).padStart(3, '0'),
    name: ['Grid One', 'Poster', 'Grid Two', 'Type', 'Grid Three'][index] ?? 'Other',
    category: [0, 2, 3, 4].includes(index) ? '字体、网格与东亚文字' : '构图逻辑',
    category_slug: [0, 2, 3, 4].includes(index) ? 'typography' : 'composition',
    subcategory: index === 3 ? '字体' : '网格',
    subcategory_slug: index === 3 ? 'type' : 'grid',
    width: 1200,
    height: 800,
    raw: 'private layout data',
  })),
  categories: [
    { slug: 'typography', name: '字体、网格与东亚文字', count: 4, subcategories: [
      { slug: 'grid', name: '网格', count: 3 },
      { slug: 'type', name: '字体', count: 1 },
    ] },
    { slug: 'composition', name: '构图逻辑', count: 346, subcategories: [
      { slug: 'grid', name: '网格', count: 346 },
    ] },
  ],
  posts: [
    {
      slug: 'grid-one', title: 'Grid One', category: 'Web', creatorName: 'Lin',
      description: '作品说明', sourceUrl: 'https://artist.example/work',
      industries: ['Design'], styles: ['Grid'], createdAt: '2026-10-01', mediaCount: 3,
      raw: 'private post data',
      media: [
        { id: 'image', type: 'image', src: '/full.webp', thumb: '/thumb.webp', poster: null, width: null, height: null },
        { id: 'video', type: 'video', src: 'https://cdn.example/full.mp4', thumb: '/video.webp', poster: '', width: 16, height: 9 },
        { id: 'hidden', type: 'image', src: null, thumb: null, poster: null, width: null, height: null },
      ],
    },
    {
      slug: 'motion', title: 'Motion', category: 'Motion', creatorName: null,
      industries: [], styles: [], createdAt: '2026-09-30', mediaCount: 1,
      media: [{ id: 'motion-video', type: 'video', src: 'https://cdn.example/movie.mp4', previewSrc: '/loop.mp4', thumb: '/loop.webp', poster: '', width: 16, height: 9 }],
    },
    {
      slug: 'empty', title: 'Empty', category: null, creatorName: null,
      industries: [], styles: [], createdAt: '2026-09-29', mediaCount: 0, media: [],
    },
    {
      slug: 'grid-two', title: 'Grid Two', category: 'Web', creatorName: 'Lin',
      industries: [], styles: ['Grid'], createdAt: '2026-09-28', mediaCount: 1,
      media: [{ id: 'remote', type: 'image', src: 'https://cdn.example/grid.webp', thumb: null, poster: null, width: 8, height: 6 }],
    },
  ],
};
globalThis.__portfolioApiFixture = fixture;

// Replace content-package I/O with memory; run the real API, filters and muse projections.
const modules = {
  '@personal-design/layout-compositions': `
    const fixture = globalThis.__portfolioApiFixture;
    export const catalog = fixture.catalog;
    export const categories = fixture.categories;
    export const upstream = { url: 'https://layouts.example/' };
    export const getLayoutById = id => catalog.find(item => item.id === id);
    export const hasImage = item => {
      fixture.presenceReads.push(item.id);
      return item.id !== '003';
    };
    export const imageUrl = item => {
      fixture.imageReads.push(item.id);
      return item.id === '002' ? 'https://cdn.example/corrected.png' : '/corrected/' + item.id + '.webp';
    };
    export const thumbnailUrl = item => '/thumbs/' + item.id + '.webp';
  `,
  '@personal-design/inspora': `
    const fixture = globalThis.__portfolioApiFixture;
    export const listPostCards = () => { fixture.cardReads++; return fixture.posts; };
    export const getPostBySlug = slug => fixture.posts.find(post => post.slug === slug);
  `,
  '@personal-design/design-engineer-tools': `
    export const toolCategories = [{ id: 'AI Code', tools: [
      { name: 'Editor', url: 'https://editor.example/', icon: '/editor.svg', raw: 'private' },
      { name: 'CLI', url: 'https://cli.example/', icon: null },
    ] }];
  `,
  '@personal-design/personal-sites': `
    export const personalSite = {
      slug: 'personal-sites', name: '个人网站', tagline: '网站介绍', description: '网站说明',
      date: '2026-09-09', href: '/products/personal-sites', cover: '/site.webp',
    };
    export const promoUrl = '/promo.mp4';
    export const promoPosterUrl = '/poster.webp';
    export const websiteUrl = 'https://website.example/';
  `,
  '@personal-design/word-arcade': `
    export const arcadeProduct = {
      slug: 'word-arcade', name: '文字游乐场', tagline: '小游戏', description: '游戏说明',
      date: '2026-09-29', href: '/products/word-arcade', cover: '',
    };
  `,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier))
      return { url: `portfolio-fixture:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('@/lib/'))
      return nextResolve(new URL(`./${specifier.slice('@/lib/'.length)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('portfolio-fixture:'))
      return { format: 'module', source: modules[url.slice('portfolio-fixture:'.length)], shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { portfolioResponse } = await import('./portfolio-api.ts');
const cache = 'public, max-age=60, stale-while-revalidate=300';
async function get(path = '', status = 200) {
  const url = new URL(`https://portfolio.example/api/portfolio${path}`);
  const segments = url.pathname.slice('/api/portfolio'.length).split('/').filter(Boolean);
  const response = await portfolioResponse(new Request(url), segments);
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get('cache-control'), status === 200 ? cache : null, path);
  return response.json();
}

const firstLayout = {
  id: '001', title: 'Grid One', category: '字体、网格与东亚文字', topic: '网格',
  author: '', text: '', sourceURL: 'https://layouts.example/',
  thumbnail: 'https://portfolio.example/thumbs/001.webp',
  media: [{ id: '001', kind: 'image', url: 'https://portfolio.example/corrected/001.webp',
    poster: 'https://portfolio.example/thumbs/001.webp', width: 1200, height: 800 }],
};
const missingLayout = {
  id: '003', title: 'Grid Two', category: '字体、网格与东亚文字', topic: '网格',
  author: '', text: '', sourceURL: 'https://layouts.example/', thumbnail: '', media: [],
};

test('non-list portfolio requests leave muse cards uninitialized', async () => {
  assert.equal(fixture.cardReads, 0, 'Importing the API must not read muse cards');
  const root = await get();
  assert.deepEqual(root.items.map(item => item.id), [
    'layout-compositions', 'muse', 'design-engineer-tools', 'personal-sites',
    'ai-coding-dictionary', 'ai-chat', 'word-arcade',
  ]);
  assert.deepEqual(root.items.find(item => item.id === 'personal-sites'), {
    id: 'personal-sites', name: '个人网站', summary: '网站介绍', description: '网站说明',
    date: '2026-09-09', dateLabel: '收录', cover: 'https://portfolio.example/site.webp',
  });
  assert.equal(root.items.at(-1).cover, '');
  assert.deepEqual(await get('/layouts/001'), { item: firstLayout });
  assert.deepEqual(await get('/layouts/003'), { item: missingLayout });
  await get('/layouts?limit=2');
  assert.deepEqual(await get('/tools'), { categories: [{ id: 'AI Code', name: 'AI 编程', tools: [
    { name: 'Editor', url: 'https://editor.example/', icon: 'https://portfolio.example/editor.svg' },
    { name: 'CLI', url: 'https://cli.example/', icon: '' },
  ] }] });
  assert.deepEqual(await get('/site'), {
    video: 'https://portfolio.example/promo.mp4', poster: 'https://portfolio.example/poster.webp',
    website: 'https://website.example/',
    description: '在这里记录工程经历，也整理每天读到的动态、值得回看的内容和持续关注的开源项目。从一条摘要进入完整阅读，再回到原始来源。',
  });
  assert.deepEqual(await get('/muse/grid-one'), { item: {
    id: 'grid-one', title: 'Grid One', category: '网页', topic: '', author: 'Lin',
    text: '作品说明', sourceURL: 'https://artist.example/work',
    thumbnail: 'https://portfolio.example/thumb.webp',
    media: [
      { id: 'image', kind: 'image', url: 'https://portfolio.example/full.webp', poster: 'https://portfolio.example/thumb.webp', width: 4, height: 3 },
      { id: 'video', kind: 'video', url: 'https://cdn.example/full.mp4', poster: '', width: 16, height: 9 },
    ],
  } });
  assert.deepEqual(await get('/muse/empty'), { item: {
    id: 'empty', title: 'Empty', category: '未分类', topic: '', author: '', text: '',
    sourceURL: '', thumbnail: '', media: [],
  } });
  for (const path of ['/unknown', '/layouts/missing', '/muse/missing', '/muse/extra/path', '/layouts/extra/path', '/tools/extra', '/site/extra'])
    assert.deepEqual(await get(path, 404), { error: '未找到内容' });
  for (const path of ['/muse?offset=-1', '/muse?limit=0', '/muse?limit=61', '/layouts?offset=NaN', '/layouts?limit=1.5', '/muse?offset=1000001'])
    assert.deepEqual(await get(path, 400), { error: 'offset/limit 无效' });
  assert.deepEqual(await get(`/muse?q=${'x'.repeat(201)}`, 400), { error: '搜索词过长' });
  assert.equal(fixture.cardReads, 0, 'Only the muse list may initialize cards');
});

test('layout limit=2 resolves media for only the two returned layouts', async () => {
  fixture.imageReads.length = 0;
  fixture.presenceReads.length = 0;
  const first = await get('/layouts?limit=2');
  assert.deepEqual(fixture.imageReads, ['001', '002']);
  assert.deepEqual([...new Set(fixture.presenceReads)], ['001', '002']);
  assert.equal(first.total, 350);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.items, [firstLayout, {
    id: '002', title: 'Poster', category: '构图逻辑', topic: '网格', author: '', text: '',
    sourceURL: 'https://layouts.example/', thumbnail: 'https://portfolio.example/thumbs/002.webp',
    media: [{ id: '002', kind: 'image', url: 'https://cdn.example/corrected.png',
      poster: 'https://portfolio.example/thumbs/002.webp', width: 1200, height: 800 }],
  }]);
  assert.deepEqual(first.categories, [
    { id: 'typography', name: '字体与网格', count: 4 },
    { id: 'composition', name: '构图', count: 346 },
  ]);
  assert.deepEqual(first.topics, [
    { id: 'grid', name: '网格', count: 3 }, { id: 'type', name: '字体', count: 1 },
    { id: 'grid', name: '网格', count: 346 },
  ]);
  assert.equal(first.attribution, '图鉴改编自 nevertoday/350-layout-compositions · CC BY 4.0');
});

test('layout filters precede paging and retain missing images and category counts', async () => {
  const filtered = await get('/layouts?cat=typography&theme=grid&q=%20gRiD%20&offset=1&limit=2');
  assert.equal(filtered.total, 3);
  assert.equal(filtered.hasMore, false);
  assert.deepEqual(filtered.items.map(item => item.id), ['003', '005']);
  assert.deepEqual(filtered.items[0], missingLayout);
  assert.deepEqual(filtered.categories, [
    { id: 'typography', name: '字体与网格', count: 4 },
    { id: 'composition', name: '构图', count: 346 },
  ]);
  assert.deepEqual(filtered.topics, [
    { id: 'grid', name: '网格', count: 3 }, { id: 'type', name: '字体', count: 1 },
  ]);
  const second = await get('/layouts?limit=2&offset=2');
  assert.deepEqual(second.items.map(item => item.id), ['003', '004']);
  for (const query of ['q=no-match', 'cat=missing', 'theme=missing', 'offset=350']) {
    fixture.imageReads.length = 0;
    fixture.presenceReads.length = 0;
    const empty = await get(`/layouts?${query}`);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.hasMore, false);
    assert.equal(empty.total, query === 'offset=350' ? 350 : 0);
    assert.deepEqual(fixture.imageReads, []);
    assert.deepEqual(fixture.presenceReads, []);
  }
  const defaults = await get('/layouts');
  assert.equal(defaults.items.length, 24);
  assert.equal(defaults.total, 350);
  assert.equal((await get('/layouts?limit=60')).items.length, 60);
});

test('muse lists initialize cards once and retain previews, filters and category counts', async () => {
  const first = await get('/muse?limit=2');
  assert.equal(fixture.cardReads, 1);
  assert.equal(first.total, 4);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.items, [
    { id: 'grid-one', title: 'Grid One', category: '网页', topic: '', author: 'Lin',
      text: '', sourceURL: '', thumbnail: 'https://portfolio.example/thumb.webp',
      media: [{ id: 'grid-one', kind: 'image', url: 'https://portfolio.example/full.webp',
        poster: 'https://portfolio.example/thumb.webp', width: 4, height: 3 }] },
    { id: 'motion', title: 'Motion', category: '动效', topic: '', author: '',
      text: '', sourceURL: '', thumbnail: 'https://portfolio.example/loop.mp4',
      media: [{ id: 'motion', kind: 'video', url: 'https://portfolio.example/loop.mp4',
        poster: '', width: 16, height: 9 }] },
  ]);
  assert.deepEqual(first.categories, [
    { id: 'Web', name: '网页', count: 2 }, { id: 'Motion', name: '动效', count: 1 },
    { id: '未分类', name: '未分类', count: 1 },
  ]);
  assert.deepEqual(first.topics, []);
  assert.equal(first.attribution, '');
  const filtered = await get('/muse?cat=Web&q=grid&offset=1&limit=1');
  assert.equal(filtered.total, 2);
  assert.equal(filtered.hasMore, false);
  assert.deepEqual(filtered.items, [
    { id: 'grid-two', title: 'Grid Two', category: '网页', topic: '', author: 'Lin',
      text: '', sourceURL: '', thumbnail: 'https://cdn.example/grid.webp',
      media: [{ id: 'grid-two', kind: 'image', url: 'https://cdn.example/grid.webp',
        poster: '', width: 8, height: 6 }] },
  ]);
  assert.deepEqual(filtered.categories, first.categories);
  const empty = await get('/muse?cat=未分类');
  assert.equal(empty.total, 1);
  assert.equal(empty.hasMore, false);
  assert.deepEqual(empty.items[0].media, []);
  for (const query of ['q=no-match', 'cat=missing']) {
    const unmatched = await get(`/muse?${query}`);
    assert.equal(unmatched.total, 0);
    assert.equal(unmatched.hasMore, false);
    assert.deepEqual(unmatched.items, []);
  }
  assert.equal(fixture.cardReads, 1);
});
