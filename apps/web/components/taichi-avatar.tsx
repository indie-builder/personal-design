'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { timelineAvatarUrl } from '@personal-design/personal-sites';
import styles from './taichi-avatar.module.css';

// Angles are shoulder, elbow, hip and knee joints; all poses share one clock.
const poses = [
  { t: 0, la: 35, le: -55, ra: -35, re: -55, ll: 30, lk: 35, rl: -30, rk: 10, lean: 0 },
  ...Array.from({ length: 6 }, (_, i) => ({
    t: 0.025 + i * 0.025,
    la: i % 2 ? 38 : -38,
    le: -65,
    ra: i % 2 ? -38 : 38,
    re: -65,
    ll: i % 2 ? 35 : -35,
    lk: i % 2 ? 8 : 55,
    rl: i % 2 ? -35 : 35,
    rk: i % 2 ? 55 : 8,
    lean: i % 2 ? -2 : 1,
  })),
  { t: 0.2, la: 8, le: -12, ra: -8, re: 12, ll: 10, lk: -10, rl: -10, rk: 10, lean: 0 },
  { t: 0.29, la: 80, le: -95, ra: 65, re: -65, ll: 23, lk: -30, rl: -23, rk: 12, lean: -5 },
  { t: 0.4, la: -65, le: 75, ra: -80, re: 95, ll: 23, lk: -12, rl: -23, rk: 30, lean: 5 },
  { t: 0.51, la: 105, le: -15, ra: -70, re: 85, ll: 30, lk: -30, rl: -22, rk: 10, lean: -4 },
  { t: 0.62, la: 65, le: -80, ra: -105, re: 15, ll: 18, lk: -10, rl: -45, rk: 90, lean: 2 },
  { t: 0.73, la: 35, le: -100, ra: -35, re: 100, ll: 10, lk: -10, rl: -10, rk: 10, lean: 0 },
  { t: 0.79, la: 8, le: -12, ra: -8, re: 12, ll: 3, lk: -3, rl: -3, rk: 3, lean: 0 },
  ...Array.from({ length: 7 }, (_, i) => ({
    t: 0.82 + i * 0.025,
    la: i % 2 ? 38 : -38,
    le: -65,
    ra: i % 2 ? -38 : 38,
    re: -65,
    ll: i % 2 ? 35 : -35,
    lk: i % 2 ? 8 : 55,
    rl: i % 2 ? -35 : 35,
    rk: i % 2 ? 55 : 8,
    lean: i % 2 ? -2 : 1,
  })),
  { t: 1, la: 0, le: 0, ra: 0, re: 0, ll: 0, lk: 0, rl: 0, rk: 0, lean: 0 },
];
type Joint = 'la' | 'le' | 'ra' | 're' | 'll' | 'lk' | 'rl' | 'rk';

