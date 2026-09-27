'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { categoryLabel } from '@/lib/category-label';
import { instantMotion, observeMotionPolicy, playExit } from '@/lib/motion';
import { CollectionSearch } from './collection-search';
import { matchesSearch } from '@/lib/browse-context';
import { paramsHref } from '@/lib/site-url';
import { Button } from './button';
import { WorkspaceBack } from './workspace-shell';
import { BookSpines, bindings } from './book-spines';
import { BookOpening, type OpeningBook } from './book-opening';
import { BookReader } from './book-reader';
import styles from './layout-bookshelf.module.css';

export interface BookPage {
  id: string;
  name: string;
  category: string;
  theme: string;
  themeSlug: string;
  thumb: string | null;
  src: string | null;
}
interface Props {
  categories: { name: string; count: number }[];
  items: BookPage[];
}
const path = '/products/layout-compositions';

export function LayoutBookshelf({ categories, items }: Props) {
  const params = useSearchParams();
  const theme = params.get('theme') || '';
  const query = params.get('q') || '';
  const active = categories.find((c) => c.name === params.get('cat'));
  const matches = items.filter(
    (item) =>
      (!theme || item.themeSlug === theme) &&
      matchesSearch(query, [item.id, item.name, item.theme, categoryLabel(item.category)]),
  );
  const pages = active ? matches.filter((item) => item.category === active.name) : [];
  const [extracting, setExtracting] = useState(-1);
  const extracted = useRef<((skip?: boolean) => void) | null>(null);
  const [opening, setOpening] = useState<OpeningBook | null>(null);
  const finishOpening = useCallback(() => setOpening(null), []);
  const lastBook = useRef(0);
  const shelfScroll = useRef(0);
  const closing = useRef<ReturnType<typeof playExit> | null>(null);
  const shelfReturn = useRef<{ index: number; y: number } | null>(null);
  const previousActive = useRef(active);
  const [isClosing, setIsClosing] = useState(false);
  function update(values: Record<string, string>, push = false) {
    window.history[push ? 'pushState' : 'replaceState'](
      { layoutShelfReturn: push || !!window.history.state?.layoutShelfReturn },
      '',
      paramsHref(path, new URLSearchParams(params.toString()), values),
    );
  }
  function open(name: string, id = '') {
    if (opening || extracting !== -1) return;
    let committed = false;
    const commitOpen = () => {
      if (committed) return;
      committed = true;
      update({ cat: name, page: id }, true);
    };
    shelfScroll.current = window.scrollY;
    window.scrollTo({ top: 0, behavior: 'instant' });
    lastBook.current = categories.findIndex((c) => c.name === name);
    const index = lastBook.current;
    shelfReturn.current = { index, y: shelfScroll.current };
    const element = document.getElementById(`book-${index}`);
    if (!element || instantMotion()) {
      commitOpen();
      return;
    }
    extracted.current = (skip = false) => {
      extracted.current = null;
      setExtracting(-1);
      if (skip || instantMotion() || document.hidden) {
        commitOpen();
        return;
      }
      const rect = (element.querySelector('[data-book-cover]') ?? element).getBoundingClientRect();
      const [color, ink] = bindings[index % bindings.length]!;
      setOpening({
        index,
        extracted: true,
        title: categoryLabel(name),
        color,
        ink,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        reveal: commitOpen,
      });
    };
    setExtracting(index);
  }
  useEffect(() => {
    if (extracting === -1) return;
    const stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) extracted.current?.(true);
    });
    // Animation completion is presentation, not the only path to opening the book.
    const timeout = setTimeout(() => extracted.current?.(true), 2100);
    return () => {
      stop();
      clearTimeout(timeout);
    };
  }, [extracting]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !extracted.current) return;
      event.preventDefault();
      extracted.current = null;
      setExtracting(-1);
      requestAnimationFrame(() =>
        document.getElementById(`book-${lastBook.current}`)?.focus({ preventScroll: true }),
      );
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  const close = useCallback(() => {
    if (closing.current) return;
    const commit = () => {
      shelfReturn.current = {
        index: active ? categories.indexOf(active) : lastBook.current,
        y: shelfScroll.current,
      };
      setIsClosing(false);
      setOpening(null);
      if (window.history.state?.layoutShelfReturn) {
        window.history.back();
        return;
      }
      window.history.replaceState(
        null,
        '',
        paramsHref(path, new URLSearchParams(window.location.search), {
          zoom: '',
          cat: '',
          page: '',
        }),
      );
    };
    const spread = document.querySelector<HTMLElement>('[data-book-spread]');
    const reader = spread?.closest<HTMLElement>('[aria-label$="画册"]') ?? null;
    if (instantMotion() || document.hidden || opening || !reader) {
      commit();
      return;
    }
    const left = spread?.firstElementChild as HTMLElement | null;
    if (left) left.style.transformOrigin = 'right center';
    const fold = left?.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
      duration: 260,
      easing: 'cubic-bezier(.4,0,.8,.6)',
      fill: 'forwards',
    });
    setIsClosing(true);
    const exit = playExit(
      reader,
      commit,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 1, transform: 'scale(.98)', offset: 0.6 },
        { opacity: 0, transform: 'translateY(14px) scale(.96)' },
      ],
      { duration: 260, hold: true },
    );
    closing.current = {
      finish: exit.finish,
      cancel: () => {
        exit.cancel();
        fold?.cancel();
        left?.style.removeProperty('transform-origin');
      },
    };
  }, [active, categories, opening]);
  useLayoutEffect(() => {
    const prior = previousActive.current;
    previousActive.current = active;
    if (active || !prior) return;
    setOpening(null);
    setIsClosing(false);
    const restore = shelfReturn.current ?? {
      index: categories.indexOf(prior),
      y: shelfScroll.current,
    };
    const book = document.getElementById(`book-${restore.index}`);
    if (!book) return;
    // The reader is detached now; releasing its final frame cannot flash the old spread.
    closing.current?.cancel();
    closing.current = null;
    window.scrollTo({ top: restore.y, behavior: 'instant' });
    book.focus({ preventScroll: true });
    shelfReturn.current = null;
  }, [active, categories]);
  useEffect(() => () => closing.current?.cancel(), []);
  return (
    <div
      className={styles.library}
      aria-busy={!!opening || extracting !== -1}
      data-opening={opening?.index}
      data-filtered={!!theme || !!query || undefined}
    >
      {opening && <BookOpening book={opening} onDone={finishOpening} />}
      {active ? (
        <WorkspaceBack label="返回书架" onBack={close} />
      ) : (
        <div className={styles.toolbar} inert={!!opening || extracting !== -1}>
          <span className={styles.collectionName}>排版构图图鉴</span>
          <CollectionSearch
            value={query}
            onChange={(q) => update({ q, page: '' })}
            placeholder="搜索图鉴"
            label="搜索图鉴名称或主题"
          />
        </div>
      )}
      {active && pages.length ? (
        <BookReader
          key={`${active.name}:${theme}:${query}`}
          closing={isClosing}
          name={active.name}
          pages={pages}
          initialId={params.get('page') || ''}
          zoomId={params.get('zoom') || ''}
          onZoomHandled={() => update({ zoom: '' })}
          onPage={(id) => update({ page: id })}
          onClose={close}
        />
      ) : (
        <>
          <div inert={!!opening || extracting !== -1}>
            <BookSpines
              categories={categories}
              extracting={extracting}
              onExtract={() => extracted.current?.()}
              onOpen={open}
              muted={categories
                .filter((c) => !matches.some((item) => item.category === c.name))
                .map((c) => c.name)}
            />
          </div>
          {theme || query ? (
            <section
              className={styles.results}
              aria-label="图鉴搜索结果"
              inert={!!opening || extracting !== -1}
            >
              <div className={styles.resultHeading}>
                <p role="status">{matches.length} 条图鉴</p>
                <Button
                  variant="ghost"
                  onClick={() => update({ q: '', theme: '', cat: '', page: '' })}
                >
                  清除筛选
                </Button>
              </div>
              {matches.length ? (
                <div className={styles.matchList}>
                  {matches.map((item) => (
                    <button key={item.id} onClick={() => open(item.category, item.id)}>
                      <span>
                        {item.name}
                        <small>
                          {categoryLabel(item.category)} · {item.theme}
                        </small>
                      </span>
                      <ArrowRight size={18} strokeWidth={1.6} aria-hidden />
                    </button>
                  ))}
                </div>
              ) : (
                <p>没有匹配的图鉴，试试其他关键词或主题。</p>
              )}
            </section>
          ) : (
            <p className={styles.hint}>选一本，翻开看看。</p>
          )}
        </>
      )}
    </div>
  );
}
