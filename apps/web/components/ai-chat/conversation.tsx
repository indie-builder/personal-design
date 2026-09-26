'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, RotateCcw, Square } from 'lucide-react';
import type { Agent, ChatMessage, Conversation, FormSubmission } from '@personal-design/ai-chat';
import { defaultAgent, uiExamples } from '@personal-design/ai-chat';
import { usePiChat } from '@/lib/use-pi-chat';
import { Button } from '../button';
import { SubmittedForm } from '../ai-chat-submission';
import { GeneratedAnswer } from '../ai-chat-ui';
import styles from '../ai-chat.module.css';

export function ConversationView({
  conversation,
  agent,
  onMessages,
  onBusy,
  onHeaderHiddenChange,
}: {
  conversation: Conversation;
  agent: Agent;
  onMessages: (id: string, messages: ChatMessage[]) => void;
  onBusy: (busy: boolean) => void;
  onHeaderHiddenChange: (hidden: boolean) => void;
}) {
  const { messages, sendMessage, status, error, stop, regenerate, clearError, updateUiState } =
    usePiChat(conversation, agent);
  const [input, setInput] = useState('');
  const [copyStatus, setCopyStatus] = useState<{ id: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(null), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const [restoredMessages] = useState(
    () => new Set(conversation.messages.map((message) => message.id)),
  );
  const [atBottom, setAtBottom] = useState(true);
  const composerHidden = !atBottom;
  const scroll = useRef<HTMLDivElement>(null);
  const composerArea = useRef<HTMLDivElement>(null);
  const scrollGesture = useRef({ top: 0, travel: 0, userUntil: 0 });
  useEffect(() => onHeaderHiddenChange(false), [onHeaderHiddenChange]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    onBusy(busy);
    if (busy) onHeaderHiddenChange(false);
    return () => onBusy(false);
  }, [busy, onBusy, onHeaderHiddenChange]);
  useEffect(() => {
    onMessages(conversation.id, messages);
  }, [conversation.id, messages, onMessages]);
  useEffect(
    () => () => {
      if (busyRef.current) void stop();
    },
    [stop],
  );
  useEffect(() => {
    if (atBottom && scroll.current) {
      scroll.current.scrollTop = scroll.current.scrollHeight;
      scrollGesture.current.top = scroll.current.scrollTop;
      scrollGesture.current.travel = 0;
    }
  }, [messages, status, atBottom]);

  useEffect(() => {
    const area = composerArea.current;
    const viewport = scroll.current;
    if (!area || !viewport) return;
    const fit = () => {
      area.parentElement?.style.setProperty('--composer-height', `${area.offsetHeight}px`);
      if (atBottom) {
        viewport.scrollTop = viewport.scrollHeight;
        scrollGesture.current.top = viewport.scrollTop;
        scrollGesture.current.travel = 0;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [atBottom]);

  const send = useCallback(
    (text: string, submission?: FormSubmission) => {
      const value = text.trim();
      if (!value || busy || value.length > 4000) return;
      clearError();
      setInput('');
      setAtBottom(true);
      void sendMessage(value, submission);
    },
    [busy, clearError, sendMessage],
  );

  // 抬手方向决定页头隐藏；输入聚焦或到顶强制显示
  const markUserScroll = () => {
    scrollGesture.current.userUntil = performance.now() + 1200;
  };

  return (
    <section className={styles.thread} aria-label="对话">
      <div
        ref={scroll}
        className={styles.messages}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onPointerDown={markUserScroll}
        onScroll={() => {
          const element = scroll.current;
          if (!element) return;
          setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
          const gesture = scrollGesture.current;
          const top = Math.max(0, element.scrollTop);
          const delta = top - gesture.top;
          gesture.top = top;
          if (performance.now() > gesture.userUntil) return;
          gesture.userUntil = performance.now() + 1200;
          gesture.travel =
            Math.sign(delta) === Math.sign(gesture.travel) ? gesture.travel + delta : delta;
          if (top < 24 || document.activeElement === textarea.current) {
            onHeaderHiddenChange(false);
            gesture.travel = 0;
          } else if (Math.abs(gesture.travel) >= 12) {
            onHeaderHiddenChange(gesture.travel > 0);
            gesture.travel = 0;
          }
        }}
      >
        <div className={styles.messageInner}>
          {!messages.length && (
            <div className={styles.welcome}>
              <h2>
                {agent.id === defaultAgent.id ? '找到适合团队的协作方式' : '今天想聊些什么？'}
              </h2>
              <p>
                {agent.id === defaultAgent.id
                  ? '从选方案到安排试用，一起把需求理清楚。'
                  : '说说你的需求，我们一起理清思路。'}
              </p>
              <div className={styles.suggestions} aria-label="示例问题">
                {uiExamples.map((example) => (
                  <Button
                    key={example.id}
                    variant="default"
                    disabled={busy}
                    aria-label={example.question}
                    onClick={() => send(example.prompt)}
                  >
                    <span className={styles.promptQuestion}>{example.question}</span>
                    <span className={styles.promptDescription}>{example.description}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const text = message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n');
            const streaming = busy && index === messages.length - 1;
            if (message.role === 'assistant' && !text) return null;
            return (
              <article
                key={message.id}
                data-arriving={!restoredMessages.has(message.id) || undefined}
                className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
                aria-label={message.role === 'user' ? '你的问题' : `${agent.name}的回答`}
              >
                {message.role === 'user' ? (
                  <>
                    <p>{text}</p>
                    {message.metadata?.submission && (
                      <SubmittedForm submission={message.metadata.submission} />
                    )}
                  </>
                ) : (
                  <div className={styles.answerContent}>
                    <div data-answer-body>
                      <GeneratedAnswer
                        text={text}
                        streaming={streaming}
                        readOnly={busy || index !== messages.length - 1}
                        onReply={send}
                        initialState={message.metadata?.uiState}
                        onStateUpdate={(state) => updateUiState(message.id, state)}
                      />
                    </div>
                    {!streaming && (
                      <MessageActions
                        message={message}
                        isLatest={index === messages.length - 1}
                        busy={busy}
                        copyStatus={copyStatus}
                        setCopyStatus={setCopyStatus}
                        onRegenerate={() => {
                          setCopyStatus(null);
                          setAtBottom(true);
                          void regenerate();
                        }}
                      />
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {busy && (
            <p className={styles.progress} role="status" data-generation-status>
              <span className={styles.waitDots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {status === 'submitted' ? '正在思考…' : '正在生成回答…'}
            </p>
          )}
          {error && (
            <div className={styles.error} role="alert">
              <p>
                {error.message === 'Failed to fetch'
                  ? '网络连接中断，请检查网络后重试。'
                  : error.message}
              </p>
              <Button
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
              >
                重试
              </Button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={composerArea}
        className={styles.composerArea}
        data-hidden={composerHidden || undefined}
      >
        {!atBottom && (
          <Button
            icon
            className={styles.toBottom}
            aria-label="回到最新消息"
            onClick={() => {
              onHeaderHiddenChange(false);
              setAtBottom(true);
            }}
          >
            <ArrowDown size={20} strokeWidth={1.6} />
          </Button>
        )}
        <div
          className={styles.composerPanel}
          data-composer-panel=""
          data-hidden={composerHidden || undefined}
          inert={composerHidden}
          aria-hidden={composerHidden || undefined}
          onFocusCapture={() => onHeaderHiddenChange(false)}
        >
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={textarea}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label={`发消息给${agent.name}`}
              placeholder={`发消息给${agent.name}…`}
              rows={1}
              maxLength={4000}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  !window.matchMedia('(pointer: coarse)').matches
                ) {
                  event.preventDefault();
                  send(input);
                }
              }}
            />
            {busy ? (
              <Button icon variant="primary" aria-label="停止生成" onClick={() => void stop()}>
                <Square size={16} fill="currentColor" />
              </Button>
            ) : (
              <Button
                type="submit"
                icon
                variant="primary"
                aria-label="发送消息"
                disabled={!input.trim()}
              >
                <ArrowUp size={20} strokeWidth={1.6} />
              </Button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

/** 复制渲染后的正文；最新回答额外提供重新生成。 */
function MessageActions({
  message,
  isLatest,
  busy,
  copyStatus,
  setCopyStatus,
  onRegenerate,
}: {
  message: ChatMessage;
  isLatest: boolean;
  busy: boolean;
  copyStatus: { id: string; ok: boolean } | null;
  setCopyStatus: (status: { id: string; ok: boolean } | null) => void;
  onRegenerate: () => void;
}) {
  const copied = copyStatus?.id === message.id ? copyStatus : null;
  return (
    <div className={styles.messageActions} role="group" aria-label="回答操作">
      <Button
        icon
        variant="ghost"
        aria-label="复制回答"
        title="复制回答"
        onClick={async (event) => {
          const content = event.currentTarget
            .closest('article')
            ?.querySelector<HTMLElement>('[data-answer-body]')?.innerText;
          if (!content) return;
          try {
            await navigator.clipboard.writeText(content);
            setCopyStatus({ id: message.id, ok: true });
          } catch {
            setCopyStatus({ id: message.id, ok: false });
          }
        }}
      >
        {copied?.ok ? <Check size={16} /> : <Copy size={16} />}
      </Button>
      {!busy && isLatest && (
        <Button icon variant="ghost" aria-label="重新生成" title="重新生成" onClick={onRegenerate}>
          <RotateCcw size={16} />
        </Button>
      )}
      {copied && <span role="status">{copied.ok ? '已复制' : '复制失败，请重试'}</span>}
    </div>
  );
}
