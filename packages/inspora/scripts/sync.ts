/**
 * 灵感集同步入口 —— 一条管线适配三类数据源：
 *
 * - inspora：inspora.design（列表/详情走 RSC 抓取，需 Playwright，
 *   Vercel checkpoint 时回退 ego-browser），媒体只下缩略图/海报/头像。
 *   见 scripts/source-inspora.ts。
 * - bestx：Best Designs on X（bestdesignsonx.com，公开 Supabase REST +
 *   CDN 热链，无需浏览器、无本地媒体）。见 scripts/source-bestx.ts。
 * - collectui：Collect UI（collectui.com），复用公开 REST 管线，同一原作多行媒体合并。
 *
 * 各源互相独立：一个失败不影响其他源写入；同一原作（X 推文）读取侧仅保留一份。
 *
 * 用法：
 *   node scripts/sync.ts                      # 三个源都增量（日常）
 *   node scripts/sync.ts --full               # 三个源全量 backfill（首次）
 *   node scripts/sync.ts --source=collectui   # 只跑一个源（inspora | bestx | collectui）
 *   node scripts/sync.ts --max-pages N        # inspora 分类翻页上限（调试）
 */
import { Data, Effect, Result } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { openDatabase, withTransaction, database, databaseError, type Db } from './db.ts';
import { syncInspora } from './source-inspora.ts';
import { syncBestx } from './source-bestx.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(PKG_ROOT, 'inspora.db');

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const maxPagesIdx = args.indexOf('--max-pages');
const MAX_PAGES = maxPagesIdx >= 0 ? Number(args[maxPagesIdx + 1]) : Infinity;
const sourceIdx = args.findIndex((arg) => arg.startsWith('--source='));
const ONLY = sourceIdx >= 0 ? args[sourceIdx]!.split('=')[1] : null;

class SyncError extends Data.TaggedError('Sync')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const sources = [
  { name: 'bestx', run: ({ db, stmts }: Db) => syncBestx({ db, stmts, full: FULL }) },
  {
    name: 'collectui',
    run: ({ db, stmts }: Db) => syncBestx({ db, stmts, full: FULL, source: 'collectui' }),
  },
  {
    name: 'inspora',
    run: ({ db, stmts }: Db) => syncInspora({ db, stmts, full: FULL, maxPages: MAX_PAGES }),
  },
].filter((source) => !ONLY || source.name === ONLY);

/** 老的 inspora 行详情补全时才会写 tweet_id；每次同步前从 source_url 直接补齐，跨源去重才能覆盖存量 */
function backfillTweetIds(db: Db['db']) {
  return Effect.gen(function* () {
    const rows = yield* database(
      () =>
        db
          .prepare(
            "SELECT id, source_url FROM posts WHERE source = 'inspora' AND tweet_id IS NULL AND source_url LIKE '%/status/%'",
          )
          .all() as { id: string; source_url: string }[],
    );
    const update = yield* database(() => db.prepare('UPDATE posts SET tweet_id = ? WHERE id = ?'));
    yield* Effect.tryPromise({
      try: () =>
        withTransaction(db, () => {
          for (const row of rows) {
            const tweetId = row.source_url.match(/\/status\/(\d+)/)?.[1];
            if (tweetId) update.run(tweetId, row.id);
          }
        }),
      catch: (cause) => databaseError(cause),
    });
    if (rows.length > 0) console.log(`已回填 ${rows.length} 条 inspora 行的原作推文 id`);
  });
}

const program = Effect.gen(function* () {
  if (ONLY && !['inspora', 'bestx', 'collectui'].includes(ONLY)) {
    console.error(`未知来源: ${ONLY}（可选 inspora | bestx | collectui）`);
    process.exitCode = 2;
    return;
  }
  const { db, stmts } = yield* Effect.acquireRelease(
    database(() => openDatabase(DB_PATH)),
    ({ db }) => Effect.sync(() => db.close()),
  );
  yield* backfillTweetIds(db);
  const results = yield* Effect.all(
    sources.map((source) =>
      Effect.gen(function* () {
        console.log(`\n=== 同步源 ${source.name} ===`);
        const result = yield* source.run({ db, stmts });
        console.log(`${source.name} 完成:`, JSON.stringify(result));
        return source.name;
      }).pipe(
        Effect.mapError(
          (error) =>
            new SyncError({ message: `${source.name} 失败: ${error.message}`, cause: error }),
        ),
        Effect.tapError((error) => Effect.sync(() => console.error(error.message))),
      ),
    ),
    { concurrency: 1, mode: 'result' },
  );
  const failed = results.flatMap((result, index) =>
    Result.isFailure(result) ? [sources[index]!.name] : [],
  );
  const total = yield* database(() =>
    db.prepare('SELECT source, COUNT(*) AS c FROM posts GROUP BY source').all(),
  );
  const totalMedia = yield* database(() => db.prepare('SELECT COUNT(*) AS c FROM media').get()!.c);
  console.log(`\n完成。posts=${JSON.stringify(total)} media=${totalMedia}`);
  if (failed.length > 0) {
    return yield* Effect.fail(
      new SyncError({ message: `以下来源未同步成功，下次运行会继续: ${failed.join(', ')}` }),
    );
  }
}).pipe(Effect.scoped);

NodeRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit, onExit) => {
    if (exit._tag === 'Failure') {
      for (const reason of exit.cause.reasons) {
        if (reason._tag === 'Fail') console.error(reason.error);
        if (reason._tag === 'Die') console.error(reason.defect);
      }
      onExit(1);
    } else onExit(Number(process.exitCode ?? 0));
  },
});
