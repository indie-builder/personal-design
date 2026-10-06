#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Data, Effect, Schedule } from 'effect';
import { NodeRuntime } from '@effect/platform-node';

class SyncStepError extends Data.TaggedError('SyncStep')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

class FaviconError extends Data.TaggedError('Favicon')<{
  readonly url: string;
  readonly cause: unknown;
}> {}

type SourceTool = { name: string; url: string };

// Node 文件操作不可取消，等待实际完成后才让 scope 清理临时文件。
const fileStep = <A>(name: string, run: () => Promise<A>) =>
  Effect.uninterruptible(
    Effect.tryPromise({
      try: () => run(),
      catch: (cause) => new SyncStepError({ step: name, cause }),
    }),
  );

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceUrl = 'https://designengineer.tools/';
const catalogPath = path.join(pkgDir, 'catalog.json');
const iconDir = path.resolve(pkgDir, '../../apps/web/public/design-engineer-tools/icons');
const categoryPattern = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const retrySchedule = Schedule.upTo(Schedule.exponential(1000, 2), { times: 2 });

function decode(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCatalog(html: string) {
  const headings = [...html.matchAll(categoryPattern)];
  const categories = headings.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = headings[index + 1]?.index ?? html.indexOf('<footer', bodyStart);
    const body = html.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);
    const tools = [...body.matchAll(linkPattern)]
      .map((link) => ({ name: decode(link[2] ?? ''), url: link[1] ?? '' }))
      .filter(({ name, url }) => name && url.startsWith('https://'));
    return { id: decode(match[1] ?? ''), tools };
  });
  const unique = new Set<string>();
  for (const category of categories) {
    category.tools = category.tools.filter((tool) => {
      const key = `${category.id}\u0000${tool.url}`;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    });
  }
  return categories.filter((category) => category.id && category.tools.length);
}

function iconPath(url: string) {
  const id = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return {
    file: path.join(iconDir, `${id}.png`),
    publicPath: `/design-engineer-tools/icons/${id}.png`,
  };
}

function syncIcon(tool: SourceTool) {
  const icon = iconPath(tool.url);
  const attempt = Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(
        `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tool.url)}&sz=64`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('image/') ||
        bytes.length < 100
      )
        throw new Error(`HTTP ${response.status}`);
      return bytes;
    },
    catch: (cause) => new FaviconError({ url: tool.url, cause }),
  });
  return Effect.catch(
    Effect.gen(function* () {
      const bytes = yield* Effect.retry(attempt, retrySchedule);
      yield* fileStep(`favicon:${tool.url}`, () => writeFile(icon.file, bytes));
      return { ...tool, icon: icon.publicPath };
    }),
    (error) =>
      Effect.sync(() => {
        if (existsSync(icon.file)) return { ...tool, icon: icon.publicPath };
        const message = error.cause instanceof Error ? error.cause.message : String(error.cause);
        console.warn(`favicon 跳过: ${tool.name} (${message})`);
        return { ...tool, icon: null };
      }),
  );
}

function syncIcons(categories: ReturnType<typeof parseCatalog>) {
  return Effect.gen(function* () {
    yield* fileStep('mkdir:icons', () => mkdir(iconDir, { recursive: true }));
    const tools = categories.flatMap((category) => category.tools);
    const results = yield* Effect.all(
      tools.map((tool) => syncIcon(tool)),
      { concurrency: 12 },
    );
    let offset = 0;
    const synced = categories.map((category) => {
      const tools = results.slice(offset, offset + category.tools.length);
      offset += category.tools.length;
      return { ...category, tools };
    });
    const missing = results.filter((result) => !result.icon).length;
    if (missing)
      yield* Effect.sync(() =>
        console.warn(`${missing} 个工具没有可用 favicon，页面将显示外链图标`),
      );
    return synced;
  });
}

const program = Effect.scoped(
  Effect.gen(function* () {
    const html = yield* Effect.retry(
      Effect.tryPromise({
        try: async (signal) => {
          const response = await fetch(sourceUrl, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
            headers: { 'user-agent': 'personal-design-sync/1.0 (+https://designengineer.tools/)' },
          });
          if (!response.ok) throw new Error(`目录请求失败: HTTP ${response.status}`);
          return response.text();
        },
        catch: (cause) => new SyncStepError({ step: 'fetch:catalog', cause }),
      }),
      retrySchedule,
    );
    const categories = parseCatalog(html);
    const total = categories.reduce((count, category) => count + category.tools.length, 0);
    if (categories.length < 10 || total < 100) {
      return yield* Effect.fail(
        new SyncStepError({
          step: 'parse:catalog',
          cause: new Error(`目录解析不完整: ${categories.length} 个分类，${total} 个工具`),
        }),
      );
    }
    const synced = yield* syncIcons(categories);
    const catalog = { sourceUrl, syncedAt: new Date().toISOString(), categories: synced };
    yield* fileStep('mkdir:package', () => mkdir(pkgDir, { recursive: true }));
    const temporary = yield* Effect.acquireRelease(Effect.succeed(`${catalogPath}.tmp`), (file) =>
      Effect.orDie(fileStep('rm:catalog.tmp', () => rm(file, { force: true }))),
    );
    yield* fileStep('write:catalog.tmp', () =>
      writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`),
    );
    yield* fileStep('rename:catalog', () => rename(temporary, catalogPath));
    yield* Effect.sync(() => console.log(`已同步 ${categories.length} 个分类、${total} 个工具`));
  }),
);

NodeRuntime.runMain(program);
