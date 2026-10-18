/** inspora 浏览器发现与详情补全；完整读取列表后才写库。 */
import { chromium } from 'playwright';
import type { spawn as Spawn } from 'node:child_process';
import { Data, Effect, Result } from 'effect';
import {
  collectFeed,
  FeedError,
  extractInitialPage,
  extractDetailPost,
  type InsporaPost,
} from './sync-source.ts';
import { withTransaction, database, databaseError, type Db } from './db.ts';
import { tweetIdOf } from './source-bestx.ts';
import { defaultRetrySchedule } from './download.ts';

const SITE = 'https://www.inspora.design';

const EGO_TASK = '灵感集数据同步';

export class InsporaError extends Data.TaggedError('Inspora')<{
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

function egoScript(script: string, spawn: typeof Spawn) {
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
function verifiedFetch(url: string, state: BrowserState, spawn: typeof Spawn) {
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
    const { stdout, stderr } = yield* egoScript(script, spawn).pipe(
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
  spawn: typeof Spawn,
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
    if (response.challenge === 'challenge') response = yield* verifiedFetch(url, state, spawn);
    return response;
  });
}

export function syncInsporaPosts(
  { db, stmts, full, maxPages }: Db & { full: boolean; maxPages: number },
  spawn: typeof Spawn,
) {
  return Effect.gen(function* () {
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
                spawn,
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
            const response = yield* fetchPage(page, url, state, spawn).pipe(
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
              stmts.upsertPost({
                id: item.id,
                slug: item.slug,
                title: item.title,
                creatorName: item.creator?.name,
                createdAt: item.createdAt,
                isFeatured: item.isFeatured,
              });
              for (const [pos, media] of (item.media ?? []).entries()) {
                stmts.upsertMedia({
                  ...media,
                  postId: item.id,
                  position: media.position ?? pos,
                  raw: media,
                });
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
          const response = yield* fetchPage(page, `/posts/${slug}`, state, spawn, {
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
          if (!detail) return yield* Effect.fail(new InsporaError({ message: '详情对象提取失败' }));
          yield* database(() => {
            stmts.upsertPost({
              ...detail,
              id: postId,
              slug: detail.slug ?? slug,
              title: detail.title ?? '',
              creatorName: detail.creator?.name,
              creatorUrl: detail.creator?.url,
              raw: detail,
              enrichedAt: new Date().toISOString(),
              tweetId: tweetIdOf(detail.sourceUrl),
            });
            // 详情里的 media 字段更全（sizeBytes / mimeType），覆盖一次
            for (const [pos, media] of (detail.media ?? []).entries()) {
              stmts.upsertMedia({
                ...media,
                postId,
                position: media.position ?? pos,
                raw: media,
              });
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
}
