import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/lib/'))
      return nextResolve(
        new URL(`./${specifier.slice('@/lib/'.length)}.ts`, import.meta.url).href,
        context,
      );
    return nextResolve(specifier, context);
  },
});
const { filterMuseItems, musePage, museMatches, museItems } = await import('./muse-catalog.ts');
const { museKeywords, museMediaOf, museBrowseEntries } = await import('./muse-detail.ts');
const { listPostRefs } = await import('@personal-design/inspora');
const { windowed } = await import('./browse-context.ts');

// Failure modes: dropping media without dimensions, changing poster fallback or empty
// poster semantics, skipping hidden-media alt numbering, filtering after pagination,
// losing adjacent-entry bounds when the module index no longer contains the current post,
// accepting an empty catalog or a filter that matches every category and search query.
test('muse media and keywords retain empty values, nullable dimensions and displayed ordering', () => {
  const base = {
    id: 'm',
    type: 'image',
    src: '/full',
    poster: null,
    thumb: '/thumb',
    width: null,
    height: null,
  };
  const post = {
    title: '作品',
    category: null,
    industries: ['Web'],
    styles: ['Motion'],
    media: [{ ...base, src: null }, base, { ...base, id: 'v', type: 'video', poster: '' }],
  };
  assert.equal(museKeywords(post), 'Web Motion');
  assert.deepEqual(museMediaOf(post), [
    {
      id: 'm',
      type: 'image',
      src: '/full',
      poster: '/thumb',
      width: null,
      height: null,
      alt: '作品 · 第 1 件',
    },
    {
      id: 'v',
      type: 'video',
      src: '/full',
      poster: '',
      width: null,
      height: null,
      alt: '作品 · 第 2 件',
    },
  ]);
});

test('muse paging filters the full catalog before applying the bounded window', () => {
  for (const filters of [
    {},
    { q: ' web ' },
    { category: '全部' },
    { category: '未分类' },
    { category: 'missing' },
  ]) {
    const matched = filterMuseItems(filters);
    assert.deepEqual(musePage({ ...filters, offset: 2, limit: 3 }), {
      total: matched.length,
      hasMore: 5 < matched.length,
      items: matched.slice(2, 5),
    });
    assert(matched.every((item) => museMatches(item, filters)));
  }
});

test('unfiltered muse paging retains the nonempty catalog and its order', () => {
  assert(museItems.length > 0);
  assert.equal(musePage({}).total, museItems.length);
  assert.deepEqual(musePage({ offset: 2, limit: 3 }).items, museItems.slice(2, 5));
});

test('unknown muse categories return an empty page', () => {
  assert.deepEqual(musePage({ category: 'missing' }), {
    total: 0,
    hasMore: false,
    items: [],
  });
});

test('unmatched muse searches return an empty page', () => {
  assert.deepEqual(musePage({ q: 'no-match-98273' }), {
    total: 0,
    hasMore: false,
    items: [],
  });
});

test('muse list and lightweight detail navigation share search fields and ordering', () => {
  const refs = listPostRefs();
  for (const filters of [
    { q: ' web ' },
    { q: '网页' },
    { q: 'Motion' },
    { q: 'minimal' },
    { category: 'Web' },
    { category: '全部', q: 'design' },
  ]) {
    const matched = filterMuseItems(filters);
    assert(matched.length > 0);
    const post = refs.find((entry) => entry.slug === matched[Math.floor(matched.length / 2)].key);
    assert(post);
    const params = new URLSearchParams({ browse: '2', q: filters.q ?? '' });
    if (filters.category) params.set('cat', filters.category);
    const navigation = museBrowseEntries(post, refs, params.toString());
    assert(navigation.contextHref);
    assert.deepEqual(
      navigation.entries,
      windowed(matched, `/products/muse/${post.slug}`).map((item) => ({
        href: item.href,
        title: item.name,
      })),
    );
  }
});

test('browse windows keep bounded adjacent works including the first and last item', () => {
  const entries = Array.from({ length: 700 }, (_, index) => ({ href: `/${index}` }));
  assert.deepEqual(windowed(entries, '/350'), entries.slice(110, 591));
  assert.deepEqual(windowed(entries, '/0'), entries.slice(0, 481));
  assert.deepEqual(windowed(entries, '/699'), entries.slice(219));
  assert.deepEqual(windowed(entries, '/missing'), entries.slice(0, 240));
  assert.equal(windowed(entries.slice(0, 481), '/0').length, 481);
});
