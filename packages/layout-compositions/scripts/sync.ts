#!/usr/bin/env node
/**
 * 同步上游 350-layout-compositions 的图片资产。
 * tarball 与解压目录可复用，已有非空 WebP 跳过。
 * 默认从 PNG 生成 720px / q82 缩略图，--with-images 另生成无损高清图。
 * corrections.json 修正上游 v2 图文错位，以 v1 补齐缺图；missing 条目保留。
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Data, Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import type { LayoutItem } from '../src/index.ts';
import { downloadTarball } from './download.ts';

class SyncStepError extends Data.TaggedError('SyncStep')<{
  readonly step: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

class ConversionFailures extends Data.TaggedError('ConversionFailures')<{
  readonly count: number;
  readonly message: string;
}> {}

type Corrections = Record<string, { v2?: string; v1?: string; missing?: boolean }>;
type ConversionResult = 'converted' | 'skipped' | 'missing' | 'failed';
type Source = { image: string; sha256: string | null };

const step = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) =>
      new SyncStepError({
        step: name,
        cause,
        message: `${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const execFileAsync = promisify(execFile);
const pkgDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const upstreamDir = path.join(pkgDir, '.upstream');
const tarballPath = path.join(upstreamDir, 'repo.tar.gz');
const extractDir = path.join(upstreamDir, 'extracted');
const outBase = path.resolve(pkgDir, '../../apps/web/public/layout-compositions');
const TARBALL_URL =
  'https://codeload.github.com/nevertoday/350-layout-compositions/tar.gz/refs/heads/main';
const CONCURRENCY = 8;
const WITH_IMAGES = process.argv.includes('--with-images');

function resolveSource(
  item: LayoutItem,
  corrections: Corrections,
  catalogById: Map<string, LayoutItem>,
) {
  return Effect.gen(function* () {
    const correction = corrections[item.id];
    if (!correction) return { image: item.image, sha256: item.sha256 } satisfies Source;
    if (correction.missing) return null;
    if (correction.v1) {
      return { image: path.join('images', `layout-${correction.v1}.png`), sha256: null };
    }
    const source = correction.v2 ? catalogById.get(correction.v2) : undefined;
    if (!source) {
      return yield* Effect.fail(
        new SyncStepError({
          step: 'corrections',
          cause: correction,
          message: `corrections.json: ${item.id} 引用了不存在的文件 ${correction.v2}`,
        }),
      );
    }
    return { image: source.image, sha256: source.sha256 } satisfies Source;
  });
}

const prepareTarball = Effect.gen(function* () {
  const size = yield* step('stat:tarball', async () =>
    existsSync(tarballPath) ? statSync(tarballPath).size : 0,
  );
  if (size > 1024 * 1024) {
    console.log(`[sync] 复用已下载的 tarball (${(size / 1e6).toFixed(0)}MB)`);
    return;
  }
  yield* step('mkdir:upstream', () => mkdir(upstreamDir, { recursive: true }));
  console.log('[sync] 下载上游 tarball (~700MB) ...');
  yield* downloadTarball(TARBALL_URL, tarballPath);
  console.log('[sync] 下载完成');
});

const extractTarball = Effect.gen(function* () {
  const extracted = yield* step(
    'stat:extracted',
    async () => existsSync(extractDir) && readdirSync(extractDir).length > 0,
  );
  if (extracted) {
    console.log('[sync] 复用已解压的上游仓库');
    return;
  }
  yield* step('mkdir:extracted', () => mkdir(extractDir, { recursive: true }));
  console.log('[sync] 解压 tarball ...');
  yield* Effect.tryPromise({
    try: (signal) => execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDir], { signal }),
    catch: (cause) =>
      new SyncStepError({ step: 'tar', cause, message: `解压失败: ${String(cause)}` }),
  });
  console.log('[sync] 解压完成');
});

function sha256(filePath: string) {
  return Effect.scoped(
    Effect.gen(function* () {
      const stream = yield* Effect.acquireRelease(
        Effect.sync(() => createReadStream(filePath)),
        (stream) => Effect.sync(() => stream.destroy()),
      );
      return yield* step(`sha256:${filePath}`, async () => {
        const hash = createHash('sha256');
        for await (const chunk of stream) hash.update(chunk);
        return hash.digest('hex');
      });
    }),
  );
}

function writeWebp(srcImage: string, output: string, thumbnail: boolean) {
  const tmpPath = `${output}.part`;
  return Effect.scoped(
    Effect.gen(function* () {
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const image = sharp(srcImage);
          if (thumbnail) image.resize({ width: 720 }).webp({ quality: 82 });
          else image.webp({ lossless: true });
          return { image, transfer: image.toFile(tmpPath) };
        }),
        ({ image, transfer }) =>
          step(`cleanup:${output}`, async () => {
            image.destroy();
            await Promise.allSettled([transfer]);
            await rm(tmpPath, { force: true });
          }).pipe(Effect.orDie),
      );
      yield* step(`webp:${output}`, () => resource.transfer);
      // 中断不会留下被“存在且非空”判定为已完成的截断图。
      yield* step(`rename:${output}`, () => rename(tmpPath, output));
    }),
  );
}

function convertOne(
  root: string,
  item: LayoutItem,
  corrections: Corrections,
  catalogById: Map<string, LayoutItem>,
): Effect.Effect<ConversionResult, SyncStepError> {
  return Effect.gen(function* () {
    const source = yield* resolveSource(item, corrections, catalogById);
    if (!source) return 'missing' as const;
    const imageOut = path.join(outBase, 'images', item.category_slug, `${item.id}.webp`);
    const thumbOut = path.join(outBase, 'thumbnails', item.category_slug, `${item.id}.webp`);
    const { imageDone, thumbDone } = yield* step(`stat:${item.id}`, async () => ({
      imageDone: !WITH_IMAGES || (existsSync(imageOut) && statSync(imageOut).size > 0),
      thumbDone: existsSync(thumbOut) && statSync(thumbOut).size > 0,
    }));
    if (imageDone && thumbDone) return 'skipped' as const;
    const srcImage = path.join(root, source.image);
    if (source.sha256) {
      const digest = yield* sha256(srcImage);
      if (digest !== source.sha256) {
        return yield* Effect.fail(
          new SyncStepError({
            step: `sha256:${item.id}`,
            cause: { expected: source.sha256, actual: digest },
            message: `sha256 校验失败: ${item.id} ${item.name} (${digest} != ${source.sha256})`,
          }),
        );
      }
    }
    yield* step(`mkdir:${item.id}`, async () => {
      await mkdir(path.dirname(imageOut), { recursive: true });
      await mkdir(path.dirname(thumbOut), { recursive: true });
    });
    const jobs = [];
    if (!imageDone) jobs.push(writeWebp(srcImage, imageOut, false));
    // 缩略图从 PNG 缩放，避免再次压缩上游 JPG。
    if (!thumbDone) jobs.push(writeWebp(srcImage, thumbOut, true));
    yield* Effect.all(jobs, { concurrency: 2 });
    return 'converted' as const;
  });
}

const program = Effect.gen(function* () {
  const catalog = yield* step(
    'read:catalog',
    async () =>
      JSON.parse(await readFile(path.join(pkgDir, 'catalog.json'), 'utf8')) as LayoutItem[],
  );
  const corrections = yield* step(
    'read:corrections',
    async () =>
      JSON.parse(await readFile(path.join(pkgDir, 'corrections.json'), 'utf8')) as Corrections,
  );
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  yield* prepareTarball;
  yield* extractTarball;
  const root = yield* step('repoRoot', async () => {
    const entries = readdirSync(extractDir);
    const entry = entries[0];
    if (entries.length !== 1 || !entry) {
      throw new Error(`解压目录结构异常: ${entries.join(', ')}`);
    }
    return path.join(extractDir, entry);
  });
  console.log(`[sync] 共 ${catalog.length} 条，开始转换 (并发 ${CONCURRENCY})`);
  const counts: Record<ConversionResult, number> = {
    converted: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  };
  let done = 0;
  yield* Effect.all(
    catalog.map((item) =>
      Effect.gen(function* () {
        const result = yield* convertOne(root, item, corrections, catalogById).pipe(
          Effect.catchTag('SyncStep', (error) =>
            Effect.sync(() => {
              console.warn(`[sync] 转换失败: ${item.id} ${item.name}: ${error.message}`);
              return 'failed' as const;
            }),
          ),
        );
        counts[result] += 1;
        done += 1;
        if (done % 40 === 0 || done === catalog.length) {
          console.log(`[sync] 进度 ${done}/${catalog.length}`);
        }
      }),
    ),
    { concurrency: CONCURRENCY, discard: true },
  );
  console.log(
    `[sync] 完成: 新转换 ${counts.converted}，跳过 ${counts.skipped}，上游缺失 ${counts.missing}，失败 ${counts.failed}`,
  );
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== catalog.length) {
    return yield* Effect.fail(
      new SyncStepError({ step: 'count', cause: counts, message: '条目数不匹配' }),
    );
  }
  if (counts.failed > 0) {
    return yield* Effect.fail(
      new ConversionFailures({ count: counts.failed, message: `${counts.failed} 条转换失败` }),
    );
  }
});

NodeRuntime.runMain(program);
