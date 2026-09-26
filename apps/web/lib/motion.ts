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
    easing: options.easing ?? 'cubic-bezier(.4,0,.8,.6)',
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
