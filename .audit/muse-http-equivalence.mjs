import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listPosts } from '../packages/inspora/src/index.ts';

const root = new URL('../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return { url: new URL(`apps/web/${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
    if (specifier === '@personal-design/inspora') return { url: new URL('packages/inspora/src/index.ts', root).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { museItems, musePage } = await import('../apps/web/lib/muse-catalog.ts');
const { museThumbnailOf, museKeywords } = await import('../apps/web/lib/muse-detail.ts');
const original = listPosts().map((post) => {
  const first = post.media[0];
  const src = first?.type === 'video' ? first.previewSrc : (first?.thumb ?? first?.src);
  return { key: post.slug, category: post.category ?? '未分类', lead: post.creatorName ?? undefined,
    name: post.title, sub: post.createdAt.slice(0, 10), href: `/products/muse/${post.slug}`,
    kind: first?.type ?? 'image', src: src ?? '', poster: museThumbnailOf(post),
    fullSrc: first?.type === 'image' ? (first.src ?? first.thumb ?? undefined) : undefined,
    width: first?.width ?? 4, height: first?.height ?? 3, mediaCount: post.media.length,
    keywords: museKeywords(post) };
});
assert.deepEqual(museItems, original);
const base = process.env.DESIGN_BASE_URL;
assert(base);
const cases = [{}, { offset: 24 }, { limit: 3, q: 'dashboard' }, { category: museItems[0].category, limit: 4 },
  { q: 'zzzz-no-match-928' }, { q: 'dashboard', offset: 3, limit: 2 }];
const results = [];
for (const filter of cases) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) query.set(key === 'category' ? 'cat' : key, String(value));
  const response = await fetch(`${base}/products/muse/api/posts?${query}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
  const { total, items } = musePage(filter);
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify({ total, items })));
  results.push({ query: query.toString(), total, items: items.length, cacheControl: response.headers.get('cache-control') });
}
const source = await readFile(new URL('apps/web/app/products/muse/[slug]/page.tsx', root), 'utf8');
assert(source.includes('const getPost = cache(getPostBySlug)'));
const response = await fetch(`${base}/products/muse/${museItems[0].key}`);
const html = await response.text();
assert.equal(response.status, 200);
assert(html.includes(museItems[0].name));
await writeFile(new URL('muse-http-equivalence.json', import.meta.url), JSON.stringify({ cardsCompared: museItems.length, results, detailStatus: response.status }, null, 2));
console.log(JSON.stringify({ cardsCompared: museItems.length, queries: results.length, detailStatus: response.status }));
