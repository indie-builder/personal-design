import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
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

test('Effect 取消中断底层传输，不发布目标文件', async () => {
  // 停滞响应：发一个 chunk 后保持连接，模拟慢源。取消后底层 fetch 必须真正断开。
  const dir = await mkdtemp(path.join(tmpdir(), 'download-cancel-'));
  const target = path.join(dir, 'media.bin');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.write('partial');
  });
  let responseClosed = false;
  server.on('request', (_req, res) => res.on('close', () => (responseClosed = true)));
  await new Promise<void>((resolve) => {
    server.listen({ port: 0, host: '127.0.0.1' }, () => resolve());
  });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/file`;
  try {
    const controller = new AbortController();
    const run = Effect.runPromiseExit(download(url, target, immediateRetry), {
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    controller.abort();
    const exit = await run;
    assert.equal(exit._tag, 'Failure');
    if (exit._tag === 'Failure') assert.equal(exit.cause.reasons[0]?._tag, 'Interrupt');
    // 连接真正断开（底层 fetch 被 abort，而非仅 fiber 放弃等待）
    const deadline = Date.now() + 5000;
    while (!responseClosed && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(responseClosed, '底层连接未随取消断开');
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 被取消的下载不得发布目标文件，也不留半截临时文件
    assert.deepEqual(await readdir(dir), []);
  } finally {
    server.close();
  }
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

test('下载请求断言是 Die 且不重试', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'download-defect-'));
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    throw new assert.AssertionError({ message: 'download bug' });
  });
  const exit = await Effect.runPromiseExit(
    download('https://example.com/a', path.join(dir, 'a'), immediateRetry),
  );
  assert.equal(exit._tag, 'Failure');
  if (exit._tag === 'Failure') assert.equal(exit.cause.reasons[0]?._tag, 'Die');
  assert.equal(attempts, 1);
});

test('目录创建失败进入 Fail，改名失败清理临时文件并尝试三次', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'download-files-'));
  const blocked = path.join(dir, 'blocked');
  await writeFile(blocked, 'file');
  const failedMkdir = await Effect.runPromiseExit(
    download('https://example.com/a', path.join(blocked, 'a'), immediateRetry),
  );
  assert.equal(failedMkdir._tag, 'Failure');
  if (failedMkdir._tag === 'Failure') assert.equal(failedMkdir.cause.reasons[0]?._tag, 'Fail');
  const target = path.join(dir, 'target');
  let attempts = 0;
  await withServer(
    async (_req, res) => {
      attempts++;
      await mkdir(target, { recursive: true });
      res.end('media');
    },
    async (url) => {
      const exit = await Effect.runPromiseExit(download(url, target, immediateRetry));
      assert.equal(exit._tag, 'Failure');
      if (exit._tag === 'Failure') assert.equal(exit.cause.reasons[0]?._tag, 'Fail');
      assert.equal(attempts, 3);
      assert.deepEqual((await readdir(dir)).sort(), ['blocked', 'target']);
    },
  );
});
