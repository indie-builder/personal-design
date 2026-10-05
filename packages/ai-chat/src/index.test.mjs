import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentSchema,
  analyticsAgent,
  analyticsExamples,
  builtinAgents,
  defaultAgent,
  isMaleAvatar,
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
