'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EventType, openAIReadableStreamAdapter } from '@openuidev/react-headless';
import {
  metadataSchema,
  type Agent,
  type ChatMessage,
  type Conversation,
} from '@personal-design/ai-chat';

// Keep the browser's existing transcript; OpenUI's official adapter owns stream parsing.
export function usePiChat(conversation: Conversation, agent: Agent) {
  const [messages, setMessages] = useState<ChatMessage[]>(conversation.messages);
  const current = useRef(messages);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');
  const [error, setError] = useState<Error>();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const commit = useCallback((next: ChatMessage[]) => {
    current.current = next;
    if (mounted.current) setMessages(next);
  }, []);
  const clearError = useCallback(() => setError(undefined), []);
  const stop = useCallback(() => controller.current?.abort(), []);
  const run = useCallback(
    async (history: ChatMessage[]) => {
      if (controller.current) return;
      const requestController = new AbortController();
      controller.current = requestController;
      setError(undefined);
      setStatus('submitted');
      commit(history);
      const memory = [...history]
        .reverse()
        .map((m) => m.metadata?.memory)
        .find(Boolean);
      const boundary = memory ? history.findIndex((m) => m.id === memory.throughId) : -1;
      try {
        const response = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestController.signal,
          body: JSON.stringify({
            agent,
            messages: history
              .slice(boundary + 1)
              .map(({ metadata: _metadata, ...message }) => message),
            ...(boundary >= 0 ? { memory } : {}),
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        let metadata: ChatMessage['metadata'] = memory ? { memory } : undefined;
        const encoded = response.headers.get('x-ai-memory');
        if (encoded)
          metadata = metadataSchema.parse(
            JSON.parse(
              new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))),
            ),
          );
        const answer: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: '' }],
          metadata,
        };
        let text = '';
        let finished = false;
        for await (const event of openAIReadableStreamAdapter().parse(response)) {
          if (requestController.signal.aborted) break;
          if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
            text += event.delta;
            if (mounted.current) setStatus('streaming');
            commit([...history, { ...answer, parts: [{ type: 'text', text }] }]);
          } else if (event.type === EventType.TEXT_MESSAGE_END) finished = true;
        }
        if (!requestController.signal.aborted && (!finished || !text.trim()))
          throw new Error('回答中断，请重试。');
        if (mounted.current) setStatus('ready');
      } catch (cause) {
        if (mounted.current) {
          if (requestController.signal.aborted) setStatus('ready');
          else {
            setError(
              cause instanceof Error && /[\u4e00-\u9fff]/u.test(cause.message)
                ? cause
                : new Error('问答服务暂时不可用，请重试。'),
            );
            setStatus('error');
          }
        }
      } finally {
        if (controller.current === requestController) controller.current = null;
      }
    },
    [agent, commit],
  );
  const sendMessage = useCallback(
    (text: string) =>
      run([
        ...current.current,
        { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] },
      ]),
    [run],
  );
  const regenerate = useCallback(() => {
    let index = current.current.length - 1;
    while (index >= 0 && current.current[index]?.role !== 'user') index--;
    if (index >= 0) return run(current.current.slice(0, index + 1));
  }, [run]);
  const updateUiState = useCallback(
    (id: string, uiState: Record<string, unknown>) => {
      const message = current.current.find((m) => m.id === id);
      if (!message || JSON.stringify(message.metadata?.uiState) === JSON.stringify(uiState)) return;
      commit(
        current.current.map((m) =>
          m.id === id ? { ...m, metadata: { ...m.metadata, uiState } } : m,
        ),
      );
    },
    [commit],
  );
  return { messages, sendMessage, status, error, stop, regenerate, clearError, updateUiState };
}
