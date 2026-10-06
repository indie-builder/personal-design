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
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { Data, Effect, Result } from 'effect';
import {
  collectFeed,
  FeedError,
  extractInitialPage,
  extractDetailPost,
  type InsporaPost,
} from './sync-source.ts';
import { withTransaction, database, databaseError, type Db } from './db.ts';
import { download, extOf, defaultRetrySchedule } from './download.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/web/public/inspora');
const SITE = 'https://www.inspora.design';

const EGO_TASK = '灵感集数据同步';

class InsporaError extends Data.TaggedError('Inspora')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface BrowserResponse {
  status: number;
  challenge: string | null;
  body: string;
}

interface BrowserState {
  usedEgo: boolean;
  egoFailed: boolean;
}

function requestError(cause: unknown) {
  if (
    !(cause instanceof Error) ||
    cause.name === 'AssertionError' ||
    cause instanceof TypeError ||
    cause instanceof ReferenceError ||
    cause instanceof SyntaxError ||
    cause instanceof RangeError
  )
    throw cause;
  return new InsporaError({ message: cause.message, cause });
}

const request = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => requestError(cause),
  });

function egoScript(script: string) {
  return Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const child = spawn(
          '/bin/zsh',
          ['-c', `ego-browser nodejs <<'EGO_SYNC_SCRIPT'\n${script}\nEGO_SYNC_SCRIPT`],
          { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let failure: Error | undefined;
        let stopped = false;
        const stop = () => {
          if (stopped || child.pid === undefined) return;
          stopped = true;
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error)) throw error;
            if (error.code !== 'ESRCH') failure = error;
          }
        };
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          failure = new Error('ego-browser 请求超时');
          stop();
        }, 90000);
        const append = (chunk: string, output: 'stdout' | 'stderr') => {
          if (output === 'stdout') stdout += chunk;
          else stderr += chunk;
          if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 10 * 1024 * 1024) {
            failure = new Error('ego-browser 输出超过 maxBuffer');
            stop();
          }
        };
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => append(chunk, 'stdout'));
        child.stderr.on('data', (chunk: string) => append(chunk, 'stderr'));
        child.once('error', (error) => {
          failure = error;
        });
        const closed = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          child.once('close', (code, signal) => {
            clearTimeout(timer);
            if (failure) reject(failure);
            else if (code !== 0) reject(new Error(`Command failed: ${signal ?? code}\n${stderr}`));
            else resolve({ stdout, stderr });
          });
        });
        // Rejections are consumed by the Effect below, including when interruption wins the race.
        void closed.catch(() => {});
        return { stop, closed, child };
      }),
      ({ stop, closed, child }) =>
        Effect.promise(async () => {
          try {
            if (child.exitCode === null && child.signalCode === null) stop();
          } finally {
            await closed.then(
              () => undefined,
              () => undefined,
            );
          }
        }),
    );
    return yield* Effect.tryPromise({
      try: (signal) => {
        signal.addEventListener('abort', () => resource.stop(), { once: true });
        return resource.closed;
      },
      catch: (cause) => requestError(cause),
    });
  }).pipe(Effect.scoped);
}

const parse = <A>(run: () => A) =>
  Effect.try({
    try: () => run(),
    catch: (cause) => {
      if (!(cause instanceof SyntaxError) && !(cause instanceof FeedError)) throw cause;
      return new InsporaError({ message: cause.message, cause });
    },
  });

// 无头 Chromium 无法完成校验时，使用项目指定的正常浏览器会话。
function verifiedFetch(url: string, state: BrowserState) {
  return Effect.gen(function* () {
    state.usedEgo = true;
    const expression = `(async () => { const res = await fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(30000) }); return { status: res.status, challenge: res.headers.get('x-vercel-mitigated'), body: await res.text() }; })()`;
    const script = `await useOrCreateTaskSpace(${JSON.stringify(EGO_TASK)});
await openOrReuseTab(${JSON.stringify(SITE)}, { wait: true, timeout: 30 });
let response = await js(${JSON.stringify(expression)});
if (response.challenge === 'challenge') {
  await gotoAndWait(${JSON.stringify(SITE + url)}, { timeout: 30 });
  await wait(5);
  response = await js(${JSON.stringify(expression)});
}
cliLog('SYNC_RESULT:' + JSON.stringify(response));`;
    const { stdout, stderr } = yield* egoScript(script).pipe(
      Effect.catchTag('Inspora', (error) => {
        // 失去会话控制时立即停止；不重试或主动收回用户的浏览器。
        state.egoFailed = true;
        return Effect.fail(
          new InsporaError({
            message: 'ego-browser 会话不可用或控制权已改变；同步已停止，请检查浏览器后重试',
            cause: error,
          }),
        );
      }),
    );
    const result = `${stdout}\n${stderr}`
      .split('\n')
      .find((line) => line.startsWith('SYNC_RESULT:'));
    if (!result) {
      state.egoFailed = true;
      return yield* Effect.fail(
        new InsporaError({
          message: 'ego-browser 会话不可用或控制权已改变；同步已停止，请检查浏览器后重试',
        }),
      );
    }
    return yield* parse(
      () => JSON.parse(result.slice('SYNC_RESULT:'.length)) as BrowserResponse,
    ).pipe(
      Effect.catchTag('Inspora', (error) => {
        state.egoFailed = true;
        return Effect.fail(
          new InsporaError({
            message: 'ego-browser 会话不可用或控制权已改变；同步已停止，请检查浏览器后重试',
            cause: error,
          }),
        );
      }),
    );
  });
}

