import assert from 'node:assert/strict';

// Against a production build: DESIGN_BASE_URL=... node scripts/design-checks/layout-first-paint.mjs
const base = process.env.DESIGN_BASE_URL || process.argv[2] || 'http://localhost:3100';
const url = new URL('/products/layout-compositions', base);
url.search = new URLSearchParams({ cat: '平面、出版与广告', page: '136' }).toString();
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200);
const html = await response.text();
const images = html.match(/<img\b[^>]*>/g) || [];
for (const id of ['136', '137']) {
  const image = images.find((tag) => tag.includes(`/03-editorial-advertising/${id}.webp`));
  assert.ok(image, `图鉴 ${id} 必须在服务器 HTML 中输出，不能等待 JavaScript`);
  assert.match(image, /loading="eager"/, `图鉴 ${id} 不应懒加载`);
  assert.match(image, /fetchPriority="high"/i);
}
console.log('PASS: 当前跨页的两张图片在 HTML 中直接输出并立即加载');
