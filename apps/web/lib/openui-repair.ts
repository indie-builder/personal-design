import { createParser } from '@openuidev/lang-core';
import { Effect } from 'effect';
import { GenerationError, ProviderError, UiRepairError } from './chat-error';
import openuiPrompt from './openui-system-prompt.json';
import type { createChatSession } from './pi-chat';

type Session = Effect.Success<ReturnType<typeof createChatSession>>;

export function assertChatAnswer(
  session: Session,
  fallback: 'Generation failed' | 'UI repair failed',
) {
  const last = session.messages.at(-1);
  if (last?.role !== 'assistant' || last.stopReason === 'error' || last.stopReason === 'aborted') {
    const message = last?.role === 'assistant' ? last.errorMessage || fallback : fallback;
    return Effect.fail(
      fallback === 'Generation failed'
        ? new GenerationError({ message })
        : new UiRepairError({ message }),
    );
  }
  return Effect.void;
}

export function repairOpenUi(
  session: Session,
  output: { text: string },
  emit: (delta: { content: string }) => void,
  signal: AbortSignal,
) {
  return Effect.gen(function* () {
    const parser = createParser(openuiPrompt.schema, 'Stack');
    const result = parser.parse(output.text);
    if (
      result.root &&
      !result.meta.errors.length &&
      !result.meta.unresolved.length &&
      !result.meta.orphaned.length
    )
      return;
    output.text += '\n';
    emit({ content: '\n' });
    yield* Effect.tryPromise({
      try: () =>
        session.prompt(
          `修正刚才的界面结构。错误：${JSON.stringify(result.meta)}。只输出有效 OpenUI Lang 定义，不要解释或代码围栏。可以重新定义 root 覆盖原根，必须包含本阶段的下一步按钮及所有需要显示的内容，root = Stack(...) 只写一次，绝不写 root = root =。保留用户填写信息和案例数据，不创建新业务阶段。`,
        ),
      catch: (cause) => new ProviderError({ cause }),
    });
    if (signal.aborted) return yield* Effect.interrupt;
    yield* assertChatAnswer(session, 'UI repair failed');
    const corrected = parser.parse(output.text);
    if (!corrected.root || corrected.meta.errors.length || corrected.meta.unresolved.length)
      return yield* Effect.fail(new UiRepairError({ message: 'Invalid UI' }));
  });
}
