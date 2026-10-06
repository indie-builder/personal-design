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
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok || !res.body)
        throw new DownloadError({ url, cause: new Error(`HTTP ${res.status}`) });
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpPath));
      await rename(tmpPath, absPath);
    },
    catch: (cause) => downloadError(url, cause),
  });

export function download(
  url: string,
  absPath: string,
  schedule: typeof defaultRetrySchedule = defaultRetrySchedule,
) {
  return Effect.gen(function* () {
    if (yield* Effect.promise(() => fileNonEmpty(absPath))) return 'skipped' as const;
    yield* fileOperation(url, () => mkdir(path.dirname(absPath), { recursive: true }));
    // 写临时文件、成功后原子改名：中断不会留下半截目标文件被下次运行误判为已下载。
    const tmpPath = `${absPath}.part`;
    yield* attempt(url, tmpPath, absPath).pipe(
      // 每次失败（含最终失败）先清掉半截临时文件，再按 schedule 重试
      Effect.tapError(() => fileOperation(url, () => rm(tmpPath, { force: true }))),
      Effect.retry(schedule),
    );
    return 'downloaded' as const;
  });
}
