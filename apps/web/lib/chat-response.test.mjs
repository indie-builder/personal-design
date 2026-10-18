import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { PassThrough, Readable } from 'node:stream';
import { Effect } from 'effect';
import { aiChatProvider } from '../../../scripts/design-checks/fixtures/ai-chat-provider.mjs';
import { assertChatStream } from '../../../scripts/design-checks/chat-stream-protocol.mjs';

// Replay real Pi sessions through the provider HTTP boundary, without sockets or real credentials.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@tanstack/react-start/server-only')
      return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (
      context.parentURL?.startsWith(new URL('./', import.meta.url).href) &&
      specifier.startsWith('./') &&
      !/\.[a-z]+$/.test(specifier)
    )
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/openui-system-prompt.json'))
      return {
        format: 'module',
        source: `export default ${readFileSync(new URL(url), 'utf8')}`,
        shortCircuit: true,
      };
    return nextLoad(url, context);
  },
});
const { createChatResponse } = await import('./chat-response.ts');
const { analyticsAgent } = await import('@personal-design/ai-chat');
const { createParser } = await import('@openuidev/lang-core');
const { schema } = JSON.parse(
  readFileSync(new URL('./openui-system-prompt.json', import.meta.url)),
);
const parser = createParser(schema, 'Stack');
const plainAgent = { id: 'plain-test', name: '普通', prompt: '你是测试助手。' };
const message = (text, index = 0) => ({
  id: `m${index}`,
  role: index % 2 ? 'assistant' : 'user',
  text,
});
const deferred = () => Promise.withResolvers();

function fixtureFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    assert.equal(new URL(url).origin, 'http://chat-response.test', 'no real network');
    const headers = new Headers();
    const body = new PassThrough();
    let started = false;
    const start = (status = 200) => {
      if (started) return;
      started = true;
      resolve(new Response(Readable.toWeb(body), { status, headers }));
    };
    body.setHeader = (name, value) => headers.set(name, value);
    body.writeHead = (status, values) => {
      for (const [name, value] of Object.entries(values)) headers.set(name, value);
      start(status);
    };
    const end = body.end.bind(body);
    body.end = (...args) => {
      start();
      return end(...args);
    };
    const abort = () => body.destroy(new Error('aborted'));
    options.signal?.addEventListener('abort', abort, { once: true });
    body.once('close', () => options.signal?.removeEventListener('abort', abort));
    const req = {
      url: new URL(url).pathname,
      async *[Symbol.asyncIterator]() {
        yield options.body ?? '';
      },
    };
    aiChatProvider(req, body).catch(reject);
  });
}

