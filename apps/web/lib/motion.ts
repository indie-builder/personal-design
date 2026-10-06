import { useEffect, useRef, type RefObject } from 'react';

// WAAPI easing strings cannot reference CSS var(); these constants are the single TS
// source. Entries naming a globals.css token are dual-sourced — keep values in sync.
export const EASE_OUT = 'cubic-bezier(.23,1,.32,1)'; // mirrors --ease-out
export const EASE_EXIT = 'cubic-bezier(.4,0,.8,.6)'; // exit acceleration curve
export const EASE_CHAT_SCREEN = 'cubic-bezier(.32,.72,0,1)'; // mirrors --ease-chat-screen
export const EASE_BOOK_OPENING = 'cubic-bezier(.4,0,.2,1)'; // cover alignment
export const EASE_ARCADE_LETTER_EXIT = 'cubic-bezier(.3,0,.8,1)'; // arcade knock-fly
export const EASE_TRAVEL = 'cubic-bezier(.45,0,.2,1)'; // mirrors --ease-travel: book extract, book preview reveal, timeline walker

/** Call in interaction handlers: repeated keyboard actions never wait on motion. */
export function instantMotion() {
  return (
    document.documentElement.dataset.input === 'keyboard' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** CSS and WAAPI owners share the same input, accessibility and visibility changes. */
export function observeMotionPolicy(update: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Let the triggering key (especially Escape) finish its action before settling motion.
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(update, 0);
  };
  const input = new MutationObserver(schedule);
  input.observe(document.documentElement, { attributes: true, attributeFilter: ['data-input'] });
  reduced.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  update();
  return () => {
    input.disconnect();
    clearTimeout(timer);
    reduced.removeEventListener('change', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}

/** Keep the outgoing surface mounted until it has visibly left. */
export function playExit(
  element: HTMLElement | null,
  commit: () => void,
  frames: Keyframe[] = [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateX(28px) scale(.98)' },
  ],
  options: { duration?: number; hold?: boolean; easing?: string } = {},
) {
  const duration = options.duration ?? 180;
  if (!element || instantMotion() || document.hidden) {
    commit();
    return { finish: () => {}, cancel: () => {} };
  }
  const animation = element.animate(frames, {
    duration,
    easing: options.easing ?? EASE_EXIT,
    fill: 'forwards',
  });
  let settled = false;
  let stop = () => {};
  const settle = (navigate: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    stop();
    if (!navigate || !options.hold) animation.cancel();
    if (navigate) commit();
  };
  const finish = () => settle(true);
  const timer = setTimeout(finish, duration + 120);
  stop = observeMotionPolicy(() => {
    if (instantMotion() || document.hidden) finish();
  });
  void animation.finished.then(finish, finish);
  return {
    finish,
    cancel: () => {
      animation.cancel();
      settle(false);
    },
  };
}

/**
 * Home-preview players only move while their tile is on screen and motion is
 * allowed. Reports `visible && foreground && !instantMotion()` changes through
 * `onPlay`; visibility, motion policy and tab changes all re-evaluate.
 */
export function useVisiblePlay(
  ref: RefObject<Element | null>,
  onPlay: (playing: boolean) => void,
  threshold = 0.3,
) {
  const report = useRef(onPlay);
  useEffect(() => {
    report.current = onPlay;
  }, [onPlay]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const update = () => {
      const next = visible && !document.hidden && !instantMotion();
      report.current(next);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting && entry.intersectionRatio >= threshold;
        update();
      },
      { threshold },
    );
    observer.observe(element);
    const stop = observeMotionPolicy(update);
    return () => {
      observer.disconnect();
      stop();
      report.current(false);
    };
  }, [ref, threshold]);
}
