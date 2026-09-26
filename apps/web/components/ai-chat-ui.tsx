'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import { Renderer, type ParseResult } from '@openuidev/react-lang';
import { ThemeProvider } from '@openuidev/react-ui';
import { answerLightTheme, answerDarkTheme } from '@/lib/ai-chat-ui-theme';
import { mobileOpenuiLibrary } from './ai-chat-mobile-library';
import styles from './ai-chat-ui.module.css';

function readableValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(readableValue).filter(Boolean).join('、');
  if (typeof value === 'object') {
    if ('value' in value) return readableValue(value.value);
    return Object.entries(value)
      .map(([key, item]) => `${key}：${readableValue(item)}`)
      .join('；');
  }
  return String(value);
}

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
  onReply,
  initialState,
  onStateUpdate,
}: {
  text: string;
  streaming: boolean;
  onReply: (text: string) => void;
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
    <div className={`${styles.generatedUi} ai-openui`}>
      <ThemeProvider
        mode={mode}
        lightTheme={answerLightTheme}
        darkTheme={answerDarkTheme}
        cssSelector=".ai-openui"
      >
        <RenderBoundary>
          <Renderer
            publishObservability={false}
            response={text.replace(/^\s*```[^\n]*\n/u, '').replace(/\n```\s*$/u, '')}
            library={mobileOpenuiLibrary}
            isStreaming={streaming}
            initialState={initialState}
            onStateUpdate={onStateUpdate}
            onParseResult={parsed}
            onAction={(event) => {
              if (event.type !== 'continue_conversation') return;
              const details =
                event.formState && Object.keys(event.formState).length
                  ? '\n' +
                    Object.entries(event.formState)
                      .map(([name, value]) => `${name}：${readableValue(value)}`)
                      .join('\n')
                  : '';
              onReply(
                (event.humanFriendlyMessage === 'Save Changes'
                  ? '请根据我更新的内容继续'
                  : event.humanFriendlyMessage) + details,
              );
            }}
          />
          {!streaming && invalid && (
            <p role="status" className={styles.muted}>
              这条回答的部分内容未能显示，请重新生成。
            </p>
          )}
        </RenderBoundary>
      </ThemeProvider>
    </div>
  );
}
