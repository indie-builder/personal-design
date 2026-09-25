'use client';

import { useLayoutEffect, useRef } from 'react';
import styles from './dictionary-map.module.css';

function runtimeUrl(term: string | null, query: string) {
  const params = new URLSearchParams();
  if (term) params.set('term', term);
  if (query) params.set('q', query);
  return `/ai-coding-atlas/index.html${params.size ? `?${params}` : ''}`;
}

/** The captured original frontend runs in its own document so its CSS and renderer remain intact. */
export function DictionaryMap() {
  const frame = useRef<HTMLIFrameElement>(null);
  useLayoutEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const receive = (event: MessageEvent) => {
      if (
        location.pathname !== '/products/ai-coding-dictionary' ||
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'dictionary-state'
      )
        return;
      const { term, q } = event.data;
      if (
        (term !== null && (typeof term !== 'string' || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(term))) ||
        typeof q !== 'string' ||
        q.length > 2000
      )
        return;
      const params = new URLSearchParams(location.search);
      const previousTerm = params.get('term');
      const previousQuery = params.get('q') ?? '';
      if (previousTerm === term && previousQuery === q) return;
      if (term) params.set('term', term);
      else params.delete('term');
      if (q) params.set('q', q);
      else params.delete('q');
      params.delete('lang');
      const target = `${location.pathname}${params.size ? `?${params}` : ''}`;
      if (previousTerm !== term && previousQuery === q) history.pushState(null, '', target);
      else history.replaceState(null, '', target);
    };
    const restore = () => {
      if (location.pathname !== '/products/ai-coding-dictionary') return;
      const params = new URLSearchParams(location.search);
      iframe.contentWindow?.location.replace(
        new URL(runtimeUrl(params.get('term'), params.get('q') ?? ''), location.origin).href,
      );
    };
    addEventListener('message', receive);
    addEventListener('popstate', restore);
    // Next Activity retains DOM across routes; each activation needs a fresh graph instance.
    restore();
    return () => {
      removeEventListener('message', receive);
      removeEventListener('popstate', restore);
    };
  }, []);
  return (
    <main className={styles.page}>
      <iframe
        ref={frame}
        src="/ai-coding-atlas/index.html"
        title="AI Coding 词典知识图谱与中英对照"
        sandbox="allow-scripts allow-same-origin"
        className={styles.frame}
      />
    </main>
  );
}
