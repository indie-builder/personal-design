import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatPersistence } from './chat-stream.ts';

// Failure modes: lost trailing deltas, stale timer overwrites, indefinite debounce,
// missing lifecycle flushes, writes after disposal and repeated storage errors.
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [];
  const errors = [];
  const persistence = createChatPersistence(
    (value) => writes.push(value),
    (error) => errors.push(error),
  );
  return { persistence, writes, errors };
}
const saved = (text) => ({
  agents: [],
  conversations: [{ id: 'chat', agentId: 'general', title: text, messages: [] }],
});

test('streaming writes the latest snapshot at bounded intervals, not every delta', (t) => {
  const { persistence, writes } = setup(t);
  assert.deepEqual(writes, []);
  const first = saved('first');
  const latest = saved('latest');
  persistence.schedule(first, true);
  t.mock.timers.tick(250);
  persistence.schedule(latest, true);
  t.mock.timers.tick(249);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(writes, [latest]);
  persistence.schedule(first, true);
  t.mock.timers.tick(500);
  assert.deepEqual(writes, [latest, first]);
});

test('completion or stop saves immediately and cancels the stale streaming timer', (t) => {
  const { persistence, writes } = setup(t);
  persistence.schedule(saved('partial'), true);
  const complete = saved('complete');
  persistence.schedule(complete, false);
  assert.deepEqual(writes, [complete]);
  t.mock.timers.tick(1000);
  assert.deepEqual(writes, [complete]);
});

test('lifecycle flush preserves the trailing snapshot and is idempotent', (t) => {
  const { persistence, writes } = setup(t);
  const latest = saved('last delta');
  persistence.schedule(latest, true);
  persistence.flush();
  persistence.flush();
  t.mock.timers.tick(1000);
  assert.deepEqual(writes, [latest]);
});

test('agent and form changes outside generation save immediately', (t) => {
  const { persistence, writes } = setup(t);
  const state = saved('edited');
  persistence.schedule(state, false);
  assert.deepEqual(writes, [state]);
});

test('storage failure reports once and cannot later overwrite existing history', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let errors = 0;
  const persistence = createChatPersistence(
    () => {
      attempts++;
      throw new Error('quota');
    },
    () => errors++,
  );
  persistence.schedule(saved('partial'), true);
  t.mock.timers.tick(500);
  persistence.schedule(saved('complete'), false);
  persistence.flush();
  assert.equal(attempts, 1);
  assert.equal(errors, 1);
});
