import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStream } from './chat-stream.ts';

// Failure modes: delayed first content, missing final/aborted chunks, split Unicode,
// continuous deltas starving updates, duplicate flushes and callbacks after unmount.
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const updates = [];
  const stream = createChatStream((text) => updates.push(text));
  return { stream, updates };
}

test('first content appears immediately; subsequent chunks coalesce without losing text', (t) => {
  const { stream, updates } = setup(t);
  stream.append('你');
  assert.deepEqual(updates, ['你']);
  stream.append('好');
  stream.append('\ud83d');
  stream.append('\ude00');
  t.mock.timers.tick(31);
  assert.deepEqual(updates, ['你']);
  t.mock.timers.tick(1);
  assert.deepEqual(updates, ['你', '你好😀']);
});

test('continuous deltas cannot postpone rendering indefinitely', (t) => {
  const { stream, updates } = setup(t);
  stream.append('a');
  stream.append('b');
  t.mock.timers.tick(16);
  stream.append('c');
  t.mock.timers.tick(16);
  assert.deepEqual(updates, ['a', 'abc']);
  stream.append('d');
  t.mock.timers.tick(32);
  assert.equal(updates.at(-1), 'abcd');
});

test('completion, error or stop flushes trailing content once and cancels its timer', (t) => {
  const { stream, updates } = setup(t);
  stream.append('first');
  stream.append(' last');
  stream.flush();
  stream.flush();
  t.mock.timers.tick(100);
  assert.deepEqual(updates, ['first', 'first last']);
});

test('empty streams never create an assistant message', (t) => {
  const { stream, updates } = setup(t);
  stream.append('');
  stream.flush();
  t.mock.timers.tick(100);
  assert.deepEqual(updates, []);
});

test('unmount discards pending callbacks and cannot affect a subsequent stream', (t) => {
  const { stream, updates } = setup(t);
  stream.append('old');
  stream.append(' pending');
  stream.cancel();
  stream.append(' late');
  stream.flush();
  const next = createChatStream((text) => updates.push(text));
  next.append('new');
  t.mock.timers.tick(100);
  assert.deepEqual(updates, ['old', 'new']);
});

test('1000 one-millisecond deltas preserve output with at most 33 update callbacks', (t) => {
  const { stream, updates } = setup(t);
  const chunks = Array.from({ length: 1000 }, (_, i) => `${i}中`);
  for (const chunk of chunks) {
    stream.append(chunk);
    t.mock.timers.tick(1);
  }
  stream.flush();
  assert.equal(updates.at(-1), chunks.join(''));
  assert(updates.length <= 33, `${updates.length} updates`);
  t.diagnostic(
    `1000 input deltas -> ${updates.length} callbacks; fake timer workload, not measured React commits or browser frame rate`,
  );
});
