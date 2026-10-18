import { usePathname, useSearchParams } from '@/lib/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { EASE_OUT, instantMotion, observeMotionPolicy } from '@/lib/motion';
import { categoryLabel } from '@/lib/category-label';
import { paramsHref } from '@/lib/site-url';
import styles from './category-tabs.module.css';

/** ?cat= 参数读写：active 派生 + select（replace 不产生历史记录） */
export function useCatParam(
  allowed?: readonly string[],
): [active: string, select: (name: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const requested = searchParams.get('cat') ?? '全部';
  const active =
    requested === '全部' || !allowed || allowed.includes(requested) ? requested : '全部';
  useEffect(() => {
    if (requested === active) return;
    const href = paramsHref(pathname, new URLSearchParams(searchParams.toString()), { cat: '' });
    window.history.replaceState(null, '', href);
  }, [requested, active, searchParams, pathname]);
  const select = (name: string) => {
    const href = paramsHref(pathname, new URLSearchParams(searchParams.toString()), {
      cat: name === '全部' ? '' : name,
    });
    window.history.replaceState(null, '', href);
  };
  return [active, select];
}

/** 原生分类筛选组：选中状态，单行可滚动，焦点自动进入可见区。 */
export function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: { name: string }[];
  active: string;
  onSelect: (name: string) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const restoreFocus = useRef<HTMLButtonElement | null>(null);
  // A pending pointer intent survives an ancestor Suspense hide/show, which tears down
  // and replays this effect; it clears when the motion settles.
  const intent = useRef<{
    name: string;
    previous: { x: number; y: number; width: number };
    opacity: string;
    ghost?: { x: number; y: number; width: number; opacity: string };
  } | null>(null);
  const updateRef = useRef<(animate: boolean) => void>(() => {});
  // Server responses replace arrays even when the category controls stay unchanged.
  const categoryKey = JSON.stringify(categories.map((category) => category.name));

  useLayoutEffect(() => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    if (!group || !indicator) return;
    let target: { x: number; y: number; width: number } | undefined;
    let animations: Animation[] = [];
    let ghost: HTMLSpanElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let disposed = false;
    let replayed = false;
    const cancel = () => {
      generation++;
      clearTimeout(timer);
      for (const animation of animations) animation.cancel();
      animations = [];
      ghost?.remove();
      ghost = undefined;
      indicator.style.willChange = '';
    };
    const transform = (box: { x: number; y: number; width: number }) =>
      `translate(${box.x}px, ${box.y}px) scaleX(${box.width})`;
    const update = (animate: boolean) => {
      if (disposed) return;
      const selected = group.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!selected) {
        cancel();
        intent.current = null;
        target = undefined;
        delete group.dataset.motionReady;
        return;
      }
      if (
        group.getClientRects().length &&
        restoreFocus.current &&
        document.activeElement !== restoreFocus.current
      ) {
        const button = restoreFocus.current;
        restoreFocus.current = null;
        if (document.activeElement === document.body && selected === button)
          button.focus({ preventScroll: true });
      }
      const origin = group.getBoundingClientRect();
      // Layout offsets exclude the button's existing press transform.
      const next = {
        x: selected.offsetLeft,
        y: selected.offsetTop + selected.offsetHeight - 1,
        width: selected.offsetWidth,
      };
      const changed =
        !target ||
        Math.abs(next.x - target.x) > 0.1 ||
        Math.abs(next.y - target.y) > 0.1 ||
        Math.abs(next.width - target.width) > 0.1;
      // The remounted effect already measured the new spot; the intent still holds
      // where the line was last visible, so the motion can continue from there.
      if (intent.current && selected.textContent !== categoryLabel(intent.current.name))
        intent.current = null;
      const replay = !replayed && intent.current ? intent.current : undefined;
      // An ancestor Suspense hide can replay this effect before the wall is shown;
      // start the motion on the reveal instead of running it out of sight.
      if (replay && !group.getClientRects().length) {
        cancel();
        target = next;
        indicator.style.transform = transform(next);
        group.dataset.motionReady = '';
        return;
      }
      if (!changed && !replay) {
        if (!animate && (instantMotion() || document.hidden)) cancel();
        return;
      }
      // Read the rendered line and fading ghost before cancelling: fast reversals start mid-flight.
      const current = target ? indicator.getBoundingClientRect() : undefined;
      const previous =
        replay?.previous ??
        (current && {
          x: current.left - origin.left,
          y: current.top - origin.top,
          width: current.width,
        });
      const opacity = replay?.opacity ?? getComputedStyle(indicator).opacity;
      const ghostBox = ghost?.getBoundingClientRect();
      const ghostOpacity = ghost ? getComputedStyle(ghost).opacity : '0';
      // Returning to the ghost's spot resumes its visible opacity instead of flashing from 0.
      const ghostMatch = replay
        ? replay.ghost &&
          Math.abs(replay.ghost.x - next.x) < 1 &&
          Math.abs(replay.ghost.y - next.y) < 1 &&
          Math.abs(replay.ghost.width - next.width) < 1
        : ghostBox &&
          Math.abs(ghostBox.left - (origin.left + next.x)) < 1 &&
          Math.abs(ghostBox.top - (origin.top + next.y)) < 1 &&
          Math.abs(ghostBox.width - next.width) < 1;
      const resumed = ghostMatch ? (replay?.ghost?.opacity ?? ghostOpacity) : '0';
      cancel();
      target = next;
      indicator.style.transform = transform(next);
      group.dataset.motionReady = '';
      if (replay) replayed = true;
      if (
        (!animate && !replay) ||
        !previous ||
        instantMotion() ||
        document.hidden ||
        !indicator.animate
      ) {
        intent.current = null;
        return;
      }
      const token = generation;
      try {
        if (Math.abs(previous.y - next.y) < 2) {
          indicator.style.willChange = 'transform';
          animations = [
            indicator.animate(
              [{ transform: transform(previous) }, { transform: transform(next) }],
              { duration: 180, easing: EASE_OUT },
            ),
          ];
        } else {
          // Wrapped rows exchange emphasis locally; the line never sweeps across works.
          ghost = indicator.cloneNode() as HTMLSpanElement;
          delete ghost.dataset.categoryIndicator;
          ghost.dataset.categoryGhost = '';
          ghost.style.transform = transform(previous);
          ghost.style.willChange = 'opacity';
          group.append(ghost);
          indicator.style.willChange = 'opacity';
          animations.push(
            // Hold the final frame; default fill would flash the ghost back until the 140ms line ends.
            ghost.animate([{ opacity }, { opacity: 0 }], {
              duration: 100,
              easing: EASE_OUT,
              fill: 'forwards',
            }),
          );
          animations.push(
            indicator.animate([{ opacity: resumed }, { opacity: 1 }], {
              duration: 140,
              easing: EASE_OUT,
            }),
          );
        }
        const finish = () => {
          if (generation === token) {
            cancel();
            intent.current = null;
          }
        };
        timer = setTimeout(finish, 300);
        void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
      } catch {
        cancel();
        intent.current = null;
      }
    };
    updateRef.current = update;
    update(false);
    const resize = new ResizeObserver(() => update(false));
    resize.observe(group);
    for (const button of group.querySelectorAll('button'))
      resize.observe(button, { box: 'border-box' });
    const reflow = () => update(false);
    const focusChanged = (event: FocusEvent) => {
      if (event.target !== restoreFocus.current) restoreFocus.current = null;
    };
    const pointerChanged = (event: PointerEvent) => {
      if (!restoreFocus.current?.contains(event.target as Node)) restoreFocus.current = null;
    };
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('pointerdown', pointerChanged, true);
    window.addEventListener('resize', reflow);
    document.fonts.addEventListener('loadingdone', reflow);
    void document.fonts.ready.then(reflow);
    const stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) {
        intent.current = null;
        cancel();
        update(false);
      }
    });
    return () => {
      disposed = true;
      cancel();
      resize.disconnect();
      stop();
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('pointerdown', pointerChanged, true);
      window.removeEventListener('resize', reflow);
      document.fonts.removeEventListener('loadingdone', reflow);
      delete group.dataset.motionReady;
      updateRef.current = () => {};
    };
  }, [categoryKey]);

  useLayoutEffect(() => {
    updateRef.current(intent.current?.name === active);
  }, [active]);

  return (
    <div ref={groupRef} role="group" aria-label="分类" className={styles.tabs}>
      <span
        ref={indicatorRef}
        className={styles.indicator}
        data-category-indicator=""
        aria-hidden="true"
      />
      {[{ name: '全部' }, ...categories].map((category) => (
        <button
          key={categoryLabel(category.name)}
          type="button"
          aria-pressed={active === category.name}
          onClick={(event) => {
            // Record where the line is visible now: an ancestor Suspense hide/show may
            // remount this effect before the new selection renders. The fading ghost at
            // the target resumes from its real opacity after the remount.
            restoreFocus.current =
              document.activeElement === event.currentTarget ? event.currentTarget : null;
            const indicator = indicatorRef.current;
            const group = groupRef.current;
            const line = indicator?.getBoundingClientRect();
            const origin = group?.getBoundingClientRect();
            const ghost = group?.querySelector('[data-category-ghost]');
            const ghostBox = ghost?.getBoundingClientRect();
            intent.current =
              event.detail > 0 &&
              category.name !== active &&
              !instantMotion() &&
              !document.hidden &&
              indicator &&
              line &&
              origin &&
              line.width > 0
                ? {
                    name: category.name,
                    previous: {
                      x: line.left - origin.left,
                      y: line.top - origin.top,
                      width: line.width,
                    },
                    opacity: getComputedStyle(indicator).opacity,
                    ghost:
                      ghost && ghostBox
                        ? {
                            x: ghostBox.left - origin.left,
                            y: ghostBox.top - origin.top,
                            width: ghostBox.width,
                            opacity: getComputedStyle(ghost).opacity,
                          }
                        : undefined,
                  }
                : null;
            onSelect(category.name);
          }}
          className={styles.tab}
          onFocus={(event) =>
            event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        >
          {categoryLabel(category.name)}
        </button>
      ))}
    </div>
  );
}
