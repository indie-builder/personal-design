/** 同步共用的媒体下载工具（仅 inspora 源需要本地副本；bestx 全量热链）。 */
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const extOf = (url) => path.extname(new URL(url).pathname) || '';

export async function fileNonEmpty(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

export async function download(url, absPath, retries = 3) {
  if (await fileNonEmpty(absPath)) return 'skipped';
  await mkdir(path.dirname(absPath), { recursive: true });
  // 写临时文件、成功后原子改名：中断不会留下半截目标文件被下次运行误判为已下载。
  const tmpPath = `${absPath}.part`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpPath));
      await rename(tmpPath, absPath);
      return 'downloaded';
    } catch (err) {
      await rm(tmpPath, { force: true });
      if (attempt === retries) throw err;
      await sleep(1000 * attempt);
    }
  }
}

/** 简单并发池 */
export async function pool(items, concurrency, fn) {
  const results = { downloaded: 0, skipped: 0, failed: 0 };
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          const r = await fn(item);
          results[r] = (results[r] ?? 0) + 1;
        } catch (err) {
          results.failed++;
          console.warn(`  ✗ ${item.url ?? item.avatar_url}: ${err.message}`);
        }
      }
    }),
  );
  return results;
}
