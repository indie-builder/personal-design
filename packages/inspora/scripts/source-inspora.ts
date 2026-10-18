/**
 * inspora.design 增量同步源（原 sync.ts 主流程，逻辑保持不变）。
 *
 * 数据源（均已实测）：
 * - 列表：公开分类页 HTML 的 RSC initialPage，16 条/页，按 createdAt 倒序。
 *   /api/posts 即使在正常浏览器中也可能返回 Vercel checkpoint（HTTP 429）；
 *   优先逐分类读取首屏，只有未遇到旧作品时才请求 API 翻页，失败则不写入列表。
 *   无头浏览器遇到校验时使用 ego-browser 正常会话（本机需运行 ego lite）。
 * - 详情：无 API，抓取 `/posts/<slug>` 的 HTML，从 RSC payload
 *   （self.__next_f.push）里提取含 sourceUrl 的完整帖子对象
 *   （description / category / industries / colors / styles / sourceUrl …）。
 * - 媒体：`media.inspora.design`（Cloudflare R2）直链无防护。只下载
 *   海报/缩略图/头像入库；大图与视频不入库，web 端热链原站，
 *   包查询 API 按本地文件存在性自动优先本地副本。
 *
 * 增量逻辑：各分类遇到「本次运行前已入库的 post id」即停；先完整发现再写库；
 * 详情只在 enriched_at 为空时补抓；媒体文件已存在且非空即跳过。可随时中断，下次接着跑。
 */
import { spawn } from 'node:child_process';
import { Effect, Result } from 'effect';
import { database, type Db } from './db.ts';
import { InsporaError, syncInsporaPosts } from './inspora-browser.ts';
import { download, extOf } from './download.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/web/public/inspora');
const mediaUrl = <A>(run: () => A) =>
  Effect.try({
    try: () => run(),
    catch: (cause) => {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ERR_INVALID_URL')
        throw cause;
      return new InsporaError({ message: cause.message, cause });
    },
  });

function downloadAll<A extends { url?: string; avatar_url?: string }, E>(
  items: A[],
  run: (item: A) => Effect.Effect<'downloaded' | 'skipped', E>,
) {
  return Effect.gen(function* () {
    const outcomes = yield* Effect.all(
      items.map((item) =>
        run(item).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              const cause = error instanceof Error && 'cause' in error ? error.cause : error;
              console.warn(
                `  ✗ ${item.url ?? item.avatar_url}: ${cause instanceof Error ? cause.message : String(cause)}`,
              );
            }),
          ),
        ),
      ),
      { concurrency: 6, mode: 'result' },
    );
    const results = { downloaded: 0, skipped: 0, failed: 0 };
    for (const outcome of outcomes) {
      if (Result.isFailure(outcome)) results.failed++;
      else results[outcome.success]++;
    }
    return results;
  });
}

export function syncInspora({
  db,
  stmts,
  full = false,
  maxPages = Infinity,
}: Db & { full?: boolean; maxPages?: number }) {
  return Effect.gen(function* () {
    console.log(
      `模式: ${full ? '全量 backfill' : '增量'}${maxPages < Infinity ? `（最多 ${maxPages} 页）` : ''}`,
    );

    const { newPosts, enriched, toEnrich } = yield* syncInsporaPosts(
      { db, stmts, full, maxPages },
      spawn,
    );

    // 3. 媒体下载（R2 直链，无需浏览器）——只下载海报/缩略图；
    //    大图与视频热链原站（src/index.ts 查询时按本地文件存在性回退）
    const mediaRows = yield* database(
      () =>
        stmts.mediaNeedingDownload.all() as {
          id: string;
          type: string;
          url: string;
          poster_url: string;
          raw_json: string;
        }[],
    );
    console.log(`待下载媒体: ${mediaRows.length} 个`);
    const mediaResults = yield* downloadAll(mediaRows, (m) =>
      Effect.gen(function* () {
        if (m.type === 'video') {
          const relP = yield* mediaUrl(() => `posters/${m.id}${extOf(m.poster_url)}`);
          const r = yield* download(m.poster_url, path.join(PUBLIC_DIR, relP));
          yield* database(() =>
            stmts.updateMediaPaths.run(null, `/inspora/${relP}`, `/inspora/${relP}`, m.id),
          );
          return r;
        }
        // image：只留最小 variant 作缩略图，原图热链
        let thumbUrl = m.url;
        try {
          const variants = JSON.parse(m.raw_json)?.variants as
            | { bytes: number; url: string }[]
            | undefined;
          if (Array.isArray(variants) && variants.length > 0) {
            thumbUrl = variants.reduce((a, b) => (a.bytes <= b.bytes ? a : b)).url;
          }
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        const relT = yield* mediaUrl(() => `thumbnails/${m.id}${extOf(thumbUrl)}`);
        const r = yield* download(thumbUrl, path.join(PUBLIC_DIR, relT));
        yield* database(() => stmts.updateMediaPaths.run(null, null, `/inspora/${relT}`, m.id));
        return r;
      }),
    );
    console.log(`媒体下载: ${JSON.stringify(mediaResults)}`);

    // 4. 作者头像
    const avatars = yield* database(
      () =>
        stmts.creatorsNeedingAvatar.all() as {
          avatar_url: string;
          creator_name: string;
        }[],
    );
    let avatarFailed = 0;
    if (avatars.length > 0) {
      const avatarResults = yield* downloadAll(avatars, (a) =>
        Effect.gen(function* () {
          const rel = yield* mediaUrl(
            () => `avatars/${path.basename(new URL(a.avatar_url).pathname)}`,
          );
          const r = yield* download(a.avatar_url, path.join(PUBLIC_DIR, rel));
          yield* database(() => stmts.updateAvatar.run(`/inspora/${rel}`, a.creator_name));
          return r;
        }),
      );
      console.log(`头像下载: ${JSON.stringify(avatarResults)}`);
      avatarFailed = avatarResults.failed;
    }

    const total = yield* database(
      () => db.prepare("SELECT COUNT(*) AS c FROM posts WHERE source = 'inspora'").get()!.c,
    );
    const totalMedia = yield* database(
      () =>
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM media WHERE post_id IN (SELECT id FROM posts WHERE source = 'inspora')",
          )
          .get()!.c,
    );
    console.log(`inspora 完成。posts=${total} media=${totalMedia}`);
    if (enriched < toEnrich.length || mediaResults.failed > 0 || avatarFailed > 0) {
      return yield* Effect.fail(
        new InsporaError({ message: '详情、媒体或头像未全部同步成功，下次增量会继续补齐' }),
      );
    }
    return { newPosts, enriched, mediaResults, avatarFailed };
  });
}
