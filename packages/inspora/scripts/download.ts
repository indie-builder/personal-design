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

const attempt = (url: string, tmpPath: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpPath));
    },
    catch: (cause) => new DownloadError({ url, cause }),
  });

export function download(
  url: string,
  absPath: string,
  schedule: typeof defaultRetrySchedule = defaultRetrySchedule,
) {
  return Effect.gen(function* () {
    if (yield* Effect.promise(() => fileNonEmpty(absPath))) return 'skipped' as const;
    yield* Effect.promise(() => mkdir(path.dirname(absPath), { recursive: true }));
    // 写临时文件、成功后原子改名：中断不会留下半截目标文件被下次运行误判为已下载。
    const tmpPath = `${absPath}.part`;
    yield* attempt(url, tmpPath).pipe(
      // 每次失败（含最终失败）先清掉半截临时文件，再按 schedule 重试
      Effect.tapError(() => Effect.promise(() => rm(tmpPath, { force: true }))),
      Effect.retry(schedule),
    );
    yield* Effect.promise(() => rename(tmpPath, absPath));
    return 'downloaded' as const;
  });
}
