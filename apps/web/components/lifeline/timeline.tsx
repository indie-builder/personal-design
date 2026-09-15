'use client';

import { Children, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/button';
import { cn } from '@/lib/utils';
import styles from './timeline.module.css';

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/** One native scroll coordinate for mouse, touch and focus. rAF only smooths desktop gestures. */
export function LifelineTimeline({
  children,
  className,
  onScrollableChange,
}: {
  children: ReactNode;
  className?: string;
  onScrollableChange?: (scrollable: boolean) => void;
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const target = useRef(0);
  const drag = useRef<{
    id: number;
    start: number;
    offset: number;
    last: number;
    time: number;
    speed: number;
    moved: boolean;
  } | null>(null);
  const suppressUntil = useRef(0);
  const [grabbing, setGrabbing] = useState(false);
  const [position, setPosition] = useState({ start: true, end: false, scrollable: false, node: 1 });
  const count = Children.count(children);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  const move = useCallback(
    (offset: number, immediate = false) => {
      const el = viewport.current;
      if (!el) return;
      stop();
      target.current = clamp(offset, el.scrollWidth - el.clientWidth);
      if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.scrollLeft = target.current;
        return;
      }
      // Keep subpixel state locally: scrollLeft may round writes and otherwise stall near the target.
      let current = el.scrollLeft;
      let previous = performance.now();
      const tick = (now: number) => {
        const diff = target.current - current;
        const next = current + diff * (1 - Math.pow(0.78, Math.min(now - previous, 40) / 16.67));
        previous = now;
        current = Math.abs(diff) < 1 ? target.current : next;
        el.scrollLeft = current;
        if (current !== target.current) frame.current = requestAnimationFrame(tick);
        else frame.current = 0;
      };
      frame.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  useEffect(() => {
    const el = viewport.current;
    const row = track.current;
    if (!el || !row) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const nodes = Array.from(row.querySelectorAll<HTMLElement>('[data-node-index]'));
      const closest = nodes.reduce(
        (best, node, index) =>
          Math.abs(node.offsetLeft - el.scrollLeft - 24) <
          Math.abs((nodes[best]?.offsetLeft ?? 0) - el.scrollLeft - 24)
            ? index
            : best,
        0,
      );
      const next = {
        start: el.scrollLeft < 2,
        end: el.scrollLeft >= max - 2,
        scrollable: max > 2,
        node: closest + 1,
      };
      setPosition((old) =>
        old.start === next.start &&
        old.end === next.end &&
        old.scrollable === next.scrollable &&
        old.node === next.node
          ? old
          : next,
      );
      if (progress.current)
        progress.current.style.transform = `translateX(${max > 0 ? (el.scrollLeft / max) * 100 : 0}%)`;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(row);
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    onScrollableChange?.(position.scrollable);
  }, [position.scrollable, onScrollableChange]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        !window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches
      )
        return;
      const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      const column = (event.target as Element).closest<HTMLElement>('[data-lifeline-column]');
      if (
        vertical &&
        column &&
        column.scrollHeight > column.clientHeight + 1 &&
        ((event.deltaY > 0 && column.scrollTop + column.clientHeight < column.scrollHeight - 1) ||
          (event.deltaY < 0 && column.scrollTop > 0))
      )
        return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1;
      const delta = (vertical ? event.deltaY : event.deltaX) * unit;
      const origin = frame.current ? target.current : el.scrollLeft;
      if ((origin <= 0 && delta < 0) || (origin >= el.scrollWidth - el.clientWidth && delta > 0))
        return;
      event.preventDefault();
      move(origin + delta);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [move]);

  const go = (direction: number) => {
    const el = viewport.current;
    if (!el) return;
    const nodes = Array.from(
      track.current?.querySelectorAll<HTMLElement>('[data-node-index]') ?? [],
    );
    const inset = parseFloat(getComputedStyle(track.current!).paddingLeft);
    const offsets = nodes.map((node) => node.offsetLeft - inset);
    const next =
      direction > 0
        ? offsets.find((x) => x > el.scrollLeft + 8)
        : offsets.reverse().find((x) => x < el.scrollLeft - 8);
    move(next ?? (direction > 0 ? el.scrollWidth : 0));
  };

  const endDrag = (cancelled = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setGrabbing(false);
    if (viewport.current?.hasPointerCapture(current.id))
      viewport.current.releasePointerCapture(current.id);
    if (current.moved) {
      suppressUntil.current = performance.now() + 250;
      if (
        !cancelled &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
        performance.now() - current.time < 100
      )
        move((viewport.current?.scrollLeft ?? 0) - current.speed * 160);
    }
  };

  return (
    <div className={cn(styles.timeline, className)}>
      <div className={styles.toolbar}>
        <p id={`${id}-hint`}>
          <span className={styles.desktopHint}>拖动或滚动浏览，方向键切换</span>
          <span className={styles.mobileHint}>左右滑动浏览产品</span>
        </p>
        <div className={styles.controls}>
          <span className={styles.position}>
            {String(position.node).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </span>
          <Button
            icon
            variant="ghost"
            aria-label="上一个时间节点"
            aria-controls={id}
            disabled={position.start || !position.scrollable}
            onClick={() => go(-1)}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            icon
            variant="ghost"
            aria-label="下一个时间节点"
            aria-controls={id}
            disabled={position.end || !position.scrollable}
            onClick={() => go(1)}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
      <div
        id={id}
        ref={viewport}
        role="region"
        aria-label="产品上线时间轴"
        aria-describedby={`${id}-hint`}
        tabIndex={0}
        className={cn(styles.viewport, grabbing && styles.grabbing)}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          stop();
          if (event.pointerType !== 'mouse' || event.button !== 0 || !position.scrollable) return;
          if ((event.target as Element).closest('button,input,textarea,select')) return;
          drag.current = {
            id: event.pointerId,
            start: event.clientX,
            offset: event.currentTarget.scrollLeft,
            last: event.clientX,
            time: performance.now(),
            speed: 0,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const dx = event.clientX - current.start;
          if (!current.moved && Math.abs(dx) < 6) return;
          current.moved = true;
          setGrabbing(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          const now = performance.now();
          current.speed =
            0.65 * current.speed +
            (0.35 * (event.clientX - current.last)) / Math.max(1, now - current.time);
          current.last = event.clientX;
          current.time = now;
          move(current.offset - dx, true);
        }}
        onPointerLeave={() => {
          if (drag.current && !drag.current.moved) endDrag(true);
        }}
        onPointerUp={() => endDrag()}
        onPointerCancel={() => endDrag(true)}
        onLostPointerCapture={() => endDrag(true)}
        onClickCapture={(event) => {
          if (event.detail !== 0 && performance.now() < suppressUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onFocusCapture={(event) => {
          if (event.target === event.currentTarget) return;
          stop();
          const node = (event.target as HTMLElement).closest<HTMLElement>('[data-node-index]');
          if (!node) return;
          const el = event.currentTarget;
          const inset = parseFloat(getComputedStyle(track.current!).paddingLeft);
          if (
            node.offsetLeft < el.scrollLeft + inset ||
            node.offsetLeft + node.offsetWidth > el.scrollLeft + el.clientWidth - inset
          )
            move(node.offsetLeft - inset, true);
        }}
        onKeyDown={(event) => {
          if (
            (event.target as Element).closest('input,textarea,select,[contenteditable="true"]') ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            go(event.key === 'ArrowRight' ? 1 : -1);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            move(event.key === 'Home' ? 0 : event.currentTarget.scrollWidth);
          }
        }}
      >
        <div ref={track} className={styles.track}>
          <div className={styles.rail} aria-hidden />
          {children}
        </div>
      </div>
      {position.scrollable && (
        <div className={styles.progress} aria-hidden>
          <div ref={progress}>
            <span />
          </div>
        </div>
      )}
    </div>
  );
}

export function LifelineNode({
  index,
  label,
  sublabel,
  badge,
  ringClassName,
  center = false,
  header,
  children,
  className,
}: {
  index: number;
  label: string;
  sublabel?: string;
  badge?: ReactNode;
  ringClassName?: string;
  center?: boolean;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section data-node-index={index} className={cn(styles.node, className)} aria-label={label}>
      <div className={styles.nodeLabel}>
        {badge}
        <span>{label}</span>
        {sublabel && <span className={styles.date}>{sublabel}</span>}
      </div>
      <span aria-hidden className={cn(styles.ring, ringClassName)} />
      {header && <div>{header}</div>}
      <div data-lifeline-column className={cn(styles.column, center && styles.center)}>
        {children}
      </div>
    </section>
  );
}