function Arm({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left';
  return (
    <g transform={`translate(${left ? 64 : 96} 70)`}>
      <g data-joint={left ? 'la' : 'ra'}>
        <path className={styles.sleeveOutline} d="M0 0L0 25" />
        <path className={styles.sleeve} d="M0 0L0 25" />
        <g transform="translate(0 25)">
          <g data-joint={left ? 'le' : 're'}>
            <path className={styles.sleeveOutline} d="M0 0L0 23" />
            <path className={styles.sleeve} d="M0 0L0 23" />
            <path className={styles.hand} d="M-4 22Q-6 26 -4 29L-2 33Q0 35 2 33L4 27Q5 24 2 22Z" />
          </g>
        </g>
      </g>
    </g>
  );
}
function Leg({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left';
  return (
    <g transform={`translate(${left ? 70 : 90} 110)`}>
      <g data-joint={left ? 'll' : 'rl'}>
        <path className={styles.trouserOutline} d="M0 0L0 23" />
        <path className={styles.trouser} d="M0 0L0 23" />
        <g transform="translate(0 23)">
          <g data-joint={left ? 'lk' : 'rk'}>
            <path className={styles.trouserOutline} d="M0 0L0 24" />
            <path className={styles.trouser} d="M0 0L0 24" />
            <path
              className={styles.shoe}
              d={`M-5 23H5L${left ? -12 : 12} 28Q${left ? -15 : 15} 33 0 32H-5Z`}
            />
          </g>
        </g>
      </g>
    </g>
  );
}

export function TaichiAvatar() {
  const [playing, setPlaying] = useState(false);
  const actor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = actor.current;
    if (!playing || !element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const duration = reduced.matches ? 1000 : 9200;
    const distance = window.innerWidth < 480 ? 94 : 140;
    const animations: Animation[] = [];
    const travel = element.animate(
      reduced.matches
        ? [
            { opacity: 0, transform: 'translate(52px,20px)' },
            { opacity: 1, offset: 0.25, transform: 'translate(52px,20px)' },
            { opacity: 1, offset: 0.75, transform: 'translate(52px,20px)' },
            { opacity: 0, transform: 'translate(52px,20px)' },
          ]
        : [
            { offset: 0, opacity: 0, transform: 'translate(-28px,-44px) scale(.2)' },
            { offset: 0.04, opacity: 1, transform: 'translate(0px,8px) scale(.8)' },
            { offset: 0.18, opacity: 1, transform: `translate(${distance}px,24px) scale(1)` },
            { offset: 0.79, opacity: 1, transform: `translate(${distance}px,24px) scale(1)` },
            { offset: 0.82, opacity: 1, transform: `translate(${distance}px,24px) scale(-1,1)` },
            { offset: 0.96, opacity: 1, transform: 'translate(0px,8px) scale(-.8,.8)' },
            { offset: 1, opacity: 0, transform: 'translate(-28px,-44px) scale(-.2,.2)' },
          ],
      { duration, fill: 'both', easing: 'linear' },
    );
    animations.push(travel);
    if (!reduced.matches) {
      element.querySelectorAll<SVGGElement>('[data-joint]').forEach((joint) => {
        const key = joint.dataset.joint as Joint;
        animations.push(
          joint.animate(
            poses.map((p) => ({
              offset: p.t,
              transform: `rotate(${p[key]}deg)`,
              easing: 'ease-in-out',
            })),
            { duration, fill: 'both', easing: 'linear' },
          ),
        );
      });
      const body = element.querySelector('[data-body]');
      if (body)
        animations.push(
          body.animate(
            poses.map((p) => ({
              offset: p.t,
              transform: `translate(${p.lean * 0.8}px,${p.t >= 0.2 && p.t < 0.73 ? 5 : 0}px) rotate(${p.lean * 0.5}deg)`,
              easing: 'ease-in-out',
            })),
            { duration, fill: 'both', easing: 'linear' },
          ),
        );
    }
    travel.onfinish = () => setPlaying(false);
    const stop = () => setPlaying(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      }
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', stop);
    return () => {
      travel.onfinish = null;
      animations.forEach((a) => a.cancel());
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', stop);
    };
  }, [playing]);
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={playing ? '太极表演中，按 Esc 收起' : '点击头像，看一段太极'}
        aria-disabled={playing}
        onClick={() => {
          if (!playing) setPlaying(true);
        }}
        title="来一段太极"
      >
        <Image src={timelineAvatarUrl} width={32} height={32} alt="" priority />
      </button>
      {playing && (
        <div className={styles.stage} aria-hidden="true">
          <div ref={actor} className={styles.actor}>
            <svg
              viewBox="0 0 160 180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <ellipse
                cx="80"
                cy="170"
                rx="29"
                ry="3"
                fill="currentColor"
                opacity=".09"
                stroke="none"
              />
              <g data-body className={styles.body}>
                <Leg side="left" />
                <Leg side="right" />
                <path
                  className={styles.jacket}
                  d="M66 61Q80 58 94 61Q100 77 98 91L104 111Q81 120 56 111L62 91Q60 76 66 61Z"
                />
                <path className={styles.seam} d="M74 63L80 70L86 63M80 70V109M77 80H83M77 91H83" />
                <Arm side="left" />
                <Arm side="right" />
                <path className={styles.skin} d="M74 55V64Q80 69 86 64V55" />
                <g className={styles.face}>
                  <path
                    className={styles.skin}
                    d="M61 35Q57 30 58 41Q59 48 64 46M99 35Q103 30 102 41Q101 48 96 46"
                  />
                  <path
                    className={styles.skin}
                    d="M62 25Q80 15 98 25L96 48Q93 61 80 62Q67 61 64 48Z"
                  />
                  <path
                    className={styles.hair}
                    d="M61 35Q54 25 62 21Q61 15 70 16Q77 9 85 15Q95 12 98 21Q105 26 98 36L94 29Q84 32 77 25Q74 32 66 29L64 36Z"
                  />
                  <path d="M68 37Q72 35 76 37M84 37Q89 35 92 37M72 39V42M88 39V42M80 40L78 46H81" />
                  <path
                    className={styles.hair}
                    d="M65 46Q70 51 72 47Q80 44 88 47Q91 51 95 46L93 54Q80 68 67 54Z"
                  />
                  <path d="M73 52Q80 56 87 52" stroke="#f5eee3" strokeWidth="2" />
                </g>
              </g>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
