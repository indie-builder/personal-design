import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Effect, Schedule } from 'effect';
import { download } from './download.ts';

// 无退避重试（3 次尝试）：失败路径的测试不等真实的指数退避。
const immediateRetry = Schedule.exponential(1, 1).pipe(Schedule.upTo({ times: 2 }));

/** 局部 HTTP 服务器：按 handler 处理请求后关闭 */
async function withServer(handler: RequestListener, run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen({ port: 0, host: '127.0.0.1' }, () => resolve());
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}/file`);
  } finally {
    server.close();
  }
}

test('下载成功后目标文件完整，不留临时文件', async () => {
  await withServer(
    (_req, res) => {
      res.end('hello media');
    },
    async (url) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'download-'));
      const target = path.join(dir, 'a.webp');
      assert.equal(await Effect.runPromise(download(url, target, immediateRetry)), 'downloaded');
      assert.equal(await readFile(target, 'utf8'), 'hello media');
      assert.deepEqual(await readdir(dir), ['a.webp']);
    },
  );
});

test('传输中断不落半截目标文件，临时文件被清理', async () => {
  await withServer(
    (_req, res) => {
      res.write('partial');
      res.destroy();
    },
    async (url) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'download-'));
      const target = path.join(dir, 'b.webp');
      await assert.rejects(() => Effect.runPromise(download(url, target, immediateRetry)));
      assert.equal((await readdir(dir)).length, 0);
    },
  );
});

test('已存在的非空文件跳过下载', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'download-'));
  const target = path.join(dir, 'c.webp');
  await writeFile(target, 'existing');
  await withServer(
    () => {
      throw new Error('不应发起请求');
    },
    async (url) => {
      assert.equal(await Effect.runPromise(download(url, target, immediateRetry)), 'skipped');
      assert.equal(await readFile(target, 'utf8'), 'existing');
    },
  );
});
