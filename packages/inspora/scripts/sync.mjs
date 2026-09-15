/**
 * 灵感集同步入口 —— 一条管线适配两类数据源：
 *
 * - inspora：inspora.design（列表/详情走 RSC 抓取，需 Playwright，
 *   Vercel checkpoint 时回退 ego-browser），媒体只下缩略图/海报/头像。
 *   见 scripts/source-inspora.mjs。
 * - bestx：Best Designs on X（bestdesignsonx.com，公开 Supabase REST +
 *   CDN 热链，无需浏览器、无本地媒体）。见 scripts/source-bestx.mjs。
 *
 * 两源互相独立：一个失败不影响另一个写入；同一原作（X 推文）被两源
 * 同时收录时，读取侧（src/index.ts）只展示 inspora 版本。
 *
 * 用法：
 *   node scripts/sync.mjs                      # 两个源都增量（日常）
 *   node scripts/sync.mjs --full               # 两个源全量 backfill（首次）
 *   node scripts/sync.mjs --source=bestx       # 只跑一个源（inspora | bestx）
 *   node scripts/sync.mjs --max-pages N        # inspora 分类翻页上限（调试）
 */
import { openDatabase } from './db.mjs';
import { syncInspora } from './source-inspora.mjs';
import { syncBestx } from './source-bestx.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(PKG_ROOT, 'inspora.db');

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const maxPagesIdx = args.indexOf('--max-pages');
const MAX_PAGES = maxPagesIdx >= 0 ? Number(args[maxPagesIdx + 1]) : Infinity;
const sourceIdx = args.findIndex((arg) => arg.startsWith('--source='));
const ONLY = sourceIdx >= 0 ? args[sourceIdx].split('=')[1] : null;
if (ONLY && !['inspora', 'bestx'].includes(ONLY)) {
  console.error(`未知来源: ${ONLY}（可选 inspora | bestx）`);
  process.exit(2);
}

const sources = [
  { name: 'bestx', run: ({ db, stmts }) => syncBestx({ db, stmts, full: FULL }) },
  {
    name: 'inspora',
    run: ({ db, stmts }) => syncInspora({ db, stmts, full: FULL, maxPages: MAX_PAGES }),
  },
].filter((source) => !ONLY || source.name === ONLY);

const { db, stmts } = openDatabase(DB_PATH);
const failed = [];

/** 老的 inspora 行详情补全时才会写 tweet_id；每次同步前从 source_url 直接补齐，跨源去重才能覆盖存量 */
function backfillTweetIds() {
  const rows = db
    .prepare(
      "SELECT id, source_url FROM posts WHERE source = 'inspora' AND tweet_id IS NULL AND source_url LIKE '%/status/%'",
    )
    .all();
  const update = db.prepare('UPDATE posts SET tweet_id = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const tweetId = row.source_url.match(/\/status\/(\d+)/)?.[1];
      if (tweetId) update.run(tweetId, row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (rows.length > 0) console.log(`已回填 ${rows.length} 条 inspora 行的原作推文 id`);
}

try {
  backfillTweetIds();
  for (const source of sources) {
    console.log(`\n=== 同步源 ${source.name} ===`);
    try {
      const result = await source.run({ db, stmts });
      console.log(`${source.name} 完成:`, JSON.stringify(result));
    } catch (error) {
      // 单源失败只记下，另一个源继续；最后统一以非零退出
      failed.push(source.name);
      console.error(`${source.name} 失败: ${error.message}`);
    }
  }
  const total = db.prepare('SELECT source, COUNT(*) AS c FROM posts GROUP BY source').all();
  const totalMedia = db.prepare('SELECT COUNT(*) AS c FROM media').get().c;
  console.log(`\n完成。posts=${JSON.stringify(total)} media=${totalMedia}`);
  if (failed.length > 0) {
    throw new Error(`以下来源未同步成功，下次运行会继续: ${failed.join(', ')}`);
  }
} finally {
  db.close();
}
