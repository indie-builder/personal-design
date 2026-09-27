'use client';

import type { RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import { agentSchema, randomAvatarId, type Agent } from '@personal-design/ai-chat';
import { Button } from '../button';
import styles from '../ai-chat.module.css';

/** 全高创建智能体表单：只有名称与系统提示词；草稿留在外壳，返回列表后保留。 */
export function AgentCreationScreen({
  editorRef,
  agentCount,
  draft,
  setDraft,
  formError,
  setFormError,
  onCreate,
  onBack,
}: {
  editorRef: RefObject<HTMLElement | null>;
  agentCount: number;
  draft: { name: string; prompt: string };
  setDraft: (draft: { name: string; prompt: string }) => void;
  formError: string;
  setFormError: (message: string) => void;
  onCreate: (agent: Agent) => void;
  onBack: () => void;
}) {
  return (
    <section
      ref={editorRef}
      id="agent-creation"
      className={styles.createScreen}
      aria-labelledby="agent-creation-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onBack();
        }
      }}
    >
      <div className={`${styles.panelHeader} ${styles.createHeader}`}>
        <Button icon variant="ghost" aria-label="返回智能体列表" onClick={onBack}>
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
          if (agentCount >= 100) {
            setFormError('本机已创建 100 个智能体。');
            return;
          }
          onCreate(result.data);
        }}
      >
        <div className={styles.createFields}>
          <label>
            名称
            <input
              name="name"
              required
              maxLength={40}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如：写作助手"
              autoComplete="off"
              enterKeyHint="next"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  editorRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
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
              value={draft.prompt}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              placeholder="例如：你是一位写作助手。先理解我的目标，再给出简洁、具体的修改建议。"
            />
          </label>
        </div>
        <div className={styles.formActions}>
          {formError && <p role="alert">{formError}</p>}
          <Button
            variant="primary"
            type="submit"
            disabled={!draft.name.trim() || !draft.prompt.trim()}
          >
            创建并开始对话
          </Button>
        </div>
      </form>
    </section>
  );
}
