import { Img } from './img';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Menu, Plus, X } from 'lucide-react';
import {
  avatarUrl,
  defaultAgent,
  type Agent,
  type ChatTranscript,
  type Conversation,
} from '@personal-design/ai-chat';
import {
  EASE_CHAT_SCREEN,
  EASE_EXIT,
  instantMotion,
  observeMotionPolicy,
  playExit,
} from '@/lib/motion';
import { Button, buttonClassName } from './button';
import { AgentCreationScreen } from './ai-chat/agent-creation';
import { ConversationView } from './ai-chat/conversation';
import { useSavedChat } from './ai-chat/use-saved-chat';
import styles from './ai-chat.module.css';
import conversationMotion from './ai-chat-conversation-motion.module.css';

function newConversation(agentId: string): Conversation {
  return { id: crypto.randomUUID(), agentId, title: '新对话', messages: [] };
}

export function AiChat() {
  const [active, setActive] = useState<Conversation | null>(null);
  const [panel, setPanel] = useState<'agents' | 'create' | 'history' | null>(null);
  const [busy, setBusy] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [agentDraft, setAgentDraft] = useState({ name: '', prompt: '' });
  const [formError, setFormError] = useState('');
  const page = useRef<HTMLElement>(null);
  const creationEntry = useRef<Animation | null>(null);
  const creationExit = useRef<ReturnType<typeof playExit> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const creation = useRef<HTMLElement>(null);
  const agentPopover = useRef<HTMLDivElement>(null);
  const agentButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const conversationSurface = useRef<HTMLDivElement>(null);
  const conversationEntry = useRef<Animation | null>(null);
  const conversationExit = useRef<ReturnType<typeof playExit> | null>(null);
  const conversationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const incomingDirection = useRef(0);
  const pendingConversation = useRef<string | null>(null);
  const { saved, setSaved, storageError } = useSavedChat(
    (initial) =>
      setActive(
        initial.conversations.find((item) =>
          initial.agents.some((agent) => agent.id === item.agentId),
        ) ?? newConversation(defaultAgent.id),
      ),
    busy,
  );

  // 面板开关统一走原生 dialog / popover；创建页按 visualViewport 可视高度定位
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
          conversationEntry.current?.cancel();
          clearTimeout(conversationTimer.current);
          conversationEntry.current = null;
          conversationExit.current?.finish();
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
        { duration: 240, easing: EASE_CHAT_SCREEN },
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

  function enterConversation(from: Keyframe) {
    const surface = conversationSurface.current;
    if (!surface || instantMotion() || document.hidden) return;
    try {
      const animation = surface.animate([from, { transform: 'translateX(0)', opacity: 1 }], {
        duration: 200,
        easing: EASE_CHAT_SCREEN,
      });
      conversationEntry.current = animation;
      const finish = () => {
        if (conversationEntry.current !== animation) return;
        clearTimeout(conversationTimer.current);
        animation.cancel();
        conversationEntry.current = null;
      };
      conversationTimer.current = setTimeout(finish, 320);
      void animation.finished.then(finish, finish);
    } catch {
      // Animation failure leaves the normal, visible conversation usable.
      conversationEntry.current = null;
    }
  }

  useLayoutEffect(() => {
    const surface = conversationSurface.current;
    if (surface) surface.inert = false;
    pendingConversation.current = null;
    const direction = incomingDirection.current;
    incomingDirection.current = 0;
    if (direction) enterConversation({ transform: `translateX(${direction * 16}px)`, opacity: 0 });
    return () => {
      clearTimeout(conversationTimer.current);
      conversationEntry.current?.cancel();
      conversationEntry.current = null;
      conversationExit.current?.cancel();
      conversationExit.current = null;
      if (surface) surface.inert = false;
    };
  }, [active?.id]);

  function switchConversation(next: Conversation, direction = 1, animate = true) {
    if (next.id === active?.id && !pendingConversation.current) return;
    if (next.id === pendingConversation.current) {
      if (instantMotion() || document.hidden) conversationExit.current?.finish();
      return;
    }
    const surface = conversationSurface.current;
    // Sample before cancellation so a reverse continues from the painted frame.
    const visual = surface ? getComputedStyle(surface) : null;
    const from = { transform: visual?.transform ?? 'none', opacity: visual?.opacity ?? '1' };
    conversationEntry.current?.cancel();
    conversationEntry.current = null;
    clearTimeout(conversationTimer.current);
    conversationExit.current?.cancel();
    conversationExit.current = null;
    pendingConversation.current = null;
    if (surface) surface.inert = false;
    if (next.id === active?.id) {
      enterConversation(from);
      return;
    }
    const commit = () => {
      if (pendingConversation.current !== next.id) return;
      incomingDirection.current = animate && !instantMotion() && !document.hidden ? direction : 0;
      setActive(next);
    };
    pendingConversation.current = next.id;
    if (!surface || !animate || instantMotion() || document.hidden) {
      commit();
      return;
    }
    if (surface.contains(document.activeElement))
      agentButton.current?.focus({ preventScroll: true });
    surface.inert = true;
    try {
      conversationExit.current = playExit(
        surface,
        commit,
        [from, { transform: `translateX(${-direction * 16}px)`, opacity: 0 }],
        { duration: 140, hold: true, easing: EASE_EXIT },
      );
    } catch {
      surface.inert = false;
      commit();
    }
  }

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
      { duration: 180, hold: true, easing: EASE_CHAT_SCREEN },
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

  const updateTranscript = useCallback(
    (id: string, transcript: ChatTranscript) => {
      if (!transcript.messages.length) return;
      setSaved((current) => {
        const existing = current.conversations.find((conversation) => conversation.id === id);
        const source = existing ?? (active?.id === id ? active : null);
        if (!source) return current;
        const updated = {
          ...source,
          title:
            transcript.messages.find((message) => message.role === 'user')?.text.slice(0, 48) ||
            '新对话',
          ...transcript,
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
    [active, setSaved],
  );

  const agent = saved.agents.find((item) => item.id === active?.agentId) ?? defaultAgent;
  function selectAgent(next: Agent) {
    if (next.id !== agent.id) switchConversation(newConversation(next.id));
    else if (active) switchConversation(active);
    closePanel();
  }
  function startConversation() {
    switchConversation(newConversation(agent.id));
    if (panel) closePanel();
  }
  function createAgent(next: Agent) {
    leaveCreation(null, () => {
      setSaved((current) => ({ ...current, agents: [...current.agents, next] }));
      switchConversation(newConversation(next.id), 1, false);
      setAgentDraft({ name: '', prompt: '' });
      requestAnimationFrame(() => agentButton.current?.focus());
    });
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
              <Img
                src={avatarUrl(agent.avatarId)}
                alt=""
                width={36}
                height={36}
                priority
                unoptimized
              />
            </span>
            <span className={styles.agentName}>{agent.name}</span>
            <ChevronDown size={18} strokeWidth={1.6} />
          </button>
          <Button
            icon
            variant="ghost"
            aria-label="新建对话"
            disabled={busy || !active}
            onClick={startConversation}
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
          <div
            ref={conversationSurface}
            className={conversationMotion.surface}
            data-conversation-id={active.id}
          >
            <ConversationView
              key={active.id}
              conversation={active}
              agent={agent}
              onTranscript={updateTranscript}
              onBusy={setBusy}
              onHeaderHiddenChange={setHeaderHidden}
            />
          </div>
        ) : (
          <p className={styles.loading} role="status">
            正在打开对话…
          </p>
        )}
      </div>
      {panel === 'create' && (
        <AgentCreationScreen
          editorRef={creation}
          agentCount={saved.agents.length}
          draft={agentDraft}
          setDraft={setAgentDraft}
          formError={formError}
          setFormError={setFormError}
          onCreate={createAgent}
          onBack={() => leaveCreation('agents')}
        />
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
                  <Img src={avatarUrl(item.avatarId)} alt="" width={32} height={32} unoptimized />
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
          <Button className={styles.drawerNew} variant="subtle" onClick={startConversation}>
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
                    switchConversation(item, -1);
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
