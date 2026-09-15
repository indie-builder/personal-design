'use client';

import Image from 'next/image';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Maximize2 } from 'lucide-react';
import { categoryLabel } from '@/lib/category-label';
import { useLightbox } from './lifeline/lightbox';
import { instantMotion, observeMotionPolicy, playExit } from '@/lib/motion';
import { CollectionSearch } from './collection-search';
import { matchesSearch } from '@/lib/browse-context';
import { Button } from './button';
import { WorkspaceBack } from './workspace-shell';
import styles from './layout-bookshelf.module.css';
import { BookOpening, type OpeningBook } from './book-opening';

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
const bindings = [
  ['#b94a35', '#fff6df', 340, 76],
  ['#d6c7a6', '#342e25', 292, 68],
  ['#557477', '#fff9e9', 380, 88],
  ['#d4ac49', '#302918', 324, 74],
  ['#465676', '#f7f3e9', 360, 82],
  ['#a65e47', '#fff8ec', 280, 66],
  ['#707453', '#fff9e5', 350, 78],
  ['#ddd5c3', '#34312a', 310, 72],
] as const;
export function BookSpines({
  categories,
  onOpen,
  muted = [],
  previewActive = -1,
  extracting = -1,
  onExtract,
}: {
  extracting?: number;
  onExtract?: () => void;
  previewActive?: number;
  categories: { name: string; count: number }[];
  onOpen?: (name: string) => void;
  muted?: string[];
}) {
  return (
    <div className={styles.shelf} data-preview={!onOpen || undefined}>
      <div className={styles.books}>
        {categories.map((category, index) => {
          const [color, ink, height, width] = bindings[index % bindings.length]!;
          const content = (
            <Fragment key={category.name}>
              <span className={styles.spineTitle}>{categoryLabel(category.name)}</span>
              <span className={styles.spineBottom}>
                {String(index + 1).padStart(2, '0')}
                <span>{category.count} 页</span>
              </span>
            </Fragment>
          );
          const props = {
            className: styles.spine,
            style: {
              '--binding': color,
              '--binding-ink': ink,
              '--book-height': `${height}px`,
              '--book-width': `${width}px`,
            } as CSSProperties,
          };
          return onOpen ? (
            <button
              {...props}
              key={category.name}
              id={`book-${index}`}
              disabled={muted.includes(category.name)}
              aria-label={`打开${categoryLabel(category.name)}，${category.count}页`}
              data-extracting={extracting === index || undefined}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && extracting === index) onExtract?.();
              }}
              onClick={() => onOpen(category.name)}
            >
              {content}
              <span key="cover" data-book-cover aria-hidden="true">
                <span>{categoryLabel(category.name)}</span>
                <small>排版构图图鉴</small>
              </span>
            </button>
          ) : (
            <span
              {...props}
              key={category.name}
              data-book-active={index === previewActive}
              data-cover-title={categoryLabel(category.name)}
            >
              {content}
              <span key="cover" data-book-cover aria-hidden="true">
                <span>{categoryLabel(category.name)}</span>
                <small>排版构图图鉴</small>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

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
    const next = new URLSearchParams(params.toString());
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    window.history[push ? 'pushState' : 'replaceState'](
      { layoutShelfReturn: push || !!window.history.state?.layoutShelfReturn },
      '',
      `${path}${next.size ? `?${next}` : ''}`,
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
      const next = new URLSearchParams(window.location.search);
      next.delete('zoom');
      next.delete('cat');
      next.delete('page');
      window.history.replaceState(null, '', `${path}${next.size ? `?${next}` : ''}`);
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

function BookReader({
  name,
  pages,
  initialId,
  zoomId,
  onZoomHandled,
  onPage,
  onClose,
  closing,
}: {
  name: string;
  pages: BookPage[];
  initialId: string;
  zoomId: string;
  onZoomHandled: () => void;
  onPage: (id: string) => void;
  onClose: () => void;
  closing: boolean;
}) {
  const initial = Math.max(
    0,
    pages.findIndex((page) => page.id === initialId),
  );
  const [spread, setSpread] = useState(Math.floor(initial / 2) * 2);
  const [turn, setTurn] = useState<{ from: number; to: number; direction: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reader = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const swiped = useRef(false);
  useEffect(() => {
    reader.current?.focus({ preventScroll: true });
    return () => clearTimeout(timer.current);
  }, []);
  const zoomOpened = useRef(false);
  useEffect(() => {
    if (!zoomId || zoomOpened.current) return;
    const button = reader.current?.querySelector<HTMLButtonElement>(
      `[data-page-id="${CSS.escape(zoomId)}"]`,
    );
    if (button && !button.disabled) {
      zoomOpened.current = true;
      button.focus({ preventScroll: true });
      button.click();
    }
    onZoomHandled();
  }, [zoomId, onZoomHandled]);
  function jump(id: string) {
    const index = pages.findIndex((page) => page.id === id);
    if (index < 0) return;
    clearTimeout(timer.current);
    setTurn(null);
    setSpread(Math.floor(index / 2) * 2);
    onPage(id);
  }
  function go(direction: number) {
    if (turn) return;
    const next = spread + direction * 2;
    if (next < 0 || next >= pages.length) return;
    onPage(pages[next]!.id);
    if (instantMotion()) {
      setSpread(next);
      return;
    }
    setTurn({ from: spread, to: next, direction });
    timer.current = setTimeout(() => {
      setSpread(next);
      setTurn(null);
    }, 680);
  }
  const left = turn?.direction === -1 ? turn.to : spread;
  const right = turn?.direction === 1 ? turn.to + 1 : spread + 1;
  const previousFooter = (
    <footer className={styles.pageFooter}>
      <Button
        variant="ghost"
        data-direction="previous"
        disabled={spread === 0 || !!turn}
        onClick={() => go(-1)}
        aria-label="上一页"
      >
        上一页
      </Button>
    </footer>
  );
  const nextFooter = (
    <footer className={styles.pageFooter}>
      <Button
        variant="ghost"
        data-direction="next"
        disabled={spread + 2 >= pages.length || !!turn}
        onClick={() => go(1)}
        aria-label="下一页"
      >
        下一页
      </Button>
    </footer>
  );
  return (
    <div
      ref={reader}
      className={styles.reader}
      inert={closing}
      tabIndex={-1}
      aria-label={`${categoryLabel(name)}画册`}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[aria-busy="true"]') &&
          event.key !== 'Escape'
        )
          return;
        if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select'))
          return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          go(event.key === 'ArrowRight' ? 1 : -1);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.readerHeading}>
        <h2>{categoryLabel(name)}</h2>
        <select
          className={styles.pagePicker}
          aria-label="跳转到图鉴"
          value={pages[spread]!.id}
          onChange={(event) => jump(event.target.value)}
        >
          {pages.map((page, index) => (
            <option value={page.id} key={page.id}>
              第{index + 1}页 · {page.name}
            </option>
          ))}
        </select>
        <p
          className={styles.readingStatus}
          role="status"
          aria-label={`第${spread + 1}至${Math.min(spread + 2, pages.length)}页，共${pages.length}页`}
        >
          {spread + 1}
          {spread + 1 < pages.length ? `–${Math.min(spread + 2, pages.length)}` : ''}
          <span> / {pages.length}</span>
        </p>
      </div>
      <div
        className={styles.bookStage}
        onClickCapture={(event) => {
          if (swiped.current) {
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
          }
        }}
        onPointerDown={(event) => {
          swiped.current = false;
          if (event.pointerType === 'touch') pointer.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (pointer.current !== null && Math.abs(event.clientX - pointer.current) > 60) {
            swiped.current = true;
            go(event.clientX < pointer.current ? 1 : -1);
            event.preventDefault();
          }
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      >
        <div className={styles.spread} data-book-spread>
          <div className={`${styles.page} ${styles.left}`}>
            <PageContent key={pages[left]?.id ?? 'end-left'} item={pages[left]} number={left + 1} />
            {previousFooter}
          </div>
          <div className={`${styles.page} ${styles.right}`}>
            <PageContent
              key={pages[right]?.id ?? 'end-right'}
              item={pages[right]}
              number={right + 1}
            />
            {nextFooter}
          </div>
          {turn && (
            <div
              className={`${styles.leaf} ${turn.direction === 1 ? styles.forward : styles.backward}`}
              aria-hidden
              inert
            >
              <div className={`${styles.face} ${styles.front}`}>
                <PageContent
                  item={pages[turn.direction === 1 ? turn.from + 1 : turn.from]}
                  number={turn.direction === 1 ? turn.from + 2 : turn.from + 1}
                />
                {turn.direction === 1 ? nextFooter : previousFooter}
              </div>
              <div className={`${styles.face} ${styles.back}`}>
                <PageContent
                  item={pages[turn.direction === 1 ? turn.to : turn.to + 1]}
                  number={turn.direction === 1 ? turn.to + 1 : turn.to + 2}
                />
                {turn.direction === 1 ? previousFooter : nextFooter}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageContent({ item, number }: { item?: BookPage; number: number }) {
  const [failed, setFailed] = useState(false);
  const lightbox = useLightbox();
  if (!item) return <div className={styles.endPage}>本册已阅毕</div>;
  return (
    <>
      <button
        data-page-id={item.id}
        className={styles.pageImage}
        aria-label={`放大${item.name}`}
        disabled={!item.src}
        onClick={(event) => {
          if (item.src)
            lightbox?.open(
              { src: item.src, thumb: item.thumb ?? undefined, alt: item.name },
              { rect: event.currentTarget.getBoundingClientRect(), sourceEl: event.currentTarget },
            );
        }}
      >
        {item.thumb && !failed ? (
          <Image
            src={item.thumb}
            alt={item.name}
            fill
            unoptimized
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 640px) 44vw, 440px"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <span>
            {item.name}
            <br />
            {failed ? '图片暂时无法加载' : '此图鉴暂缺图片'}
          </span>
        )}
        {item.src && (
          <span className={styles.zoomHint}>
            <Maximize2 size={14} />
            放大查看
          </span>
        )}
      </button>
      <span className={styles.folio} aria-label={`第${number}页`}>
        {number}
      </span>
    </>
  );
}
