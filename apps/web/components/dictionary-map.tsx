'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import type { DictionaryEntry } from '@personal-design/ai-coding-dictionary';
import type {
  DictionaryGraphEdge,
  DictionaryGraphNode,
} from '@personal-design/ai-coding-dictionary/graph';
import { DictionaryDetail } from './dictionary-detail';
import { DictionaryGraph } from './dictionary-graph';
import styles from './dictionary-map.module.css';

type Props = {
  entries: DictionaryEntry[];
  sections: { en: string; zh: string }[];
  nodes: DictionaryGraphNode[];
  edges: DictionaryGraphEdge[];
};

export function DictionaryMap({ entries, sections, nodes, edges }: Props) {
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const bySlug = useMemo(() => new Map(nodes.map((node) => [node.slug, node])), [nodes]);
  const records = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        slug: nodes.find((node) => node.title === entry.term)!.slug,
      })),
    [entries, nodes],
  );
  const current = records.find((entry) => entry.slug === selected) ?? null;
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(
    () =>
      normalized
        ? records
            .filter((entry) =>
              [entry.term, entry.description.zh, entry.description.en, ...entry.body.zh]
                .join(' ')
                .toLocaleLowerCase()
                .includes(normalized),
            )
            .map((entry) => entry.slug)
        : null,
    [normalized, records],
  );

  useEffect(() => {
    if (pathname !== '/products/ai-coding-dictionary') {
      queueMicrotask(() => {
        setSelected(null);
        setQuery('');
        setSearchOpen(false);
      });
      return;
    }
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const term = params.get('term');
      setSelected(term && bySlug.has(term) ? term : null);
      const nextQuery = (params.get('q') ?? '').slice(0, 2000);
      setQuery(nextQuery);
      setSearchOpen(!!nextQuery);
    };
    queueMicrotask(restore);
    addEventListener('popstate', restore);
    return () => removeEventListener('popstate', restore);
  }, [pathname, bySlug]);

  const updateUrl = (term: string | null, nextQuery: string, push: boolean) => {
    const params = new URLSearchParams(location.search);
    if (term) params.set('term', term);
    else params.delete('term');
    if (nextQuery) params.set('q', nextQuery);
    else params.delete('q');
    params.delete('lang');
    const url = `${location.pathname}${params.size ? `?${params}` : ''}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  };
  const select = (slug: string | null, clearQuery = false) => {
    if (slug && !bySlug.has(slug)) return;
    const nextQuery = clearQuery ? '' : query;
    if (clearQuery) setQuery('');
    if (slug !== selected || nextQuery !== query) updateUrl(slug, nextQuery, slug !== selected);
    setSelected(slug);
    if (!slug) queueMicrotask(() => button.current?.focus({ preventScroll: true }));
  };
  const changeQuery = (value: string) => {
    const next = value.slice(0, 2000);
    setQuery(next);
    updateUrl(selected, next, false);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selected || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      select(null);
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  });

  return (
    <main className={styles.page}>
      <div className={styles.graph} data-detail-open={!!current}>
        <DictionaryGraph
          nodes={nodes}
          edges={edges}
          selected={selected}
          matches={matches}
          onSelect={(slug) => select(slug, !!slug && !!query && !matches?.includes(slug))}
        />
      </div>
      <div className={styles.search} data-detail-open={!!current} data-open={searchOpen}>
        {searchOpen && (
          <div className={styles.searchField}>
            <input
              ref={input}
              id="dictionary-search"
              type="search"
              value={query}
              placeholder="搜索术语或中文解释"
              aria-label="搜索词典"
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matches?.[0]) select(matches[0]);
                if (event.key === 'Escape') {
                  event.preventDefault();
                  if (query) changeQuery('');
                  else {
                    setSearchOpen(false);
                    button.current?.focus();
                  }
                }
              }}
            />
            <button
              type="button"
              aria-label="关闭搜索"
              onClick={() => {
                changeQuery('');
                setSearchOpen(false);
                button.current?.focus();
              }}
            >
              <X size={16} strokeWidth={1.6} />
            </button>
            {query && (
              <ul className={styles.results} aria-label="搜索结果">
                {matches?.length ? (
                  matches.slice(0, 12).map((slug) => {
                    const node = bySlug.get(slug)!;
                    return (
                      <li key={slug}>
                        <button type="button" onClick={() => select(slug)}>
                          <span>{node.title}</span>
                          <small>{sections[node.section]?.zh}</small>
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li className={styles.noResults}>没有匹配的术语</li>
                )}
              </ul>
            )}
          </div>
        )}
        <button
          ref={button}
          type="button"
          className={styles.searchButton}
          aria-label={searchOpen ? '聚焦搜索框' : '搜索词典'}
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? 'dictionary-search' : undefined}
          onClick={() => {
            setSearchOpen(true);
            queueMicrotask(() => input.current?.focus());
          }}
        >
          <Search size={19} strokeWidth={1.6} />
        </button>
      </div>
      <DictionaryDetail
        entry={current}
        entries={records}
        nodes={nodes}
        sections={sections}
        matches={matches}
        query={query}
        onSelect={select}
        onClose={() => select(null)}
      />
    </main>
  );
}