function fetchPage(
  page: import('playwright').Page,
  url: string,
  state: BrowserState,
  headers?: Record<string, string>,
) {
  return Effect.gen(function* () {
    let response = yield* request(() =>
      page.evaluate(
        async ({ url, headers }) => {
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
          return {
            status: res.status,
            challenge: res.headers.get('x-vercel-mitigated'),
            body: await res.text(),
          };
        },
        { url, headers },
      ),
    );
    if (response.challenge === 'challenge') response = yield* verifiedFetch(url, state);
    return response;
  });
}

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

    const { newPosts, enriched, toEnrich } = yield* Effect.gen(function* () {
      let closeError: InsporaError | undefined;
      const browserResult = yield* Effect.gen(function* () {
        const state: BrowserState = { usedEgo: false, egoFailed: false };
        const { browser } = yield* Effect.acquireRelease(
          request(() => chromium.launch({ headless: true })).pipe(
            Effect.map((browser) => ({ browser, state })),
          ),
          ({ browser, state }) =>
            Effect.gen(function* () {
              yield* request(() => browser.close()).pipe(
                Effect.catchTag('Inspora', (error) =>
                  Effect.sync(() => {
                    closeError = error;
                  }),
                ),
              );
              if (state.usedEgo && !state.egoFailed) {
                yield* egoScript(
                  `cliLog(await completeTaskSpace(${JSON.stringify(EGO_TASK)}, { keep: false }));`,
                ).pipe(
                  Effect.catchTag('Inspora', (error) =>
                    Effect.sync(() => console.warn(`ego-browser 清理失败: ${error.message}`)),
                  ),
                );
              }
            }),
        );
        const page = yield* request(() => browser.newPage());
        yield* request(() =>
          page.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }),
        );
        const title = yield* request(() => page.title());
        if (/checkpoint|security/i.test(title)) {
          return yield* Effect.fail(
            new InsporaError({ message: `未通过 Vercel checkpoint（标题: ${title}），请稍后重试` }),
          );
        }
        console.log(`已进入站点（${title}）`);

        // 分类从实际导航读取，避免上游新增分类时静默漏同步。
        const categories = yield* request(() =>
          page
            .locator('a[href*="category="]')
            .evaluateAll((links) => [
              ...new Set(
                links
                  .map((link) =>
                    new URL((link as { href: string }).href).searchParams.get('category'),
                  )
                  .filter((category): category is string => Boolean(category)),
              ),
            ]),
        );
        if (categories.length === 0)
          return yield* Effect.fail(
            new InsporaError({ message: '未找到分类导航，停止同步以避免漏数据' }),
          );
        // 增量只对比本源的 id：另一个源的作品与这里无关
        const knownIds = new Set(
          yield* database(() =>
            db
              .prepare("SELECT id FROM posts WHERE source = 'inspora'")
              .all()
              .map((row) => row.id as string),
          ),
        );
        const feed = yield* collectFeed(
          categories,
          knownIds,
          (category, cursor) =>
            Effect.gen(function* () {
              const query = new URLSearchParams({ category, view: 'latest' });
              if (cursor) query.set('cursor', cursor);
              const url = `${cursor ? '/api/posts' : '/'}?${query}`;
              const response = yield* fetchPage(page, url, state).pipe(
                Effect.flatMap((response) =>
                  response.status === 200
                    ? Effect.succeed(response)
                    : Effect.fail(
                        new InsporaError({
                          message: `${category}: HTTP ${response.status}${response.challenge === 'challenge' ? ' Vercel checkpoint' : ''}，分类列表未完整读取，未写入新增作品`,
                        }),
                      ),
                ),
                Effect.retry({ schedule: defaultRetrySchedule, while: () => !state.egoFailed }),
              );
              const data = yield* parse(() =>
                cursor
                  ? (JSON.parse(response.body) as import('./sync-source.ts').FeedPage<InsporaPost>)
                  : extractInitialPage<InsporaPost>(response.body),
              );
              if (!data || !Array.isArray(data.items))
                return yield* Effect.fail(new FeedError({ message: `${category}: 列表数据无效` }));
              console.log(`分类 ${category}${cursor ? ' 翻页' : ' 首屏'}: ${data.items.length} 条`);
              yield* Effect.sleep(300);
              return data;
            }),
          { full, maxPages },
        );

        let newPosts = 0;
        yield* Effect.tryPromise({
          try: () =>
            withTransaction(db, () => {
              for (const item of feed) {
                const isNew = !stmts.hasPost.get(item.id);
                stmts.upsertPost.run(
                  item.id,
                  item.slug,
                  item.title,
                  item.creator?.name ?? null,
                  null, // creator_url 只有详情页有
                  null, // creator_avatar 下载阶段回填
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  item.createdAt,
                  null,
                  item.isFeatured ? 1 : 0,
                  null, // raw_json 等详情补全
                  null, // enriched_at
                  new Date().toISOString(),
                  'inspora',
                  null, // tweet_id 详情补全时从 source_url 提取
                );
                for (const [pos, media] of (item.media ?? []).entries()) {
                  stmts.upsertMedia.run(
                    media.id,
                    item.id,
                    media.position ?? pos,
                    media.type,
                    media.url,
                    media.posterUrl ?? null,
                    media.width ?? null,
                    media.height ?? null,
                    media.sizeBytes ?? null,
                    media.alt ?? null,
                    null,
                    null,
                    null,
                    JSON.stringify(media),
                  );
                }
                if (isNew) newPosts++;
              }
            }),
          catch: (cause) => databaseError(cause),
        });
        console.log(`feed 同步完成，新增 ${newPosts} 条`);

        // 2. 详情补全（含 category / description / sourceUrl / 完整 raw_json）
        const toEnrich = yield* database(() => stmts.needsEnrich.all() as { slug: string }[]);
        console.log(`待补全详情: ${toEnrich.length} 条`);
        const idBySlug = new Map<string, string>();
        {
          const rows = yield* database(() =>
            db.prepare("SELECT id, slug FROM posts WHERE source = 'inspora'").all(),
          );
          for (const r of rows) idBySlug.set(r.slug as string, r.id as string);
        }
        let enriched = 0;
        for (const { slug } of toEnrich) {
          const postId = idBySlug.get(slug)!;
          yield* Effect.gen(function* () {
            const response = yield* fetchPage(page, `/posts/${slug}`, state, {
              accept: 'text/html',
            }).pipe(
              Effect.flatMap((response) =>
                response.status === 200
                  ? Effect.succeed(response)
                  : Effect.fail(
                      new InsporaError({
                        message: `HTTP ${response.status}${response.challenge ? ' Vercel checkpoint' : ''}`,
                      }),
                    ),
              ),
              Effect.retry({ schedule: defaultRetrySchedule, while: () => !state.egoFailed }),
            );
            const html = response.body;
            const detail = yield* parse(() => html && extractDetailPost(html, postId));
            if (!detail)
              return yield* Effect.fail(new InsporaError({ message: '详情对象提取失败' }));
            yield* database(() => {
              stmts.upsertPost.run(
                postId,
                detail.slug ?? slug,
                detail.title ?? '',
                detail.creator?.name ?? null,
                detail.creator?.url ?? null,
                null,
                detail.description ?? null,
                detail.category ?? null,
                detail.industries ? JSON.stringify(detail.industries) : null,
                detail.colors ? JSON.stringify(detail.colors) : null,
                detail.styles ? JSON.stringify(detail.styles) : null,
                detail.sourceUrl ?? null,
                detail.createdAt,
                detail.publishedAt ?? null,
                detail.isFeatured ? 1 : 0,
                JSON.stringify(detail),
                new Date().toISOString(),
                new Date().toISOString(),
                'inspora',
                // source_url 多为 X 原帖链接，提取推文 id 供跨源去重
                detail.sourceUrl?.match(/\/status\/(\d+)/)?.[1] ?? null,
              );
              // 详情里的 media 字段更全（sizeBytes / mimeType），覆盖一次
              for (const [pos, media] of (detail.media ?? []).entries()) {
                stmts.upsertMedia.run(
                  media.id,
                  postId,
                  media.position ?? pos,
                  media.type,
                  media.url,
                  media.posterUrl ?? null,
                  media.width ?? null,
                  media.height ?? null,
                  media.sizeBytes ?? null,
                  media.alt ?? null,
                  null,
                  null,
                  null,
                  JSON.stringify(media),
                );
              }
            });
            enriched++;
            if (enriched % 20 === 0) console.log(`  详情进度 ${enriched}/${toEnrich.length}`);
          }).pipe(
            Effect.catchTag(['Inspora', 'Database'], (err) => {
              if (state.egoFailed) return Effect.fail(err);
              return Effect.sync(() =>
                console.warn(`  ✗ 详情 ${slug}: ${err.message}（下次同步会重试）`),
              );
            }),
          );
          yield* Effect.sleep(300);
        }
        console.log(`详情补全完成: ${enriched}/${toEnrich.length}`);
        return { newPosts, enriched, toEnrich };
      }).pipe(Effect.scoped, Effect.result);
      if (closeError) return yield* Effect.fail(closeError);
      if (Result.isFailure(browserResult)) return yield* Effect.fail(browserResult.failure);
      return browserResult.success;
    });

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
