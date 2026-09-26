import 'server-only';
import { modelMessageContent, type ChatMessage } from '@personal-design/ai-chat';
import type { Message } from '@earendil-works/pi-ai';

export async function createPiRuntime() {
  const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
  const { InMemoryCredentialStore, InMemoryModelsStore } = await import('@earendil-works/pi-ai');
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    refreshOnCreate: false,
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
  await runtime.setRuntimeApiKey('zhipu-chat', process.env.ZHIPU_API_KEY!);
  const model = runtime.getModel('zhipu-chat', id);
  if (!model) throw new Error('Model not configured');
  return { runtime, model };
}

export async function createChatSession(
  provider: Awaited<ReturnType<typeof createPiRuntime>>,
  system: string,
  history: ChatMessage[],
) {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } =
    await import('@earendil-works/pi-coding-agent');
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
  await resourceLoader.reload();
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
  const { session } = await createAgentSession({
    modelRuntime: provider.runtime,
    model: provider.model,
    thinkingLevel: 'off',
    noTools: 'all',
    tools: [],
    resourceLoader,
    sessionManager,
    settingsManager,
  });
  return session;
}
