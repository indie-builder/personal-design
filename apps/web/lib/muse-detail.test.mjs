import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const reads = { refs: 0 };
globalThis.__museDetailReads = reads;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/lib/'))
      return nextResolve(new URL(`./${specifier.slice('@/lib/'.length)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.includes('/packages/inspora/src/index.ts')) {
      return {
        ...result,
        source: String(result.source).replace(
          /export function listPosts\(/,
          'export function listPostsBlocked(',
        ).replace(
          /export function listPostRefs\(\): InsporaPostRef\[\] \{/,
          'export function listPostRefs(): InsporaPostRef[] { globalThis.__museDetailReads.refs++;',
        ) + '\nexport function listPosts() { throw new Error("Detail must not load the full catalog"); }\n',
      };
    }
    return result;
  },
});

// Failure modes: detail imports initialize all posts and media, or navigation loses
// its bounded window while switching back to the lightweight refs index.
test('muse detail uses lightweight refs without loading the full catalog', async () => {
  const { museBrowseEntries, museMediaOf } = await import('./muse-detail.ts');
  assert.equal(reads.refs, 0);
  const { getPostBySlug, listPostRefs } = await import('@personal-design/inspora');
  const postRefs = listPostRefs();
  const post = getPostBySlug('isometric-ai-computer');
  assert(post);
  const navigation = museBrowseEntries(post, postRefs);
  assert.equal(navigation.currentHref, '/products/muse/isometric-ai-computer');
  assert(navigation.browseEntries.length > 0);
  assert(navigation.browseEntries.length <= 481);
  assert(navigation.entries.length > 0);
  assert(navigation.entries.length <= 481);
  assert(navigation.browseEntries.some((entry) => entry.href === navigation.currentHref));
  assert(museMediaOf(post).length > 0);
  assert.equal(reads.refs, 1);
  assert.deepEqual(museBrowseEntries(post, postRefs), navigation);
  assert.equal(reads.refs, 1);
});
