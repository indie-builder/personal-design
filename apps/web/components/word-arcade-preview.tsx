'use client';

import { useEffect, useRef } from 'react';
import { Arcade } from '@personal-design/word-arcade';
import { drawArcade } from './word-arcade-draw';

export function WordArcadePreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const scale = Math.min(2, devicePixelRatio || 1);
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const css = getComputedStyle(canvas);
      const game = new Arcade('breakout', width, height, []);
      game.ball.y = height * 0.6;
      drawArcade(ctx, game, css.color, css.getPropertyValue('--color-paper').trim(), true);
      ctx.fillStyle = css.color;
      ctx.textAlign = 'center';
      ctx.font = '500 21px "Albert Sans", system-ui, sans-serif';
      ctx.fillText('任何想法，一键开玩。', width / 2, 68);
      ctx.globalAlpha = 0.65;
      ctx.font = '10px "Albert Sans", system-ui, sans-serif';
      ctx.fillText('BRICK BASH', width / 2, 33);
      ctx.globalAlpha = 1;
    };
    draw();
    const size = new ResizeObserver(draw);
    size.observe(canvas);
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      size.disconnect();
      theme.disconnect();
    };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: '100%', display: 'block', color: 'var(--color-ink)' }}
      aria-hidden="true"
    />
  );
}
