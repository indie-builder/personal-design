'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EventType, openAIReadableStreamAdapter } from '@openuidev/react-headless';
import { createChatStream } from './chat-stream';
import { readToolStatus } from './chat-tools';
import {
  memorySchema,
  messageSchema,
  type ChatToolStep,
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
  const [toolSteps, setToolSteps] = useState<ChatToolStep[]>([]);
  const controller = useRef<AbortController | null>(null);
  const stream = useRef<ReturnType<typeof createChatStream> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.cancel();
      controller.current?.abort();
    };
  }, []);
  const commit = useCallback((next: ChatTranscript) => {
    current.current = next;
    if (mounted.current) setTranscript(next);
  }, []);
  const stop = useCallback(() => {
    stream.current?.flush();
    controller.current?.abort();
  }, []);
  const run = useCallback(
    async (history: ChatMessage[]) => {
      if (controller.current) return;
      const requestController = new AbortController();
      controller.current = requestController;
      setError(undefined);
      setToolSteps([]);
      setStatus('submitted');
      let memory = current.current.memory;
      const boundary = history.findIndex((m) => m.id === memory?.throughId);
      if (boundary < 0) memory = undefined;
      commit({ messages: history, memory });
      let failure: Error | undefined;
      const finishStream = () => {
        stream.current?.flush();
        stream.current?.cancel();
        stream.current = null;
        if (controller.current === requestController) controller.current = null;
        if (mounted.current) {
          if (failure && !requestController.signal.aborted) {
            setError(failure);
            setStatus('error');
          } else setStatus('ready');
        }
      };
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
        const startStream = () => {
          text = '';
          stream.current?.cancel();
          stream.current = createChatStream((value) => {
            if (mounted.current) {
              setStatus('streaming');
              commit({ messages: [...history, { ...answer, text: value }], memory });
            }
          });
        };
        startStream();
        // 与服务端对称，工具开始即重置回答；状态支路不阻塞 OpenUI 解析。
        const [forAdapter, forStatus] = response.body!.tee();
        void readToolStatus(forStatus, {
          active: () => mounted.current,
          onStart: (step) => {
            setToolSteps((steps) => [...steps, step]);
            startStream();
          },
          onEnd: (key, state) => {
            setToolSteps((steps) =>
              steps.map((step) => (step.key === key ? { ...step, state } : step)),
            );
          },
        });
        for await (const event of openAIReadableStreamAdapter().parse(new Response(forAdapter))) {
          if (requestController.signal.aborted) break;
          if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
            text += event.delta;
            stream.current?.append(event.delta);
          } else if (event.type === EventType.TEXT_MESSAGE_END) finished = true;
        }
        if (!requestController.signal.aborted && (!finished || !text.trim()))
          throw new Error('回答中断，请重试。');
      } catch (cause) {
        failure =
          cause instanceof Error && /[\u4e00-\u9fff]/u.test(cause.message)
            ? cause
            : new Error('问答服务暂时不可用，请重试。');
      } finally {
        finishStream();
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
  return { transcript, sendMessage, status, error, stop, regenerate, updateUiState, toolSteps };
}
