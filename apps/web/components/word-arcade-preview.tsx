'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Arcade, headlines } from '@personal-design/word-arcade';
import { instantMotion, useVisiblePlay } from '@/lib/motion';
import { arcadeBackgroundPaths, drawArcade } from './word-arcade-draw';

export function WordArcadePreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playback = useRef<(playing: boolean) => void>(() => {});
  const onPlay = useCallback((playing: boolean) => playback.current(playing), []);

  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let game: Arcade;
    let background: Path2D[][] | undefined;
    let frame = 0,
      last = 0,
      rest = 0;
    let running = false,
      disposed = false;
    let ink = '',
      paper = '';
    const font = '500 21px "Albert Sans", system-ui, sans-serif';

    const draw = () => {
      if (!game) return;
      const quiet = instantMotion();
      drawArcade(ctx, game, ink, paper, quiet, background);
      ctx.fillStyle = ink;
      ctx.font = font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const letter of game.bricks)
        if (letter.alive || quiet) ctx.fillText(letter.text, letter.homeX, letter.homeY);
      ctx.globalAlpha = 0.65;
      ctx.textAlign = 'center';
      ctx.font = '10px "Albert Sans", system-ui, sans-serif';
      ctx.fillText('BRICK BASH', game.width / 2, 25);
      ctx.globalAlpha = 1;
    };
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (game.state !== 'playing') {
        rest += dt;
        if (rest >= 0.9) {
          game.reset();
          game.start();
          rest = 0;
        }
      } else {
        // Use the real collision engine, with a slower clock and automatic paddle.
        const target = game.bricks.find((letter) => letter.alive);
        const angle =
          target && game.ball.vy > 0
            ? Math.atan2(target.x + target.w / 2 - game.ball.x, game.floor - 22 - target.y)
            : 0;
        game.pointer.x = game.ball.x - Math.max(-40, Math.min(40, (angle / (Math.PI / 3)) * 48));
        game.step(dt * 0.55);
      }
      draw();
      frame = requestAnimationFrame(animate);
    };
    const palette = () => {
      const css = getComputedStyle(canvas);
      ink = css.color;
      paper = css.getPropertyValue('--color-paper').trim();
      draw();
    };
    const measure = () => {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      // Preserve fractional-DPR edge coverage with the original rect drawing path.
      background = Number.isInteger(scale) ? arcadeBackgroundPaths(width, height) : undefined;
      ctx.font = font;
      const letters = Array.from(headlines[0]).filter((char) => /[\p{L}\p{N}]/u.test(char));
      const widths = letters.map((char) => ctx.measureText(char).width);
      let x = (width - widths.reduce((sum, w) => sum + w, 0)) / 2;
      game = new Arcade(
        'breakout',
        width,
        height,
        letters.map((text, i) => {
          const w = widths[i]!;
          const letter = { text, x, y: 52, w, h: 23, headline: true };
          x += w;
          return letter;
        }),
      );
      game.start();
      rest = 0;
      palette();
      if (running && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    measure();
    playback.current = (playing) => {
      running = playing;
      canvas.dataset.playing = String(playing);
      cancelAnimationFrame(frame);
      frame = 0;
      draw();
      if (running && game) {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const size = new ResizeObserver(measure);
    size.observe(canvas);
    const theme = new MutationObserver(palette);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    void document.fonts.ready.then(() => {
      if (!disposed) measure();
    });
    return () => {
      disposed = true;
      running = false;
      canvas.dataset.playing = 'false';
      cancelAnimationFrame(frame);
      playback.current = () => {};
      size.disconnect();
      theme.disconnect();
    };
  }, []);
  useVisiblePlay(ref, onPlay, 0.3);

  return (
    <canvas
      ref={ref}
      data-arcade-preview
      style={{ width: '100%', height: '100%', display: 'block', color: 'var(--color-ink)' }}
      aria-hidden="true"
    />
  );
}
