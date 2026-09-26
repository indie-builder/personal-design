'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePiChat } from '@/lib/use-pi-chat';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Menu,
  Plus,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import {
  agentSchema,
  avatarUrl,
  isMaleAvatar,
  randomAvatarId,
  uiExamples,
  defaultAgent,
  savedSchema,
  metadataSchema,
  type Agent,
  type ChatMessage,
  type Conversation,
  type SavedChat,
} from '@personal-design/ai-chat';
import { instantMotion, observeMotionPolicy, playExit } from '@/lib/motion';
import { Button, buttonClassName } from './button';
import { GeneratedAnswer } from './ai-chat-ui';
import styles from './ai-chat.module.css';

const STORAGE_KEY = 'personal-design:ai-chat:v1';
const emptyStore: SavedChat = { agents: [defaultAgent], conversations: [] };

function newConversation(agentId: string): Conversation {
  return { id: crypto.randomUUID(), agentId, title: '新对话', messages: [] };
}

export function AiChat() {
  const [saved, setSaved] = useState<SavedChat>(emptyStore);
  const [active, setActive] = useState<Conversation | null>(null);
  const [panel, setPanel] = useState<'agents' | 'create' | 'history' | null>(null);
  const [busy, setBusy] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [formError, setFormError] = useState('');
  const [agentDraft, setAgentDraft] = useState({ name: '', prompt: '' });
  const page = useRef<HTMLElement>(null);
  const creationEntry = useRef<Animation | null>(null);
  const creationExit = useRef<ReturnType<typeof playExit> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const creation = useRef<HTMLElement>(null);
  const agentPopover = useRef<HTMLDivElement>(null);
  const agentButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      // Browser storage is read after hydration; server and first client render must match.
      let initial = emptyStore;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) initial = savedSchema.parse(JSON.parse(raw));
      } catch {
        setStorageError('本机历史记录无法读取，本次对话仍可使用。');
      }
      const agents = initial.agents.some((item) => item.id === defaultAgent.id)
        ? initial.agents
        : [defaultAgent, ...initial.agents];
      initial = {
        ...initial,
        agents: agents.map((item) => ({
          ...item,
          ...(item.id === defaultAgent.id
            ? { name: defaultAgent.name, prompt: defaultAgent.prompt }
            : {}),
          avatarId: isMaleAvatar(item.avatarId) ? item.avatarId : randomAvatarId(),
        })),
      };
      setSaved(initial);
      setActive(
        initial.conversations.find((item) =>
          initial.agents.some((agent) => agent.id === item.agentId),
        ) ?? newConversation(defaultAgent.id),
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!active || storageError) return;
    queueMicrotask(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {
        setStorageError('浏览器存储不可用，本次更新暂未保存，请保留当前页面。');
      }
    });
  }, [saved, active, storageError]);

  useEffect(() => {
    const surface = page.current;
    const modal = dialog.current;
    const editor = creation.current;
    const dropdown = agentPopover.current;
    if (panel === 'history') {
      dropdown?.hidePopover();
      modal?.showModal();
    } else {
      modal?.close();
      if (panel === 'agents') {
        dropdown?.showPopover();
        dropdown?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
      } else dropdown?.hidePopover();
      if (panel === 'create')
        editor?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    // Mobile keyboards resize the visual viewport, not necessarily 100dvh.
    const viewport = window.visualViewport;
    const fitCreation = () => {
      if (panel !== 'create' || !viewport) return;
      const headerHeight = surface
        ? Number.parseFloat(getComputedStyle(surface).getPropertyValue('--ai-header-height')) || 0
        : 0;
      const visibleTop = Math.max(0, headerHeight - viewport.offsetTop);
      editor?.style.setProperty(
        '--create-visible-height',
        `${Math.max(0, viewport.height - visibleTop)}px`,
      );
    };
    fitCreation();
    viewport?.addEventListener('resize', fitCreation);
    viewport?.addEventListener('scroll', fitCreation);
    return () => {
      viewport?.removeEventListener('resize', fitCreation);
      viewport?.removeEventListener('scroll', fitCreation);
      editor?.style.removeProperty('--create-visible-height');
      if (!surface?.getClientRects().length) surface?.setAttribute('data-motion-paused', '');
      modal?.close();
      dropdown?.hidePopover();
    };
  }, [panel]);

  useEffect(
    () =>
      observeMotionPolicy(() => {
        page.current?.toggleAttribute('data-motion-paused', document.hidden);
        if (document.documentElement.dataset.input === 'keyboard') setHeaderHidden(false);
        if (instantMotion() || document.hidden) {
          creationEntry.current?.finish();
          creationExit.current?.finish();
        }
      }),
    [],
  );

  useLayoutEffect(() => {
    creationExit.current?.cancel();
    creationExit.current = null;
    const editor = creation.current;
    if (editor) {
      editor.inert = false;
      delete editor.dataset.exiting;
    }
    if (panel === 'create' && editor && !instantMotion() && !document.hidden) {
      creationEntry.current = editor.animate(
        [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)' },
      );
    }
    return () => {
      creationEntry.current?.cancel();
      creationEntry.current = null;
      creationExit.current?.cancel();
      creationExit.current = null;
      if (editor) {
        editor.inert = false;
        delete editor.dataset.exiting;
      }
    };
  }, [panel]);

  function leaveCreation(next: 'agents' | null, complete?: () => void) {
    if (creationExit.current) {
      creationExit.current.finish();
      return;
    }
    const editor = creation.current;
    const commit = () => {
      setPanel(next);
      complete?.();
    };
    if (!editor || instantMotion() || document.hidden) {
      commit();
      return;
    }
    // Read once before cancelling an interrupted entrance; return from its actual position.
    const transform = getComputedStyle(editor).transform;
    creationEntry.current?.cancel();
    creationEntry.current = null;
    editor.inert = true;
    editor.dataset.exiting = 'true';
    creationExit.current = playExit(
      editor,
      commit,
      [{ transform }, { transform: 'translateX(100%)' }],
      { duration: 180, hold: true, easing: 'cubic-bezier(.32,.72,0,1)' },
    );
  }

  function closePanel() {
    const target = panel === 'history' ? menuButton.current : agentButton.current;
    if (panel === 'create') {
      leaveCreation(null, () => requestAnimationFrame(() => target?.focus()));
      return;
    }
    dialog.current?.close();
    agentPopover.current?.hidePopover();
    setPanel(null);
    requestAnimationFrame(() => target?.focus());
  }

  const updateMessages = useCallback(
    (id: string, messages: ChatMessage[]) => {
      const clean = messages
        .map((message) => ({
          id: message.id,
          role: message.role as 'user' | 'assistant',
          metadata: metadataSchema.safeParse(message.metadata).data,
          parts: message.parts
            .filter((part) => part.type === 'text')
            .map((part) => ({ type: 'text' as const, text: part.text })),
        }))
        .filter((message) => message.parts.length > 0);
      if (!clean.length) return;
      setSaved((current) => {
        const existing = current.conversations.find((conversation) => conversation.id === id);
        const source = existing ?? (active?.id === id ? active : null);
        if (!source) return current;
        const updated = {
          ...source,
          title:
            clean.find((message) => message.role === 'user')?.parts[0]?.text.slice(0, 48) ||
            '新对话',
          messages: clean,
        };
        return {
          ...current,
          conversations: [
            updated,
            ...current.conversations.filter((conversation) => conversation.id !== id),
          ],
        };
      });
    },
    [active],
  );

  const agent = saved.agents.find((item) => item.id === active?.agentId) ?? defaultAgent;
  function selectAgent(next: Agent) {
    if (next.id !== agent.id) setActive(newConversation(next.id));
    closePanel();
  }

  return (
    <main ref={page} className={styles.page}>
      <div
        className={styles.chatSurface}
        inert={panel === 'create'}
        aria-hidden={panel === 'create' || undefined}
        onKeyDownCapture={() => setHeaderHidden(false)}
      >
        <header
          className={styles.header}
          data-hidden={(headerHidden && !panel) || undefined}
          inert={headerHidden && !panel}
          aria-hidden={(headerHidden && !panel) || undefined}
        >
          <button
            ref={menuButton}
            type="button"
            className={buttonClassName({ icon: true, variant: 'ghost' })}
            aria-label="打开导航"
            onClick={() => setPanel('history')}
            disabled={busy}
          >
            <Menu size={22} strokeWidth={1.6} />
          </button>
          <button
            ref={agentButton}
            type="button"
            className={styles.agentButton}
            aria-haspopup="dialog"
            aria-controls="ai-agent-list"
            aria-expanded={panel === 'agents' || panel === 'create'}
            onClick={() => setPanel(panel === 'agents' ? null : 'agents')}
            disabled={busy}
          >
            <span className={styles.avatar} aria-hidden="true">
              <Image src={avatarUrl(agent.avatarId)} alt="" width={36} height={36} unoptimized />
            </span>
            <span className={styles.agentName}>{agent.name}</span>
            <ChevronDown size={18} strokeWidth={1.6} />
          </button>
          <Button
            icon
            variant="ghost"
            aria-label="新建对话"
            disabled={busy || !active}
            onClick={() => setActive(newConversation(agent.id))}
          >
            <Plus size={24} strokeWidth={1.6} />
          </Button>
        </header>
        {storageError && (
          <p className={styles.storageNotice} role="status">
            {storageError}
          </p>
        )}
        {active ? (
          <ConversationView
            key={active.id}
            conversation={active}
            agent={agent}
            onMessages={updateMessages}
            onBusy={setBusy}
            onHeaderHiddenChange={setHeaderHidden}
          />
        ) : (
          <p className={styles.loading} role="status">
            正在打开对话…
          </p>
        )}
      </div>
      {panel === 'create' && (
        <section
          ref={creation}
          id="agent-creation"
          className={styles.createScreen}
          aria-labelledby="agent-creation-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              leaveCreation('agents');
            }
          }}
        >
          <div className={`${styles.panelHeader} ${styles.createHeader}`}>
            <Button
              icon
              variant="ghost"
              aria-label="返回智能体列表"
              onClick={() => leaveCreation('agents')}
            >
              <ArrowLeft size={18} strokeWidth={1.6} />
            </Button>
            <h2 id="agent-creation-title">创建智能体</h2>
            <span aria-hidden="true" />
          </div>
          <form
            className={styles.agentForm}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = agentSchema.safeParse({
                id: crypto.randomUUID(),
                name: data.get('name'),
                prompt: data.get('prompt'),
                avatarId: randomAvatarId(),
              });
              if (!result.success) {
                setFormError('请填写名称和系统提示词，内容不能只有空格。');
                return;
              }
              if (saved.agents.length >= 100) {
                setFormError('本机已创建 100 个智能体。');
                return;
              }
              leaveCreation(null, () => {
                setSaved((current) => ({ ...current, agents: [...current.agents, result.data] }));
                setActive(newConversation(result.data.id));
                setAgentDraft({ name: '', prompt: '' });
                requestAnimationFrame(() => agentButton.current?.focus());
              });
            }}
          >
            <div className={styles.createFields}>
              <label>
                名称
                <input
                  name="name"
                  required
                  maxLength={40}
                  value={agentDraft.name}
                  onChange={(event) =>
                    setAgentDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  placeholder="例如：写作助手"
                  autoComplete="off"
                  enterKeyHint="next"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      creation.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
                    }
                  }}
                />
              </label>
              <label className={styles.promptField}>
                系统提示词
                <textarea
                  name="prompt"
                  required
                  maxLength={12000}
                  rows={8}
                  value={agentDraft.prompt}
                  onChange={(event) =>
                    setAgentDraft((draft) => ({ ...draft, prompt: event.target.value }))
                  }
                  placeholder="例如：你是一位写作助手。先理解我的目标，再给出简洁、具体的修改建议。"
                />
              </label>
            </div>
            <div className={styles.formActions}>
              {formError && <p role="alert">{formError}</p>}
              <Button
                variant="primary"
                type="submit"
                disabled={!agentDraft.name.trim() || !agentDraft.prompt.trim()}
              >
                创建并开始对话
              </Button>
            </div>
          </form>
        </section>
      )}

      <div
        ref={agentPopover}
        popover="auto"
        id="ai-agent-list"
        role="dialog"
        aria-label="选择智能体"
        className={styles.agentPopover}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closePanel();
          }
        }}
        onToggle={(event) => {
          if (event.newState === 'closed')
            setPanel((current) => (current === 'agents' ? null : current));
        }}
      >
        <ul className={styles.agentList}>
          {saved.agents.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectAgent(item)}
                aria-pressed={item.id === agent.id}
              >
                <span className={styles.smallAvatar} aria-hidden="true">
                  <Image src={avatarUrl(item.avatarId)} alt="" width={32} height={32} unoptimized />
                </span>
                <span>{item.name}</span>
                {item.id === agent.id && <Check size={18} strokeWidth={1.6} />}
              </button>
            </li>
          ))}
        </ul>
        <Button
          className={styles.createButton}
          variant="ghost"
          onClick={() => {
            setFormError('');
            setPanel('create');
          }}
        >
          <Plus size={18} strokeWidth={1.6} />
          创建智能体
        </Button>
      </div>

      <dialog
        ref={dialog}
        className={`${styles.dialog} ${styles.drawer}`}
        aria-labelledby="ai-panel-title"
        onCancel={(event) => {
          event.preventDefault();
          closePanel();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) closePanel();
        }}
      >
        <div className={`${styles.panel} ${styles.navigation}`}>
          <div className={styles.panelHeader}>
            <h2 id="ai-panel-title">对话</h2>
            <Button icon variant="ghost" aria-label="关闭" onClick={closePanel}>
              <X size={20} strokeWidth={1.6} />
            </Button>
          </div>
          <Button
            className={styles.drawerNew}
            variant="subtle"
            onClick={() => {
              setActive(newConversation(agent.id));
              closePanel();
            }}
          >
            <Plus size={18} strokeWidth={1.6} />
            新建对话
          </Button>
          <h3 className={styles.historyLabel}>对话记录</h3>
          <nav className={styles.history} aria-label="历史对话">
            {saved.conversations.length ? (
              saved.conversations.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={item.id === active?.id ? 'true' : undefined}
                  onClick={() => {
                    setActive(item);
                    closePanel();
                  }}
                >
                  <span>{item.title}</span>
                  <small>
                    {saved.agents.find((value) => value.id === item.agentId)?.name || '智能体'}
                  </small>
                </button>
              ))
            ) : (
              <p className={styles.muted}>还没有对话，发送一个问题开始吧。</p>
            )}
          </nav>
        </div>
      </dialog>
    </main>
  );
}

