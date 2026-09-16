'use client';

import { useEffect, useRef, useState } from 'react';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';
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
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [routeStarted, setRouteStarted] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || stops < 2) return;
    let visible = false;
    const update = () => setRunning(!completed && visible && !instantMotion() && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    const removePolicyListener = observeMotionPolicy(update);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      removePolicyListener();
      document.removeEventListener('visibilitychange', update);
    };
  }, [completed, stops]);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setStep((frame) => (frame + 1) % 2), 220);
    const complete = window.setTimeout(() => {
      setRunning(false);
      setRouteStarted(false);
      setCompleted(true);
    }, 12000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(complete);
    };
  }, [running]);
  useEffect(() => {
    if (!running || !routeStarted) {
      onHit(null);
      return;
    }
    // The collision points in the CSS route; count from its actual animation start.
    const offsets = [720, 3720, 6720, 9720].slice(0, stops);
    const timers = offsets.flatMap((offset, index) => [
      window.setTimeout(() => onHit(index), offset),
      window.setTimeout(() => onHit(null), offset + 520),
    ]);
    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [onHit, routeStarted, running, stops]);
  return (
    <li
      ref={ref}
      className={styles.scene}
      data-running={running}
      data-complete={completed || undefined}
      onAnimationStart={(event) => {
        if (event.currentTarget === event.target) setRouteStarted(true);
      }}
      aria-hidden="true"
    >
      <svg
        className={styles.walker}
        viewBox="0 0 27 32"
        data-step={step}
        shapeRendering="crispEdges"
      >
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
      </svg>
    </li>
  );
}
