import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentSchema,
  analyticsAgent,
  analyticsExamples,
  builtinAgents,
  defaultAgent,
  isMaleAvatar,
  normalizeSavedChat,
  uiExamples,
} from './index.ts';

test('两个内置智能体按序暴露，资料符合 schema 且提示词在限额内', () => {
  assert.deepEqual(builtinAgents, [defaultAgent, analyticsAgent]);
  assert.equal(defaultAgent.id, 'general');
  assert.equal(analyticsAgent.id, 'analytics');
  for (const agent of builtinAgents) {
    const parsed = agentSchema.parse(agent);
    assert.equal(parsed.id, agent.id);
    assert.ok(agent.prompt.length > 0 && agent.prompt.length <= 12000);
  }
  // 内置智能体的形象必须稳定且来自男生头像池。
  assert.equal(analyticsAgent.avatarId, 15);
  assert.ok(isMaleAvatar(analyticsAgent.avatarId));
});

// Restore failures: missing/stale builtins, unstable analytics avatar, invalid custom avatars,
// reordered custom agents, lost conversation memory and mutations of the stored snapshot.
test('恢复时补齐最新内置资料，保留有效头像、自定义顺序与会话', () => {
  const custom = { id: 'custom', name: '自定义', prompt: '保留提示词', avatarId: 15 };
  const initial = {
    agents: [custom, { ...defaultAgent, name: '旧名称', prompt: '旧提示词', avatarId: 15 }],
    conversations: [
      {
        id: 'chat',
        agentId: custom.id,
        title: '保留',
        messages: [],
        memory: { summary: '保留摘要', throughId: 'message' },
      },
    ],
  };
  const before = structuredClone(initial);
  const result = normalizeSavedChat(initial);
  assert.deepEqual(
    result.agents.map((agent) => agent.id),
    [...builtinAgents.map((agent) => agent.id), custom.id],
  );
  assert.deepEqual(result.agents[0], { ...defaultAgent, avatarId: 15 });
  assert.deepEqual(result.agents[1], analyticsAgent);
  assert.deepEqual(result.agents[2], custom);
  assert.deepEqual(result.conversations, initial.conversations);
  assert.deepEqual(initial, before);
});

test('恢复时固定问数头像，只为缺失或无效头像重新分配', () => {
  const result = normalizeSavedChat({
    agents: [
      { ...analyticsAgent, avatarId: undefined },
      { id: 'missing', name: '缺失', prompt: '保留' },
      { id: 'invalid', name: '无效', prompt: '保留', avatarId: 999 },
      { id: 'valid', name: '有效', prompt: '保留', avatarId: 15 },
    ],
    conversations: [],
  });
  assert.equal(
    result.agents.find((agent) => agent.id === analyticsAgent.id).avatarId,
    analyticsAgent.avatarId,
  );
  assert.equal(result.agents.find((agent) => agent.id === 'valid').avatarId, 15);
  for (const agent of result.agents) assert.ok(isMaleAvatar(agent.avatarId));
});

test('空记录恢复内置智能体且重复恢复保持头像稳定', () => {
  const restored = normalizeSavedChat({ agents: [], conversations: [] });
  assert.deepEqual(
    restored.agents.map((agent) => agent.id),
    builtinAgents.map((agent) => agent.id),
  );
  assert.deepEqual(normalizeSavedChat(restored), restored);
});

test('智能问数示例与生成式 UI 示例各三条，字段齐全且问题不重叠', () => {
  assert.equal(analyticsExamples.length, 3);
  assert.equal(uiExamples.length, 3);
  const questions = new Set(
    [...analyticsExamples, ...uiExamples].map((example) => example.question),
  );
  assert.equal(questions.size, 6);
  for (const example of analyticsExamples) {
    for (const key of ['id', 'label', 'question', 'description', 'prompt']) {
      assert.ok(String(example[key]).length > 0, `example.${key} should not be empty`);
    }
  }
});
