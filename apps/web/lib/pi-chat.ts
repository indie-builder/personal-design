import 'server-only';
import { Effect } from 'effect';
import { modelMessageContent, type ChatMessage } from '@personal-design/ai-chat';
import type { Message } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { PiRuntimeError, PiSessionError } from './chat-error';

export function createPiRuntime() {
  return Effect.gen(function* () {
    const [{ ModelRuntime }, { InMemoryCredentialStore, InMemoryModelsStore }] = yield* Effect.all(
      [
        Effect.promise(() => import('@earendil-works/pi-coding-agent')),
        Effect.promise(() => import('@earendil-works/pi-ai')),
      ],
      { concurrency: 'unbounded' },
    );
    const runtime = yield* Effect.tryPromise({
      try: () =>
        ModelRuntime.create({
          credentials: new InMemoryCredentialStore(),
          modelsStore: new InMemoryModelsStore(),
          modelsPath: null,
          refreshOnCreate: false,
        }),
      catch: (cause) => new PiRuntimeError({ cause }),
    });
    const id = process.env.ZHIPU_MODEL || 'glm-5.3-flash';
    runtime.registerProvider('zhipu-chat', {
      api: 'openai-completions',
      baseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4',
      models: [
        {
          id,
          name: id,
          reasoning: true,
          input: ['text'],
          contextWindow: 128000,
          maxTokens: 8000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          compat: {
            thinkingFormat: 'zai',
            supportsDeveloperRole: false,
            maxTokensField: 'max_tokens',
          },
        },
      ],
    });
    yield* Effect.tryPromise({
      try: () => runtime.setRuntimeApiKey('zhipu-chat', process.env.ZHIPU_API_KEY!),
      catch: (cause) => new PiRuntimeError({ cause }),
    });
    const model = runtime.getModel('zhipu-chat', id);
    if (!model)
      return yield* Effect.fail(new PiRuntimeError({ cause: new Error('Model not configured') }));
    return { runtime, model };
  });
}

export function createChatSession(
  provider: Effect.Success<ReturnType<typeof createPiRuntime>>,
  system: string,
  history: ChatMessage[],
  options?: { tools?: ToolDefinition[] },
) {
  return Effect.gen(function* () {
    const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } =
      yield* Effect.promise(() => import('@earendil-works/pi-coding-agent'));
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, provider: { maxRetries: 1, timeoutMs: 110000 } },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: system,
    });
    yield* Effect.tryPromise({
      try: () => resourceLoader.reload(),
      catch: (cause) => new PiSessionError({ cause }),
    });
    const sessionManager = SessionManager.inMemory();
    for (const item of history) {
      const content = modelMessageContent(item);
      const message: Message =
        item.role === 'user'
          ? { role: 'user', content, timestamp: Date.now() }
          : {
              role: 'assistant',
              content: [{ type: 'text', text: content }],
              timestamp: Date.now(),
              api: provider.model.api,
              provider: provider.model.provider,
              model: provider.model.id,
              stopReason: 'stop',
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            };
      sessionManager.appendMessage(message);
    }
    const analyticsTools = options?.tools;
    const { session } = yield* Effect.tryPromise({
      try: () =>
        createAgentSession({
          modelRuntime: provider.runtime,
          model: provider.model,
          thinkingLevel: 'off',
          // options.tools 优先于 noTools 生效；提供工具时按名单激活,内置工具保持关闭。
          noTools: 'all',
          tools: analyticsTools?.map((tool) => tool.name),
          customTools: analyticsTools,
          resourceLoader,
          sessionManager,
          settingsManager,
        }),
      catch: (cause) => new PiSessionError({ cause }),
    });
    return session;
  });
}
