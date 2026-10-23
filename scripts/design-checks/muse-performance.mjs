import assert from 'node:assert/strict';
import { access, stat } from 'node:fs/promises';

// 部署包断言改为直接核对 Nitro 产物：数据库经 serverDataAssets 复制进 server 产物，
// 本地媒体随 public 目录进入 .output/public。
await access(new URL('../../apps/web/.output/server/inspora.db', import.meta.url));
await stat(new URL('../../apps/web/.output/public/inspora/posters', import.meta.url));

const base = process.env.DESIGN_BASE_URL || process.argv[2];
if (!base) throw new Error('需要 DESIGN_BASE_URL 或首个参数指定站点地址（生产预览用 pnpm start 的 Portless URL）。');
const response = await fetch(new URL('/products/muse', base));
assert.equal(response.status, 200);
const html = await response.text();
assert.equal((html.match(/id="muse-/g) || []).length, 24, '首批24件必须在服务器 HTML 中呈现');
assert.ok(html.length < 400_000, `网格页 HTML 必须保持窗口化（当前 ${(html.length / 1024).toFixed(0)}KB）`);
const poster = html.match(/poster="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
assert.ok(poster, '首屏视频必须有可直接请求的封面');
const posterUrl = new URL(poster, base);
assert.match(posterUrl.searchParams.get('v') || '', /^[a-f0-9]{40}$/, '使用 MEDIA_VERSION=<commit sha> 构建后测试缓存');
const cached = await fetch(posterUrl, { method: 'HEAD' });
assert.match(cached.headers.get('cache-control') || '', /max-age=31536000/);
posterUrl.search = '';
const plain = await fetch(posterUrl, { method: 'HEAD' });
assert.doesNotMatch(plain.headers.get('cache-control') || '', /immutable/, '无版本地址不能永久缓存');
const filtered = await fetch(new URL('/products/muse?q=brand%20work', base)).then(r => r.text());
assert.match(filtered, /id="muse-brand-work"/);
assert.doesNotMatch(filtered, /id="muse-cartridge-portfolio"/);
const slice = await fetch(new URL('/products/muse/api/posts?offset=24&limit=24', base));
assert.equal(slice.status, 200);
const sliceData = await slice.json();
assert.ok(Array.isArray(sliceData.items) && sliceData.items.length === 24, '分片接口必须返回整批窗口');
assert.ok(sliceData.total > sliceData.items.length, '分片接口必须给出筛选命中总数');
console.log('PASS: SSR首批24件、窗口化负载、搜索首屏、版本化媒体缓存、无版本缓存保护、分片接口');
