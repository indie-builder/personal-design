'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { categoryLabel } from '@/lib/category-label';
import { useLightbox } from './lifeline/lightbox';
import { instantMotion } from '@/lib/motion';
import { Button } from './button';
import styles from './layout-bookshelf.module.css';
import type { BookPage } from './layout-bookshelf';

/** 双页画册阅读器：一次翻动一个跨页，方向键、触摸横滑与页码目录可用。 */
export function BookReader({
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
  // Fetching and decoding must finish before a flip starts, or the incoming
  // pages pop in mid-animation; one spread each way covers both flip directions.
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    for (const page of [
      pages[spread - 2],
      pages[spread - 1],
      pages[spread + 2],
      pages[spread + 3],
    ]) {
      if (!page?.thumb || warmed.current.has(page.thumb)) continue;
      warmed.current.add(page.thumb);
      const image = new window.Image();
      image.src = page.thumb;
      void image.decode().catch(() => {});
    }
  }, [pages, spread]);
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
