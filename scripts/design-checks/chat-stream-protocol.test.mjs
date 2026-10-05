import assert from 'node:assert/strict';
import test from 'node:test';
import { assertChatStream } from './chat-stream-protocol.mjs';

const chunk = (delta, finish_reason = null) => ({
  choices: [{ index: 0, delta, finish_reason }],
});
const role = chunk({ role: 'assistant' });
const content = (text = 'root = Stack([]);') => chunk({ content: text });
const tool = (name, phase) => ({ type: 'tool_status', name, phase });
const stop = chunk({}, 'stop');

test('rejects content emitted before the first tool call', () => {
  const raw = [
    role,
    content('工具前文字'),
    tool('get_context', 'start'),
    tool('get_context', 'end'),
    content(),
    stop,
  ];
  assert.throws(
    () => assertChatStream(raw, { requireTools: true }),
    /no content before the first tool call/,
  );
});

const invalidTools = [
  [
    'content during tool execution',
    [role, tool('get_context', 'start'), content(), tool('get_context', 'end'), stop],
  ],
  ['missing tool end', [role, tool('get_context', 'start'), content(), stop]],
  [
    'a different tool ends',
    [role, tool('get_context', 'start'), tool('list_models', 'end'), content(), stop],
  ],
  [
    'one completed tool conceals another missing end',
    [
      role,
      tool('get_context', 'start'),
      tool('list_models', 'start'),
      tool('list_models', 'end'),
      content(),
      stop,
    ],
  ],
  [
    'end precedes start',
    [role, chunk({}), tool('get_context', 'end'), tool('get_context', 'start'), content(), stop],
  ],
  [
    'duplicate tool end',
    [
      role,
      tool('get_context', 'start'),
      tool('get_context', 'end'),
      tool('get_context', 'end'),
      content(),
      stop,
    ],
  ],
  [
    'tool status follows content',
    [
      role,
      tool('get_context', 'start'),
      tool('get_context', 'end'),
      content(),
      tool('list_models', 'start'),
      tool('list_models', 'end'),
      stop,
    ],
  ],
  [
    'unknown tool phase',
    [
      role,
      tool('get_context', 'start'),
      tool('get_context', 'unknown'),
      tool('get_context', 'end'),
      content(),
      stop,
    ],
  ],
  [
    'a repeated tool call has no second end',
    [
      role,
      tool('get_context', 'start'),
      tool('get_context', 'end'),
      tool('get_context', 'start'),
      content(),
      stop,
    ],
  ],
];
for (const [name, raw] of invalidTools) {
  test(`rejects ${name}`, () => {
    assert.throws(() => assertChatStream(raw, { requireTools: true }), assert.AssertionError);
  });
}

const invalidStreams = [
  ['an empty stream', []],
  [
    'a stream without content',
    [role, tool('get_context', 'start'), tool('get_context', 'end'), stop],
  ],
  ['a missing finish event', [role, content()]],
  ['an event after finish', [role, content(), stop, chunk({})]],
  ['another stop after an earlier finish', [role, content(), stop, content('late'), stop]],
  ['a finish reason other than stop', [role, content(), chunk({}, 'length')]],
];
for (const [name, raw] of invalidStreams) {
  test(`rejects ${name}`, () => {
    assert.throws(() => assertChatStream(raw), assert.AssertionError);
  });
}

test('accepts matched tools before content despite leading and interleaved chunks', () => {
  const raw = [
    role,
    chunk({ content: '' }),
    tool('get_context', 'start'),
    chunk({}),
    tool('get_context', 'end'),
    tool('list_models', 'start'),
    tool('list_models', 'end'),
    content('root = '),
    content('Stack([]);'),
    stop,
  ];
  const result = assertChatStream(raw, { requireTools: true });
  assert.equal(result.text, 'root = Stack([]);');
  assert.deepEqual(
    result.statuses.map(({ name, phase }) => [name, phase]),
    [
      ['get_context', 'start'],
      ['get_context', 'end'],
      ['list_models', 'start'],
      ['list_models', 'end'],
    ],
  );
});

test('accepts repeated calls with a matching end for every start', () => {
  const raw = [
    role,
    tool('get_context', 'start'),
    tool('get_context', 'start'),
    tool('get_context', 'end'),
    tool('get_context', 'end'),
    content(),
    stop,
  ];
  assert.doesNotThrow(() => assertChatStream(raw, { requireTools: true }));
});

test('accepts plain agent content without tool events', () => {
  const result = assertChatStream([role, content(), stop]);
  assert.equal(result.text, 'root = Stack([]);');
  assert.deepEqual(result.statuses, []);
});

test('requires tools when the analytics fixture is expected to call them', () => {
  assert.throws(
    () => assertChatStream([role, content(), stop], { requireTools: true }),
    assert.AssertionError,
  );
});
