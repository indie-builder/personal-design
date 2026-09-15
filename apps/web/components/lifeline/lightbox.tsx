'use client';

import Link from 'next/link';
import { instantMotion } from '@/lib/motion';
import { buttonClassName } from '../button';
import styles from './lightbox.module.css';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface LightboxItem {
  /** 高清图 */
  src: string;
  width?: number;
  height?: number;
  /** 已缓存的缩略图：FLIP 期间先显示，高清图加载完成后替换 */
  thumb?: string;
  alt: string;
  /** 编号（图注用），如「001」 */
  serial?: string;
  /** 详情页链接（图注「查看详情」入口） */
  href?: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OpenOptions {
  /** 触发元素的屏幕 rect，FLIP 动画的起点 */
  rect: Rect;
  /** 触发元素引用：关闭动画前重新测量，避免飞回旧位置 */
  sourceEl?: Element | null;
  /** 同组条目（左右切换） */
  siblings?: LightboxItem[];
  /** 当前条目在 siblings 中的下标 */
  index?: number;
}

const LightboxContext = createContext<{
  open: (item: LightboxItem, options: OpenOptions) => void;
} | null>(null);

export function useLightbox() {
  return useContext(LightboxContext);
}

// Shared 200ms enter / 140ms exit; FLIP keeps the trigger-to-media relationship.
const EASE = 'var(--ease-out)';
const DURATION = 200;
const EXIT_DURATION = 140;

interface ActiveImage {
  item: LightboxItem;
  sourceEl: Element | null;
  initialRect: Rect;
  siblings: LightboxItem[];
  index: number;
}

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 灯箱：transform 版 FLIP（不触发布局）、显式关闭按钮、图注 + 详情入口、
 * 同组左右切换（缩略图 + 计数 + 相邻预取）、实色暗房、reduced-motion 瞬时显隐。
 * 卸载走「closing 标志 + transitionend + 超时」三保险，RM 下直接状态卸载。
 */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveImage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullReady, setFullReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [closeRect, setCloseRect] = useState<Rect | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [instant, setInstant] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const closeTimerRef = useRef(0);
  const closingRef = useRef(false);
  const swipeRef = useRef<HTMLDivElement>(null);
  const suppressSwipeClick = useRef(false);
  const swipeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startT: number;
    lastX: number;
    lastT: number;
    velocity: number;
    dx: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // 卸载兜底：关闭动画的兜底定时器不遗留（回调是 setActive(null)，纯洁癖）
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const open = useCallback((item: LightboxItem, options: OpenOptions) => {
    const immediate = instantMotion();
    setInstant(immediate);
    setNaturalRatio(null);
    clearTimeout(closeTimerRef.current);
    closingRef.current = false;
    setActive({
      item,
      sourceEl: options.sourceEl ?? null,
      initialRect: options.rect,
      siblings: options.siblings ?? [],
      index: options.index ?? 0,
    });
    setCloseRect(null);
    setFullReady(false);
    setLoadError(false);
    setThumbError(false);
    setExpanded(immediate);
  }, []);

  const activeRef = useRef<ActiveImage | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const close = useCallback(() => {
    const immediate = reducedMotion || instantMotion();
    setInstant(immediate);
    if (immediate) {
      clearTimeout(closeTimerRef.current);
      closingRef.current = false;
      setActive(null);
      setExpanded(false);
      return;
    }
    // 关闭动画的目标：重新测量触发元素（marquee/滚动后原 rect 已失效）
    const current = activeRef.current;
    setCloseRect(current?.sourceEl?.isConnected ? current.sourceEl.getBoundingClientRect() : null);
    closingRef.current = true;
    setExpanded(false);
    // 兜底通道：动画结束事件丢失时也保证卸载
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setActive(null), EXIT_DURATION + 80);
  }, [reducedMotion]);

  const go = useCallback((dir: 1 | -1) => {
    setInstant(instantMotion());
    setNaturalRatio(null);
    // 关闭动画期间按方向键：取消卸载倒计时，灯箱恢复展开（修闪没竞态）
    const current = activeRef.current;
    if (!current || current.siblings.length < 2) return;
    clearTimeout(closeTimerRef.current);
    closingRef.current = false;
    setExpanded(true);
    setActive((cur) => {
      if (!cur || cur.siblings.length === 0) return cur;
      const next = (cur.index + dir + cur.siblings.length) % cur.siblings.length;
      const item = cur.siblings[next];
      // sourceEl 已不指向当前条目：之后关闭原地淡出，而不是飞回第一张
      return item ? { ...cur, item, index: next, sourceEl: null } : cur;
    });
    setFullReady(false);
    setLoadError(false);
    setThumbError(false);
  }, []);

  useEffect(() => {
    if (!active || fullReady || loadError) return;
    const timer = window.setTimeout(() => {
      setLoadError(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [active, attempt, fullReady, loadError]);

  const isOpen = active !== null;
  const dialogReady = isOpen && frame !== null;

  useEffect(() => {
    if (active && !previousFocusRef.current)
      previousFocusRef.current = active.sourceEl ?? document.activeElement;
  }, [active]);

  // 打开后双帧展开；锁背景滚动；body 挂标记（暂停灵感墙 marquee）
  useEffect(() => {
    if (!isOpen) return;
    let inner = 0;
    const raf = instant
      ? 0
      : requestAnimationFrame(() => {
          inner = requestAnimationFrame(() => {
            if (!closingRef.current) setExpanded(true);
          });
        });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.lightboxOpen = 'true';
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(inner);
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.lightboxOpen;
    };
  }, [isOpen, instant]);

  // dialog 挂载（frame 就绪）后初始聚焦到关闭按钮——frame 为 null 时 dialog 不存在，
  // 在 [active] effect 里 focus 会静默落空（aria-modal 名副其实的第一步）
  useEffect(() => {
    if (dialogReady) closeButtonRef.current?.focus();
  }, [dialogReady]);

  // Keep background controls out of pointer and assistive-technology navigation.
  useEffect(() => {
    if (!dialogReady) return;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== dialogRef.current,
    );
    const previous = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    return () =>
      background.forEach((element, index) => {
        element.inert = previous[index] ?? false;
      });
  }, [dialogReady]);

  // 关闭后焦点还源到触发元素
  useEffect(() => {
    if (active) return;
    const el = previousFocusRef.current;
    if (el instanceof HTMLElement && el.isConnected) el.focus();
    previousFocusRef.current = null;
  }, [active]);

  // 键盘：Esc 关闭，←/→ 同组切换
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, select, [contenteditable=true]'))
      ) {
        return;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, go]);

  // 展开后预取相邻高清图，翻页不再「模糊 thumb → 淡入」
  useEffect(() => {
    if (!active || !expanded || active.siblings.length < 2) return;
    for (const dir of [-1, 1]) {
      const sibling =
        active.siblings[(active.index + dir + active.siblings.length) % active.siblings.length];
      if (sibling) {
        const img = new window.Image();
        img.src = sibling.src;
      }
    }
  }, [active, expanded]);

  // 目标框：按源 rect 纵横比适配视口，resize 时重算
  useLayoutEffect(() => {
    if (!active) return;
    const compute = () => {
      const aspect =
        naturalRatio ??
        (active.item.width && active.item.height
          ? active.item.width / active.item.height
          : active.initialRect.width > 0 && active.initialRect.height > 0
            ? active.initialRect.width / active.initialRect.height
            : 1);
      const maxW = Math.max(1, window.innerWidth - (window.innerWidth < 640 ? 32 : 144));
      const maxH = Math.max(1, window.innerHeight - 210);
      let width = maxW;
      let height = width / aspect;
      if (height > maxH) {
        height = maxH;
        width = height * aspect;
      }
      setFrame({
        left: (window.innerWidth - width) / 2,
        top: (window.innerHeight - height) / 2 - 12,
        width,
        height,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [active, naturalRatio]);

  // FLIP 起点变换：未展开时从源 rect 变换到目标框（transform only，不触发布局）
  let startTransform: string | undefined;
  if (active && frame && !expanded) {
    const origin = closeRect ?? (active.sourceEl ? active.initialRect : null);
    if (origin) {
      const dx = origin.x + origin.width / 2 - (frame.left + frame.width / 2);
      const dy = origin.y + origin.height / 2 - (frame.top + frame.height / 2);
      startTransform = `translate(${dx}px, ${dy}px) scale(${origin.width / frame.width}, ${origin.height / frame.height})`;
    } else {
      // 翻过页后 sourceEl 失效：原地微缩淡出
      startTransform = 'scale(0.97)';
    }
  }

  const transition =
    reducedMotion || instant
      ? 'none'
      : `transform ${expanded ? DURATION : EXIT_DURATION}ms ${EASE}, opacity ${expanded ? DURATION : EXIT_DURATION}ms ${EASE}`;
  const hasSiblings = (active?.siblings.length ?? 0) > 1;
  // 关闭动画是否有回飞目标（无目标时 thumb 也要淡出，否则结尾硬切）
  const hasOrigin = Boolean(closeRect ?? (active?.sourceEl ? active.initialRect : null));

  // 移动端 swipe 翻图（手写 pointer，零依赖；纵向手势不拦截）
  const onSwipeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      swipeStateRef.current ||
      event.pointerType === 'mouse' ||
      !hasSiblings ||
      !expanded ||
      (event.target instanceof Element && event.target.closest('button, a'))
    )
      return;
    suppressSwipeClick.current = false;
    // 清掉上一次回弹残留的 transition（否则后续拖拽全程慢半拍）
    if (swipeRef.current) swipeRef.current.style.transition = 'none';
    swipeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startT: event.timeStamp,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      dx: 0,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onSwipeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeStateRef.current;
    const el = swipeRef.current;
    if (!s || !el || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      s.active = true;
    }
    if (s.active) {
      s.dx = dx;
      // 尾部速度（指数平滑），「慢拖后发力甩」也能触发
      const dt = event.timeStamp - s.lastT;
      if (dt > 0) {
        s.velocity = 0.8 * s.velocity + 0.2 * ((event.clientX - s.lastX) / dt);
        s.lastX = event.clientX;
        s.lastT = event.timeStamp;
      }
      if (!reducedMotion) el.style.transform = `translate3d(${dx * 0.9}px, 0, 0)`;
    }
  };
  const onSwipeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeStateRef.current;
    const el = swipeRef.current;
    if (!s || !el || event.pointerId !== s.pointerId) return;
    swipeStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (s.active) {
      suppressSwipeClick.current = true;
      if (Math.abs(s.dx) > 64 || Math.abs(s.velocity) > 0.5) {
        // 触发翻图：位移直接复位（crossfade 接管视觉连续性）
        el.style.transition = 'none';
        el.style.transform = '';
        go(s.dx < 0 ? 1 : -1);
        return;
      }
      // 未达到阈值：回弹
      el.style.transition = reducedMotion ? 'none' : `transform 150ms ${EASE}`;
      el.style.transform = '';
    }
  };

  // focus trap：Tab/Shift+Tab 在 dialog 内循环，不外溢到背景
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
      // 过滤响应式隐藏的元素（sm:hidden 的移动版按钮），否则 first/last 锚点落空
    ].filter((el) => el.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !dialog.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {active && frame
        ? // portal 到 body：摆脱 transformed 祖先（detail-in 等）对 fixed 定位的污染
          createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={active.item.alt}
              tabIndex={-1}
              className={styles.surface}
              onKeyDown={onDialogKeyDown}
            >
              {/* 遮罩：毛玻璃 + 加深，明暗两种背景下都能分离层次。
             灯箱是恒定暗房表面（不随主题翻转），色值取自暗色 palette 原值而非 token */}
              <div
                aria-hidden
                className={styles.backdrop}
                style={{
                  opacity: expanded ? 1 : 0,
                  transition: reducedMotion || instant ? 'none' : `opacity ${DURATION}ms ${EASE}`,
                }}
                onClick={close}
              />

              {/* 图片 + 图注：swipe 容器（移动端滑动翻图） */}
              <div
                ref={swipeRef}
                className="absolute inset-0 touch-pan-y"
                onPointerDown={onSwipeStart}
                onPointerMove={onSwipeMove}
                onPointerUp={onSwipeEnd}
                onPointerCancel={(event) => {
                  if (swipeStateRef.current?.pointerId !== event.pointerId) return;
                  swipeStateRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  if (swipeRef.current) swipeRef.current.style.transform = '';
                }}
                onClick={(event) => {
                  if (suppressSwipeClick.current) {
                    suppressSwipeClick.current = false;
                    return;
                  }
                  if (event.target === event.currentTarget) close();
                }}
              >
                {/* thumb 打底（首屏/新图未就绪时可见） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`thumb-${active.item.src}`}
                  onError={() => setThumbError(true)}
                  src={active.item.thumb ?? active.item.src}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute object-contain"
                  style={{
                    ...frame,
                    transform: expanded ? 'none' : startTransform,
                    opacity: thumbError ? 0 : expanded ? 1 : hasOrigin ? 0.99 : 0,
                    transition,
                  }}
                />
                {/* 当前高清图 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${active.item.src}-${attempt}`}
                  src={active.item.src}
                  alt={active.item.alt}
                  draggable={false}
                  className="absolute object-contain"
                  style={{
                    ...frame,
                    transform: expanded ? 'none' : startTransform,
                    opacity: expanded && fullReady ? 1 : 0,
                    transition,
                  }}
                  ref={(el) => {
                    // 缓存图可能在监听挂载前就加载完，onLoad 不会触发，挂载时补检
                    if (el?.complete && el.naturalWidth > 0) setFullReady(true);
                  }}
                  onError={() => {
                    setLoadError(true);
                  }}
                  onLoad={(event) => {
                    setFullReady(true);
                    setLoadError(false);
                    if (event.currentTarget.naturalHeight)
                      setNaturalRatio(
                        event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                      );
                  }}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === 'transform' && closingRef.current) {
                      clearTimeout(closeTimerRef.current);
                      setActive(null);
                    }
                  }}
                />

                {!fullReady && expanded ? (
                  <div className={styles.status} role="status">
                    <span>
                      {loadError
                        ? active.item.thumb && !thumbError
                          ? '高清图暂时无法加载，当前显示预览图。'
                          : '图片暂时无法加载。'
                        : '正在加载高清图…'}
                    </span>
                    {loadError ? (
                      <button
                        type="button"
                        className={buttonClassName({ className: styles.control })}
                        onClick={() => {
                          setLoadError(false);
                          setFullReady(false);
                          setAttempt((value) => value + 1);
                        }}
                      >
                        重新加载
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {/* 图注：编号 + 名称 + 计数 + 详情入口（移动端切换按钮并入此栏） */}
                <div
                  className={styles.caption}
                  style={{
                    left: window.innerWidth < 640 ? 16 : 72,
                    top: frame.top + frame.height + 12,
                    width: window.innerWidth - (window.innerWidth < 640 ? 32 : 144),
                    opacity: expanded ? 1 : 0,
                    transition: reducedMotion || instant ? 'none' : `opacity ${DURATION}ms ${EASE}`,
                  }}
                >
                  <p className="flex min-w-0 items-center truncate text-[#edf1f6]">
                    {hasSiblings ? (
                      <span className="mr-2 inline-flex shrink-0 gap-1 sm:hidden">
                        <button
                          type="button"
                          data-direction="previous"
                          aria-label="上一张"
                          onClick={() => go(-1)}
                          className={buttonClassName({ icon: true, className: styles.control })}
                        >
                          <ArrowLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          data-direction="next"
                          aria-label="下一张"
                          onClick={() => go(1)}
                          className={buttonClassName({ icon: true, className: styles.control })}
                        >
                          <ArrowRight className="size-4" />
                        </button>
                      </span>
                    ) : null}
                    {active.item.serial ? (
                      <span className="mr-2 shrink-0 font-mono text-xs text-[#bdbdbd]">
                        {active.item.serial}
                      </span>
                    ) : null}
                    <span className="truncate">{active.item.alt}</span>
                  </p>
                  <span className="flex shrink-0 items-center gap-3">
                    {hasSiblings ? (
                      <span className="font-mono text-xs text-[#bdbdbd]">
                        {active.index + 1} / {active.siblings.length}
                      </span>
                    ) : null}
                    {active.item.href ? (
                      <Link
                        href={active.item.href}
                        onClick={() => {
                          clearTimeout(closeTimerRef.current);
                          setActive(null);
                        }}
                        className="inline-flex items-center gap-1 text-[#c3ccd8] underline-offset-4 transition-colors hover:text-white hover:underline"
                      >
                        查看详情
                        <ArrowRight size={18} strokeWidth={1.6} aria-hidden />
                      </Link>
                    ) : null}
                  </span>
                </div>
              </div>

              {/* 关闭按钮（移动端常驻可见，触屏无 Esc；初始聚焦目标） */}
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="关闭"
                onClick={close}
                className={buttonClassName({
                  icon: true,
                  className: `${styles.control} ${styles.close}`,
                })}
              >
                <X className="size-5" />
              </button>

              {/* 同组左右切换（桌面侧翼；移动端在图注栏内） */}
              {hasSiblings ? (
                <>
                  <button
                    type="button"
                    data-direction="previous"
                    aria-label="上一张"
                    onClick={() => go(-1)}
                    className={buttonClassName({
                      icon: true,
                      className: `${styles.control} ${styles.previous}`,
                    })}
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    data-direction="next"
                    aria-label="下一张"
                    onClick={() => go(1)}
                    className={buttonClassName({
                      icon: true,
                      className: `${styles.control} ${styles.next}`,
                    })}
                  >
                    <ArrowRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </LightboxContext.Provider>
  );
}
