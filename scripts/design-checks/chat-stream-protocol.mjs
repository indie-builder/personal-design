import assert from 'node:assert/strict';

export function assertChatStream(raw, { requireTools = false } = {}) {
  assert.equal(raw.at(-1)?.choices?.[0]?.finish_reason, 'stop', 'stream ends with stop');
  assert.equal(
    raw.findIndex((line) => line.choices?.[0]?.finish_reason != null),
    raw.length - 1,
    'finish appears only at the end',
  );
  const firstContent = raw.findIndex((line) => line.choices?.[0]?.delta?.content);
  assert(firstContent >= 0, 'stream emits content');
  const firstStart = raw.findIndex((line) => line.type === 'tool_status' && line.phase === 'start');
  const statuses = raw.filter((line) => line.type === 'tool_status');
  if (requireTools || statuses.length) {
    assert(firstStart >= 0, 'tool_status start is emitted');
    assert(firstStart < firstContent, 'no content before the first tool call');
    const starts = new Map();
    for (const [index, line] of raw.entries()) {
      if (line.type !== 'tool_status') continue;
      assert(index < firstContent, 'tool_status precedes content');
      if (line.phase === 'start') {
        const indices = starts.get(line.name) ?? [];
        indices.push(index);
        starts.set(line.name, indices);
      } else {
        assert.equal(line.phase, 'end', 'tool_status phase is start or end');
        const start = starts.get(line.name)?.shift();
        assert(start !== undefined && start < index, 'tool_status end follows a matching start');
      }
    }
    assert(
      [...starts.values()].every((indices) => indices.length === 0),
      'every tool_status start ends before content',
    );
  }
  const text = raw
    .filter((line) => line.choices?.[0]?.delta?.content)
    .map((line) => line.choices[0].delta.content)
    .join('');
  return { statuses, text };
}
