import test from 'node:test';
import assert from 'node:assert/strict';

// 对 /api/portfolio 的集成契约检查：需对运行中的生产服务执行，
// 基址与 design-checks 一致（DESIGN_BASE_URL，默认 http://localhost:3000），
// 已纳入 run-all.mjs 全套回归；单独运行用 pnpm test:portfolio-api，
// 连本机 7200 开发服务时用 PORTFOLIO_API_BASE 覆盖。
// 注意：layouts 的 350/8 是数据快照钉，同步增删图鉴后需同步更新。
const base =
  process.env.PORTFOLIO_API_BASE ?? process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
async function get(path = '') {
  const response = await fetch(`${base}/api/portfolio${path}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /public/);
  return response.json();
}
function publicOnly(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['raw', 'raw_json', 'source', 'syncedAt', 'tweetId', 'sizeBytes', 'creatorAvatar'].includes(key), `Internal field: ${key}`);
    publicOnly(child);
  }
}
test('portfolio is complete and public', async () => {
  const result = await get();
  assert.deepEqual(result.items.map(x => x.id), [
    'layout-compositions',
    'muse',
    'design-engineer-tools',
    'personal-sites',
    'ai-coding-dictionary',
    'ai-chat',
  ]);
  publicOnly(result);
});
test('layouts paginate, filter, search and resolve corrected media', async () => {
  const first = await get('/layouts?limit=2');
  const second = await get('/layouts?limit=2&offset=2');
  assert.equal(first.total, 350);
  assert.equal(first.categories.length, 8);
  assert.equal(first.items.length, 2);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(first.hasMore, true);
  const detail = await get(`/layouts/${first.items[0].id}`);
  assert.equal(detail.item.title, first.items[0].title);
  assert.ok(detail.item.media[0].url.startsWith('https://') || detail.item.media[0].url.startsWith(base));
  const empty = await get('/layouts?q=no-match-98273');
  assert.equal(empty.total, 0);
  assert.equal(empty.hasMore, false);
  const filtered = await get(`/layouts?cat=${first.categories[0].id}`);
  assert.equal(filtered.total, first.categories[0].count);
  const all = [];
  for (let offset = 0; offset < first.total; offset += 60) all.push(...(await get(`/layouts?limit=60&offset=${offset}`)).items);
  assert.equal(new Set(all.map(x => x.id)).size, 350);
  assert.ok(all.some(x => x.media.length === 0), 'Missing illustrations must remain in the catalogue');
  publicOnly(first); publicOnly(detail);
});
test('muse detail includes all media without raw provider payloads', async () => {
  const page = await get('/muse?limit=3');
  assert.equal(page.items.length, 3);
  assert.ok(page.total > 3);
  const result = await get(`/muse/${encodeURIComponent(page.items[0].id)}`);
  assert.equal(result.item.id, page.items[0].id);
  assert.ok(Array.isArray(result.item.media));
  publicOnly(page); publicOnly(result);
});
test('tools and site use their public package data', async () => {
  const tools = await get('/tools');
  assert.ok(tools.categories.length >= 10);
  assert.ok(tools.categories.flatMap(x => x.tools).length >= 100);
  const site = await get('/site');
  assert.equal(new URL(site.video).pathname, '/personal-sites/promo.mp4');
  publicOnly(tools); publicOnly(site);
});
test('invalid pagination and missing resources return explicit errors', async () => {
  for (const path of ['/layouts?limit=0', '/muse?offset=-1', '/muse?limit=9999', '/layouts?offset=NaN', '/layouts?limit=1.5']) {
    assert.equal((await fetch(`${base}/api/portfolio${path}`)).status, 400);
  }
  for (const path of ['/layouts/99999', '/muse/not-a-real-item', '/unknown', '/tools/extra']) {
    assert.equal((await fetch(`${base}/api/portfolio${path}`)).status, 404);
  }
});
