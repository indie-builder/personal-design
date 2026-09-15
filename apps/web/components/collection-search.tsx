'use client';

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from './button';
import styles from './collection-search.module.css';

/** Immediate filtering: the input is the entry point, with no submit step. */
export function CollectionSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.defaultPrevented
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input,textarea,select,[role=textbox]'))
      )
        return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  return (
    <form
      role="search"
      aria-label={label}
      className={styles.search}
      onSubmit={(event) => event.preventDefault()}
    >
      <Search className={styles.icon} size={18} strokeWidth={1.6} aria-hidden />
      <input
        ref={input}
        type="search"
        aria-label={label}
        aria-keyshortcuts="/"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            input.current?.blur();
          }
        }}
      />
      {value ? (
        <Button
          icon
          variant="ghost"
          className={styles.clear}
          aria-label="清除搜索"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </form>
  );
}
