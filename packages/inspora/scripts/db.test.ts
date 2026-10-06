import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, withTransaction, database, databaseError, DatabaseError } from './db.ts';
import { Effect } from 'effect';

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

test('SQL 语法、缺表与程序断言走 Die，约束失败走 Fail', async () => {
  const { db } = openDatabase(':memory:');
  try {
    for (const sql of ['SELEC 1', 'SELECT * FROM missing_table']) {
      const exit = await Effect.runPromiseExit(database(() => db.prepare(sql)));
      assert.equal(exit._tag, 'Failure');
      if (exit._tag === 'Failure') assert.equal(exit.cause.reasons[0]?._tag, 'Die');
    }
    const defect = new assert.AssertionError({ message: 'bug' });
    const exit = await Effect.runPromiseExit(
      database(() => {
        throw defect;
      }),
    );
    assert.equal(exit._tag, 'Failure');
    if (exit._tag === 'Failure') assert.equal(exit.cause.reasons[0]?._tag, 'Die');
    const constrained = db.prepare(
      "INSERT INTO posts (id, slug, title, created_at, synced_at) VALUES ('bad', 'bad', NULL, '2026', '2026')",
    );
    const failure = await Effect.runPromiseExit(
      Effect.tryPromise({
        try: () => withTransaction(db, () => constrained.run()),
        catch: (cause) => databaseError(cause),
      }),
    );
    assert.equal(failure._tag, 'Failure');
    if (failure._tag === 'Failure') {
      assert.equal(failure.cause.reasons[0]?._tag, 'Fail');
      const reason = failure.cause.reasons[0];
      if (reason?._tag === 'Fail') assert.ok(reason.error instanceof DatabaseError);
    }
    assert.equal(postCount(db), 0);
    await withTransaction(db, () => insertPost(db, 'recovered'));
    assert.equal(postCount(db), 1);
  } finally {
    db.close();
  }
});
