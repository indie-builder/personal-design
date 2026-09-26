'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { instantMotion } from '@/lib/motion';
import type { Product } from '@/lib/products';
import { buttonClassName } from './button';
import { MotionVideo } from './motion-video';
import { AiChatPreview } from './ai-chat-preview';
import { SiteReceiptPreview } from './site-receipt-preview';
import { TimelineWalker } from './timeline-walker';
import { WorkspaceLink } from './workspace-shell';
import { BookPreview, DictionaryPreview, PreviewImage, ToolPreview } from './home-previews';
import type { Preview, ToolPreviewItem } from './home-previews';
import styles from './home-view.module.css';

export function HomeView({
  products,
  layoutPreviews = [],
  musePreviews = [],
  toolsPreview = [],
  layoutCategories = [],
}: {
  products: Product[];
  layoutCategories?: { name: string; count: number }[];
  layoutPreviews?: Preview[];
  musePreviews?: Preview[];
  toolsPreview?: ToolPreviewItem[];
}) {
  const drag = useRef({ start: 0, scroll: 0, down: false, moved: false });
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [hitDate, setHitDate] = useState<number | null>(null);
  const ordered = [...products].sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft < 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [products.length]);

  function move(direction: number) {
    const element = viewport.current;
    if (!element) return;
    // Step by a real timeline entry; decorative list items (the walker) must not shrink it.
    const entryClass = styles.entry;
    const cell = entryClass ? element.querySelector(`li.${CSS.escape(entryClass)}`) : null;
    const step = cell?.getBoundingClientRect().width ?? element.clientWidth;
    element.scrollBy({ left: direction * step, behavior: instantMotion() ? 'instant' : 'smooth' });
  }

  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <span className={styles.period}>
          {ordered[0]?.date.slice(0, 4) ?? new Date().getFullYear()}
          <span aria-hidden="true">—</span>持续更新
        </span>
      </header>

      {ordered.length > 0 ? (
        <>
          <div className={styles.timeline}>
            <div
              ref={viewport}
              className={styles.viewport}
              role="region"
              aria-label="作品时间轴，左右方向键浏览"
              tabIndex={0}
              onPointerDown={(event) => {
                if (
                  event.pointerType !== 'mouse' ||
                  event.button !== 0 ||
                  (edges.start && edges.end)
                )
                  return;
                drag.current = {
                  start: event.clientX,
                  scroll: event.currentTarget.scrollLeft,
                  down: true,
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const state = drag.current;
                if (!state.down) return;
                if (event.buttons !== 1) {
                  state.down = false;
                  delete event.currentTarget.dataset.dragging;
                  return;
                }
                const delta = event.clientX - state.start;
                if (Math.abs(delta) > 6) {
                  state.moved = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.currentTarget.dataset.dragging = 'true';
                }
                if (state.moved) event.currentTarget.scrollLeft = state.scroll - delta;
              }}
              onPointerUp={(event) => {
                drag.current.down = false;
                delete event.currentTarget.dataset.dragging;
              }}
              onPointerCancel={(event) => {
                drag.current.down = false;
                delete event.currentTarget.dataset.dragging;
              }}
              onLostPointerCapture={(event) => {
                drag.current.down = false;
                delete event.currentTarget.dataset.dragging;
              }}
              onClickCapture={(event) => {
                if (drag.current.moved) {
                  event.preventDefault();
                  event.stopPropagation();
                  drag.current.moved = false;
                }
              }}
              onDragStart={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  move(event.key === 'ArrowLeft' ? -1 : 1);
                }
              }}
            >
              <ol className={styles.entries}>
                <TimelineWalker stops={ordered.length} onHit={setHitDate} />
                {ordered.map((product, index) => {
                  const previews =
                    product.slug === 'layout-compositions'
                      ? layoutPreviews
                      : product.slug === 'muse'
                        ? musePreviews
                        : [];
                  const isLayout = product.slug === 'layout-compositions';
                  return (
                    <li
                      key={product.slug}
                      className={styles.entry}
                      data-hit={hitDate === index || undefined}
                      style={{ '--order': index } as CSSProperties}
                    >
                      <time dateTime={product.date} className={styles.date}>
                        {product.date.replaceAll('-', '.')}
                      </time>
                      <div className={styles.rule} aria-hidden="true">
                        <span className={styles.node} />
                      </div>
                      <WorkspaceLink
                        href={product.href}
                        prefetch
                        className={styles.project}
                        aria-label={`进入${product.name}`}
                      >
                        <div className={styles.title}>
                          <h2>{product.name}</h2>
                          {product.href.startsWith('/') ? (
                            <ArrowRight size={18} strokeWidth={1.6} aria-hidden="true" />
                          ) : (
                            <ArrowUpRight size={18} strokeWidth={1.6} aria-hidden="true" />
                          )}
                        </div>
                        <p className={styles.tagline}>{product.tagline}</p>
                        <div
                          className={`${styles.preview} ${isLayout ? styles.bookPreview : previews[0]?.videoSrc ? styles.motionPreview : styles.frames}`}
                        >
                          {isLayout ? (
                            <BookPreview categories={layoutCategories} />
                          ) : product.slug === 'design-engineer-tools' ? (
                            <ToolPreview tools={toolsPreview} />
                          ) : product.slug === 'ai-chat' ? (
                            <AiChatPreview />
                          ) : product.slug === 'ai-coding-dictionary' ? (
                            <DictionaryPreview />
                          ) : product.slug === 'personal-sites' ? (
                            <SiteReceiptPreview />
                          ) : previews[0]?.videoSrc ? (
                            <MotionVideo
                              src={previews[0].videoSrc}
                              poster={previews[0].src}
                              aria-label={previews[0].alt}
                            />
                          ) : (
                            (previews.length
                              ? previews.slice(0, 3)
                              : [{ src: product.cover, alt: `${product.name}内容预览` }]
                            ).map((preview, i) => (
                              <PreviewImage
                                key={preview.src}
                                {...preview}
                                priority={index === 0 && i === 0}
                              />
                            ))
                          )}
                        </div>
                      </WorkspaceLink>
                    </li>
                  );
                })}
                <li className={`${styles.entry} ${styles.future}`}>
                  <span className={styles.date}>未完待续</span>
                  <div className={styles.rule} aria-hidden="true">
                    <span className={styles.node} />
                  </div>
                </li>
              </ol>
            </div>
          </div>
          {(!edges.start || !edges.end) && (
            <footer className={styles.footer}>
              <div className={styles.controls}>
                <span className={styles.hint}>拖动或沿时间浏览</span>
                <button
                  className={buttonClassName({ icon: true })}
                  data-direction="previous"
                  onClick={() => move(-1)}
                  disabled={edges.start}
                  aria-label="向前浏览作品"
                >
                  <ArrowLeft size={18} strokeWidth={1.5} />
                </button>
                <button
                  className={buttonClassName({ icon: true })}
                  data-direction="next"
                  onClick={() => move(1)}
                  disabled={edges.end}
                  aria-label="向后浏览作品"
                >
                  <ArrowRight size={18} strokeWidth={1.5} />
                </button>
              </div>
            </footer>
          )}
        </>
      ) : (
        <p className={styles.empty}>产品正在整理中，稍后再来看看。</p>
      )}
    </main>
  );
}
