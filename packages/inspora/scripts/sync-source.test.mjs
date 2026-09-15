import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractInitialPage, extractDetailPost, collectFeed } from './sync-source.mjs';

test('读取分段 RSC 中的列表，保留字符串中的括号和转义字符', () => {
  const page = { items: [{ id: 'new', title: 'a } "quoted"' }], nextCursor: null };
  const payload = `1:["$","component",null,{"initialPage":${JSON.stringify(page)}}]`;
  const html = [payload.slice(0, 40), payload.slice(40)]
    .map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`)
    .join('');
  assert.deepEqual(extractInitialPage(html), page);
  assert.throws(() => extractInitialPage('<title>Vercel Security Checkpoint</title>'));
});

test('详情跳过同 ID 的列表条目，读取带出处的完整对象', () => {
  const detail = { id: 'new', sourceUrl: 'https://example.com/work', description: 'test' };
  const payload = `${JSON.stringify({ id: 'new', title: 'preview' })}\n${JSON.stringify(detail)}`;
  assert.deepEqual(
    extractDetailPost(`<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`, 'new'),
    detail,
  );
});

test('需要翻页时持续读取到旧作品，完整合并新增', async () => {
  const result = await collectFeed(['Web'], new Set(['old']), async (_, cursor) =>
    cursor
      ? { items: [{ id: 'second' }, { id: 'old' }], nextCursor: 'older' }
      : { items: [{ id: 'first' }], nextCursor: 'next' },
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ['first', 'second'],
  );
});

test('各分类分别追到原有作品，合并新增时不提前停止其他分类', async () => {
  const result = await collectFeed(['Web', 'Motion'], new Set(['old']), async (category) => ({
    items: [{ id: 'shared' }, { id: category }, { id: 'old' }],
    nextCursor: 'more',
  }));
  assert.deepEqual(
    result.map((item) => item.id),
    ['shared', 'Web', 'Motion'],
  );
});

test('首屏没有覆盖增量时必须翻页，接口失败不能返回不完整结果', async () => {
  await assert.rejects(
    collectFeed(['Web'], new Set(['old']), async (_, cursor) => {
      if (cursor) throw new Error('HTTP 429 checkpoint');
      return { items: [{ id: 'new' }], nextCursor: 'more' };
    }),
    /429/,
  );
  await assert.rejects(
    collectFeed(
      ['Web'],
      new Set(),
      async () => ({
        items: [{ id: 'new' }],
        nextCursor: 'more',
      }),
      { maxPages: 1 },
    ),
    /未覆盖/,
  );
});
