'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ImageOff } from 'lucide-react';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';
import { shuffleBooks } from '@/lib/book-shuffle';
import type { Product } from '@/lib/products';
import { buttonClassName } from './button';
import { MotionVideo } from './motion-video';
import { BookSpines } from './layout-bookshelf';
import { SiteReceiptPreview } from './site-receipt-preview';
import { TimelineWalker } from './timeline-walker';
import { WorkspaceLink } from './workspace-shell';
import styles from './home-view.module.css';

type Preview = { src: string; alt: string; videoSrc?: string };
type ToolPreviewItem = { name: string; category: string; icon: string | null };

function PreviewImage({ src, alt, priority = false }: Preview & { priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.imageFrame}>
      {failed || !src ? (
        <div className={styles.mediaError}>
          <ImageOff size={20} strokeWidth={1.5} />
          <span>预览暂不可用</span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 250px, 320px"
          className={styles.image}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** The homepage preview moves only while it is visible; the actual shelf stays unchanged. */
function BookPreview({ categories }: { categories: { name: string; count: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [active, setActive] = useState(-1);
  const bag = useRef<number[]>([]);
  const current = useRef(-1);
  function nextBook() {
    if (!running || instantMotion() || document.hidden) return;
    if (!bag.current.length) bag.current = shuffleBooks(categories.length, current.current);
    current.current = bag.current.shift() ?? -1;
    setActive(current.current);
  }
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const update = () => {
      const quiet = instantMotion();
      const playing = visible && !document.hidden && !quiet;
      setQuiet(quiet);
      setRunning(playing);
      if (playing && current.current === -1) {
        bag.current = shuffleBooks(categories.length);
        current.current = bag.current.shift() ?? -1;
        setActive(current.current);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.3;
        update();
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    const stop = observeMotionPolicy(update);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [categories.length]);
  return (
    <div
      ref={ref}
      className={styles.bookMotion}
      data-running={running}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.bookActive === 'true')
          nextBook();
      }}
    >
      <BookSpines categories={categories} previewActive={quiet ? -1 : active} />
    </div>
  );
}

function ToolPreview({ tools }: { tools: ToolPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const element = ref.current;
    if (!element || !tools.length) return;
    let visible = false;
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      setActive(-1);
    };
    const advance = () => {
      if (!visible || instantMotion() || document.hidden) return stop();
      setActive((current) => (current + 1) % tools.length);
      timer = window.setTimeout(advance, 1800);
    };
    const update = () => {
      window.clearTimeout(timer);
      if (visible && !instantMotion() && !document.hidden) advance();
      else stop();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.3;
        update();
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    const removePolicyListener = observeMotionPolicy(update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      removePolicyListener();
      document.removeEventListener('visibilitychange', update);
    };
  }, [tools.length]);
  return (
    <div ref={ref} className={styles.toolPreview} aria-hidden="true">
      {tools.map((tool, index) => (
        <span key={tool.name} data-active={index === active || undefined}>
          <i>
            {tool.icon && <Image src={tool.icon} alt="" width={16} height={16} />}
            <ArrowUpRight size={16} strokeWidth={1.6} />
          </i>
          <b>{tool.name}</b>
        </span>
      ))}
    </div>
  );
}

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
                        {product.dateLabel && ` · ${product.dateLabel}`}
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
                          ) : product.slug === 'ai-coding-dictionary' ? (
                            <div className={styles.dictionaryPreview} aria-hidden="true">
                              <span>
                                <i />
                                MODEL
                              </span>
                              <span>
                                <i />
                                TOKEN
                              </span>
                              <span>
                                <i />
                                AGENT
                              </span>
                              <span>
                                <i />
                                HARNESS
                              </span>
                              <span>
                                <i />
                                CONTEXT
                              </span>
                              <span>
                                <i />
                                MCP
                              </span>
                              <svg viewBox="0 0 320 196" preserveAspectRatio="none">
                                <path d="M80 65 160 41 244 81 175 129 85 143 80 65 M160 41 175 129 M244 81 85 143" />
                              </svg>
                            </div>
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
