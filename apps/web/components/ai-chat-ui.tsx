'use client';

import type { FormSubmission } from '@personal-design/ai-chat';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { Renderer, type ParseResult } from '@openuidev/react-lang';
import { ThemeProvider } from '@openuidev/react-ui';
import { answerLightTheme, answerDarkTheme } from '@/lib/ai-chat-ui-theme';
import { AnswerReadOnlyContext, mobileOpenuiLibrary } from './ai-chat-mobile-library';
import styles from './ai-chat-ui.module.css';

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">这条回答未能显示，请重新生成。</p>
    ) : (
      this.props.children
    );
  }
}

export function GeneratedAnswer({
  text,
  streaming,
  readOnly,
  onReply,
  initialState,
  onStateUpdate,
}: {
  text: string;
  streaming: boolean;
  readOnly: boolean;
  onReply: (text: string, submission?: FormSubmission) => void;
  initialState?: Record<string, unknown>;
  onStateUpdate?: (state: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const sync = () =>
      setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  function parsed(result: ParseResult | null) {
    setInvalid(!result?.root || !!result.meta.errors.length || !!result.meta.unresolved.length);
  }
  return (
    <div className={`${styles.generatedUi} ai-openui`} data-read-only={readOnly || undefined}>
      <ThemeProvider
        mode={mode}
        lightTheme={answerLightTheme}
        darkTheme={answerDarkTheme}
        cssSelector=".ai-openui"
      >
        <AnswerReadOnlyContext.Provider value={readOnly}>
          <RenderBoundary>
            <Renderer
              publishObservability={false}
              response={text.replace(/^\s*```[^\n]*\n/u, '').replace(/\n```\s*$/u, '')}
              library={mobileOpenuiLibrary}
              isStreaming={streaming}
              initialState={initialState}
              onStateUpdate={readOnly ? undefined : onStateUpdate}
              onParseResult={parsed}
              onAction={(event) => {
                if (readOnly || event.type !== 'continue_conversation') return;
                onReply(
                  event.humanFriendlyMessage === 'Save Changes'
                    ? '请根据我更新的内容继续'
                    : event.humanFriendlyMessage,
                  event.formState && Object.keys(event.formState).length
                    ? { formName: event.formName, formState: event.formState }
                    : undefined,
                );
              }}
            />
            {!streaming && invalid && (
              <p role="status" className={styles.muted}>
                这条回答的部分内容未能显示，请重新生成。
              </p>
            )}
          </RenderBoundary>
        </AnswerReadOnlyContext.Provider>
      </ThemeProvider>
    </div>
  );
}
