import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Effect, Schedule } from 'effect';
import { downloadTarball, DownloadError } from './download.ts';

const immediateRetry = Schedule.exponential(1, 1).pipe(Schedule.upTo({ times: 2 }));

async function withDownload(
  handler: RequestListener,
  run: (url: string, target: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'layout-download-'));
  const server = createServer(handler);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}/repo.tar.gz`, path.join(dir, 'repo.tar.gz'));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dir, { recursive: true, force: true });
  }
}

test('暂时 HTTP 失败后第三次尝试成功，原子替换目标且不留临时文件', async () => {
  let requests = 0;
  await withDownload(
    (_req, res) => {
      requests += 1;
      res.statusCode = requests < 3 ? 503 : 200;
      res.end(requests < 3 ? 'unavailable' : 'complete tarball');
    },
    async (url, target) => {
      await writeFile(target, 'previous tarball');
      await Effect.runPromise(downloadTarball(url, target, { schedule: immediateRetry }));
      assert.equal(requests, 3);
      assert.equal(await readFile(target, 'utf8'), 'complete tarball');
      assert.deepEqual(await readdir(path.dirname(target)), ['repo.tar.gz']);
    },
  );
});

test('连续 HTTP 失败共尝试三次，保留原目标并返回 typed error', async () => {
  let requests = 0;
  await withDownload(
    (_req, res) => {
      requests += 1;
      res.writeHead(503).end('unavailable');
    },
    async (url, target) => {
      await writeFile(target, 'previous tarball');
      await assert.rejects(
        Effect.runPromise(downloadTarball(url, target, { schedule: immediateRetry })),
        (error: unknown) => error instanceof DownloadError && error.url === url,
      );
      assert.equal(requests, 3);
      assert.equal(await readFile(target, 'utf8'), 'previous tarball');
      assert.deepEqual(await readdir(path.dirname(target)), ['repo.tar.gz']);
    },
  );
});

test('响应正文停滞会超时并重试三次，不发布或遗留半截文件', { timeout: 5_000 }, async () => {
  let requests = 0;
  await withDownload(
    (_req, res) => {
      requests += 1;
      res.write('partial');
    },
    async (url, target) => {
      await assert.rejects(
        Effect.runPromise(
          downloadTarball(url, target, { timeoutMs: 100, schedule: immediateRetry }),
        ),
        (error: unknown) => error instanceof DownloadError,
      );
      assert.equal(requests, 3);
      assert.deepEqual(await readdir(path.dirname(target)), []);
    },
  );
});

test('响应正文中断会重试三次，并清理临时文件', async () => {
  let requests = 0;
  await withDownload(
    (_req, res) => {
      requests += 1;
      res.write('partial');
      setImmediate(() => res.destroy());
    },
    async (url, target) => {
      await assert.rejects(
        Effect.runPromise(downloadTarball(url, target, { schedule: immediateRetry })),
        (error: unknown) => error instanceof DownloadError,
      );
      assert.equal(requests, 3);
      assert.deepEqual(await readdir(path.dirname(target)), []);
    },
  );
});

test('取消运行会中止请求并清理临时文件，不重试或替换原目标', async () => {
  let requests = 0;
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  await withDownload(
    (_req, res) => {
      requests += 1;
      res.write('partial');
      markStarted();
    },
    async (url, target) => {
      await writeFile(target, 'previous tarball');
      const controller = new AbortController();
      const result = Effect.runPromise(downloadTarball(url, target), {
        signal: controller.signal,
      });
      const rejected = assert.rejects(result);
      await started;
      controller.abort();
      await rejected;
      assert.equal(requests, 1);
      assert.equal(await readFile(target, 'utf8'), 'previous tarball');
      assert.deepEqual(await readdir(path.dirname(target)), ['repo.tar.gz']);
    },
  );
});
