'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Arcade,
  games,
  headlines,
  type GameKind,
  type GameState,
} from '@personal-design/word-arcade';
import { Pause, RotateCcw } from 'lucide-react';
import { Button } from './button';
import { instantMotion } from '@/lib/motion';
import { drawArcade } from './word-arcade-draw';
import styles from './word-arcade.module.css';

type Status = { state: GameState; score: number; lives: number; level: number; remaining: number };
const initial: Status = { state: 'idle', score: 0, lives: 3, level: 0, remaining: 8 };

export function WordArcade() {
  const [kind, setKind] = useState<GameKind>('breakout');
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState<Status>(initial);
  const [ready, setReady] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Arcade | null>(null);
  const carry = useRef<{ score: number; lives: number; level: number } | null>(null);
  const active = games.find((game) => game.id === kind)!;
  const text = headlines[round % headlines.length]!;

  const begin = useEffectEvent(() => action('start'));

  // Refresh cycles through a shuffled bag. Storage is optional (private mode still works).
  useEffect(() => {
    let played: GameKind[] = [];
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem('word-arcade-played') ?? '[]');
      if (Array.isArray(raw))
        played = raw.filter((id): id is GameKind => games.some((g) => g.id === id));
    } catch {
      /* No persistence needed to play. */
    }
    const remaining = games.filter((g) => !played.includes(g.id));
    const choices = remaining.length ? remaining : games.filter((g) => g.id !== played.at(-1));
    const next = choices[Math.floor(Math.random() * choices.length)]!.id;
    try {
      sessionStorage.setItem(
        'word-arcade-played',
        JSON.stringify(remaining.length ? [...played, next] : [next]),
      );
    } catch {
      /* Optional history. */
    }
    const frame = requestAnimationFrame(() => {
      setKind(next);
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const area = stage.current,
      surface = canvas.current,
      ctx = surface?.getContext('2d');
    if (!area || !surface || !ctx || !ready) return;
    let game: Arcade;
    let frame = 0,
      last = 0,
      lastStatus = '';
    let ink = '',
      paper = '';
    let disposed = false;
    const keys = new Set<string>();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const knocked = new Set<number>();
    const punctuation = [...area.querySelectorAll<HTMLElement>('[data-game-punctuation]')];
    const letters = [...area.querySelectorAll<HTMLElement>('[data-game-letter]')];
    const publish = () => {
      const next = {
        state: game.state,
        score: game.score,
        lives: game.lives,
        level: game.level,
        remaining: game.remaining,
      };
      const key = JSON.stringify(next);
      if (key !== lastStatus) {
        lastStatus = key;
        setStatus(next);
      }
      area.dataset.gameState = game.state;
      area.dataset.score = String(game.score);
    };
    const paint = () => {
      const quiet = instantMotion();
      for (const el of punctuation) el.style.opacity = game.state === 'idle' ? '1' : '0';
      game.bricks.forEach((b, i) => {
        const el = letters[i]!;
        el.style.transform = `translate(${b.x - b.homeX + (b.w - b.homeW) / 2}px, ${b.y - b.homeY + (b.h - b.homeH) / 2}px) rotate(${b.rotation}rad) scale(${b.scale})`;
        el.style.opacity = b.alive ? '1' : '0';
        el.dataset.gameTarget = String(b.alive && b.active);
        if (quiet || (b.alive && knocked.has(i))) {
          el.getAnimations().forEach((a) => a.cancel());
          knocked.delete(i);
        }
        if (!b.alive && !knocked.has(i)) {
          knocked.add(i);
          if (!quiet && kind !== 'snake' && kind !== 'runner') {
            const transform = el.style.transform;
            const rising = kind === 'invaders';
            el.animate(
              [
                { transform, opacity: 1 },
                {
                  transform: `${transform} translate(16px,-24px) rotate(15deg)`,
                  opacity: 1,
                  offset: 0.3,
                },
                {
                  transform: `${transform} translate(48px,${rising ? -64 : 200}px) rotate(100deg)`,
                  opacity: 0,
                },
              ],
              { duration: rising ? 450 : 700, easing: 'cubic-bezier(.3,0,.8,1)' },
            );
          }
        }
      });
      drawArcade(ctx, game, ink, paper, quiet);
      publish();
    };
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (game.state === 'playing') {
        const dx =
          Number(keys.has('ArrowRight') || keys.has('d')) -
          Number(keys.has('ArrowLeft') || keys.has('a'));
        const dy =
          Number(keys.has('ArrowDown') || keys.has('s')) -
          Number(keys.has('ArrowUp') || keys.has('w'));
        if (dx || dy) {
          if (kind === 'snake')
            game.pointer = { x: game.snake.x + dx * 1000, y: game.snake.y + dy * 1000 };
          else {
            game.pointer.x = Math.max(0, Math.min(game.width, game.pointer.x + dx * 440 * dt));
            game.pointer.y = Math.max(
              game.ceiling,
              Math.min(game.floor - 30, game.pointer.y + dy * 360 * dt),
            );
          }
        }
        game.step(dt);
      }
      paint();
      frame = game.state === 'playing' ? requestAnimationFrame(animate) : 0;
    };
    const wake = () => {
      paint();
      if (!frame && game.state === 'playing') {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const palette = () => {
      const style = getComputedStyle(area);
      ink = style.color;
      paper = style.getPropertyValue('--color-paper').trim();
      if (game) paint();
    };
    const measure = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const el of letters) {
        el.getAnimations().forEach((a) => a.cancel());
        el.style.transform = '';
        el.style.opacity = '';
      }
      const box = area.getBoundingClientRect(),
        dpr = Math.min(2, devicePixelRatio || 1);
      surface.width = Math.round(box.width * dpr);
      surface.height = Math.round(box.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const previous = game;
      game = new Arcade(
        kind,
        box.width,
        box.height,
        letters.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent ?? '',
            x: r.left - box.left,
            y: r.top - box.top + r.height * 0.12,
            w: r.width,
            h: r.height * 0.76,
            headline: el.dataset.headline === 'true',
          };
        }),
      );
      if (previous && previous.state !== 'idle') {
        const measured = game.bricks;
        const sx = box.width / previous.width,
          sy = box.height / previous.height;
        const old = previous.bricks;
        game = previous;
        game.width = box.width;
        game.height = box.height;
        game.floor = box.height - 16;
        game.bricks = measured.map((b, i) => {
          const before = old[i]!;
          return {
            ...b,
            alive: before.alive,
            active: before.active,
            passed: before.passed,
            age: before.age,
            vx: before.vx,
            vy: before.vy,
            scale: before.scale,
            rotation: before.rotation,
            x: before.active ? before.x * sx : b.homeX + (before.x - before.homeX) * sx,
            y: before.active ? before.y * sy : b.homeY + (before.y - before.homeY) * sy,
            w: b.homeW * before.scale,
            h: b.homeH * before.scale,
          };
        });
        for (const p of [
          game.ball,
          game.pointer,
          game.snake,
          ...game.shots,
          ...game.bombs,
          ...game.body,
          ...game.trail,
          ...game.tokens,
        ]) {
          p.x *= sx;
          p.y *= sy;
        }
        game.playerX *= sx;
        game.pause();
      }
      if (carry.current) {
        Object.assign(game, carry.current);
        game.baseScore = game.score;
        game.state = 'playing';
        carry.current = null;
      }
      engine.current = game;
      palette();
      wake();
    };
    const updatePointer = (e: PointerEvent) => {
      const r = area.getBoundingClientRect();
      game.pointer = {
        x: e.clientX - r.left,
        y: Math.max(
          game.ceiling,
          e.clientY - r.top - (kind === 'ducks' && e.pointerType === 'touch' ? 40 : 0),
        ),
      };
      if (game.state === 'idle' && (kind === 'breakout' || kind === 'invaders')) {
        game.playerX = Math.max(
          kind === 'breakout' ? 48 : 19,
          Math.min(game.width - (kind === 'breakout' ? 48 : 19), game.pointer.x),
        );
        game.ball.x = game.playerX;
      }
      if (!frame) paint();
    };
    const press = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      area.focus({ preventScroll: true });
      updatePointer(e);
      if (game.state === 'cleared') {
        advance();
        return;
      }
      if (e.pointerType !== 'mouse') area.setPointerCapture(e.pointerId);
      if (game.state === 'playing') game.act();
      else begin();
      wake();
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        (e.target as Element).closest('button') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.isComposing
      )
        return;
      const key = e.key.toLowerCase().startsWith('arrow') ? e.key : e.key.toLowerCase();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 's', 'd', 'w'].includes(key)) {
        e.preventDefault();
        keys.add(key);
        if (!e.repeat) {
          const dx = ['ArrowRight', 'd'].includes(key)
            ? 1
            : ['ArrowLeft', 'a'].includes(key)
              ? -1
              : 0;
          const dy = ['ArrowDown', 's'].includes(key) ? 1 : ['ArrowUp', 'w'].includes(key) ? -1 : 0;
          if (kind === 'snake')
            game.pointer = { x: game.snake.x + dx * 1000, y: game.snake.y + dy * 1000 };
          else {
            game.pointer.x = Math.max(0, Math.min(game.width, game.pointer.x + dx * 24));
            game.pointer.y = Math.max(game.ceiling, Math.min(game.floor, game.pointer.y + dy * 24));
          }
          wake();
        }
      }
      if (e.repeat) return;
      if (key === 'Escape' || key === 'escape' || key === 'p') {
        e.preventDefault();
        game.pause();
        wake();
      }
      if (key === ' ' || key === 'enter') {
        e.preventDefault();
        if (game.state === 'cleared') advance();
        else {
          if (game.state === 'playing') game.act();
          else begin();
          wake();
        }
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys.delete(e.key);
      keys.delete(e.key.toLowerCase());
    };
    const pause = () => {
      keys.clear();
      game.pause();
      wake();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    const notifyAction = () => wake();
    measure();
    const size = new ResizeObserver(() => {
      const r = area.getBoundingClientRect();
      if (Math.abs(r.width - game.width) > 1 || Math.abs(r.height - game.height) > 1) measure();
    });
    size.observe(area);
    const theme = new MutationObserver(palette);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.fonts.ready.then(() => {
      if (!disposed && game.state === 'idle') measure();
    });
    area.addEventListener('pointermove', updatePointer);
    area.addEventListener('pointerdown', press);
    area.addEventListener('pointercancel', pause);
    area.addEventListener('keydown', keydown);
    area.addEventListener('keyup', keyup);
    area.addEventListener('blur', pause);
    area.addEventListener('arcade-action', notifyAction);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', pause);
    motion.addEventListener('change', paint);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      engine.current = null;
      area.dataset.gameState = 'inactive';
      keys.clear();
      size.disconnect();
      theme.disconnect();
      area.removeEventListener('pointermove', updatePointer);
      area.removeEventListener('pointerdown', press);
      area.removeEventListener('pointercancel', pause);
      area.removeEventListener('keydown', keydown);
      area.removeEventListener('keyup', keyup);
      area.removeEventListener('blur', pause);
      area.removeEventListener('arcade-action', notifyAction);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', pause);
      motion.removeEventListener('change', paint);
      for (const el of letters) {
        el.getAnimations().forEach((a) => a.cancel());
        el.style.transform = '';
        el.style.opacity = '';
      }
    };
  }, [kind, ready, round]);

  function advance() {
    const game = engine.current;
    if (!game) return;
    carry.current = { score: game.score, lives: game.lives, level: game.level + 1 };
    setRound((r) => r + 1);
  }
  function action(command: 'start' | 'pause' | 'reset') {
    const game = engine.current;
    if (!game) return;
    if (command === 'reset') {
      carry.current = null;
      game.reset();
      if (round) setRound(0);
    } else if (command === 'pause') game.pause();
    else if (game.state === 'cleared') {
      advance();
      return;
    } else if (game.state === 'over' && round > 0) {
      carry.current = { score: 0, lives: kind === 'snake' ? 0 : 3, level: 0 };
      setRound(0);
      return;
    } else game.start();
    stage.current?.focus({ preventScroll: true });
    stage.current?.dispatchEvent(new Event('arcade-action'));
  }
  const prompt =
    status.state === 'idle'
      ? '开始游戏'
      : status.state === 'over'
        ? '再来一次'
        : status.state === 'cleared'
          ? '下一关'
          : status.state === 'miss'
            ? '继续'
            : '继续';
  const statusTitle =
    status.state === 'over'
      ? '游戏结束'
      : status.state === 'cleared'
        ? '过关'
        : status.state === 'paused'
          ? '已暂停'
          : '';
  return (
    <main className={styles.page}>
      <div className={styles.choices} role="group" aria-label="选择小游戏">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            aria-pressed={game.id === kind}
            onClick={() => {
              carry.current = null;
              setKind(game.id);
              setRound(0);
            }}
            className={styles.choice}
          >
            {game.name}
          </button>
        ))}
      </div>
      <div
        ref={stage}
        className={styles.stage}
        role="region"
        aria-label={`${active.name}游戏区域`}
        aria-describedby="arcade-instructions"
        tabIndex={0}
        data-arcade-stage
        data-game={kind}
      >
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div className={styles.hud} aria-hidden="true">
          <span>第 {status.level + 1} 关</span>
          <span>剩余 {status.remaining} 字</span>
          <span>得分 {String(status.score).padStart(4, '0')}</span>
          {kind !== 'snake' && (
            <span>
              {'♥'.repeat(status.lives)}
              {'♡'.repeat(3 - status.lives)}
            </span>
          )}
        </div>
        <div className={styles.headline}>
          <h1 aria-label={text}>
            {Array.from(text).map((char, i) => (
              <span
                aria-hidden="true"
                data-game-letter={/[\p{L}\p{N}]/u.test(char) ? '' : undefined}
                data-game-punctuation={!/[\p{L}\p{N}]/u.test(char) ? '' : undefined}
                data-headline="true"
                key={`${round}-${i}`}
              >
                {char}
              </span>
            ))}
          </h1>
        </div>
        {status.state !== 'playing' && (
          <div className={styles.prompt}>
            {statusTitle && <p className={styles.promptTitle}>{statusTitle}</p>}
            <Button variant="primary" disabled={!ready} onClick={() => action('start')}>
              {ready ? prompt : '准备中…'}
            </Button>
          </div>
        )}
      </div>
      <div className={styles.footer}>
        <p id="arcade-instructions">{active.instruction}</p>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => action('pause')}
            disabled={status.state !== 'playing'}
            aria-label="暂停游戏"
            aria-keyshortcuts="Escape"
            title="Esc 暂停"
          >
            <Pause size={16} aria-hidden="true" />
            暂停
          </Button>
          <Button
            variant="ghost"
            onClick={() => action('reset')}
            disabled={!ready}
            aria-label="重新开始"
          >
            <RotateCcw size={16} aria-hidden="true" />
            重来
          </Button>
        </div>
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {active.name}，
        {status.state === 'playing'
          ? '游戏进行中'
          : statusTitle || (status.state === 'idle' ? '未开始' : '可继续')}
        ，剩余 {status.remaining} 字，得分 {status.score}
        {kind !== 'snake' ? `，剩余 ${status.lives} 次机会` : ''}。
      </p>
    </main>
  );
}