async function setup(t, fetcher = fixtureFetch) {
  for (const [name, value] of Object.entries({
    ZHIPU_API_KEY: 'test-only',
    ZHIPU_BASE_URL: 'http://chat-response.test',
    ANALYTICS_MCP_TOKEN: '',
  })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  t.mock.method(globalThis, 'fetch', fetcher);
  await fixtureFetch('http://chat-response.test/reset');
  return async (
    text,
    { agent = analyticsAgent, messages = [message(text)], memory, signal } = {},
  ) =>
    Effect.runPromise(
      createChatResponse(new Request('https://chat.test/api/ai-chat', { signal }), {
        agent,
        messages,
        ...(memory ? { memory } : {}),
      }),
    );
}
const lines = async (response) => (await response.text()).trim().split('\n').map(JSON.parse);
const contents = (raw) => raw.flatMap((line) => line.choices?.[0]?.delta?.content ?? []).join('');
const requests = async () => (await fixtureFetch('http://chat-response.test/requests')).json();

// Failure modes: irreversible between-tool output; lost status/error flags; no-tool stalls;
// failed/aborted answers leaking buffered text; cancellation hanging; summary/repair regressions.
test('three real Pi tool rounds discard all intermediate text and preserve statuses before final content', async (t) => {
  const post = await setup(t);
  const raw = await lines(await post('步骤状态验收：查询在职人数'));
  assert(!contents(raw).includes('BETWEEN_TOOLS'), 'between-tool text must never be sent');
  const { statuses, text } = assertChatStream(raw, { requireTools: true });
  assert.deepEqual(
    statuses.map(({ name, phase, isError }) => [name, phase, isError]),
    [
      ['get_context', 'start', undefined],
      ['get_context', 'end', true],
      ['describe_cube', 'start', undefined],
      ['describe_cube', 'end', true],
      ['query_cube', 'start', undefined],
      ['query_cube', 'end', true],
    ],
  );
  assert(!text.includes('我先读取业务口径'));
  assert.match(text, /全公司在职 528 人/);
  assert(parser.parse(text).root);
  assert.equal((await requests()).length, 4, 'no repair prompt needed for the final answer');
});

test('analytics repair can run tools and release only its successful final answer', async (t) => {
  const waiting = deferred(),
    release = deferred();
  const post = await setup(t, async (url, options) => {
    const response = await fixtureFetch(url, options);
    const data = JSON.parse(options.body);
    if (
      !data.messages.some(
        (m) =>
          m.role === 'assistant' && m.tool_calls?.some((c) => c.function?.name === 'query_cube'),
      )
    )
      return response;
    const text = await response.text();
    return new Response(
      new ReadableStream({
        async start(controller) {
          const end = text.indexOf('data: [DONE]');
          controller.enqueue(new TextEncoder().encode(text.slice(0, end)));
          waiting.resolve();
          await release.promise;
          controller.enqueue(new TextEncoder().encode(text.slice(end)));
          controller.close();
        },
      }),
      { headers: response.headers },
    );
  });
  const reader = (await post('修复工具验收：查询在职人数')).body.getReader();
  const seen = [];
  let streamError;
  const consuming = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        seen.push(...new TextDecoder().decode(chunk.value).trim().split('\n').map(JSON.parse));
      }
    } catch (error) {
      streamError = error;
    }
  })();
  try {
    await waiting.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert(!contents(seen).includes('全公司在职 528 人'), 'repair body waits for completion');
    assert.deepEqual(
      seen
        .filter((line) => line.type === 'tool_status')
        .map(({ name, phase, isError }) => [name, phase, isError]),
      [
        ['get_context', 'start', undefined],
        ['get_context', 'end', true],
        ['describe_cube', 'start', undefined],
        ['describe_cube', 'end', true],
        ['query_cube', 'start', undefined],
        ['query_cube', 'end', true],
      ],
    );
  } finally {
    release.resolve();
    await consuming;
    reader.releaseLock();
  }
  assert.ifError(streamError);
  assert(!contents(seen).includes('BETWEEN_TOOLS'), 'repair tool preambles never leak');
  const lastTool = seen.findLastIndex((line) => line.type === 'tool_status');
  const { text } = assertChatStream(seen.slice(lastTool + 1));
  assert.match(text, /全公司在职 528 人/);
  const parsed = parser.parse(text);
  assert(parsed.root);
  assert.deepEqual(parsed.meta.errors, []);
  assert.deepEqual(parsed.meta.unresolved, []);
  assert.deepEqual(parsed.meta.orphaned, []);
  assert.equal((await requests()).length, 5, 'one invalid answer, one repair with two tool rounds');
});

test('provider failure after repair tools never releases the buffered repair body', async (t) => {
  const post = await setup(t, async (url, options) => {
    const data = JSON.parse(options.body);
    if (
      data.messages.some(
        (m) =>
          m.role === 'assistant' && m.tool_calls?.some((c) => c.function?.name === 'query_cube'),
      )
    ) {
      return new Response(
        'data: {"id":"failed-repair","choices":[{"index":0,"delta":{"content":"DO_NOT_RELEASE_FAILED_REPAIR"},"finish_reason":null}]}\n\ndata: {"error":{"message":"test repair failure"}}\n\ndata: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return fixtureFetch(url, options);
  });
  const errors = t.mock.method(console, 'error', () => {});
  const reader = (await post('修复工具验收：查询在职人数')).body.getReader();
  let text = '';
  try {
    await assert.rejects(async () => {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
    }, /问答服务暂时不可用/);
  } finally {
    reader.releaseLock();
  }
  assert(!text.includes('BETWEEN_TOOLS'));
  assert(!text.includes('DO_NOT_RELEASE_FAILED_REPAIR'));
  assert(!text.includes('"finish_reason":"stop"'));
  const statuses = text
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter((line) => line.type === 'tool_status');
  assert.deepEqual(
    statuses.map(({ name, phase, isError }) => [name, phase, isError]),
    [
      ['get_context', 'start', undefined],
      ['get_context', 'end', true],
      ['describe_cube', 'start', undefined],
      ['describe_cube', 'end', true],
      ['query_cube', 'start', undefined],
      ['query_cube', 'end', true],
    ],
  );
  assert(errors.mock.calls.some(({ arguments: args }) => args.includes('test repair failure')));
});

test('analytics buffers its final body until prompt completion while tool statuses stay live', async (t) => {
  const waiting = deferred(),
    release = deferred();
  const post = await setup(t, async (url, options) => {
    const response = await fixtureFetch(url, options);
    const data = JSON.parse(options.body);
    if (!data.messages.some((m) => m.role === 'tool')) return response;
    const text = await response.text();
    return new Response(
      new ReadableStream({
        async start(controller) {
          const end = text.indexOf('data: [DONE]');
          controller.enqueue(new TextEncoder().encode(text.slice(0, end)));
          waiting.resolve();
          await release.promise;
          controller.enqueue(new TextEncoder().encode(text.slice(end)));
          controller.close();
        },
      }),
      { headers: response.headers },
    );
  });
  const response = await post('查询在职人数');
  const reader = response.body.getReader();
  const seen = [];
  const consuming = (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      seen.push(...new TextDecoder().decode(chunk.value).trim().split('\n').map(JSON.parse));
    }
  })();
  try {
    await waiting.promise;
    // Let the supplied final text pass through Pi before checking the client-visible stream.
    await new Promise((resolve) => setImmediate(resolve));
    assert(seen.some((line) => line.type === 'tool_status' && line.phase === 'end'));
    assert.equal(contents(seen), '', 'final body must wait for successful prompt completion');
  } finally {
    release.resolve();
    await consuming;
    reader.releaseLock();
  }
  assertChatStream(seen, { requireTools: true });
});

