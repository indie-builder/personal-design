'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DictionaryEntry } from '@personal-design/ai-coding-dictionary';
import type { DictionaryGraphNode } from '@personal-design/ai-coding-dictionary/graph';
import { instantMotion } from '@/lib/motion';
import { CHAPTER_COLORS } from './dictionary-graph';
import styles from './dictionary-detail.module.css';

type Record = DictionaryEntry & { slug: string };
type Props = {
  entry: Record | null;
  entries: Record[];
  nodes: DictionaryGraphNode[];
  sections: { en: string; zh: string }[];
  matches: string[] | null;
  query: string;
  onSelect: (slug: string | null, clearQuery?: boolean) => void;
  onClose: () => void;
};

function Paragraph({ text }: { text: string }) {
  const lines = text.trim().split('\n');
  if (lines.length > 2 && lines[0]?.startsWith('|') && /^\|[\s:|-]+\|$/.test(lines[1] ?? '')) {
    const cells = (line: string) =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());
    return (
      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              {cells(lines[0]!).map((cell, index) => (
                <th key={index} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.slice(2).map((line, index) => (
              <tr key={index}>
                {cells(line).map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (/^Usage:?$/.test(text.trim())) return <h4 className={styles.usage}>Usage</h4>;
  return <p>{text}</p>;
}

function termHref(slug: string, query: string, matches: string[] | null) {
  const params = new URLSearchParams({ term: slug });
  if (query && matches?.includes(slug)) params.set('q', query);
  return `/products/ai-coding-dictionary?${params}`;
}

function TermLink({
  target,
  query,
  matches,
  onSelect,
  children,
  className,
}: {
  target: Record;
  query: string;
  matches: string[] | null;
  onSelect: Props['onSelect'];
  children: React.ReactNode;
  className: string | undefined;
}) {
  return (
    <a
      href={termHref(target.slug, query, matches)}
      className={className}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onSelect(target.slug, !!query && !matches?.includes(target.slug));
      }}
    >
      {children}
    </a>
  );
}

export function DictionaryDetail({
  entry,
  entries,
  nodes,
  sections,
  matches,
  query,
  onSelect,
  onClose,
}: Props) {
  const [shown, setShown] = useState<Record | null>(entry);
  const [previousEntry, setPreviousEntry] = useState<Record | null>(entry);
  const reading = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  if (entry !== previousEntry) {
    setPreviousEntry(entry);
    if (entry) setShown(entry);
  }
  useEffect(() => {
    if (entry) {
      if (reading.current) reading.current.scrollTop = 0;
      if (instantMotion()) queueMicrotask(() => heading.current?.focus({ preventScroll: true }));
      return;
    }
    const timer = setTimeout(() => setShown(null), 210);
    return () => clearTimeout(timer);
  }, [entry]);
  const visible = shown ?? entry;
  const byTerm = new Map(entries.map((item) => [item.term, item]));
  const related =
    visible?.related.map((term) => byTerm.get(term)).filter((item): item is Record => !!item) ?? [];
  const sequence = matches?.includes(visible?.slug ?? '')
    ? entries.filter((item) => matches.includes(item.slug))
    : entries;
  const index = sequence.findIndex((item) => item.slug === visible?.slug);
  const previous = sequence[index - 1],
    next = sequence[index + 1];
  const color = CHAPTER_COLORS[nodes.find((node) => node.slug === visible?.slug)?.section ?? 0];
  return (
    <aside
      className={styles.detail}
      data-open={!!entry}
      inert={!entry}
      aria-labelledby="dictionary-title"
      style={{ '--chapter-color': color } as React.CSSProperties}
    >
      {visible && (
        <>
          <header className={styles.header}>
            <h2 id="dictionary-title" ref={heading} tabIndex={-1}>
              {visible.term}
            </h2>
            <button type="button" className={styles.close} aria-label="关闭词条" onClick={onClose}>
              <X size={20} strokeWidth={1.6} />
            </button>
          </header>
          <div className={styles.reading} ref={reading}>
            <p className={styles.category}>{sections[visible.section]?.zh}</p>
            <section className={styles.introduction} aria-label="中英释义">
              <p lang="zh-CN" className={styles.definition}>
                {visible.description.zh}
              </p>
              <p lang="en" className={styles.definitionEnglish}>
                {visible.description.en}
              </p>
            </section>
            <nav className={styles.jump} aria-label="词条内容导航">
              {[
                ['dictionary-explanation', '中文解读'],
                ['dictionary-original', '英文原文'],
                ['dictionary-related', '关联目录'],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    reading.current?.querySelector(`#${id}`)?.scrollIntoView({
                      behavior: instantMotion() ? 'instant' : 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>
            <section className={styles.section} id="dictionary-explanation" lang="zh-CN">
              <h3>中文解读</h3>
              {visible.body.zh.map((text, key) => (
                <Paragraph key={key} text={text} />
              ))}
            </section>
            <section className={styles.section} id="dictionary-original" lang="en">
              <h3 lang="zh-CN">英文原文</h3>
              {visible.body.en.map((text, key) => (
                <Paragraph key={key} text={text} />
              ))}
            </section>
            <section className={styles.section} id="dictionary-related">
              <h3>关联术语</h3>
              {sections.map((section, category) => {
                const group = related.filter((item) => item.section === category);
                if (!group.length) return null;
                return (
                  <div key={section.en} className={styles.directory}>
                    <h4
                      style={{ '--chapter-color': CHAPTER_COLORS[category] } as React.CSSProperties}
                    >
                      {section.zh}
                    </h4>
                    <ul>
                      {group.map((item) => (
                        <li key={item.slug}>
                          <TermLink
                            target={item}
                            query={query}
                            matches={matches}
                            onSelect={onSelect}
                            className={styles.term}
                          >
                            {item.term}
                          </TermLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {!related.length && <p className={styles.muted}>这个词条暂无关联术语。</p>}
            </section>
          </div>
          <nav className={styles.pagination} aria-label="相邻词条">
            {(
              [
                [previous, '上一个', 'previous'],
                [next, '下一个', 'next'],
              ] as const
            ).map(([target, label, direction]) =>
              target ? (
                <TermLink
                  key={direction}
                  target={target}
                  query={query}
                  matches={matches}
                  onSelect={onSelect}
                  className={styles.neighbor}
                >
                  {direction === 'previous' ? (
                    <ChevronLeft size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                  <span>
                    <small>{label}</small>
                    <b>{target.term}</b>
                  </span>
                </TermLink>
              ) : (
                <button key={direction} className={styles.neighbor} type="button" disabled>
                  {direction === 'previous' ? (
                    <ChevronLeft size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                  <span>
                    <small>{label}</small>
                    <b>{direction === 'previous' ? '已经是第一条' : '已经是最后一条'}</b>
                  </span>
                </button>
              ),
            )}
          </nav>
        </>
      )}
    </aside>
  );
}
