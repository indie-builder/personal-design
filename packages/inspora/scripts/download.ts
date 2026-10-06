/** 同步共用的媒体下载工具（仅 inspora 源需要本地副本；bestx 全量热链）。 */
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { Data, Effect, Schedule } from 'effect';

export const extOf = (url: string) => path.extname(new URL(url).pathname) || '';

class DownloadError extends Data.TaggedError('Download')<{
  readonly url: string;
  readonly cause: unknown;
}> {}

/** 默认共 3 次尝试、指数退避（1s、2s）；测试注入无等待的 schedule。 */
export const defaultRetrySchedule = Schedule.exponential(1000, 2).pipe(Schedule.upTo({ times: 2 }));

async function fileNonEmpty(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

function downloadError(url: string, cause: unknown): DownloadError {
  if (cause instanceof DownloadError) return cause;
  if (
    !(cause instanceof Error) ||
    cause.name === 'AssertionError' ||
    cause instanceof ReferenceError ||
    cause instanceof RangeError ||
    cause instanceof SyntaxError ||
    (cause instanceof TypeError &&
      cause.message !== 'fetch failed' &&
      !('code' in cause && cause.code === 'ERR_INVALID_URL'))
  )
    throw cause;
  const code = 'code' in cause ? String(cause.code) : '';
  if (code.startsWith('ERR_') && !['ERR_INVALID_URL', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code))
    throw cause;
  return new DownloadError({ url, cause });
}

const fileOperation = <A>(url: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => downloadError(url, cause),
  });

const attempt = (url: string, tmpPath: string, absPath: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      // 传输与 fiber 中断联动：释放时 abort 底层请求、等它退出并清理 .part，
      // 被取消的下载绝不发布目标文件（rename 在作用域内、取消后不会执行）。
      const transfer = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController();
          const done = (async () => {
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
            const res = await fetch(url, { signal });
            if (!res.ok || !res.body)
              throw new DownloadError({ url, cause: new Error(`HTTP ${res.status}`) });
            await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpPath), { signal });
          })();
          return { controller, done };
        }),
        ({ controller, done }) =>
          Effect.promise(async () => {
            controller.abort();
            await Promise.allSettled([done]);
            await rm(tmpPath, { force: true });
          }),
      );
      yield* Effect.tryPromise({
        try: () => transfer.done,
        catch: (cause) => downloadError(url, cause),
      });
      yield* fileOperation(url, () => rename(tmpPath, absPath));
    }),
  );

export function download(
  url: string,
  absPath: string,
  schedule: typeof defaultRetrySchedule = defaultRetrySchedule,
) {
  return Effect.gen(function* () {
    if (yield* Effect.promise(() => fileNonEmpty(absPath))) return 'skipped' as const;
    yield* fileOperation(url, () => mkdir(path.dirname(absPath), { recursive: true }));
    // 写临时文件、成功后原子改名：中断不会留下半截目标文件被下次运行误判为已下载。
    // 每次尝试自带清理（失败/中断/成功路径由 attempt 的 release 统一负责），再按 schedule 重试。
    yield* attempt(url, `${absPath}.part`, absPath).pipe(Effect.retry(schedule));
    return 'downloaded' as const;
  });
}
