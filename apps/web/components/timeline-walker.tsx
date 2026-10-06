'use client';

import { useEffect, useRef, useState } from 'react';
import { EASE_TRAVEL, instantMotion, observeMotionPolicy } from '@/lib/motion';
import styles from './timeline-walker.module.css';

/** Reused with the owner's authorization from joeypescatore.com; follows the timeline's vertical rhythm. */
export function TimelineWalker({
  stops,
  onHit,
}: {
  stops: number;
  onHit: (index: number | null) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [step, setStep] = useState(0);
  const [look, setLook] = useState('right');
  useEffect(() => {
    const element = ref.current;
    const sprite = element?.querySelector('svg');
    const track = element?.parentElement;
    if (!element || !sprite || !track) return;
    let visible = false;
    let completed = false;
    let route: Animation | undefined;
    let reveal: Animation | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let arrival = 0;
    let count = 0;
    let previousHit: number | null = null;
    delete element.dataset.complete;

    function tick() {
      const time = Number(route?.currentTime ?? 0);
      setStep(time < 3000 || time >= arrival ? 0 : Math.floor(time / 220) % 2);
      const lookingLeft =
        (time >= 1300 && time < 2150) ||
        (time >= arrival + 300 && time < arrival + 1150) ||
        time >= arrival + 1800;
      setLook(lookingLeft ? 'left' : 'right');
      const index = Math.floor((time - 3720) / 3000);
      const hit = index >= 0 && index < count && time < 3720 + index * 3000 + 520 ? index : null;
      if (hit !== previousHit) {
        previousHit = hit;
        onHit(hit);
      }
    }

    function update() {
      const instant = instantMotion();
      element!.dataset.instant = String(instant);
      const playing = !completed && visible && !instant && !document.hidden;
      element!.dataset.running = String(playing);
      clearInterval(timer);
      if (playing) {
        route?.play();
        reveal?.play();
        timer = setInterval(tick, 40);
      } else {
        route?.pause();
        reveal?.pause();
        previousHit = null;
        onHit(null);
      }
    }

    function rebuild() {
      if (completed) return;
      const entries = [...track!.querySelectorAll<HTMLElement>('[data-timeline-stop]')];
      const end = track!.querySelector<HTMLElement>('[data-timeline-end]');
      if (!entries.length || !end) return;
      const time = Number(route?.currentTime ?? 0);
      route?.cancel();
      reveal?.cancel();
      count = entries.length;
      arrival = 3000 + count * 3000;
      const duration = arrival + 4000;
      const axis = 47 - element!.clientHeight;
      const easing = EASE_TRAVEL;
      const frame = (at: number, x: number, y: number) => ({
        offset: at / duration,
        transform: `translate(${x}px,${y}px)`,
        easing,
      });
      const frames = [frame(0, 0, 47), frame(1000, 0, axis), frame(3000, 0, axis)];
      entries.forEach((entry, index) => {
        const start = 3000 + index * 3000;
        const next = entries[index + 1] ?? end;
        frames.push(
          frame(start + 360, entry.offsetLeft, axis),
          frame(start + 720, entry.offsetLeft, -10),
          frame(start + 1320, entry.offsetLeft, axis),
          frame(start + 2880, next.offsetLeft, axis),
        );
      });
      frames.push(
        frame(arrival, end.offsetLeft, axis),
        frame(arrival + 2000, end.offsetLeft, axis),
        frame(duration, end.offsetLeft, 47),
      );
      route = element!.animate(frames, { duration, fill: 'both' });
      reveal = sprite!.animate(
        [
          { offset: 0, clipPath: 'inset(0 0 100% 0)', opacity: 0, easing },
          { offset: 1000 / duration, clipPath: 'inset(0)', opacity: 1, easing },
          { offset: (arrival + 2000) / duration, clipPath: 'inset(0)', opacity: 1, easing },
          { offset: 1, clipPath: 'inset(0 0 100% 0)', opacity: 0 },
        ],
        { duration, fill: 'both' },
      );
      route.currentTime = time;
      reveal.currentTime = time;
      route.onfinish = () => {
        completed = true;
        element!.dataset.complete = 'true';
        update();
      };
      update();
    }

    rebuild();
    const size = new ResizeObserver(rebuild);
    size.observe(track);
    size.observe(element);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    const removePolicyListener = observeMotionPolicy(update);
    return () => {
      clearInterval(timer);
      size.disconnect();
      observer.disconnect();
      removePolicyListener();
      route?.cancel();
      reveal?.cancel();
      onHit(null);
    };
  }, [onHit, stops]);
  return (
    <li ref={ref} className={styles.scene} data-timeline-walker aria-hidden="true">
      <svg
        className={styles.walker}
        viewBox="0 0 27 32"
        data-step={step}
        data-look={look}
        shapeRendering="crispEdges"
      >
        <g transform={look === 'left' ? 'translate(27 0) scale(-1 1)' : undefined}>
          <rect x="0" y="0" width="8" height="24" />
          <rect x="12" y="0" width="8" height="8" />
          <rect x="7" y="4" width="16" height="4" />
          <rect x="12" y="4" width="4" height="12" />
          <rect x="20" y="4" width="4" height="12" />
          <rect x="7" y="12" width="20" height="4" />
          <rect x="4" y="15" width="19" height="13" />
          <rect x="8" y="15" width="4" height="13" />
          <rect x="16" y="20" width="4" height="8" />
          {step === 0 ? (
            <>
              <rect x="8" y="28" width="4" height="4" />
              <rect x="16" y="28" width="4" height="4" />
            </>
          ) : (
            <>
              <rect x="10" y="28" width="4" height="4" />
              <rect x="14" y="28" width="4" height="4" />
            </>
          )}
        </g>
      </svg>
    </li>
  );
}
