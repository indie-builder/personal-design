import assert from 'node:assert/strict';
import test from 'node:test';
import { readToolStatus } from './chat-tools.ts';

// Failure modes: split UTF-8/NDJSON, malformed or unrelated lines, repeated starts,
// unmatched ends, dropped final partial lines, interrupted reads and mutable step keys.
test('tool status keeps step order across split lines and snapshots completed keys', async () => {
  const events = [];
  const input = '\ninvalid\n' + [
    { type: 'chat.completion.chunk' },
    { type: 'tool_status', name: 'ignored', phase: 'end' },
    { type: 'tool_status', phase: 'start' },
    { type: 'tool_status', name: 'query', label: '查询数据', phase: 'start' },
    { type: 'tool_status', name: 'query', phase: 'end' },
    { type: 'tool_status', name: 'query', phase: 'start' },
    { type: 'tool_status', name: 'other', phase: 'start' },
    { type: 'tool_status', name: 'other', phase: 'end', isError: true },
  ].map((event) => JSON.stringify(event) + '\n').join('') + JSON.stringify({ type: 'tool_status', name: 'partial', phase: 'start' });
  const bytes = new TextEncoder().encode(input);
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  await readToolStatus(body, {
    onStart: (step) => events.push(step),
    onEnd: (key, state) => events.push({ key, state }),
  });
  assert.deepEqual(events, [
    { key: 'query-1', label: '查询数据', state: 'running' },
    { key: 'query-1', state: 'done' },
    { key: 'query-2', label: 'query', state: 'running' },
    { key: 'other-3', label: 'other', state: 'running' },
    { key: 'other-3', state: 'error' },
  ]);
  assert.equal(body.locked, false);
});

test('interrupted status branch releases its reader without rejecting the content branch', async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error('stopped')); } });
  await readToolStatus(body, { onStart: assert.fail, onEnd: assert.fail });
  assert.equal(body.locked, false);
});