function ConversationView({
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
    (text: string) => {
      const value = text.trim();
      if (!value || busy || value.length > 4000) return;
      clearError();
      setInput('');
      setAtBottom(true);
      void sendMessage(value);
    },
    [busy, clearError, sendMessage],
  );

  return (
    <section className={styles.thread} aria-label="对话">
      <div
        ref={scroll}
        className={styles.messages}
        onWheel={() => {
          scrollGesture.current.userUntil = performance.now() + 1200;
        }}
        onTouchMove={() => {
          scrollGesture.current.userUntil = performance.now() + 1200;
        }}
        onPointerDown={() => {
          scrollGesture.current.userUntil = performance.now() + 1200;
        }}
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
                  <p>{text}</p>
                ) : (
                  <fieldset className={styles.answerContent} disabled={busy}>
                    <div data-answer-body>
                      <GeneratedAnswer
                        text={text}
                        streaming={streaming}
                        onReply={send}
                        initialState={message.metadata?.uiState}
                        onStateUpdate={(state) => updateUiState(message.id, state)}
                      />
                    </div>
                    {!streaming && (
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
                          {copyStatus?.id === message.id && copyStatus.ok ? (
                            <Check size={16} />
                          ) : (
                            <Copy size={16} />
                          )}
                        </Button>
                        {!busy && index === messages.length - 1 && (
                          <Button
                            icon
                            variant="ghost"
                            aria-label="重新生成"
                            title="重新生成"
                            onClick={() => {
                              setCopyStatus(null);
                              setAtBottom(true);
                              void regenerate();
                            }}
                          >
                            <RotateCcw size={16} />
                          </Button>
                        )}
                        {copyStatus?.id === message.id && (
                          <span role="status">{copyStatus.ok ? '已复制' : '复制失败，请重试'}</span>
                        )}
                      </div>
                    )}
                  </fieldset>
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
