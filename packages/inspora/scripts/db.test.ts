import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, withTransaction } from './db.ts';

function insertPost(db: ReturnType<typeof openDatabase>['db'], id: string) {
  db.prepare(
    "INSERT INTO posts (id, slug, title, created_at, synced_at) VALUES (?, ?, 't', '2026', '2026')",
  ).run(id, `slug-${id}`);
}

// node:sqlite 返回 null 原型对象，直接 deepEqual 字面量会因原型不等失败，取值比较。
function postCount(db: ReturnType<typeof openDatabase>['db']) {
  return (db.prepare('SELECT COUNT(*) AS c FROM posts').get() as { c: number }).c;
}

test('withTransaction 成功时提交', async () => {
  const { db } = openDatabase(':memory:');
  await withTransaction(db, () => insertPost(db, 'a'));
  assert.equal(postCount(db), 1);
  db.close();
});

test('withTransaction 异常时回滚', async () => {
  const { db } = openDatabase(':memory:');
  await assert.rejects(() =>
    withTransaction(db, async () => {
      insertPost(db, 'b');
      throw new Error('boom');
    }),
  );
  assert.equal(postCount(db), 0);
  db.close();
});

test('回滚后连接可继续使用（无悬挂事务）', async () => {
  const { db } = openDatabase(':memory:');
  await assert.rejects(() =>
    withTransaction(db, () => {
      throw new Error('boom');
    }),
  );
  await withTransaction(db, () => insertPost(db, 'c'));
  assert.equal(postCount(db), 1);
  db.close();
});
