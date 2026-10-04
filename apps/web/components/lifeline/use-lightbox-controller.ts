'use client';

import { instantMotion, observeMotionPolicy } from '@/lib/motion';
import { useMediaStatus } from '@/lib/use-media-status';
import { useLightboxSwipe } from './use-lightbox-swipe';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

export interface LightboxItem {
  /** 高清图 */
  src: string;
  width?: number;
  height?: number;
  /** 已缓存的缩略图：FLIP 期间先显示，高清图加载完成后替换 */
  thumb?: string;
  alt: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenOptions {
  /** 触发元素的屏幕 rect，FLIP 动画的起点 */
  rect: Rect;
  /** 触发元素引用：关闭动画前重新测量，避免飞回旧位置 */
  sourceEl?: Element | null;
  /** 同组条目（左右切换） */
  siblings?: LightboxItem[];
  /** 当前条目在 siblings 中的下标 */
  index?: number;
}

// Shared 200ms enter / 140ms exit; FLIP keeps the trigger-to-media relationship.
export const EASE = 'var(--ease-out)';
export const DURATION = 200;
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

export function useLightboxController() {
  const [active, setActive] = useState<ActiveImage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const {
    status: mediaStatus,
    attempt,
    setStatus: setMediaStatus,
    retry,
  } = useMediaStatus(!!active, 12000);
  const [thumbError, setThumbError] = useState(false);
  const [closeRect, setCloseRect] = useState<Rect | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [instant, setInstant] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const closeTimerRef = useRef(0);
  const enterFramesRef = useRef([0, 0]);
  const closingRef = useRef(false);
  const swipeRef = useRef<HTMLDivElement>(null);

  const cancelPendingMotion = useCallback(() => {
    enterFramesRef.current.forEach(cancelAnimationFrame);
    clearTimeout(closeTimerRef.current);
  }, []);

  const finishClose = useCallback(() => {
    cancelPendingMotion();
    closingRef.current = false;
    setActive(null);
    setExpanded(false);
  }, [cancelPendingMotion]);

  useEffect(() => cancelPendingMotion, [cancelPendingMotion]);

  const open = useCallback(
    (item: LightboxItem, options: OpenOptions) => {
      const immediate = instantMotion() || document.hidden;
      setInstant(immediate);
      setNaturalRatio(null);
      cancelPendingMotion();
      closingRef.current = false;
      setActive({
        item,
        sourceEl: options.sourceEl ?? null,
        initialRect: options.rect,
        siblings: options.siblings ?? [],
        index: options.index ?? 0,
      });
      setCloseRect(null);
      setThumbError(false);
      setMediaStatus('loading');
      setExpanded(immediate);
    },
    [cancelPendingMotion, setMediaStatus],
  );

  const activeRef = useRef<ActiveImage | null>(null);
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);

  const close = useCallback(() => {
    if (!activeRef.current) return;
    const immediate = instantMotion() || document.hidden;
    setInstant(immediate);
    if (immediate) {
      finishClose();
      return;
    }
    // 关闭动画的目标：重新测量触发元素（marquee/滚动后原 rect 已失效）
    const current = activeRef.current;
    setCloseRect(current?.sourceEl?.isConnected ? current.sourceEl.getBoundingClientRect() : null);
    closingRef.current = true;
    setExpanded(false);
    // 兜底通道：动画结束事件丢失时也保证卸载
    cancelPendingMotion();
    closeTimerRef.current = window.setTimeout(finishClose, EXIT_DURATION + 80);
  }, [cancelPendingMotion, finishClose]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setInstant(instantMotion() || document.hidden);
      setNaturalRatio(null);
      // 关闭动画期间按方向键：取消卸载倒计时，灯箱恢复展开（修闪没竞态）
      const current = activeRef.current;
      if (!current || current.siblings.length < 2) return;
      cancelPendingMotion();
      closingRef.current = false;
      setExpanded(true);
      setActive((cur) => {
        if (!cur || cur.siblings.length === 0) return cur;
        const next = (cur.index + dir + cur.siblings.length) % cur.siblings.length;
        const item = cur.siblings[next];
        // sourceEl 已不指向当前条目：之后关闭原地淡出，而不是飞回第一张
        return item ? { ...cur, item, index: next, sourceEl: null } : cur;
      });
      setThumbError(false);
      setMediaStatus('loading');
    },
    [cancelPendingMotion, setMediaStatus],
  );

  // 每次目标图变化都重新计时载入看门狗
  const activeSrc = active?.item.src;
  useEffect(() => {
    if (activeSrc) retry();
  }, [activeSrc, retry]);

  const isOpen = active !== null;
  const dialogReady = isOpen && frame !== null;
  const fullReady = mediaStatus === 'ready';
  const loadError = mediaStatus === 'error';

  useEffect(
    () =>
      observeMotionPolicy(() => {
        setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const immediate = instantMotion() || document.hidden;
        setInstant(immediate);
        if (!isOpen || !immediate) return;
        cancelPendingMotion();
        if (closingRef.current) finishClose();
        else setExpanded(true);
        if (swipeRef.current) {
          swipeRef.current.style.transition = 'none';
          swipeRef.current.style.transform = '';
        }
      }),
    [isOpen, cancelPendingMotion, finishClose],
  );

  useEffect(() => {
    if (active && !previousFocusRef.current)
      previousFocusRef.current = active.sourceEl ?? document.activeElement;
  }, [active]);

  // 打开后双帧展开；切换策略或关闭时取消尚未执行的帧。
  useEffect(() => {
    if (!active || expanded || instant || closingRef.current) return;
    const frames = enterFramesRef.current;
    frames[0] = requestAnimationFrame(() => {
      frames[1] = requestAnimationFrame(() => {
        if (!closingRef.current) setExpanded(true);
      });
    });
    return () => frames.forEach(cancelAnimationFrame);
  }, [active, expanded, instant]);

  // 锁背景滚动；body 挂标记（暂停灵感墙 marquee）。
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.lightboxOpen = 'true';
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.lightboxOpen;
    };
  }, [isOpen]);

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
  const { handlers: swipeHandlers, consumeClickSuppression } = useLightboxSwipe({
    swipeRef,
    enabled: hasSiblings && expanded,
    reducedMotion: reducedMotion || instant,
    go,
  });

  // focus trap：Tab/Shift+Tab 在 dialog 内循环，不外溢到背景
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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

  return {
    active,
    finishClose,
    expanded,
    frame,
    reducedMotion,
    instant,
    dialogRef,
    closeButtonRef,
    closingRef,
    swipeRef,
    open,
    close,
    go,
    fullReady,
    loadError,
    attempt,
    thumbError,
    setThumbError,
    setMediaStatus,
    setNaturalRatio,
    startTransform,
    transition,
    hasSiblings,
    hasOrigin,
    swipeHandlers,
    consumeClickSuppression,
    onDialogKeyDown,
    retry,
  };
}
