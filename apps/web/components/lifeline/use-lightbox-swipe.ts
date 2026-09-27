'use client';

import { useRef, type PointerEvent, type RefObject } from 'react';

interface SwipeState {
  pointerId: number;
  startX: number;
  startY: number;
  startT: number;
  lastX: number;
  lastT: number;
  velocity: number;
  dx: number;
  active: boolean;
}

const EASE = 'var(--ease-out)';

/**
 * 移动端 swipe 翻图（手写 pointer，零依赖；纵向手势不拦截）。
 * `go` 负责翻图；回弹与跟随变换直接写在拖拽容器上。
 * 返回的 `suppressClick` 供容器 onClick 消费：刚刚结束的手势不应触发点击关闭。
 */
export function useLightboxSwipe({
  swipeRef,
  enabled,
  reducedMotion,
  go,
}: {
  swipeRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  reducedMotion: boolean;
  go: (direction: 1 | -1) => void;
}) {
  const state = useRef<SwipeState | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      state.current ||
      event.pointerType === 'mouse' ||
      !enabled ||
      (event.target instanceof Element && event.target.closest('button, a'))
    )
      return;
    suppressClick.current = false;
    // 清掉上一次回弹残留的 transition（否则后续拖拽全程慢半拍）
    if (swipeRef.current) swipeRef.current.style.transition = 'none';
    state.current = {
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

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    const el = swipeRef.current;
    if (!s || !el || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) s.active = true;
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

  const release = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || event.pointerId !== s.pointerId) return;
    state.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    return s;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const el = swipeRef.current;
    const s = release(event);
    if (!s || !el) return;
    if (s.active) {
      suppressClick.current = true;
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

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const el = swipeRef.current;
    if (!release(event) || !el) return;
    el.style.transform = '';
  };

  /** Consume the one-shot flag that suppresses the click right after a swipe. */
  const consumeClickSuppression = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    consumeClickSuppression,
  };
}