test('ordinary no-tool answers still stream before provider completion', async (t) => {
  const post = await setup(t);
  const response = await post('慢速回答', { agent: plainAgent });
  const reader = response.body.getReader();
  let text = '';
  while (!text) {
    const { value } = await reader.read();
    const raw = new TextDecoder().decode(value).trim().split('\n').map(JSON.parse);
    text += contents(raw);
    assert(!raw.some((line) => line.choices?.[0]?.finish_reason === 'stop'));
  }
  assert.equal(text, 'root = Stack([card]);\nca');
  await reader.cancel();
  reader.releaseLock();
  assertChatStream(await lines(await post('取消后继续', { agent: plainAgent })));
});

test('analytics with no tool call releases its answer at completion', async (t) => {
  const post = await setup(t, (url, options) => {
    const data = JSON.parse(options.body);
    data.messages = data.messages.map((m) =>
      m.role === 'system' ? { ...m, content: '普通测试助手' } : m,
    );
    return fixtureFetch(url, { ...options, body: JSON.stringify(data) });
  });
  const { statuses, text } = assertChatStream(await lines(await post('你好')));
  assert.deepEqual(statuses, []);
  assert(parser.parse(text).root);
  const repaired = assertChatStream(await lines(await post('触发结构修复')));
  assert.equal(parser.parse(repaired.text).meta.orphaned.length, 0);
});

test('provider failure after tools discards buffered content and never reports stop', async (t) => {
  const post = await setup(t, async (url, options) => {
    const data = JSON.parse(options.body);
    if (
      data.messages.some(
        (m) =>
          m.role === 'assistant' &&
          m.tool_calls?.some((call) => call.function?.name === 'query_cube'),
      )
    ) {
      return new Response(
        'data: {"id":"failed","choices":[{"index":0,"delta":{"content":"DO_NOT_RELEASE_FAILED_ANSWER"},"finish_reason":null}]}\n\ndata: {"error":{"message":"test provider failure"}}\n\ndata: [DONE]\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        },
      );
    }
    return fixtureFetch(url, options);
  });
  const errors = t.mock.method(console, 'error', () => {});
  const response = await post('步骤状态验收：查询在职人数');
  const reader = response.body.getReader();
  let text = '';
  await assert.rejects(async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
  }, /问答服务暂时不可用/);
  reader.releaseLock();
  assert(!text.includes('BETWEEN_TOOLS'));
  assert(!text.includes('DO_NOT_RELEASE_FAILED_ANSWER'));
  assert(!text.includes('"finish_reason":"stop"'));
  assert(errors.mock.callCount() > 0);
});

test('request abort and response cancellation settle and permit a fresh analytics session', async (t) => {
  const post = await setup(t);
  const controller = new AbortController();
  const response = await post('慢速回答', { signal: controller.signal });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await assert.rejects(async () => {
    while (!(await reader.read()).done) {}
  }, /问答服务暂时不可用/);
  reader.releaseLock();
  const canceled = await post('慢速回答');
  await canceled.body.cancel();
  assertChatStream(await lines(await post('停止后继续')), { requireTools: true });
});

test('summary headers, retained context and one structural repair preserve their protocol', async (t) => {
  const post = await setup(t);
  const history = Array.from({ length: 17 }, (_, i) => message(`第${i}轮，预算3000元。`, i));
  const response = await post('', { agent: plainAgent, messages: history });
  const { memory } = JSON.parse(Buffer.from(response.headers.get('x-ai-memory'), 'base64'));
  assert.equal(memory.throughId, 'm10');
  assert.match(memory.summary, /3000/);
  assertChatStream(await lines(response));
  const final = (await requests()).at(-1);
  assert(final.messages.some((m) => m.content.includes(memory.summary)));
  assert(final.messages.some((m) => m.content.includes('第11轮')));
  assert(!final.messages.some((m) => m.content.includes('第10轮')));
  const repaired = assertChatStream(await lines(await post('触发结构修复', { agent: plainAgent })));
  assert.equal(parser.parse(repaired.text).meta.orphaned.length, 0);
  const reused = await post('继续', { agent: plainAgent, memory });
  assert.equal(reused.headers.get('x-ai-memory'), null);
  assertChatStream(await lines(reused));
});
