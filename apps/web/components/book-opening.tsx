'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';
import styles from './book-opening.module.css';

export interface OpeningBook {
  index: number;
  title: string;
  color: string;
  ink: string;
  rect: { left: number; top: number; width: number; height: number };
  reveal: () => void;
}

/** One physical cover travels from the selected spine to the reader's right page. */
export function BookOpening({ book, onDone }: { book: OpeningBook; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || !cover.current) return;
    const actor = root.current;
    const front = cover.current;
    const animations: Animation[] = [];
    let stopped = false;
    let revealed = false;
    let frame = 0;
    const reveal = () => {
      if (!revealed) {
        revealed = true;
        book.reveal();
      }
    };
    const finish = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.finish());
      reveal();
      onDone();
    };
    const play = (element: Element, frames: Keyframe[], duration: number) => {
      const animation = element.animate(frames, {
        duration,
        fill: 'forwards',
        easing: 'cubic-bezier(.4,0,.2,1)',
      });
      animations.push(animation);
      return animation.finished;
    };
    const { width, height, left, top } = book.rect;
    const origin = `translate(${left}px,${top}px)`;
    const run = async () => {
      if (stopped) return;
      reveal();
      const deadline = performance.now() + 2000;
      const settle = () => {
        if (stopped) return;
        const spread = document.querySelector('[data-book-spread]');
        if (!spread) {
          if (performance.now() > deadline) {
            finish();
            return;
          }
          frame = requestAnimationFrame(settle);
          return;
        }
        const box = spread.getBoundingClientRect();
        void (async () => {
          await play(
            actor,
            [
              { transform: origin, width: `${width}px`, height: `${height}px` },
              {
                transform: `translate(${box.left + box.width / 2}px,${box.top}px)`,
                width: `${box.width / 2}px`,
                height: `${box.height}px`,
              },
            ],
            360,
          );
          if (stopped) return;
          const left = spread.firstElementChild;
          await Promise.all([
            play(
              front,
              [
                { transform: 'rotateY(0deg)', opacity: 1 },
                { transform: 'rotateY(-176deg)', opacity: 1, offset: 0.9 },
                { transform: 'rotateY(-180deg)', opacity: 0 },
              ],
              720,
            ),
            ...(left
              ? [
                  play(
                    left,
                    [
                      { transform: 'rotateY(180deg)', opacity: 1 },
                      { transform: 'rotateY(0deg)', opacity: 1 },
                    ],
                    720,
                  ),
                ]
              : []),
          ]);
          finish();
        })().catch(finish);
      };
      frame = requestAnimationFrame(settle);
    };
    const stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) finish();
    });
    const timeout = setTimeout(finish, 4500);
    void run().catch(finish);
    return () => {
      stopped = true;
      stop();
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
    };
  }, [book, onDone]);
  return (
    <div className={styles.overlay} aria-hidden="true">
      <div
        ref={root}
        className={styles.book}
        style={
          {
            '--cover': book.color,
            '--cover-ink': book.ink,
            width: book.rect.width,
            height: book.rect.height,
            transform: `translate(${book.rect.left}px,${book.rect.top}px)`,
          } as CSSProperties
        }
      >
        <div ref={cover} className={styles.cover}>
          <span>{book.title}</span>
          <small>排版构图图鉴</small>
        </div>
      </div>
    </div>
  );
}
