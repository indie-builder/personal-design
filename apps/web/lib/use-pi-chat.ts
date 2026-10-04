'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EventType, openAIReadableStreamAdapter } from '@openuidev/react-headless';
import {
  memorySchema,
  messageSchema,
  type FormSubmission,
  type Agent,
  type ChatMessage,
  type ChatTranscript,
  type Conversation,
} from '@personal-design/ai-chat';

// Keep the browser's existing transcript; OpenUI's official adapter owns stream parsing.
export function usePiChat(conversation: Conversation, agent: Agent) {
  const [transcript, setTranscript] = useState<ChatTranscript>({
    messages: conversation.messages,
    memory: conversation.memory,
  });
  const current = useRef(transcript);
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
  const commit = useCallback((next: ChatTranscript) => {
    current.current = next;
    if (mounted.current) setTranscript(next);
  }, []);
  const stop = useCallback(() => controller.current?.abort(), []);
  const run = useCallback(
    async (history: ChatMessage[]) => {
      if (controller.current) return;
      const requestController = new AbortController();
      controller.current = requestController;
      setError(undefined);
      setStatus('submitted');
      let memory = current.current.memory;
      const boundary = history.findIndex((m) => m.id === memory?.throughId);
      if (boundary < 0) memory = undefined;
      commit({ messages: history, memory });
      try {
        const response = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestController.signal,
          body: JSON.stringify({
            agent,
            messages: history.slice(boundary + 1).map(({ metadata, ...message }) => ({
              ...message,
              ...(metadata?.submission ? { metadata: { submission: metadata.submission } } : {}),
            })),
            ...(memory ? { memory } : {}),
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        const encoded = response.headers.get('x-ai-memory');
        if (encoded) {
          memory = memorySchema.parse(
            JSON.parse(
              new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))),
            ).memory,
          );
          commit({ messages: history, memory });
        }
        const answer: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: '',
        };
        let text = '';
        let finished = false;
        for await (const event of openAIReadableStreamAdapter().parse(response)) {
          if (requestController.signal.aborted) break;
          if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
            text += event.delta;
            if (mounted.current) setStatus('streaming');
            commit({ messages: [...history, { ...answer, text }], memory });
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
    (text: string, submission?: FormSubmission) => {
      try {
        // Snapshot ActionEvent state as JSON, matching OpenUI's context serialization.
        const message = messageSchema.parse(
          JSON.parse(
            JSON.stringify({
              id: crypto.randomUUID(),
              role: 'user',
              text,
              ...(submission ? { metadata: { submission } } : {}),
            }),
          ),
        );
        return run([...current.current.messages, message]);
      } catch {
        setError(new Error('提交内容过长或格式不正确，请检查后重试。'));
        setStatus('error');
        return Promise.resolve();
      }
    },
    [run],
  );
  const regenerate = useCallback(() => {
    setError(undefined);
    const { messages } = current.current;
    let index = messages.length - 1;
    while (index >= 0 && messages[index]?.role !== 'user') index--;
    if (index >= 0) return run(messages.slice(0, index + 1));
  }, [run]);
  const updateUiState = useCallback(
    (id: string, uiState: Record<string, unknown>) => {
      const message = current.current.messages.find((m) => m.id === id);
      if (!message || JSON.stringify(message.metadata?.uiState) === JSON.stringify(uiState)) return;
      commit({
        ...current.current,
        messages: current.current.messages.map((m) =>
          m.id === id ? { ...m, metadata: { ...m.metadata, uiState } } : m,
        ),
      });
    },
    [commit],
  );
  return { transcript, sendMessage, status, error, stop, regenerate, updateUiState };
}
